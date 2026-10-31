import { isabgolGapAfterDinner, lastDinner, ofKind, summarizeToilet, waterMl } from "../day";
import { mealAnalysisOf, payloadOf, type StoredEvent } from "../events";
import { BRISTOL_LABELS, formatGap } from "../ladder";
import type { Settings } from "../settings";
import { findingsFor, findingValue, type ToleranceReport } from "../tolerance";
import { localParts, minutesBetween } from "../time";
import { clockOf, joinList, mealItems } from "./facts";

/**
 * "Why was my morning rough?": this morning's rounds next to what happened yesterday.
 * Ranked by what usually matters most for the next morning: Isabgol timing, dinner,
 * heavy foods, bedtime, water, stress, and toilet technique this morning.
 */

export type MorningReview = { headline: string; factors: string[]; wins: string[]; next: string[]; good: boolean; noData: boolean };

const HEAVY = new Set(["legume", "fried", "peanuts", "maida", "large_portion"]);

function nightMinutes(iso: string, tz: string): number {
  const m = localParts(iso, tz).minutes;
  return m < 12 * 60 ? m + 1440 : m;
}

export function reviewMorning(yesterday: StoredEvent[], today: StoredEvent[], settings: Settings, tolerance: ToleranceReport | null): MorningReview {
  const tz = settings.tz;
  const t = summarizeToilet(today);
  if (t.visits === 0) {
    return {
      headline: "No rounds logged yet this morning",
      factors: [],
      wins: [],
      next: ["Log each round after the toilet session, and I can compare it with yesterday."],
      good: false,
      noData: true,
    };
  }
  const smooth = t.firstPassBristol === 3 || t.firstPassBristol === 4;
  const good = t.visits <= 1 && smooth;
  const outcome = `${t.visits} ${t.visits === 1 ? "round" : "rounds"}${t.firstPassBristol ? `, first pass type ${t.firstPassBristol} (${BRISTOL_LABELS[t.firstPassBristol]})` : ""}`;

  const factors: string[] = [];
  const wins: string[] = [];
  const next: string[] = [];

  const dinner = lastDinner(yesterday);
  const isabgol = ofKind(yesterday, "isabgol").at(-1);
  const gap = isabgolGapAfterDinner(yesterday);
  if (gap !== null && gap > 150) {
    factors.push(`Isabgol came ${formatGap(gap)} after dinner (the aim is about ${settings.isabgol_delay_min} min).`);
    next.push(`Tonight: Isabgol about ${settings.isabgol_delay_min} minutes after dinner.`);
  } else if (gap !== null && gap < 60) {
    factors.push(`Isabgol came only ${gap} min after dinner.`);
  } else if (gap !== null) {
    wins.push(`Isabgol on time (${formatGap(gap)} after dinner)`);
  } else if (dinner && !isabgol) {
    factors.push("No Isabgol logged last night.");
  }

  if (dinner) {
    const at = localParts(dinner.occurred_at, tz).minutes;
    if (at >= 22 * 60 || at < 4 * 60) factors.push(`Dinner was late, at ${clockOf(dinner.occurred_at, tz)}.`);
    else if (at <= 21 * 60) wins.push(`Early dinner (${clockOf(dinner.occurred_at, tz)})`);
  }

  const heavyMeals = ofKind(yesterday, "meal").filter((m) => mealAnalysisOf(m)?.tags.some((tag) => HEAVY.has(tag)));
  if (heavyMeals.length > 0) {
    const names = heavyMeals.map((m) => mealItems(m)).filter((s): s is string => s !== null);
    factors.push(`Heavy food yesterday: ${joinList(names.slice(0, 2))}.`);
  }

  const sleep = ofKind(yesterday, "sleep").at(-1);
  const wake = ofKind(today, "wake")[0];
  if (sleep) {
    const late = nightMinutes(sleep.occurred_at, tz) - settings.bedtime_target_min;
    if (late > 30) factors.push(`Bed at ${clockOf(sleep.occurred_at, tz)}, ${formatGap(late)} after your target.`);
    if (wake) {
      const slept = minutesBetween(sleep.occurred_at, wake.occurred_at);
      if (slept > 0 && slept < 6.5 * 60) factors.push(`About ${formatGap(Math.round(slept))} of sleep.`);
    }
  }

  const water = waterMl(yesterday);
  if (yesterday.length >= 4 && water < settings.water_target_ml * 0.6) {
    factors.push(`Water was low yesterday (${water.toLocaleString("en-IN")} of ${settings.water_target_ml.toLocaleString("en-IN")} ml).`);
  }
  const stressed = ofKind(yesterday, "stress").some((s) => (payloadOf(s, "stress")?.level ?? 0) >= 4);
  if (stressed || ofKind(yesterday, "late_work").length > 0) factors.push("Stress or late work yesterday, which tightens the pelvic floor.");

  const visits = ofKind(today, "toilet").map((v) => payloadOf(v, "toilet")).filter((p): p is NonNullable<typeof p> => p !== null);
  if (visits.some((v) => v.breath_hold === "yes" || v.breath_hold === "some")) {
    factors.push("Breath holding on the toilet this morning. It tightens the floor you are trying to relax.");
  } else if (visits.length > 0 && visits.every((v) => v.breath_hold === "no")) {
    wins.push("No breath holding this morning");
  }
  if (visits.some((v) => (v.strain ?? 0) >= 2)) factors.push("Strong straining this morning.");
  if (t.overFiveMinutes > 0) factors.push(`${t.overFiveMinutes === 1 ? "A visit" : `${t.overFiveMinutes} visits`} went past 5 minutes.`);

  // Personal patterns that match yesterday's foods and habits.
  const keys: string[] = [];
  if (gap !== null && gap > 150) keys.push("habit:isabgol_late");
  if (dinner && (localParts(dinner.occurred_at, tz).minutes >= 22 * 60)) keys.push("habit:late_dinner");
  for (const m of ofKind(yesterday, "meal")) for (const tag of mealAnalysisOf(m)?.tags ?? []) keys.push(`tag:${tag}`);
  const personal = findingsFor(tolerance, keys).filter((f) => f.effect === "worse" && (f.outcome === "next_rounds" || f.outcome === "next_smooth"));
  if (personal[0]) {
    const f = personal[0];
    const what = f.outcome === "next_rounds" ? "rounds" : "smooth mornings";
    factors.unshift(`Your logs: ${what} ${findingValue(f, "with")} vs ${findingValue(f, "without")} after days with ${f.exposure.label.toLowerCase()}.`);
  }

  if (!good) next.push("Today, one round is the goal. If you feel the pull to sit again, do the heavy reset first.");
  const headline = good
    ? `A good morning: ${outcome}`
    : factors.length > 0
      ? `A rough morning: ${outcome}`
      : `${outcome}. Nothing in yesterday's logs stands out`;
  return { headline, factors: factors.slice(0, 4), wins: wins.slice(0, 3), next: next.slice(0, 2), good, noData: false };
}
