import { after } from "next/server";
import { z } from "zod";
import { DOC_KINDS, DOC_KIND_LABEL, MAX_DOCUMENT_BYTES } from "@/lib/domain/records";
import { assertWriteAllowed, handleError, HttpError, json, rateLimit } from "@/lib/http/guard";
import { createDocument, extractDocument, getDocument, listDocuments } from "@/lib/server/documents";
import { storeMedia } from "@/lib/server/media";
import { loadSettings } from "@/lib/server/settings";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const Meta = z.strictObject({
  id: z.uuid(),
  kind: z.enum(DOC_KINDS),
  title: z.string().trim().max(120).optional(),
  doc_date: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  /** The person's OK to read the values with AI now (the upload switch). */
  read: z.boolean().optional(),
});

/** GET /api/documents: health records, newest first. */
export async function GET() {
  try {
    const ctx = await requireUser();
    return json({ documents: await listDocuments(ctx) });
  } catch (err) {
    return handleError(err, "documents.get");
  }
}

/**
 * POST multipart: "file" (PDF or photo, at most 4 MB) and "meta" (JSON). Stored in the
 * private bucket; a text PDF is then read in the background. Idempotent by id.
 */
export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    rateLimit(`documents:${ctx.userId}`, 30, 60 * 60_000);
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_DOCUMENT_BYTES + 64_000) throw new HttpError(413, "File too large (4 MB at most)");
    const form = await req.formData();
    const file = form.get("file");
    const rawMeta = form.get("meta");
    if (!(file instanceof File) || typeof rawMeta !== "string" || rawMeta.length > 4_000) throw new HttpError(400, "Invalid request");
    if (file.size > MAX_DOCUMENT_BYTES) throw new HttpError(413, "File too large (4 MB at most)");
    let candidate: unknown;
    try {
      candidate = JSON.parse(rawMeta);
    } catch {
      throw new HttpError(400, "Invalid request");
    }
    const parsed = Meta.safeParse(candidate);
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    const meta = parsed.data;

    const existing = await getDocument(ctx, meta.id);
    if (existing) return json({ document: existing });

    const { mime } = await storeMedia(ctx, meta.id, "report", file);
    await createDocument(ctx, {
      id: meta.id,
      kind: meta.kind,
      title: meta.title || DOC_KIND_LABEL[meta.kind],
      doc_date: meta.doc_date ?? null,
      notes: meta.notes || null,
      mime,
      read: meta.read === true,
    });
    const doc = await getDocument(ctx, meta.id);
    if (!doc) throw new HttpError(409, "Could not save");
    if (doc.status === "pending") {
      const settings = await loadSettings(ctx);
      after(() => extractDocument(ctx, doc, settings, true, startedAt));
    }
    return json({ document: doc });
  } catch (err) {
    return handleError(err, "documents.post");
  }
}
