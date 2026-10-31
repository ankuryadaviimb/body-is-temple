import type { CoachAction } from "./coach/answer";
import { lastDinner, mainMeals, mealSlotOf, ofKind } from "./day";
import type { StoredEvent } from "./events";
import type { Settings } from "./settings";
import { formatClock, localParts, minutesBetween } from "./time";

/**
 * The one most useful thing to do right now, shown at the top of Today.
 * In-app version of the proactive nudges (push notifications come later).
 * One nudge at a time, so the screen stays calm.
 */

export type Nudge = {
  id: string;
  tone: "tip" | "info";
  title: string;
  text: string;
  action: CoachAction | null;
  actionLabel: string | null;
};

export function nextUp(today: StoredEvent[], settings: Settings, now: Date, ladderStepId: string): Nudge | null {
  const tz = settings.tz;
  const local = localParts(now, tz).minutes;
  const after = (e: StoredEvent) => minutesBetween(e.occurred_at, now);

  const dinner = lastDinner(today);
  if (dinner && after(dinner) >= 0) {
    const tookIt = ofKind(today, "isabgol").some((i) => i.occurred_at >= dinner.occurred_at);
    const since = after(dinner);
    if (!tookIt) {
      const target = localParts(dinner.occurred_at, tz).minutes + settings.isabgol_delay_min;
      if (since < 60) {
        return {
          id: "isabgol_soon",
          tone: "info",
          title: `Isabgol at ${formatClock(target)}`,
          text: `About ${settings.isabgol_delay_min} minutes after dinner works best.`,
          action: null,
          actionLabel: null,
        };
      }
      if (since <= 150) {
        return { id: "isabgol_now", tone: "tip", title: "Isabgol time", text: "You are in the window, 60 to 150 minutes after dinner.", action: "log_isabgol", actionLabel: "Log Isabgol" };
      }
      if (since <= 300) {
        return {
          id: "isabgol_late",
          tone: "tip",
          title: "Isabgol is running late",
          text: `Take it now if you have not. Tomorrow, aim for about ${settings.isabgol_delay_min} minutes after dinner.`,
          action: "log_isabgol",
          actionLabel: "Log Isabgol",
        };
      }
    }
  }

  const meal = mainMeals(today).filter((m) => after(m) >= 0).at(-1);
  if (meal && mealSlotOf(meal) !== "breakfast") {
    const since = after(meal);
    const walked = ofKind(today, "walk").some((w) => w.occurred_at >= meal.occurred_at);
    if (since >= 10 && since <= 75 && !walked) {
      return { id: "walk", tone: "tip", title: "A 10-minute walk now", text: "Walking after a meal helps gas move along.", action: "log_walk", actionLabel: "Log a walk" };
    }
  }

  if (ofKind(today, "gas").length === 0 && today.length > 0 && local >= 20 * 60 && local < 23 * 60 + 30) {
    return { id: "gas_check", tone: "info", title: "How is the gas tonight?", text: "One tap. It teaches Temple which foods suit you.", action: "log_gas", actionLabel: "Rate gas" };
  }

  const wake = ofKind(today, "wake")[0];
  if (wake && ofKind(today, "toilet").length === 0) {
    const since = after(wake);
    if (since >= 0 && since <= 150) {
      return {
        id: "morning",
        tone: "info",
        title: "Wait for a real urge",
        text: "Sit when you feel it build. Feet up, slow breaths, 5-minute limit.",
        action: "toilet",
        actionLabel: "Toilet session",
      };
    }
  }

  if (ladderStepId === "bedtime" && ofKind(today, "sleep").length === 0) {
    const target = settings.bedtime_target_min;
    const nowNight = local < 12 * 60 ? local + 1440 : local;
    if (target - nowNight <= 45 && target - nowNight >= -60) {
      return { id: "bedtime", tone: "info", title: `Bed by ${formatClock(target)}`, text: "This week's habit. Screens down, lights low.", action: null, actionLabel: null };
    }
  }
  return null;
}
