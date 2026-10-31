import { isabgolGapAfterDinner, lastDinner, mainMeals, mealSlotOf, ofKind, summarizeToilet } from "./day";
import { mealAnalysisOf, payloadOf, type MealTag, type StoredEvent } from "./events";
import { foodLabel, normalizeFood } from "./foods";
import type { Settings } from "./settings";
import { addDays, localParts } from "./time";

/**
 * Personal food and habit tolerance, computed by code (never by AI).
 *
 * For each food, meal tag and habit, it compares how the gut did on days with it
 * against logged days without it. A pattern is shown only when both sides have at
 * least 5 days and the gap is large next to the day-to-day spread. These are patterns,
 * not proof: foods travel together (poori with chana), so the coach words them as "may".
 */

export const MIN_DAYS = 5;
export const STEADY_DAYS = 10;

export type ExposureKind = "tag" | "food" | "habit";
export type Exposure = { key: string; label: string; kind: ExposureKind };

export const OUTCOMES = {
  evening_gas: { label: "gas that day", short: "gas", higherIsWorse: true, threshold: 0.7 },
  next_rounds: { label: "rounds the next morning", short: "rounds", higherIsWorse: true, threshold: 0.5 },
  next_smooth: { label: "smooth first passes the next morning", short: "smooth mornings", higherIsWorse: false, threshold: 0.2 },
  heavy: { label: "heavy feelings that day", short: "heavy feelings", higherIsWorse: true, threshold: 0.5 },
} as const;
export type OutcomeKey = keyof typeof OUTCOMES;
export const OUTCOME_KEYS = Object.keys(OUTCOMES) as OutcomeKey[];

export type Finding = {
  exposure: Exposure;
  outcome: OutcomeKey;
  withDays: number;
  withoutDays: number;
  withMean: number;
  withoutMean: number;
  /** With minus without, in the outcome's own unit. */
  diff: number;
  effect: "worse" | "better";
  strength: "early" | "steady";
};

export type LearningItem = { exposure: Exposure; withDays: number; withoutDays: number };

export type ToleranceReport = {
  daysLogged: number;
  daysWithMeals: number;
  findings: Finding[];
  learning: LearningItem[];
  outcomeDays: Record<OutcomeKey, number>;
};

const TAG_LABELS: Partial<Record<MealTag | "raw_night", string>> = {
  fried: "Fried food",
  maida: "Maida",
  legume: "Beans and chickpeas",
  dal: "Dal",
  peanuts: "Peanuts",
  spicy: "Spicy food",
  raw_veg: "Raw salad",
  raw_night: "Raw salad at night",
  dairy: "Milk and dairy",
  sweet: "Sweets",
  packaged: "Packaged food",
  large_portion: "Big portions",
};

const HABIT_LABELS = {
  late_dinner: "Dinner after 10 PM",
  isabgol_late: "Isabgol over 2.5 h after dinner",
  late_bed: "Bed 30+ min after your target",
  walk_after_meal: "Walk after a meal",
  practice: "Breathing practice",
  workout: "Class or workout",
  late_work: "Worked late",
  stress_high: "High stress",
} as const;

type DayExposures = { eligible: Set<string>; present: Set<string> };

function minutesAfterMidnightForNight(iso: string, tz: string): number {
  const m = localParts(iso, tz).minutes;
  return m < 12 * 60 ? m + 24 * 60 : m;
}

function walkedAfterMeal(day: StoredEvent[]): boolean {
  const walks = ofKind(day, "walk").map((w) => new Date(w.occurred_at).getTime());
  return mainMeals(day).some((m) => {
    const t0 = new Date(m.occurred_at).getTime();
    return walks.some((t) => t >= t0 && t - t0 <= 90 * 60_000);
  });
}

