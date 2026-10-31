import {
  isabgolOnTime,
  mainMeals,
  ofKind,
  practiceMinutes,
  proteinEstimate,
  waterMl,
} from "./day";
import type { StoredEvent } from "./events";
import type { Settings } from "./settings";
import { localParts } from "./time";

/**
 * Four rings that fill from actions you control, never from outcomes you cannot control.
 * A segment is `true` (done), `false` (not done) or `null` (not applicable or no data yet).
 */

export type Segment = { id: string; label: string; done: boolean | null };
export type Ring = { id: "gut" | "fuel" | "move" | "rest"; label: string; segments: Segment[] };

export type RingContext = {
  settings: Settings;
  /** 0 (Sunday) to 6 for the logical day. */
  weekday: number;
  /** True while the day is still running, so pending items show as null, not false. */
  isToday: boolean;
  /** Minutes asleep before this day started, if known (Watch, or sleep and wake taps). */
  sleepMinutes: number | null;
  /** Steps for this day, if known (Watch via Shortcuts). */
  steps: number | null;
};

const pending = (done: boolean, isToday: boolean): boolean | null => (done ? true : isToday ? null : false);

export function computeRings(day: StoredEvent[], ctx: RingContext): Ring[] {
  const { settings, isToday } = ctx;

  const isabgol = isabgolOnTime(day);
  const gut: Ring = {
    id: "gut",
    label: "Gut",
    segments: [
      { id: "toilet", label: "Toilet session logged", done: pending(ofKind(day, "toilet").length > 0, isToday) },
      { id: "practice", label: "5-minute breathing practice", done: pending(practiceMinutes(day) >= 4, isToday) },
      {
        id: "isabgol",
        label: "Isabgol on time",
        done: isabgol === true ? true : isabgol === false ? false : isToday ? null : false,
      },
    ],
  };

  const protein = proteinEstimate(day);
  const fuel: Ring = {
    id: "fuel",
    label: "Fuel",
    segments: [
      { id: "meals", label: "Main meals photographed", done: pending(mainMeals(day).length >= 2, isToday) },
      { id: "water", label: "Water target", done: pending(waterMl(day) >= settings.water_target_ml, isToday) },
      {
        id: "protein",
        label: "Protein target (estimate)",
        done:
          settings.protein_target_g === null || protein.analyzedMeals === 0
            ? null
            : pending(protein.grams >= settings.protein_target_g, isToday),
      },
    ],
  };

  const workouts = ofKind(day, "workout");
  const classDay = settings.classes.some((c) => c.weekday === ctx.weekday);
  const meals = ofKind(day, "meal");
  const walkedAfterMeal = ofKind(day, "walk").some((w) => {
    const t = new Date(w.occurred_at).getTime();
    return meals.some((m) => {
      const gap = (t - new Date(m.occurred_at).getTime()) / 60_000;
      return gap >= 0 && gap <= 90;
    });
  });
  const move: Ring = {
    id: "move",
    label: "Move",
    segments: [
      {
        id: "workout",
        label: "Class or workout",
        done: workouts.length > 0 ? true : classDay ? pending(false, isToday) : null,
      },
      {
        id: "steps",
        label: "Steps target",
        done:
          ctx.steps === null || settings.steps_target === null
            ? null
            : pending(ctx.steps >= settings.steps_target, isToday),
      },
      {
        id: "walk",
        label: "Walk after a meal",
        done: meals.length === 0 ? null : pending(walkedAfterMeal, isToday),
      },
    ],
  };

  const sleepEvent = ofKind(day, "sleep").at(-1);
  let inBedByTarget: boolean | null = null;
  if (sleepEvent) {
    const p = localParts(sleepEvent.occurred_at, settings.tz);
    // Times after midnight count as 24:xx so they compare with a late target.
    const minutes = p.minutes < 12 * 60 ? p.minutes + 24 * 60 : p.minutes;
    inBedByTarget = minutes <= settings.bedtime_target_min + 30;
  } else if (!isToday) {
    inBedByTarget = null;
  }
  const rest: Ring = {
    id: "rest",
    label: "Rest",
    segments: [
      { id: "bedtime", label: "In bed by your target", done: inBedByTarget },
      {
        id: "sleep7",
        label: "7 or more hours asleep",
        done: ctx.sleepMinutes === null ? null : ctx.sleepMinutes >= 7 * 60,
      },
    ],
  };

  return [gut, fuel, move, rest];
}

export function ringProgress(ring: Ring): { done: number; applicable: number; ratio: number } {
  const applicable = ring.segments.filter((s) => s.done !== null).length;
  const done = ring.segments.filter((s) => s.done === true).length;
  return { done, applicable, ratio: applicable === 0 ? 0 : done / applicable };
}
