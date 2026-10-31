import { mealAnalysisOf, payloadOf, type MealSlot, type StoredEvent } from "./events";
import { localParts, minutesBetween } from "./time";

/** Helpers for reading one logical day's events. Pure functions, no I/O. */

export function byTime(a: StoredEvent, b: StoredEvent): number {
  return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
}

export function ofKind(events: StoredEvent[], kind: StoredEvent["kind"]): StoredEvent[] {
  return events.filter((e) => e.kind === kind).sort(byTime);
}

/** Round number of a toilet visit within its day (1-based), by time order. */
export function roundNumber(event: StoredEvent, dayEvents: StoredEvent[]): number {
  const visits = ofKind(dayEvents, "toilet");
  const idx = visits.findIndex((v) => v.id === event.id);
  if (idx >= 0) return idx + 1;
  return visits.filter((v) => byTime(v, event) < 0).length + 1;
}

export type ToiletSummary = {
  visits: number;
  passes: number;
  firstPassBristol: number | null;
  firstPassComplete: "yes" | "partly" | "no" | null;
  breathHoldFree: number;
  overFiveMinutes: number;
  bladderFull: number;
  blood: boolean;
  bestSatisfaction: number | null;
};

export function summarizeToilet(dayEvents: StoredEvent[]): ToiletSummary {
  const visits = ofKind(dayEvents, "toilet")
    .map((e) => payloadOf(e, "toilet"))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const passes = visits.filter((v) => v.passed);
  const first = passes[0];
  const sats = visits.map((v) => v.satisfaction).filter((s): s is number => typeof s === "number");
  return {
    visits: visits.length,
    passes: passes.length,
    firstPassBristol: first?.bristol ?? null,
    firstPassComplete: first?.complete ?? null,
    breathHoldFree: visits.filter((v) => v.breath_hold === "no").length,
    overFiveMinutes: visits.filter((v) => v.duration_s > 5 * 60).length,
    bladderFull: visits.filter((v) => v.bladder_full === true).length,
    blood: visits.some((v) => v.blood === true),
    bestSatisfaction: sats.length ? Math.max(...sats) : null,
  };
}

export type MealSlotWindows = {
  /** Minutes since local midnight. */
  lunchStart: number;
  lunchEnd: number;
  dinnerStart: number;
  lateStart: number;
};

export const DEFAULT_MEAL_WINDOWS: MealSlotWindows = {
  lunchStart: 12 * 60,
  lunchEnd: 16 * 60 + 30,
  dinnerStart: 18 * 60 + 30,
  lateStart: 23 * 60,
};

/**
 * Infers the meal slot from the time and what was already eaten today.
 * The first main meal before lunch is breakfast; later small meals are snacks.
 */
export function inferMealSlot(
  at: string,
  earlierSlots: MealSlot[],
  tz: string,
  w: MealSlotWindows = DEFAULT_MEAL_WINDOWS,
): MealSlot {
  const m = localParts(at, tz).minutes;
  if (m >= w.lateStart || m < 5 * 60) return "late";
  if (m >= w.dinnerStart) return earlierSlots.includes("dinner") ? "snack" : "dinner";
  if (m >= w.lunchStart && m < w.lunchEnd) return earlierSlots.includes("lunch") ? "snack" : "lunch";
  if (m < w.lunchStart) return earlierSlots.includes("breakfast") ? "snack" : "breakfast";
  return "snack";
}

export function mealSlotOf(event: StoredEvent): MealSlot | null {
  const p = payloadOf(event, "meal");
  return p?.slot ?? null;
}

export function mainMeals(dayEvents: StoredEvent[]): StoredEvent[] {
  return ofKind(dayEvents, "meal").filter((e) => {
    const s = mealSlotOf(e);
    return s === "breakfast" || s === "lunch" || s === "dinner";
  });
}

export function lastDinner(dayEvents: StoredEvent[]): StoredEvent | null {
  const dinners = ofKind(dayEvents, "meal").filter((e) => mealSlotOf(e) === "dinner");
  return dinners.at(-1) ?? null;
}

export function waterMl(dayEvents: StoredEvent[]): number {
  return ofKind(dayEvents, "water").reduce((sum, e) => sum + (payloadOf(e, "water")?.ml ?? 0), 0);
}

/** Water and other drinks before the first toilet visit of the day (morning liquids). */
export function morningLiquidsMl(dayEvents: StoredEvent[]): number | null {
  const firstVisit = ofKind(dayEvents, "toilet")[0];
  if (!firstVisit) return null;
  const cutoff = new Date(firstVisit.occurred_at).getTime();
  return dayEvents
    .filter((e) => new Date(e.occurred_at).getTime() <= cutoff)
    .reduce((sum, e) => {
      if (e.kind === "water") return sum + (payloadOf(e, "water")?.ml ?? 0);
      if (e.kind === "drink") return sum + (payloadOf(e, "drink")?.ml ?? 0);
      return sum;
    }, 0);
}

export function proteinEstimate(dayEvents: StoredEvent[]): { grams: number; analyzedMeals: number } {
  let grams = 0;
  let analyzedMeals = 0;
  for (const e of ofKind(dayEvents, "meal")) {
    const a = mealAnalysisOf(e);
    if (!a) continue;
    analyzedMeals += 1;
    grams += (a.protein_g.low + a.protein_g.high) / 2;
  }
  return { grams: Math.round(grams), analyzedMeals };
}

export function tagCounts(dayEvents: StoredEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of ofKind(dayEvents, "meal")) {
    const a = mealAnalysisOf(e);
    for (const tag of new Set(a?.tags ?? [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

/** Minutes between the day's last dinner and its Isabgol, or null if either is missing. */
export function isabgolGapAfterDinner(dayEvents: StoredEvent[]): number | null {
  const dinner = lastDinner(dayEvents);
  const isabgol = ofKind(dayEvents, "isabgol").at(-1);
  if (!dinner || !isabgol) return null;
  return Math.round(minutesBetween(dinner.occurred_at, isabgol.occurred_at));
}

export const ISABGOL_WINDOW = { minAfterDinner: 60, maxAfterDinner: 150 } as const;

/** Isabgol counts as on time 60 to 150 minutes after dinner (target 90). */
export function isabgolOnTime(dayEvents: StoredEvent[]): boolean | null {
  const isabgol = ofKind(dayEvents, "isabgol").at(-1);
  if (!isabgol) return null;
  const gap = isabgolGapAfterDinner(dayEvents);
  if (gap === null) return null;
  return gap >= ISABGOL_WINDOW.minAfterDinner && gap <= ISABGOL_WINDOW.maxAfterDinner;
}

export function practiceMinutes(dayEvents: StoredEvent[]): number {
  return Math.round(
    ofKind(dayEvents, "practice").reduce((s, e) => s + (payloadOf(e, "practice")?.duration_s ?? 0), 0) / 60,
  );
}