function exposuresOf(day: StoredEvent[], settings: Settings): DayExposures {
  const eligible = new Set<string>();
  const present = new Set<string>();
  const analyzed = ofKind(day, "meal").filter((m) => mealAnalysisOf(m) !== null);

  if (analyzed.length > 0) {
    for (const key of Object.keys(TAG_LABELS)) eligible.add(`tag:${key}`);
    for (const meal of analyzed) {
      const a = mealAnalysisOf(meal)!;
      const slot = mealSlotOf(meal);
      for (const tag of a.tags) {
        if (TAG_LABELS[tag]) present.add(`tag:${tag}`);
        if (tag === "raw_veg" && (slot === "dinner" || slot === "late")) present.add("tag:raw_night");
      }
      for (const item of a.items) {
        const food = normalizeFood(item.name);
        if (food) present.add(`food:${food}`);
      }
    }
  }

  const dinner = lastDinner(day);
  if (dinner) {
    eligible.add("habit:late_dinner");
    if (localParts(dinner.occurred_at, settings.tz).minutes >= 22 * 60) present.add("habit:late_dinner");
  }
  const gap = isabgolGapAfterDinner(day);
  if (gap !== null) {
    eligible.add("habit:isabgol_late");
    if (gap > 150) present.add("habit:isabgol_late");
  }
  const sleep = ofKind(day, "sleep").at(-1);
  if (sleep) {
    eligible.add("habit:late_bed");
    if (minutesAfterMidnightForNight(sleep.occurred_at, settings.tz) > settings.bedtime_target_min + 30) present.add("habit:late_bed");
  }
  if (mainMeals(day).length > 0) {
    eligible.add("habit:walk_after_meal");
    if (walkedAfterMeal(day)) present.add("habit:walk_after_meal");
  }
  if (day.length >= 3) {
    for (const key of ["practice", "workout", "late_work", "stress_high"]) eligible.add(`habit:${key}`);
    if (ofKind(day, "practice").length > 0) present.add("habit:practice");
    if (ofKind(day, "workout").length > 0) present.add("habit:workout");
    if (ofKind(day, "late_work").length > 0) present.add("habit:late_work");
    if (ofKind(day, "stress").some((s) => (payloadOf(s, "stress")?.level ?? 0) >= 4)) present.add("habit:stress_high");
  }
  return { eligible, present };
}

function outcomesOf(day: StoredEvent[], nextDay: StoredEvent[] | undefined): Partial<Record<OutcomeKey, number>> {
  const out: Partial<Record<OutcomeKey, number>> = {};
  const gas = ofKind(day, "gas").map((g) => payloadOf(g, "gas")?.level ?? 0);
  if (gas.length > 0) out.evening_gas = Math.max(...gas);
  if (nextDay && ofKind(nextDay, "toilet").length > 0) {
    const t = summarizeToilet(nextDay);
    out.next_rounds = t.visits;
    if (t.firstPassBristol !== null) out.next_smooth = t.firstPassBristol === 3 || t.firstPassBristol === 4 ? 1 : 0;
  }
  if (day.length >= 3) {
    out.heavy = ofKind(day, "sensation").filter((s) => payloadOf(s, "sensation")?.type === "heavy").length;
  }
  return out;
}

