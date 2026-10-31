import { handleError, json } from "@/lib/http/guard";
import { loadCoachData, TOLERANCE_DAYS } from "@/lib/server/coach-context";
import { loadSettings } from "@/lib/server/settings";
import { currentDay } from "@/lib/server/today";
import { requireUser } from "@/lib/supabase/server";

/** GET /api/insights: food and habit patterns from the last 90 days, computed by code. */
export async function GET() {
  try {
    const ctx = await requireUser();
    const settings = await loadSettings(ctx);
    const today = await currentDay(ctx, settings);
    const { tolerance } = await loadCoachData(ctx, settings, today);
    return json({ report: tolerance, windowDays: TOLERANCE_DAYS, today });
  } catch (err) {
    return handleError(err, "insights.get");
  }
}
