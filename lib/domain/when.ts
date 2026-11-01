import { addDays, formatClock, localParts, localToInstant } from "./time";

/**
 * Picking a past time for a log: a day (today or yesterday, by the calendar) and a
 * clock time. It never saves in the future:
 * - A time a little later than now on "today" (up to NEAR_FUTURE_MIN, for example 3:00 PM
 *   typed at 2:58 PM) is a rounded "now", so it saves as now.
 * - A time much later than now on "today" means last night (9 PM entered at 1 AM).
 */

/** How far ahead a "today" time may be and still count as now. */
export const NEAR_FUTURE_MIN = 90;

export type WhenValue = { day: "today" | "yesterday"; time: string };

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function timeOf(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Default: the phone's current time (to the minute), so only an earlier time needs editing. */
export function defaultWhen(tz: string, now: Date = new Date(), agoMinutes = 0): WhenValue {
  const t = new Date(now.getTime() - agoMinutes * 60_000);
  const p = localParts(t, tz);
  const today = localParts(now, tz).date;
  return { day: p.date === today ? "today" : "yesterday", time: timeOf(Math.floor(p.minutes)) };
}

export type WhenReading = "as_set" | "now" | "last_night";

/** How a picked value is read (see the rules at the top of this file). */
export function readWhen(value: WhenValue, tz: string, now: Date = new Date()): { at: Date; reading: WhenReading } {
  const today = localParts(now, tz).date;
  const date = value.day === "today" ? today : addDays(today, -1);
  const at = localToInstant(date, minutesOf(value.time), tz);
  const ahead = at.getTime() - now.getTime();
  if (value.day !== "today" || ahead <= 60_000) return { at, reading: "as_set" };
  if (ahead <= NEAR_FUTURE_MIN * 60_000) return { at: now, reading: "now" };
  return { at: localToInstant(addDays(today, -1), minutesOf(value.time), tz), reading: "last_night" };
}

export function resolveWhen(value: WhenValue, tz: string, now: Date = new Date()): Date {
  return readWhen(value, tz, now).at;
}

/** "Today, 9:30 PM" or "Yesterday, 9:30 PM". */
export function describeWhen(at: Date, tz: string, now: Date = new Date()): string {
  const p = localParts(at, tz);
  const today = localParts(now, tz).date;
  const label = p.date === today ? "Today" : p.date === addDays(today, -1) ? "Yesterday" : p.date;
  return `${label}, ${formatClock(p.minutes)}`;
}
