import { lastDinner, mainMeals, mealSlotOf, ofKind, proteinEstimate } from "../day";
import { mealAnalysisOf, type StoredEvent } from "../events";
import { about, dailyTargets, dayNutrition, gaps, proteinTarget } from "../nutrition";
import type { Settings } from "../settings";
import { localParts, minutesBetween } from "../time";
import { clockOf, joinList, mealItems } from "./facts";

/** "Did I eat right today?": wins and fixes from today's analyzed meals, by plain rules. */

export type EatingReview = {
  headline: string;
  wins: string[];
  fixes: string[];
  pending: number;
  protein: { grams: number; target: number | null; analyzedMeals: number };
};

const GENTLE_TAGS = new Set(["dal", "cooked_veg", "fruit", "high_protein"]);

export function reviewEating(today: StoredEvent[], settings: Settings, now: Date): EatingReview {
  const meals = ofKind(today, "meal").filter((m) => minutesBetween(m.occurred_at, now) >= 0);
  const analyzed = meals.filter((m) => mealAnalysisOf(m) !== null);
  const pending = meals.filter((m) => m.meta?.ai_status === "pending").length;
  const protein = { ...proteinEstimate(meals), target: proteinTarget(settings) };

  if (meals.length === 0) {
    return { headline: "No meals logged yet today", wins: [], fixes: [], pending, protein };
  }
  if (analyzed.length === 0) {
    return {
      headline: pending > 0 ? "Your meals are still being read. Check again in a minute." : "I cannot see what you ate yet",
      wins: [],
      fixes: pending > 0 ? [] : ["Add a photo or a few words to your meals, so I can check them."],
      pending,
      protein,
    };
  }

  const wins: string[] = [];
  const fixes: string[] = [];
  const legumeMeals = analyzed.filter((m) => mealAnalysisOf(m)!.tags.includes("legume"));

  for (const m of analyzed) {
    const tags = new Set(mealAnalysisOf(m)!.tags);
    const slot = mealSlotOf(m);
    const late = slot === "dinner" || slot === "late";
    const items = mealItems(m) ?? "that meal";
    if (tags.has("fried") && tags.has("legume")) fixes.push(`${items} is a heavy combo (fried plus beans or chickpeas) for gas.`);
    else if (tags.has("peanuts")) fixes.push("Peanuts are legumes and often gassy. A small handful is the safer amount.");
    if (late && tags.has("raw_veg")) fixes.push("Raw salad at night is rough fiber. Cooked vegetables are gentler in the evening.");
    if (tags.has("maida") && localParts(m.occurred_at, settings.tz).minutes >= 16 * 60) fixes.push("Maida late in the day. Roti or rice is the easier swap.");
    if (late && tags.has("large_portion")) fixes.push("A big dinner. A lighter one helps the night and the morning.");
  }
  if (legumeMeals.length >= 2) fixes.push(`Beans or chickpeas in ${legumeMeals.length} meals today. One a day is easier on gas.`);

  const dinner = lastDinner(meals);
  if (dinner) {
    const minutes = localParts(dinner.occurred_at, settings.tz).minutes;
    if (minutes >= 22 * 60 || minutes < 4 * 60) fixes.push(`Late dinner (${clockOf(dinner.occurred_at, settings.tz)}). Finishing 2 to 3 hours before bed helps.`);
    else if (minutes <= 21 * 60) wins.push(`Dinner by ${clockOf(dinner.occurred_at, settings.tz)}, early enough to settle before bed`);
  }

  const gentle = analyzed
    .filter((m) => {
      const tags = mealAnalysisOf(m)!.tags;
      return tags.some((t) => GENTLE_TAGS.has(t)) && !tags.includes("fried") && !tags.includes("legume");
    })
    .map((m) => mealItems(m))
    .filter((s): s is string => s !== null);
  if (gentle.length > 0) wins.push(`Gentle choices: ${joinList(gentle.slice(0, 2))}`);

  const walks = ofKind(today, "walk").map((w) => new Date(w.occurred_at).getTime());
  const walkedAfter = mainMeals(meals).filter((m) => {
    const t0 = new Date(m.occurred_at).getTime();
    return walks.some((t) => t >= t0 && t - t0 <= 90 * 60_000);
  });
  if (walkedAfter.length > 0) wins.push(`Walked after ${joinList(walkedAfter.map((m) => mealSlotOf(m) ?? "a meal"))}`);

  if (protein.target) {
    const main = Math.max(1, Math.min(3, mainMeals(analyzed).length));
    const expected = Math.round((protein.target * main) / 3);
    if (protein.grams >= expected * 0.85) wins.push(`Protein on track: about ${protein.grams} g so far of ${protein.target} g`);
    else fixes.push(`Protein is low: about ${protein.grams} g so far of ${protein.target} g. Add paneer, curd, tofu or dal at the next meal.`);
  }

  // Fiber, vegetables and key nutrients from the photo estimates (protein is handled above).
  const n = dayNutrition(today, settings);
  const t = dailyTargets(settings, now);
  const nutritionGaps = gaps(n, t, now, settings.tz).filter((g) => g.key !== "protein");
  if (n.macrosKnown && !nutritionGaps.some((g) => g.key === "fiber")) wins.push(`Fiber about ${about(n.fiber)} of ${t.fiber} g so far`);
  for (const g of nutritionGaps) fixes.push(g.text);

  const uniqueFixes = [...new Set(fixes)];
  const headline =
    uniqueFixes.length === 0
      ? "Yes. A gut-friendly day so far"
      : uniqueFixes.length === 1
        ? "Mostly right, with one thing to adjust"
        : "A heavy day for your gut. A few things to adjust";
  return { headline, wins: wins.slice(0, 3), fixes: uniqueFixes.slice(0, 3), pending, protein };
}
