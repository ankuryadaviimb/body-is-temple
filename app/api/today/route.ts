import { handleError, json } from "@/lib/http/guard";
import { buildToday } from "@/lib/server/today";
import { requireUser } from "@/lib/supabase/server";

/** Snapshot for the Today screen: today and yesterday's events, streak and ladder. */
export async function GET() {
  try {
    const ctx = await requireUser();
    return json(await buildToday(ctx));
  } catch (err) {
    return handleError(err, "today");
  }
}
