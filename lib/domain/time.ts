import { TZDate } from "@date-fns/tz";

/** Default time zone until the app reads the phone's own time zone on first run. */
export const DEFAULT_TZ = "UTC";

export type LocalParts = {
  /** Calendar date in the given time zone, formatted YYYY-MM-DD. */
  date: string;
  hour: number;
  minute: number;
  /** Minutes since local midnight (0 to 1439). */
  minutes: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export function toDate(value: string | number | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError("Invalid date value");
  }
  return d;
}

/** Splits an instant into local calendar parts for a time zone. */
export function localParts(value: string | number | Date, tz: string): LocalParts {
  const parts = formatterFor(tz).formatToParts(toDate(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

/** Adds whole days to a YYYY-MM-DD calendar date (time zone independent). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** Number of calendar days from `a` to `b` (b minus a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Converts a local wall-clock time in a time zone to the UTC instant. */
export function localToInstant(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(new TZDate(y, m - 1, d, hour, minute, tz).getTime());
}

export function minutesBetween(a: string | Date, b: string | Date): number {
  return (toDate(b).getTime() - toDate(a).getTime()) / 60_000;
}

/** Formats minutes since midnight as "10:30 PM". */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
