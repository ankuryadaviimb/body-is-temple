import { lastDinner, ofKind, proteinEstimate } from "../day";
import { mealAnalysisOf, type StoredEvent } from "../events";
import type { Settings } from "../settings";
import type { ToleranceReport } from "../tolerance";
import { formatClock, localParts } from "../time";
import { joinList } from "./facts";

/** "What should I eat for dinner?": light, protein-aware ideas that avoid today's load. */

export type DinnerAdvice = { headline: string; ideas: string[]; why: string[]; timing: string[]; skip: string | null };

const HEAVY = new Set(["legume", "fried", "maida", "large_portion", "peanuts"]);

export function dinnerAdvice(today: StoredEvent[], settings: Settings, now: Date, tolerance: ToleranceReport | null): DinnerAdvice {
  const meals = ofKind(today, "meal");
  const heavyMeals = meals.filter((m) => mealAnalysisOf(m)?.tags.some((t) => HEAVY.has(t)));
  const protein = proteinEstimate(meals);
  const gap = settings.protein_target_g ? settings.protein_target_g - protein.grams : 0;
  const local = localParts(now, settings.tz).minutes;
  const late = local >= 21 * 60 + 30 || local < 4 * 60;
  const why: string[] = [];

  let headline: string;
  let ideas: string[];
  if (late) {
    headline = "Small and simple. It is late";
    ideas = ["A small bowl of moong dal khichdi", "Curd rice", "Vegetable soup with one roti"];
    why.push("Late food sits overnight and often means more gas and a slower morning.");
  } else if (heavyMeals.length > 0) {
    headline = "Keep dinner light tonight";
    ideas = ["Moong dal khichdi with curd", "Roti with lauki or tori sabzi", "Curd rice with cooked vegetables"];
    why.push("You already had a heavy meal today, so the gut has enough to work through.");
  } else if (gap >= 20) {
    headline = "A light dinner with some protein";
    ideas = ["Paneer or tofu with cooked vegetables and a roti", "Moong dal with rice and curd", "Besan chilla with curd"];
    why.push(`Protein is about ${gap} g short of today's target.`);
  } else {
    headline = "Anything gentle works tonight";
    ideas = ["Dal, roti and a cooked sabzi", "Khichdi with curd", "Idli with a little sambhar"];
  }

  const personal = (tolerance?.findings ?? [])
    .filter((f) => f.effect === "worse" && (f.outcome === "evening_gas" || f.outcome === "next_rounds") && f.exposure.kind !== "habit")
    .map((f) => f.exposure.label.toLowerCase());
  const skip = personal.length
    ? `Skip tonight: ${joinList([...new Set(personal)].slice(0, 3))} (your logs link them to more gas or rounds).`
    : "Skip tonight: beans and chickpeas, fried food and raw salad.";

  const timing: string[] = [];
  const bedtime = settings.bedtime_target_min;
  const finishBy = bedtime - 150;
  const dinner = lastDinner(today);
  if (!dinner) {
    timing.push(late ? "Eat soon and keep it small." : `Finish by ${formatClock(finishBy)}, 2.5 hours before your ${formatClock(bedtime)} bedtime.`);
    timing.push(`Isabgol about ${settings.isabgol_delay_min} minutes after you eat.`);
  }
  return { headline, ideas, why, timing: timing.slice(0, 2), skip };
}
