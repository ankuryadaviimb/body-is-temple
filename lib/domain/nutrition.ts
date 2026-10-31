import { mainMeals, ofKind } from "./day";
import { mealAnalysisOf, payloadOf, type Nutrient, type StoredEvent } from "./events";
import type { Settings } from "./settings";
import { localParts } from "./time";

/**
 * Daily nutrition from meal photo estimates, and targets from the person's own numbers.
 * Photo estimates are rough (often 20 to 30% off), so totals are shown as ranges or
 * "about" values, never as exact counts.
 */

export type Range = { low: number; high: number };

/** Protein per kg for someone who trains most days and wants to lose fat while building strength. */
export const PROTEIN_PER_KG = 1.4;
/** Fiber per day, including Isabgol and chia (common guidance is 25 to 35 g). */
export const FIBER_TARGET_G = 30;
/** Servings of vegetables and fruit per day (about 400 g). */
export const PLANT_TARGET = 5;
/** Psyllium husk is mostly soluble fiber: about 3 g of fiber per teaspoon. */
export const ISABGOL_FIBER_PER_TSP = 3;
/** Chia seeds: about 3.5 g of fiber per tablespoon. */
export const CHIA_FIBER_PER_TBSP = 3.5;
/** Training most days: moderate activity factor. */
const ACTIVITY = 1.55;

/** The nutrients worth checking every day on a mostly vegetarian Indian diet. */
export const CORE_NUTRIENTS: Nutrient[] = ["iron", "calcium", "vitamin_c", "b12", "folate", "potassium"];

export const NUTRIENT_LABEL: Record<Nutrient, string> = {
  iron: "Iron",
  calcium: "Calcium",
  vitamin_c: "Vitamin C",
  b12: "Vitamin B12",
  folate: "Folate",
  potassium: "Potassium",
  magnesium: "Magnesium",
  vitamin_a: "Vitamin A",
  zinc: "Zinc",
  omega3: "Omega 3",
};

/** Gentle, mostly vegetarian sources, for "what to add" suggestions. */
export const NUTRIENT_SOURCES: Record<Nutrient, string> = {
  iron: "palak, dal, poha with lemon, or ragi",
  calcium: "curd, paneer, milk or ragi",
  vitamin_c: "amla, guava, orange or lemon",
  b12: "curd, milk or paneer (ask your doctor about a supplement)",
  folate: "dal, palak or other leafy greens",
  potassium: "banana, coconut water, dal or potato",
  magnesium: "nuts, seeds or whole grains",
  vitamin_a: "carrot, pumpkin, papaya or palak",
  zinc: "seeds, nuts, dal or paneer",
  omega3: "flax seeds, chia or walnuts",
};

const round5 = (x: number) => Math.round(x / 5) * 5;
const mid = (r: Range) => Math.round((r.low + r.high) / 2);

export type ProteinTarget = { grams: number; perKg: number; basisKg: number; capped: boolean };

/**
 * 1.4 g per kg of body weight. Above a BMI of 25 it uses the weight at BMI 25 for the
 * person's height, so a fat-loss target does not climb with extra body fat.
 */
export function autoProtein(weightKg: number | null, heightCm: number | null): ProteinTarget | null {
  if (!weightKg) return null;
  let basis = weightKg;
  let capped = false;
  if (heightCm) {
    const reference = 25 * (heightCm / 100) ** 2;
    if (weightKg > reference) {
      basis = reference;
      capped = true;
    }
  }
  return { grams: round5(basis * PROTEIN_PER_KG), perKg: PROTEIN_PER_KG, basisKg: Math.round(basis), capped };
}

export function proteinTarget(settings: Settings): number | null {
  return settings.protein_auto ? (autoProtein(settings.weight_kg, settings.height_cm)?.grams ?? null) : settings.protein_target_g;
}

export function ageOf(settings: Settings, now: Date = new Date()): number | null {
  return settings.birth_year ? now.getFullYear() - settings.birth_year : null;
}

/**
 * Calories for steady fat loss: 80 to 90% of daily needs (Mifflin-St Jeor resting energy
 * times an activity factor for training most days). Needs weight, height, age and sex.
 */
export function calorieTarget(settings: Settings, now: Date = new Date()): Range | null {
  const age = ageOf(settings, now);
  const { weight_kg: w, height_cm: h, sex } = settings;
  if (!w || !h || !age || !sex) return null;
  const bmr = 10 * w + 6.25 * h - 5 * age + (sex === "male" ? 5 : -161);
  const daily = bmr * ACTIVITY;
  return { low: Math.round((daily * 0.8) / 50) * 50, high: Math.round((daily * 0.9) / 50) * 50 };
}

export type Targets = {
  protein: number | null;
  fiber: number;
  plants: number;
  kcal: Range | null;
  /** From the calorie target: carbs 45 to 55% and fat 20 to 30% of calories. */
  carbs: Range | null;
  fat: Range | null;
};

export function dailyTargets(settings: Settings, now: Date = new Date()): Targets {
  const kcal = calorieTarget(settings, now);
  return {
    protein: proteinTarget(settings),
    fiber: FIBER_TARGET_G,
    plants: PLANT_TARGET,
    kcal,
    carbs: kcal ? { low: round5((kcal.low * 0.45) / 4), high: round5((kcal.high * 0.55) / 4) } : null,
    fat: kcal ? { low: round5((kcal.low * 0.2) / 9), high: round5((kcal.high * 0.3) / 9) } : null,
  };
}

