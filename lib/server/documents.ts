import "server-only";
import { RECORD_SYSTEM_PROMPT, recordUserPrompt } from "@/lib/ai/records-prompt";
import { extractJsonObject } from "@/lib/ai/json";
import { chatWithFallback, type ContentPart, type ProviderId } from "@/lib/ai/provider";
import { DOC_KIND_LABEL, normalizeExtraction, readPolicy, redactPages, type DocExtraction, type DocKind, type HealthDocument } from "@/lib/domain/records";
import type { Settings } from "@/lib/domain/settings";
import type { AuthedContext } from "@/lib/supabase/server";
import { HttpError } from "@/lib/http/guard";
import { readMedia, removeStoredFile } from "./media";
import { pdfRows } from "./pdf-text";

/**
 * Health records on the server. The file sits in private storage; text PDFs are read
 * here, and only the result lines (identity lines removed) go to the AI. Photos of
 * documents are read only when the person asks, because a photo cannot be redacted.
 */

const COLUMNS = "id, kind, title, doc_date, notes, status, extraction, pages, created_at, updated_at, media:media_id (mime)";

type Row = Omit<HealthDocument, "mime"> & { media: { mime: string } | { mime: string }[] | null };

function toDoc(r: Row): HealthDocument {
  const media = Array.isArray(r.media) ? r.media[0] : r.media;
  return { ...r, extraction: r.extraction ? (normalizeExtraction(r.extraction) ?? null) : null, mime: media?.mime ?? null };
}

export async function listDocuments(ctx: AuthedContext): Promise<HealthDocument[]> {
  const { data, error } = await ctx.supabase
    .from("health_documents")
    .select(COLUMNS)
    .eq("user_id", ctx.userId)
    .order("doc_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("documents_read_failed");
  return ((data ?? []) as unknown as Row[]).map(toDoc);
}

export async function getDocument(ctx: AuthedContext, id: string): Promise<HealthDocument | null> {
  const { data, error } = await ctx.supabase.from("health_documents").select(COLUMNS).eq("user_id", ctx.userId).eq("id", id).maybeSingle();
  if (error) throw new Error("documents_read_failed");
  return data ? toDoc(data as unknown as Row) : null;
}

export async function createDocument(
  ctx: AuthedContext,
  input: { id: string; kind: DocKind; title: string; doc_date: string | null; notes: string | null; mime: string; read: boolean },
): Promise<void> {
  const { error } = await ctx.supabase.from("health_documents").upsert(
    {
      id: input.id,
      user_id: ctx.userId,
      media_id: input.id,
      kind: input.kind,
      title: input.title,
      doc_date: input.doc_date,
      notes: input.notes,
      // Read only with the person's OK (the upload switch); otherwise it waits for "Read with AI".
      status: input.read ? "pending" : input.mime === "application/pdf" ? "consent" : "image",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw new Error("documents_write_failed");
}

export async function updateDocument(
  ctx: AuthedContext,
  id: string,
  patch: Partial<Pick<HealthDocument, "kind" | "title" | "doc_date" | "notes" | "status" | "pages">> & { extraction?: DocExtraction | null },
): Promise<void> {
  const { error } = await ctx.supabase.from("health_documents").update(patch).eq("user_id", ctx.userId).eq("id", id);
  if (error) throw new Error("documents_write_failed");
}

/**
 * Removes the file, then its row (the record row goes with the media row). If the file
 * cannot be removed, nothing is deleted and the person can try again.
 */
export async function deleteDocument(ctx: AuthedContext, id: string): Promise<void> {
  if (!(await removeStoredFile(ctx, id))) throw new HttpError(503, "Could not delete the file. Try again.");
}

/** The whole read must end well inside the route's 60 s limit, which after() shares. */
const EXTRACT_BUDGET_MS = 50_000;

/**
 * Reads values from a document, following readPolicy, only when `allowSend` is true (the
 * person turned on the upload switch or tapped "Read with AI"). Never via Gemini.
 */
/**
 * `startedAt` is when the request began: the upload or the tap shares the route's time
 * limit with this background read.
 */
export async function extractDocument(ctx: AuthedContext, doc: HealthDocument, settings: Settings, allowSend = false, startedAt = Date.now()): Promise<void> {
  const started = startedAt;
  const left = () => EXTRACT_BUDGET_MS - (Date.now() - started);
  try {
    const media = await readMedia(ctx, doc.id);
    if (!media) {
      await updateDocument(ctx, doc.id, { status: "failed" });
      return;
    }
    const content: ContentPart[] = [];
    let pages: number | null = null;
    const policy = readPolicy(doc.kind, media.mime);
    // Nothing is read without the person's OK (the upload switch, or "Read with AI").
    if (!allowSend) {
      await updateDocument(ctx, doc.id, { status: policy.mode === "photo" ? "image" : "consent" });
      return;
    }
    const order: ProviderId[] = policy.providers;
    if (media.mime === "application/pdf") {
      const read = await pdfRows(media.bytes);
      pages = Math.min(read.totalPages, 500);
      const redacted = redactPages(read.pages, doc.kind);
      if (redacted.text.replace(/\s/g, "").length < 40) {
        await updateDocument(ctx, doc.id, { status: "no_text", pages });
        return;
      }
      content.push({ type: "text", text: recordUserPrompt(DOC_KIND_LABEL[doc.kind], redacted.text) });
    } else {
      content.push({ type: "image_url", image_url: { url: `data:${media.mime};base64,${Buffer.from(media.bytes).toString("base64")}` } });
      content.push({ type: "text", text: recordUserPrompt(DOC_KIND_LABEL[doc.kind], null) });
    }
    const vision = content.some((c) => c.type === "image_url");
    const messages = [
      { role: "system" as const, content: RECORD_SYSTEM_PROMPT },
      { role: "user" as const, content },
    ];
    const accept = (t: string) => normalizeExtraction(extractJsonObject(t)) !== null;
    let result: { text: string } | null = null;
    let lastError: unknown = null;
    for (const [i, provider] of order.entries()) {
      // Leave the next provider a fair share of what is left.
      const budget = i < order.length - 1 ? Math.min(20_000, left() - 15_000) : left() - 2_000;
      if (budget < 5_000) break;
      try {
        result = await chatWithFallback(ctx, [provider], vision ? "vision" : "text", messages, { tz: settings.tz, maxTokens: 3000, temperature: 0, jsonObject: true, timeoutMs: budget }, accept);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!result) throw lastError ?? new Error("no_time_left");
    const extraction = normalizeExtraction(extractJsonObject(result.text));
    await updateDocument(ctx, doc.id, { status: extraction ? "done" : "failed", extraction, pages });
    // The date read from the report fills in only a date the person has not set meanwhile.
    if (extraction?.doc_date) {
      await ctx.supabase.from("health_documents").update({ doc_date: extraction.doc_date }).eq("user_id", ctx.userId).eq("id", doc.id).is("doc_date", null);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 60) : "unknown";
    console.error(JSON.stringify({ level: "warn", task: "document_extract", reason }));
    await updateDocument(ctx, doc.id, { status: "failed" }).catch(() => undefined);
  }
}
