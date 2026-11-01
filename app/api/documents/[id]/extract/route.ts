import { after } from "next/server";
import { z } from "zod";
import { assertWriteAllowed, handleError, HttpError, json, rateLimit, readJson } from "@/lib/http/guard";
import { extractDocument, getDocument, updateDocument } from "@/lib/server/documents";
import { loadSettings } from "@/lib/server/settings";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.strictObject({ allow: z.boolean().optional() });

/**
 * POST /api/documents/:id/extract reads a document again. { allow: true } is the person's
 * explicit OK to send free text or a photo of a document to the AI (see readPolicy).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    rateLimit(`extract:${ctx.userId}`, 20, 60 * 60_000);
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success) throw new HttpError(404, "Not found");
    const { allow = false } = await readJson(req, Body, 200);
    const doc = await getDocument(ctx, parsed.data);
    if (!doc) throw new HttpError(404, "Not found");
    await updateDocument(ctx, doc.id, { status: "pending" });
    const settings = await loadSettings(ctx);
    after(() => extractDocument(ctx, doc, settings, allow, startedAt));
    return json({ document: (await getDocument(ctx, doc.id)) ?? { ...doc, status: "pending" } });
  } catch (err) {
    return handleError(err, "documents.extract");
  }
}
