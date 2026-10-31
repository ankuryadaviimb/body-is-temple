import { CoachAsk } from "@/lib/domain/coach/message";
import { assertWriteAllowed, handleError, json, rateLimit, readJson } from "@/lib/http/guard";
import { askCoach, listMessages } from "@/lib/server/coach";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

/** GET /api/coach: recent questions and answers, newest first. */
export async function GET() {
  try {
    const ctx = await requireUser();
    return json({ messages: await listMessages(ctx) });
  } catch (err) {
    return handleError(err, "coach.get");
  }
}

/** POST /api/coach with { id, question, intent? }. Idempotent by the client's id. */
export async function POST(req: Request) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    rateLimit(`coach:${ctx.userId}`, 30, 60 * 60_000);
    const ask = await readJson(req, CoachAsk, 4_000);
    return json({ message: await askCoach(ctx, ask) });
  } catch (err) {
    return handleError(err, "coach.post");
  }
}
