import { after } from "next/server";
import { z } from "zod";
import { analyzeMealEvent } from "@/lib/ai/meal";
import { assertWriteAllowed, handleError, HttpError, json, rateLimit } from "@/lib/http/guard";
import { getEvents, mergeMeta } from "@/lib/server/events";
import { loadSettings } from "@/lib/server/settings";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

/** POST /api/events/:id/analyze reads a meal again (after a failure or a stuck read). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    rateLimit(`analyze:${ctx.userId}`, 20, 60 * 60_000);
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success) throw new HttpError(404, "Not found");
    const [event] = await getEvents(ctx, [parsed.data]);
    if (!event || event.kind !== "meal") throw new HttpError(404, "Not found");
    const hasInput = typeof event.payload.media_id === "string" || (typeof event.payload.text === "string" && event.payload.text.trim().length > 0);
    if (!hasInput) throw new HttpError(400, "Nothing to read: add a photo or a description");
    const snapshot = await mergeMeta(ctx, event.id, { ai_status: "pending", requested_at: new Date().toISOString() });
    if (!snapshot) throw new HttpError(404, "Not found");
    const settings = await loadSettings(ctx);
    after(() => analyzeMealEvent(ctx, snapshot, settings));
    return json({ event: snapshot });
  } catch (err) {
    return handleError(err, "events.analyze");
  }
}
