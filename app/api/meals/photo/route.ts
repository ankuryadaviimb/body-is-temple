import { after } from "next/server";
import { analyzeMealEvent } from "@/lib/ai/meal";
import { ClientEventInput } from "@/lib/domain/events";
import { assertWriteAllowed, handleError, HttpError, json } from "@/lib/http/guard";
import { insertEvents } from "@/lib/server/events";
import { MAX_UPLOAD_BYTES, storeMedia } from "@/lib/server/media";
import { loadSettings } from "@/lib/server/settings";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * POST multipart: "file" (the photo, already shrunk and re-encoded on the phone,
 * which strips location and device details) and "event" (the meal event JSON).
 * The media id equals the event id, so a retried upload stays idempotent.
 */
export async function POST(req: Request) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_UPLOAD_BYTES + 64_000) throw new HttpError(413, "File too large");

    const form = await req.formData();
    const file = form.get("file");
    const rawEvent = form.get("event");
    if (!(file instanceof File) || typeof rawEvent !== "string" || rawEvent.length > 4_000) {
      throw new HttpError(400, "Invalid request");
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(rawEvent);
    } catch {
      throw new HttpError(400, "Invalid request");
    }
    const parsed = ClientEventInput.safeParse(candidate);
    if (!parsed.success || parsed.data.kind !== "meal") throw new HttpError(400, "Invalid request");
    const input = parsed.data;

    await storeMedia(ctx, input.id, "meal_photo", file);
    const settings = await loadSettings(ctx);
    const [stored] = await insertEvents(
      ctx,
      [{ ...input, payload: { ...input.payload, media_id: input.id } }],
      "app",
      settings,
    );
    if (!stored) throw new HttpError(409, "Could not save");

    if (stored.meta?.ai_status === "pending") {
      after(() => analyzeMealEvent(ctx, stored, settings));
    }
    return json({ event: stored });
  } catch (err) {
    return handleError(err, "meals.photo");
  }
}
