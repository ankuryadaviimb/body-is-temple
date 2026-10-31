import { addDays, formatClock, localParts, localToInstant } from "./time";

/**
 * Picking a past time for a log: a day (today or yesterday, by the calendar) and a
 * clock time. A time later than now on "today" means last night (for example 9 PM
 * entered at 1 AM), so it never saves in the future.
 */

export type WhenValue = { day: "today" | "yesterday"; time: string };

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function timeOf(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Default: 30 minutes ago, rounded down to 5 minutes. */
export function defaultWhen(tz: string, now: Date = new Date(), agoMinutes = 30): WhenValue {
  const t = new Date(now.getTime() - agoMinutes * 60_000);
  const p = localParts(t, tz);
  const today = localParts(now, tz).date;
  return { day: p.date === today ? "today" : "yesterday", time: timeOf(Math.floor(p.minutes / 5) * 5) };
}

export function resolveWhen(value: WhenValue, tz: string, now: Date = new Date()): Date {
  const today = localParts(now, tz).date;
  const date = value.day === "today" ? today : addDays(today, -1);
  const at = localToInstant(date, minutesOf(value.time), tz);
  if (value.day === "today" && at.getTime() > now.getTime() + 60_000) return localToInstant(addDays(today, -1), minutesOf(value.time), tz);
  return at;
}

/** "Today, 9:30 PM" or "Yesterday, 9:30 PM". */
export function describeWhen(at: Date, tz: string, now: Date = new Date()): string {
  const p = localParts(at, tz);
  const today = localParts(now, tz).date;
  const label = p.date === today ? "Today" : p.date === addDays(today, -1) ? "Yesterday" : p.date;
  return `${label}, ${formatClock(p.minutes)}`;
}
