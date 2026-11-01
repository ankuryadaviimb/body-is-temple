import { z } from "zod";
import { DocumentMeta } from "@/lib/domain/records";
import { assertWriteAllowed, handleError, HttpError, json, readJson } from "@/lib/http/guard";
import { deleteDocument, getDocument, updateDocument } from "@/lib/server/documents";
import { requireUser } from "@/lib/supabase/server";

async function docId(params: Promise<{ id: string }>): Promise<string> {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) throw new HttpError(404, "Not found");
  return parsed.data;
}

/** PATCH /api/documents/:id with { kind?, title?, doc_date?, notes? }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    const id = await docId(params);
    const patch = await readJson(req, DocumentMeta, 4_000);
    if (!(await getDocument(ctx, id))) throw new HttpError(404, "Not found");
    await updateDocument(ctx, id, patch);
    return json({ document: await getDocument(ctx, id) });
  } catch (err) {
    return handleError(err, "documents.patch");
  }
}

/** DELETE /api/documents/:id removes the file and everything read from it. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    const id = await docId(params);
    if (!(await getDocument(ctx, id))) throw new HttpError(404, "Not found");
    await deleteDocument(ctx, id);
    return json({ ok: true });
  } catch (err) {
    return handleError(err, "documents.delete");
  }
}
