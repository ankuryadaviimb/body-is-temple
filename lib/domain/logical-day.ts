import { addDays, localParts } from "./time";

/**
 * A "logical day" runs from waking up to waking up, not midnight to midnight.
 *
 * Rules (local time):
 * 1. Default: anything before the day-start hour (5 AM) belongs to the previous day.
 *    So Isabgol at 1 AM counts toward the evening before.
 * 2. Early wake: a wake event before 5 AM starts the new day from that moment.
 * 3. Late bedtime: a sleep event after 5 AM (and before noon) keeps everything up to
 *    that bedtime on the previous day.
 *
 * Only events on the same calendar morning can be affected by an anchor, so when a wake
 * or sleep event changes, only events between local midnight and noon need recomputing.
 */

export const DEFAULT_DAY_START_HOUR = 5;

export type Anchor = { kind: "wake" | "sleep"; at: string };

export function logicalDayFor(
  at: string,
  anchors: Anchor[],
  tz: string,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
): string {
  const t = new Date(at).getTime();
  const p = localParts(at, tz);
  const cutoff = dayStartHour * 60;

  const sameMorning = anchors
    .map((a) => ({ ...a, t: new Date(a.at).getTime(), p: localParts(a.at, tz) }))
    .filter((a) => a.p.date === p.date && a.p.minutes < 12 * 60);

  if (p.minutes < cutoff) {
    // Rule 2: an early wake at or before this moment starts the new day.
    const earlyWake = sameMorning.some((a) => a.kind === "wake" && a.p.minutes < cutoff && a.t <= t);
    return earlyWake ? p.date : addDays(p.date, -1);
  }

  if (p.minutes < 12 * 60) {
    // Rule 3: a late bedtime after this moment keeps it on the previous day,
    // unless the person already woke up again before this moment.
    const lateSleep = sameMorning.some((a) => a.kind === "sleep" && a.p.minutes >= cutoff && t <= a.t);
    const wokeBefore = sameMorning.some((a) => a.kind === "wake" && a.t <= t && a.p.minutes >= cutoff);
    if (lateSleep && !wokeBefore) return addDays(p.date, -1);
  }

  return p.date;
}

/** The logical day that is "today" right now. */
export function currentLogicalDay(
  now: Date,
  anchors: Anchor[],
  tz: string,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
): string {
  return logicalDayFor(now.toISOString(), anchors, tz, dayStartHour);
}

/** Local calendar date whose morning an anchor can affect (for targeted recompute). */
export function affectedCalendarDate(anchorAt: string, tz: string): string | null {
  const p = localParts(anchorAt, tz);
  return p.minutes < 12 * 60 ? p.date : null;
}
