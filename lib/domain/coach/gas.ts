import { mainMeals, ofKind } from "../day";
import { mealAnalysisOf, payloadOf, type MealTag, type StoredEvent } from "../events";
import { normalizeFood } from "../foods";
import { findingsFor, findingValue, type ToleranceReport } from "../tolerance";
import { formatGap } from "../ladder";
import { localParts, minutesBetween } from "../time";
import { clockOf, joinList, mealPhrase } from "./facts";

/**
 * "Why am I gassy?": ranks the likely causes from the last 30 hours of logs.
 * Gas from fermenting food usually builds 2 to 14 hours after eating, so those meals
 * weigh most. Personal tolerance patterns, when there are enough days, weigh extra.
 */

export type Culprit = { title: string; detail: string; score: number };

const TAG_GAS: Partial<Record<MealTag, { weight: number; label: string }>> = {
  legume: { weight: 3, label: "beans or chickpeas" },
  peanuts: { weight: 2, label: "peanuts" },
  fried: { weight: 1.6, label: "fried food" },
  large_portion: { weight: 1.4, label: "a big portion" },
  raw_veg: { weight: 1, label: "raw salad" },
  maida: { weight: 1, label: "maida" },
  dairy: { weight: 0.8, label: "milk or dairy" },
  spicy: { weight: 0.7, label: "spicy food" },
  sweet: { weight: 0.5, label: "sweets" },
  packaged: { weight: 0.5, label: "packaged food" },
};

function recency(hoursAgo: number): number {
  if (hoursAgo < 0) return 0;
  if (hoursAgo < 2) return 0.6;
  if (hoursAgo <= 14) return 1;
  if (hoursAgo <= 30) return 0.5;
  return 0;
}

export function gasCulprits(events: StoredEvent[], now: Date, tz: string, tolerance: ToleranceReport | null): Culprit[] {
  const culprits: Culprit[] = [];

  for (const meal of ofKind(events, "meal")) {
    const a = mealAnalysisOf(meal);
    if (!a) continue;
    const hours = minutesBetween(meal.occurred_at, now) / 60;
    const r = recency(hours);
    if (r === 0) continue;
    const tags = [...new Set(a.tags)]
      .filter((t) => TAG_GAS[t])
      .sort((x, y) => (TAG_GAS[y]?.weight ?? 0) - (TAG_GAS[x]?.weight ?? 0))
      .slice(0, 3);
    const foodKeys = a.items.map((i) => normalizeFood(i.name)).filter((f): f is string => f !== null).map((f) => `food:${f}`);
    const personal = findingsFor(tolerance, [...tags.map((t) => `tag:${t}`), ...foodKeys], "evening_gas").filter((f) => f.effect === "worse");
    const base = tags.reduce((s, t) => s + (TAG_GAS[t]?.weight ?? 0), 0);
    if (base === 0 && personal.length === 0) continue;
    const score = (base + personal.length * 1.5) * r;
    const parts: string[] = [];
    if (tags.length) parts.push(`${joinList(tags.map((t) => TAG_GAS[t]!.label))}, ${formatGap(Math.max(0, Math.round(hours * 60)))} ago.`);
    if (personal[0]) {
      const f = personal[0];
      parts.push(`Your logs: gas ${findingValue(f, "with")} vs ${findingValue(f, "without")} on days with ${f.exposure.label.toLowerCase()}.`);
    }
    culprits.push({ title: mealPhrase(meal, tz), detail: parts.join(" "), score });
  }

  const todayMeals = mainMeals(events).filter((m) => {
    const ago = minutesBetween(m.occurred_at, now);
    return ago >= 0 && ago <= 16 * 60;
  });
  if (todayMeals.length > 0) {
    const walks = ofKind(events, "walk").map((w) => new Date(w.occurred_at).getTime());
    const walked = todayMeals.some((m) => {
      const t0 = new Date(m.occurred_at).getTime();
      return walks.some((t) => t >= t0 && t - t0 <= 90 * 60_000);
    });
    if (!walked) {
      culprits.push({ title: "No walk after meals", detail: "A 10-minute walk after eating helps gas move along.", score: 0.8 });
    }
  }

  const lateMeal = ofKind(events, "meal").find((m) => {
    const ago = minutesBetween(m.occurred_at, now) / 60;
    const local = localParts(m.occurred_at, tz).minutes;
    return ago >= 8 && ago <= 30 && (local >= 22 * 60 || local < 4 * 60);
  });
  if (lateMeal) {
    culprits.push({ title: `Late dinner (${clockOf(lateMeal.occurred_at, tz)})`, detail: "Food eaten late sits overnight and often shows up as morning gas.", score: 0.6 });
  }

  const stress = ofKind(events, "stress").some((s) => (payloadOf(s, "stress")?.level ?? 0) >= 4 && minutesBetween(s.occurred_at, now) <= 16 * 60);
  if (stress) {
    culprits.push({ title: "High stress", detail: "Stress makes gut sensations feel stronger and slows things down.", score: 0.5 });
  }

  return culprits.filter((c) => c.score >= 0.4).sort((a, b) => b.score - a.score).slice(0, 3);
}
