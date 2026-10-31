import {
  isabgolGapAfterDinner,
  isabgolOnTime,
  lastDinner,
  mainMeals,
  mealSlotOf,
  morningLiquidsMl,
  ofKind,
  practiceMinutes,
  summarizeToilet,
  tagCounts,
} from "./day";
import { mealAnalysisOf, payloadOf, type StoredEvent } from "./events";
import type { Settings } from "./settings";
import { addDays, formatClock, localParts } from "./time";

/**
 * The weekly habit ladder: one new gut habit plus one movement or food habit at a time.
 * A step "holds" on a day when both parts were done. The next step unlocks once the
 * current one held on at least 5 of the last 7 days.
 */

export type StepContext = { settings: Settings; steps: number | null };

export type LadderStep = {
  id: string;
  gut: string;
  other: string;
  held: (day: StoredEvent[], ctx: StepContext) => boolean;
};

const walkedAfter = (day: StoredEvent[], slot: string): boolean => {
  const meal = ofKind(day, "meal").find((m) => mealSlotOf(m) === slot);
  if (!meal) return false;
  const t0 = new Date(meal.occurred_at).getTime();
  return ofKind(day, "walk").some((w) => {
    const gap = (new Date(w.occurred_at).getTime() - t0) / 60_000;
    return gap >= 0 && gap <= 90;
  });
};

export const LADDER: LadderStep[] = [
  {
    id: "exhale",
    gut: "Feet up, push only while breathing out, stop at 5 minutes",
    other: "Photograph every main meal",
    held: (day) => {
      const visits = ofKind(day, "toilet").map((e) => payloadOf(e, "toilet"));
      if (visits.length === 0) return false;
      const gutOk = visits.every((v) => v !== null && v.breath_hold !== "yes" && v.duration_s <= 6 * 60);
      return gutOk && mainMeals(day).length >= 2;
    },
  },
  {
    id: "morning_liquids",
    gut: "1 to 1.5 glasses before the first visit, a small tea, no fourth glass",
    other: "Walk 10 minutes after lunch",
    held: (day) => {
      const ml = morningLiquidsMl(day);
      return ml !== null && ml <= 450 && walkedAfter(day, "lunch");
    },
  },
  {
    id: "isabgol_timing",
    gut: "Isabgol about 90 minutes after dinner",
    other: "Protein at breakfast",
    held: (day) => {
      if (isabgolOnTime(day) !== true) return false;
      const breakfast = ofKind(day, "meal").find((m) => mealSlotOf(m) === "breakfast");
      const analysis = breakfast ? mealAnalysisOf(breakfast) : null;
      return analysis !== null && analysis.protein_g.low >= 15;
    },
  },
  {
    id: "practice",
    gut: "5 minutes of breathing practice, outside the bathroom",
    other: "Light fueling before class (no fried food or legumes in the 3 hours before)",
    held: (day) => {
      if (practiceMinutes(day) < 4) return false;
      const workouts = ofKind(day, "workout");
      return workouts.every((w) => {
        const t = new Date(w.occurred_at).getTime();
        return !ofKind(day, "meal").some((m) => {
          const gap = (t - new Date(m.occurred_at).getTime()) / 60_000;
          const tags = new Set(mealAnalysisOf(m)?.tags ?? []);
          return gap >= 0 && gap <= 180 && (tags.has("fried") || tags.has("legume"));
        });
      });
    },
  },
  {
    id: "bedtime",
    gut: "In bed 30 minutes earlier than now",
    other: "Wear your Watch to bed so it confirms",
    held: (day, ctx) => {
      const sleep = ofKind(day, "sleep").at(-1);
      if (!sleep) return false;
      const p = localParts(sleep.occurred_at, ctx.settings.tz);
      const minutes = p.minutes < 12 * 60 ? p.minutes + 24 * 60 : p.minutes;
      return minutes <= ctx.settings.bedtime_target_min;
    },
  },
  {
    id: "no_stacking",
    gut: "No fried food and legumes on the same day",
    other: "Reach your steps target",
    held: (day, ctx) => {
      const counts = tagCounts(day);
      const stacked = (counts.get("fried") ?? 0) > 0 && (counts.get("legume") ?? 0) > 0;
      const stepsOk = ctx.steps === null || ctx.settings.steps_target === null || ctx.steps >= ctx.settings.steps_target;
      return !stacked && stepsOk;
    },
  },
];

export const HOLD_DAYS = 5;
export const WINDOW_DAYS = 7;

export type LadderState = { index: number; step: LadderStep; heldInWindow: number; startedOn: string | null };

