import { z } from "zod";
import { DEFAULT_DAY_START_HOUR } from "./logical-day";
import { DEFAULT_TZ, isValidTimeZone } from "./time";
import { UsualFoods } from "./usual-foods";

/** User settings and targets. Stored as one JSON document per user. */
export const SettingsSchema = z.strictObject({
  tz: z.string().max(64).refine(isValidTimeZone, "Unknown time zone"),
  day_start_hour: z.int().min(2).max(8),
  water_target_ml: z.int().min(500).max(6000),
  /** Usual tea size, logged by one tap on the Tea tile. */
  tea_ml: z.int().min(50).max(600),
  /** Usual glass of water (also used for amla and chia seed water). */
  water_glass_ml: z.int().min(100).max(1000),
  /** Chia seeds soaked per glass, in tablespoons (for the fiber estimate). */
  chia_tbsp: z.number().min(0.5).max(4),
  /** When true, the protein target follows weight and height (see nutrition.ts). */
  protein_auto: z.boolean(),
  /** Protein target in grams; set by hand when protein_auto is false. */
  protein_target_g: z.int().min(20).max(300).nullable(),
  steps_target: z.int().min(1000).max(40000).nullable(),
  /** Target bedtime in minutes after local midnight, may exceed 1440 (e.g. 1470 = 12:30 AM). */
  bedtime_target_min: z.int().min(20 * 60).max(28 * 60),
  isabgol_delay_min: z.int().min(30).max(240),
  weight_kg: z.number().min(25).max(300).nullable(),
  height_cm: z.number().min(100).max(250).nullable(),
  /** Optional, only for the calorie estimate. */
  birth_year: z.int().min(1920).max(2015).nullable(),
  sex: z.enum(["male", "female"]).nullable(),
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
  /** One-tap foods with known values (a packaged label or a fixed portion). */
  usual_foods: UsualFoods,
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
  water_glass_ml: 250,
  chia_tbsp: 1,
  protein_auto: true,
  protein_target_g: null,
  steps_target: null,
  bedtime_target_min: 24 * 60 + 30,
  isabgol_delay_min: 90,
  weight_kg: null,
  height_cm: null,
  birth_year: null,
  sex: null,
  classes: [],
  usual_foods: [],
  max_pushes_per_day: 4,
  quiet_start_min: 23 * 60 + 30,
  quiet_end_min: 7 * 60,
  ladder_index: 0,
  ladder_since: null,
};

/** Fields the user may change from the Settings screen (server-managed ones excluded). */
export const SettingsUpdate = SettingsSchema.omit({ ladder_index: true, ladder_since: true }).partial();

/**
 * Fills missing fields with defaults so older stored documents keep working. A field that
 * fails its own check falls back alone; the rest of the person's settings are kept.
 */
export function withDefaults(stored: unknown): Settings {
  const source = (typeof stored === "object" && stored ? stored : {}) as Record<string, unknown>;
  const repaired: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const shape = SettingsSchema.shape as Record<string, z.ZodType>;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in source)) continue;
    if (shape[key]?.safeParse(source[key]).success) repaired[key] = source[key];
  }
  const parsed = SettingsSchema.safeParse(repaired);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

