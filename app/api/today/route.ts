import { after } from "next/server";
import { handleError, json } from "@/lib/http/guard";
import { ensureCoachCard } from "@/lib/server/coach-card";
import { buildToday } from "@/lib/server/today";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Snapshot for the Today screen: today and yesterday's events, streak, ladder and the
 * AI morning card. On the first open of a new day, the card is written in the background.
 */
export async function GET() {
  try {
    const ctx = await requireUser();
    const { snapshot, needsCard } = await buildToday(ctx);
    if (needsCard) after(() => ensureCoachCard(ctx, snapshot.settings, snapshot.today));
    return json(snapshot);
  } catch (err) {
    return handleError(err, "today");
  }
}
