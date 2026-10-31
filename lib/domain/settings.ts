import { z } from "zod";
import { DEFAULT_DAY_START_HOUR } from "./logical-day";
import { DEFAULT_TZ, isValidTimeZone } from "./time";

/** User settings and targets. Stored as one JSON document per user. */
export const SettingsSchema = z.strictObject({
  tz: z.string().max(64).refine(isValidTimeZone, "Unknown time zone"),
  day_start_hour: z.int().min(2).max(8),
  water_target_ml: z.int().min(500).max(6000),
  /** Usual tea size, logged by one tap on the Tea tile. */
  tea_ml: z.int().min(50).max(600),
  /** Starting protein target; the coach tunes it. Null until weight is known. */
  protein_target_g: z.int().min(20).max(300).nullable(),
  steps_target: z.int().min(1000).max(40000).nullable(),
  /** Target bedtime in minutes after local midnight, may exceed 1440 (e.g. 1470 = 12:30 AM). */
  bedtime_target_min: z.int().min(20 * 60).max(28 * 60),
  isabgol_delay_min: z.int().min(30).max(240),
  weight_kg: z.number().min(25).max(300).nullable(),
  height_cm: z.number().min(100).max(250).nullable(),
  /** Weekly class schedule: weekday 0 (Sunday) to 6, start in minutes after midnight. */
  classes: z
    .array(
      z.strictObject({
        weekday: z.int().min(0).max(6),
        start_min: z.int().min(0).max(1439),
        label: z.string().trim().min(1).max(40),
        kind: z.enum(["group", "yoga", "other"]),
      }),
    )
    .max(21),
  /** Hard cap on push notifications per day (used from M2). */
  max_pushes_per_day: z.int().min(0).max(8),
  quiet_start_min: z.int().min(0).max(1439),
  quiet_end_min: z.int().min(0).max(1439),
  /** Habit ladder progress, advanced by the server from completed days only. */
  ladder_index: z.int().min(0).max(20),
  ladder_since: z.iso.date().nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  tz: DEFAULT_TZ,
  day_start_hour: DEFAULT_DAY_START_HOUR,
  water_target_ml: 2500,
  tea_ml: 300,
  protein_target_g: null,
  steps_target: null,
  bedtime_target_min: 24 * 60 + 30,
  isabgol_delay_min: 90,
  weight_kg: null,
  height_cm: null,
  classes: [],
  max_pushes_per_day: 4,
  quiet_start_min: 23 * 60 + 30,
  quiet_end_min: 7 * 60,
  ladder_index: 0,
  ladder_since: null,
};

/** Fields the user may change from the Settings screen (server-managed ones excluded). */
export const SettingsUpdate = SettingsSchema.omit({ ladder_index: true, ladder_since: true }).partial();

/** Fills missing fields with defaults so older stored documents keep working. */
export function withDefaults(stored: unknown): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(typeof stored === "object" && stored ? stored : {}) };
  const parsed = SettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

/** Starting protein target: 1.2 g per kg of body weight, rounded to 5 g. */
export function startingProteinTarget(weightKg: number | null): number | null {
  if (!weightKg) return null;
  return Math.round((weightKg * 1.2) / 5) * 5;
}