/**
 * Replays history to find the current step. `days` maps logical day to its events and
 * `stepsByDay` gives Watch steps where known. Advances at most one step per day.
 */
export function ladderState(
  orderedDays: string[],
  eventsByDay: Map<string, StoredEvent[]>,
  settings: Settings,
  stepsByDay: Map<string, number> = new Map(),
  startIndex = 0,
): LadderState {
  let index = Math.min(Math.max(startIndex, 0), LADDER.length - 1);
  let window: boolean[] = [];
  let startedOn: string | null = orderedDays[0] ?? null;
  for (const day of orderedDays) {
    const step = LADDER[index];
    const held = step.held(eventsByDay.get(day) ?? [], { settings, steps: stepsByDay.get(day) ?? null });
    window = [...window, held].slice(-WINDOW_DAYS);
    const count = window.filter(Boolean).length;
    if (count >= HOLD_DAYS && index < LADDER.length - 1) {
      index += 1;
      window = [];
      startedOn = addDays(day, 1);
    }
  }
  return { index, step: LADDER[index], heldInWindow: window.filter(Boolean).length, startedOn };
}

export const BRISTOL_LABELS: Record<number, string> = {
  1: "hard lumps",
  2: "lumpy log",
  3: "cracked log",
  4: "smooth banana",
  5: "soft blobs",
  6: "curdly, fluffy pieces",
  7: "watery",
};

/** "45 min" or "4 h 25 min". */
export function formatGap(minutes: number): string {
  if (minutes < 90) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export type MorningCard = {
  focus: { number: number; total: number; gut: string; other: string; heldDays: number; needed: number };
  yesterday: string[];
  tip: string | null;
};

/** Rule-based morning card (the AI version replaces it in M3, with this as the fallback). */
export function buildMorningCard(
  yesterday: StoredEvent[] | null,
  recentVisitCounts: number[],
  state: LadderState,
  settings: Settings,
): MorningCard {
  const lines: string[] = [];
  let tip: string | null = null;

  if (yesterday && yesterday.length > 0) {
    const t = summarizeToilet(yesterday);
    if (t.visits > 0) {
      const avg = recentVisitCounts.length
        ? recentVisitCounts.reduce((a, b) => a + b, 0) / recentVisitCounts.length
        : null;
      lines.push(
        `${t.visits} toilet ${t.visits === 1 ? "round" : "rounds"}` +
          (avg !== null ? ` (your recent average is ${avg.toFixed(1)})` : ""),
      );
    }
    if (t.firstPassBristol) {
      lines.push(`First pass: type ${t.firstPassBristol}, ${BRISTOL_LABELS[t.firstPassBristol]}`);
    }
    const gap = isabgolGapAfterDinner(yesterday);
    const isabgol = ofKind(yesterday, "isabgol").at(-1);
    if (isabgol) {
      lines.push(
        gap !== null
          ? `Isabgol ${formatGap(gap)} after dinner`
          : `Isabgol at ${formatClock(localParts(isabgol.occurred_at, settings.tz).minutes)}`,
      );
    }
    const gas = ofKind(yesterday, "gas").at(-1);
    const gasLevel = gas ? payloadOf(gas, "gas")?.level : undefined;
    if (gasLevel !== undefined) lines.push(`Evening gas ${gasLevel} of 4`);

    const counts = tagCounts(yesterday);
    const dinner = lastDinner(yesterday);
    if (t.blood) {
      tip = "You noted blood yesterday. If it continues or is more than streaks, please check with your doctor.";
    } else if ((counts.get("fried") ?? 0) > 0 && (counts.get("legume") ?? 0) > 0) {
      tip = "Yesterday had fried food and legumes together. Keep today lighter: khichdi, cooked vegetables, curd.";
    } else if ((counts.get("legume") ?? 0) >= 2) {
      tip = "Yesterday had legumes in more than one meal. One legume meal a day is easier on gas.";
    } else if (gap !== null && gap > 150 && dinner) {
      const target = localParts(dinner.occurred_at, settings.tz).minutes + settings.isabgol_delay_min;
      tip = `Isabgol was late last night. Tonight, aim for about ${settings.isabgol_delay_min} minutes after dinner (around ${formatClock(target)} if you eat at the same time).`;
    } else if (t.visits >= 3) {
      tip = "Aim to stop at 2 rounds today. If you sit a third time, keep it to 5 slow breaths.";
    }
  }

  return {
    focus: {
      number: state.index + 1,
      total: LADDER.length,
      gut: state.step.gut,
      other: state.step.other,
      heldDays: state.heldInWindow,
      needed: HOLD_DAYS,
    },
    yesterday: lines.slice(0, 4),
    tip,
  };
}
