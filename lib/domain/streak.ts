import type { StoredEvent } from "./events";

/**
 * Forgiving streak ("never miss twice").
 * - A day is on track if it has at least one toilet session or one meal logged.
 * - One missed day does not break the streak.
 * - A second missed day in a row uses a freeze if one is left this month (2 per month).
 * - Otherwise the streak ends, and the next on-track day starts a fresh one.
 * - Today never breaks the streak, because the day is not over yet.
 */

export const FREEZES_PER_MONTH = 2;

export function isOnTrack(dayEvents: StoredEvent[]): boolean {
  return dayEvents.some((e) => e.kind === "toilet" || e.kind === "meal");
}

export type DayStatus = { day: string; onTrack: boolean };

export type StreakResult = {
  count: number;
  /** True when yesterday was missed and today is not logged yet: one more miss would cost a freeze. */
  atRisk: boolean;
  freezesLeft: number;
  /** Days covered by a freeze in the current run. */
  frozenDays: string[];
  /** Set when the most recent run ended, so the UI can show a kind "fresh start". */
  freshStart: boolean;
};

/** `days` must be consecutive logical days in order, ending with today. */
export function computeStreak(days: DayStatus[]): StreakResult {
  const usedByMonth = new Map<string, number>();
  let count = 0;
  let misses = 0;
  let frozenDays: string[] = [];
  let freshStart = false;

  const today = days.at(-1);
  const history = today && !today.onTrack ? days.slice(0, -1) : days;

  for (const d of history) {
    if (d.onTrack) {
      count += 1;
      misses = 0;
      freshStart = false;
      continue;
    }
    misses += 1;
    if (misses === 1) continue;
    const month = d.day.slice(0, 7);
    const used = usedByMonth.get(month) ?? 0;
    if (count > 0 && used < FREEZES_PER_MONTH) {
      usedByMonth.set(month, used + 1);
      frozenDays.push(d.day);
      misses = 1;
      continue;
    }
    if (count > 0) freshStart = true;
    count = 0;
    frozenDays = [];
  }

  const month = (today?.day ?? "").slice(0, 7);
  const freezesLeft = FREEZES_PER_MONTH - (usedByMonth.get(month) ?? 0);
  const yesterdayMissed = misses >= 1;
  return {
    count,
    atRisk: Boolean(today && !today.onTrack && yesterdayMissed && count > 0),
    freezesLeft,
    frozenDays,
    freshStart,
  };
}