function exposureFromKey(key: string): Exposure {
  const [kind, name] = key.split(":") as [ExposureKind, string];
  if (kind === "tag") return { key, kind, label: TAG_LABELS[name as MealTag] ?? name };
  if (kind === "habit") return { key, kind, label: HABIT_LABELS[name as keyof typeof HABIT_LABELS] ?? name };
  return { key, kind, label: foodLabel(name) };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function pooledSd(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  const ss = a.reduce((s, x) => s + (x - ma) ** 2, 0) + b.reduce((s, x) => s + (x - mb) ** 2, 0);
  const dof = a.length + b.length - 2;
  return dof > 0 ? Math.sqrt(ss / dof) : 0;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Builds the report from events grouped by logical day. */
export function computeTolerance(byDay: Map<string, StoredEvent[]>, settings: Settings): ToleranceReport {
  const days = [...byDay.keys()].filter((d) => (byDay.get(d) ?? []).length > 0).sort();
  const perDay = days.map((d) => {
    const events = byDay.get(d) ?? [];
    return { day: d, ex: exposuresOf(events, settings), out: outcomesOf(events, byDay.get(addDays(d, 1))) };
  });

  // Foods only count once seen on at least 2 days, so one-off dishes do not crowd the list.
  const foodDays = new Map<string, number>();
  for (const { ex } of perDay) for (const k of ex.present) if (k.startsWith("food:")) foodDays.set(k, (foodDays.get(k) ?? 0) + 1);
  for (const { ex } of perDay) {
    if ([...ex.eligible].some((k) => k.startsWith("tag:"))) for (const [k, n] of foodDays) if (n >= 2) ex.eligible.add(k);
  }

  const keys = new Set<string>();
  for (const { ex } of perDay) for (const k of ex.eligible) keys.add(k);

  const findings: Finding[] = [];
  const learning: LearningItem[] = [];
  for (const key of keys) {
    const eligibleDays = perDay.filter((p) => p.ex.eligible.has(key));
    const withDays = eligibleDays.filter((p) => p.ex.present.has(key)).length;
    const withoutDays = eligibleDays.length - withDays;
    if (withDays === 0) continue;
    const exposure = exposureFromKey(key);
    if (withDays < MIN_DAYS || withoutDays < MIN_DAYS) {
      learning.push({ exposure, withDays, withoutDays });
      continue;
    }
    for (const outcome of OUTCOME_KEYS) {
      const withVals: number[] = [];
      const withoutVals: number[] = [];
      for (const p of eligibleDays) {
        const v = p.out[outcome];
        if (v === undefined) continue;
        (p.ex.present.has(key) ? withVals : withoutVals).push(v);
      }
      if (withVals.length < MIN_DAYS || withoutVals.length < MIN_DAYS) continue;
      const diff = mean(withVals) - mean(withoutVals);
      const spec = OUTCOMES[outcome];
      const sd = pooledSd(withVals, withoutVals);
      const size = sd > 0 ? Math.abs(diff) / sd : diff !== 0 ? Infinity : 0;
      if (Math.abs(diff) < spec.threshold || size < 0.5) continue;
      const worse = spec.higherIsWorse ? diff > 0 : diff < 0;
      findings.push({
        exposure,
        outcome,
        withDays: withVals.length,
        withoutDays: withoutVals.length,
        withMean: round2(mean(withVals)),
        withoutMean: round2(mean(withoutVals)),
        diff: round2(diff),
        effect: worse ? "worse" : "better",
        strength: withVals.length >= STEADY_DAYS && withoutVals.length >= STEADY_DAYS ? "steady" : "early",
      });
    }
  }

  findings.sort((a, b) => {
    if (a.effect !== b.effect) return a.effect === "worse" ? -1 : 1;
    return Math.abs(b.diff) / OUTCOMES[b.outcome].threshold - Math.abs(a.diff) / OUTCOMES[a.outcome].threshold;
  });
  learning.sort((a, b) => b.withDays - a.withDays || a.exposure.label.localeCompare(b.exposure.label));

  const outcomeDays = Object.fromEntries(
    OUTCOME_KEYS.map((k) => [k, perDay.filter((p) => p.out[k] !== undefined).length]),
  ) as Record<OutcomeKey, number>;

  return {
    daysLogged: days.length,
    daysWithMeals: perDay.filter((p) => [...p.ex.eligible].some((k) => k.startsWith("tag:"))).length,
    findings: findings.slice(0, 40),
    learning: learning.slice(0, 10),
    outcomeDays,
  };
}

function fmt(outcome: OutcomeKey, v: number): string {
  if (outcome === "next_smooth") return `${Math.round(v * 100)}%`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "Chana: more gas that day (3.2 vs 1.4, 6 days with, 9 without, early pattern)". */
export function describeFinding(f: Finding): string {
  const spec = OUTCOMES[f.outcome];
  const direction = f.diff > 0 ? "more" : f.outcome === "evening_gas" ? "less" : "fewer";
  return `${f.exposure.label}: ${direction} ${spec.label} (${fmt(f.outcome, f.withMean)} vs ${fmt(f.outcome, f.withoutMean)}, ${f.withDays} days with, ${f.withoutDays} without, ${f.strength} pattern)`;
}

export function findingValue(f: Finding, which: "with" | "without"): string {
  return fmt(f.outcome, which === "with" ? f.withMean : f.withoutMean);
}

/** Findings that mention a given exposure key (for weighting gas culprits by personal data). */
export function findingsFor(report: ToleranceReport | null, keys: string[], outcome?: OutcomeKey): Finding[] {
  if (!report) return [];
  return report.findings.filter((f) => keys.includes(f.exposure.key) && (!outcome || f.outcome === outcome));
}
