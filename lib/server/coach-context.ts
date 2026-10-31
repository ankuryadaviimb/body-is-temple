import "server-only";
import { computeTolerance } from "@/lib/domain/tolerance";
import type { Settings } from "@/lib/domain/settings";
import { addDays } from "@/lib/domain/time";
import type { AuthedContext } from "@/lib/supabase/server";
import { groupByDay, TOLERANCE_DAYS, type CoachData } from "@/lib/coach/context";
import { listEvents } from "./events";
import { loadMemory } from "./memory";

export { TOLERANCE_DAYS } from "@/lib/coach/context";

/** Loads 90 days of events and the memory notes, and computes the patterns. */
export async function loadCoachData(ctx: AuthedContext, settings: Settings, today: string): Promise<CoachData> {
  const [events, memory] = await Promise.all([listEvents(ctx, addDays(today, -(TOLERANCE_DAYS - 1)), today), loadMemory(ctx)]);
  const byDay = groupByDay(events);
  // Today is still in progress, so its outcomes are left out of the patterns.
  const finished = new Map([...byDay].filter(([day]) => day < today));
  return { byDay, memory, tolerance: computeTolerance(finished, settings) };
}