export type DayNutrition = {
  meals: number;
  analyzed: number;
  pending: number;
  mainMeals: number;
  protein: Range;
  carbs: Range;
  fat: Range;
  fiber: Range;
  kcal: Range;
  /** False when some analyzed meals predate the carbs, fat and fiber estimates. */
  macrosKnown: boolean;
  /** False when some analyzed meals predate the vegetable and nutrient estimates (unknown is not zero). */
  detailsKnown: boolean;
  veg: number;
  fruit: number;
  /** Fiber from Isabgol and chia seeds, already included in `fiber`. */
  extraFiber: number;
  covered: Nutrient[];
  missing: Nutrient[];
};

const add = (a: Range, b: Range | undefined): Range => (b ? { low: a.low + b.low, high: a.high + b.high } : a);

export function dayNutrition(day: StoredEvent[], settings: Settings): DayNutrition {
  const meals = ofKind(day, "meal");
  let protein: Range = { low: 0, high: 0 };
  let carbs: Range = { low: 0, high: 0 };
  let fat: Range = { low: 0, high: 0 };
  let fiber: Range = { low: 0, high: 0 };
  let kcal: Range = { low: 0, high: 0 };
  let veg = 0;
  let fruit = 0;
  let analyzed = 0;
  let macrosKnown = true;
  let detailsKnown = true;
  const covered = new Set<Nutrient>();

  for (const m of meals) {
    const a = mealAnalysisOf(m);
    if (!a) continue;
    analyzed += 1;
    protein = add(protein, a.protein_g);
    kcal = add(kcal, a.kcal);
    if (!a.carbs_g || !a.fat_g || !a.fiber_g) macrosKnown = false;
    if (a.nutrients === undefined || a.veg_servings === undefined) detailsKnown = false;
    carbs = add(carbs, a.carbs_g);
    fat = add(fat, a.fat_g);
    fiber = add(fiber, a.fiber_g);
    veg += a.veg_servings ?? 0;
    fruit += a.fruit_servings ?? 0;
    for (const n of a.nutrients ?? []) covered.add(n);
  }

  let extraFiber = 0;
  for (const i of ofKind(day, "isabgol")) extraFiber += (payloadOf(i, "isabgol")?.tsp ?? 0) * ISABGOL_FIBER_PER_TSP;
  for (const d of ofKind(day, "drink")) {
    const p = payloadOf(d, "drink");
    if (p?.type === "chia") extraFiber += settings.chia_tbsp * CHIA_FIBER_PER_TBSP;
    if (p?.type === "amla") covered.add("vitamin_c");
  }
  if (ofKind(day, "drink").some((d) => payloadOf(d, "drink")?.type === "chia")) covered.add("omega3");
  extraFiber = Math.round(extraFiber);
  fiber = { low: fiber.low + extraFiber, high: fiber.high + extraFiber };

  return {
    meals: meals.length,
    analyzed,
    pending: meals.filter((m) => m.meta?.ai_status === "pending").length,
    mainMeals: mainMeals(day).length,
    protein,
    carbs,
    fat,
    fiber,
    kcal,
    macrosKnown: analyzed > 0 && macrosKnown,
    detailsKnown: analyzed > 0 && detailsKnown,
    veg: Math.round(veg * 2) / 2,
    fruit: Math.round(fruit * 2) / 2,
    extraFiber,
    covered: CORE_NUTRIENTS.filter((n) => covered.has(n)),
    missing: CORE_NUTRIENTS.filter((n) => !covered.has(n)),
  };
}

const NUTRIENT_SOURCES_PROTEIN = "paneer, curd, tofu or moong dal";

export type Gap = { key: "protein" | "fiber" | "plants" | Nutrient; text: string };

/**
 * What is behind so far. Expectations grow with the main meals eaten (a skipped breakfast
 * is fine), and become the full day after dinner or late in the evening.
 */
export function gaps(n: DayNutrition, t: Targets, now: Date, tz: string): Gap[] {
  if (n.analyzed === 0) return [];
  const late = localParts(now, tz).minutes >= 21 * 60 || localParts(now, tz).minutes < 4 * 60;
  const share = late ? 1 : Math.min(1, Math.max(n.mainMeals, 1) / 3);
  const out: Gap[] = [];
  const protein = mid(n.protein);
  if (t.protein && protein < t.protein * share * 0.8) {
    out.push({ key: "protein", text: `Protein is about ${Math.max(0, Math.round(t.protein * share) - protein)} g behind. Add ${NUTRIENT_SOURCES_PROTEIN}.` });
  }
  const fiber = mid(n.fiber);
  if (n.macrosKnown && fiber < t.fiber * share * 0.8) {
    out.push({ key: "fiber", text: `Fiber is about ${Math.max(0, Math.round(t.fiber * share) - fiber)} g behind. Add cooked vegetables, a fruit or oats.` });
  }
  const plants = n.veg + n.fruit;
  if (n.detailsKnown && plants < t.plants * share * 0.6) {
    out.push({ key: "plants", text: `${plants} of ${t.plants} servings of vegetables and fruit so far. A cooked sabzi or a fruit counts.` });
  }
  if (n.detailsKnown && (late || n.mainMeals >= 2)) {
    for (const k of n.missing.slice(0, 2)) out.push({ key: k, text: `No good source of ${NUTRIENT_LABEL[k].toLowerCase()} yet: ${NUTRIENT_SOURCES[k]}.` });
  }
  return out.slice(0, 4);
}

/** "18 g" style midpoint for display. */
export function about(r: Range): number {
  return mid(r);
}
