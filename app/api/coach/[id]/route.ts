import { z } from "zod";
import { assertWriteAllowed, handleError, HttpError, json } from "@/lib/http/guard";
import { deleteMessage } from "@/lib/server/coach";
import { requireUser } from "@/lib/supabase/server";

/** DELETE /api/coach/:id removes one question and its answer. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await deleteMessage(ctx, parsed.data);
    return json({ ok: true });
  } catch (err) {
    return handleError(err, "coach.delete");
  }
}
