"use client";

import { DEFAULT_SETTINGS, type Settings } from "@/lib/domain/settings";
import { isValidTimeZone } from "@/lib/domain/time";

/**
 * Settings to use before the server's copy has loaded (first open, after sign out).
 * The phone's own time zone, never UTC, so dates and times are local from the first tap.
 */
let cached: Settings | null = null;

export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : DEFAULT_SETTINGS.tz;
  } catch {
    return DEFAULT_SETTINGS.tz;
  }
}

export function deviceSettings(): Settings {
  if (!cached) cached = { ...DEFAULT_SETTINGS, tz: deviceTimeZone() };
  return cached;
}
