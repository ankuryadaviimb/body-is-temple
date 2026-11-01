import { z } from "zod";
import { MEAL_TAGS, NUTRIENTS, type MealAnalysis, type Payload } from "./events";

/**
 * Usual foods: things eaten often whose values are known (a packaged label, or a fixed
 * portion like one small banana). One tap logs them with exact values, so they never
 * wait on AI, work offline, and never get a wrong guess. They live in the person's
 * settings, never in code. Pure, no I/O.
 */

export const USUAL_ICONS = ["bar", "fruit", "scoop", "bowl", "cup", "nuts", "egg", "plate"] as const;
export type UsualIcon = (typeof USUAL_ICONS)[number];

const grams = (max: number) => z.number().min(0).max(max);

export const UsualFood = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  /** Full name, saved on the log and read by the coach ("Whole wheat protein bar, 52 g"). */
  name: z.string().trim().min(1).max(80),
  /** Short label for the one-tap button. */
  label: z.string().trim().min(1).max(14),
  /** What one tap means, for example "1 bar (52 g)". */
  serving: z.string().trim().min(1).max(40),
  icon: z.enum(USUAL_ICONS),
  kcal: grams(2000),
  protein_g: grams(200),
  carbs_g: grams(300),
  fat_g: grams(200),
  fiber_g: grams(100),
  tags: z.array(z.enum(MEAL_TAGS)).max(8),
  nutrients: z.array(z.enum(NUTRIENTS)).max(6),
  fruit_servings: z.number().min(0).max(5),
  /** Logged as a snack, so it never takes the place of a main meal. */
  snack: z.boolean(),
});
export type UsualFood = z.infer<typeof UsualFood>;

export const MAX_USUAL_FOODS = 12;

export const UsualFoods = z
  .array(UsualFood)
  .max(MAX_USUAL_FOODS)
  .refine((list) => new Set(list.map((f) => f.id)).size === list.length, "Each usual food needs its own id");

const exact = (v: number) => ({ low: round1(v), high: round1(v) });
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** The meal analysis for one serving, read from the label, so confidence is full. */
export function analysisFromUsual(food: UsualFood): MealAnalysis {
  return {
    items: [{ name: food.name.slice(0, 80), qty: 1, unit: food.serving.slice(0, 30) }],
    tags: [...food.tags],
    protein_g: exact(food.protein_g),
    kcal: exact(food.kcal),
    carbs_g: exact(food.carbs_g),
    fat_g: exact(food.fat_g),
    fiber_g: exact(food.fiber_g),
    veg_servings: 0,
    fruit_servings: food.fruit_servings,
    nutrients: [...food.nutrients],
    slot_guess: food.snack ? "snack" : null,
    confidence: 1,
    notes: null,
  };
}

/** The meal payload for one tap on a usual food. */
export function usualMealPayload(food: UsualFood): Payload<"meal"> {
  return {
    text: `${food.name} (${food.serving})`.slice(0, 500),
    usual: food.id,
    ...(food.snack ? { slot: "snack" as const, slot_chosen: true } : {}),
  };
}

/** Server-managed fields for a usual-food meal: done at once, no AI call. */
export function usualMealMeta(food: UsualFood): { ai_status: "done"; analysis: MealAnalysis } {
  return { ai_status: "done", analysis: analysisFromUsual(food) };
}

export function findUsual(list: readonly UsualFood[], id: unknown): UsualFood | null {
  return typeof id === "string" ? (list.find((f) => f.id === id) ?? null) : null;
}

/** A readable, unique id from the label ("Protein bar" to "protein-bar", then "protein-bar-2"). */
export function usualIdFor(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "food";
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 100; i += 1) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`.slice(0, 40);
}
