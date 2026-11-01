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
 * Infers the meal slot from the time, what was already eaten today and, when known,
 * the wake time. A late breakfast still counts as breakfast (first meal within 4 hours
 * of waking, before 3 PM), and a skipped meal is fine: the first meal at 1:30 PM after
 * an early wake is lunch. The AI later checks the food itself (see refineMealSlot).
 */
export function inferMealSlot(
  at: string,
  earlierSlots: MealSlot[],
  tz: string,
  w: MealSlotWindows = DEFAULT_MEAL_WINDOWS,
  wakeAt: string | null = null,
): MealSlot {
  const m = localParts(at, tz).minutes;
  if (m >= w.lateStart || m < 5 * 60) return "late";
  if (m >= w.dinnerStart) return earlierSlots.includes("dinner") ? "snack" : "dinner";
  const hadMain = earlierSlots.some((s) => s === "breakfast" || s === "lunch");
  if (!hadMain) {
    if (m < w.lunchStart) return "breakfast";
    const sinceWake = wakeAt ? minutesBetween(wakeAt, at) : null;
    if (m < 15 * 60 && sinceWake !== null && sinceWake >= 0 && sinceWake <= 4 * 60) return "breakfast";
    return "lunch";
  }
  if (m < w.lunchStart) return "snack";
  if (m < w.lunchEnd + 30) return earlierSlots.includes("lunch") ? "snack" : "lunch";
  return "snack";
}

/**
 * Second opinion from the food itself. Indian breakfast foods (poha, idli, paratha) at a
 * late hour mean a late breakfast; a dal-rice plate as the first meal at noon means
 * breakfast was skipped. Only used when the person did not choose the slot.
 */
export function refineMealSlot(
  current: MealSlot,
  guess: MealSlot | null,
  minutes: number,
  earlierSlots: MealSlot[],
): MealSlot {
  if (!guess || guess === current) return current;
  const hadMain = earlierSlots.some((s) => s === "breakfast" || s === "lunch");
  if (current === "lunch" && guess === "breakfast" && !hadMain && minutes < 15 * 60) return "breakfast";
  if (current === "breakfast" && (guess === "lunch" || guess === "dinner") && minutes >= 11 * 60 && !hadMain) return "lunch";
  if (current === "snack" && guess === "lunch" && !earlierSlots.includes("lunch") && minutes >= 11 * 60 && minutes < 17 * 60) return "lunch";
  return current;
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

/** Drinks made with a glass of water (amla juice in water, soaked chia seeds) count as water. */
const WATER_BASED = new Set(["amla", "chia"]);

export function waterMl(dayEvents: StoredEvent[]): number {
  const water = ofKind(dayEvents, "water").reduce((sum, e) => sum + (payloadOf(e, "water")?.ml ?? 0), 0);
  const based = ofKind(dayEvents, "drink").reduce((sum, e) => {
    const p = payloadOf(e, "drink");
    return p && WATER_BASED.has(p.type) ? sum + p.ml : sum;
  }, 0);
  return water + based;
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

/** A nap still running is shown on Today until "I'm up", for at most this long. */
export const NAP_OPEN_MAX_MIN = 6 * 60;

/** The nap started but not yet ended (no minutes), if it began within the last 6 hours. */
export function openNap(dayEvents: StoredEvent[], now: Date): StoredEvent | null {
  const nap = ofKind(dayEvents, "nap").at(-1);
  if (!nap || typeof nap.payload.minutes === "number") return null;
  const since = now.getTime() - new Date(nap.occurred_at).getTime();
  return since >= -60_000 && since <= NAP_OPEN_MAX_MIN * 60_000 ? nap : null;
}

/** Minutes from a nap's start to now, within the nap's allowed range (1 to 360). */
export function napMinutesUntil(nap: StoredEvent, now: Date): number {
  const m = Math.round((now.getTime() - new Date(nap.occurred_at).getTime()) / 60_000);
  return Math.min(360, Math.max(1, m));
}

/** Daytime sleep in minutes (finished naps only). */
export function napMinutes(dayEvents: StoredEvent[]): number {
  return ofKind(dayEvents, "nap").reduce((sum, e) => sum + (typeof e.payload.minutes === "number" ? e.payload.minutes : 0), 0);
}
