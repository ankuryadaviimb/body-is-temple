import { isabgolGapAfterDinner, lastDinner, mealSlotOf, roundNumber, tagCounts } from "./day";
import { mealAnalysisOf, payloadOf, type StoredEvent } from "./events";
import type { Settings } from "./settings";
import { formatClock, localParts } from "./time";

/**
 * Instant feedback shown right after a log. Plain rules, no AI call, so it appears at once.
 * Wording is calm and suggestive: it never claims a cause from one day of data.
 */

export type Feedback = { tone: "good" | "tip" | "care"; text: string };

export type FeedbackContext = {
  settings: Settings;
  /** The current habit ladder step id, so step-specific nudges only show when relevant. */
  ladderStep: string;
};

export function feedbackFor(event: StoredEvent, day: StoredEvent[], ctx: FeedbackContext): Feedback | null {
  switch (event.kind) {
    case "meal":
      return mealFeedback(event, day, ctx);
    case "toilet":
      return toiletFeedback(event, day);
    case "isabgol":
      return isabgolFeedback(day, ctx);
    case "water":
    case "drink":
      return liquidFeedback(day, ctx);
    case "gas": {
      const level = payloadOf(event, "gas")?.level ?? 0;
      return level >= 3
        ? { tone: "tip", text: "Try 2 minutes of knees-to-chest or hips-up. Skip sitting on the toilet to push gas out." }
        : null;
    }
    case "sensation":
      return {
        tone: "care",
        text: "Reset started. This feeling is usually a false alarm from sensitive nerves, and it fades when you stop focusing on it.",
      };
    case "practice":
      return { tone: "good", text: "Practice done. This is the at-home version of biofeedback." };
    case "walk":
      return { tone: "good", text: "Walk logged. Light walking after meals helps gas move along." };
    default:
      return null;
  }
}

function mealFeedback(event: StoredEvent, day: StoredEvent[], ctx: FeedbackContext): Feedback | null {
  const analysis = mealAnalysisOf(event);
  const slot = mealSlotOf(event);
  const minutes = localParts(event.occurred_at, ctx.settings.tz).minutes;

  if (!analysis) {
    if (slot === "dinner" || slot === "late") {
      const target = minutes + ctx.settings.isabgol_delay_min;
      return { tone: "tip", text: `Dinner logged. Isabgol around ${formatClock(target)}.` };
    }
    return null;
  }

  const tags = new Set(analysis.tags);
  const counts = tagCounts(day);
  if (tags.has("fried") && tags.has("legume")) {
    return { tone: "tip", text: "Heavy combo (fried plus legumes). A 10-minute walk after this helps, and keep the next meal light." };
  }
  if (tags.has("legume") && (counts.get("legume") ?? 0) >= 2) {
    return { tone: "tip", text: "Second legume meal today. You may feel more gas tonight, so keep dinner simple." };
  }
  if (tags.has("peanuts")) {
    return { tone: "tip", text: "Peanuts are legumes and often gassy for you. A small handful is the safer amount." };
  }
  if (tags.has("raw_veg") && (slot === "dinner" || slot === "late")) {
    return { tone: "tip", text: "Raw salad at night is rough fiber. Cooked vegetables are gentler in the evening." };
  }
  if (tags.has("maida") && minutes >= 16 * 60) {
    return { tone: "tip", text: "Maida late in the day. Roti or rice is the easier swap next time." };
  }
  if (slot === "dinner" || slot === "late") {
    const target = minutes + ctx.settings.isabgol_delay_min;
    return { tone: "tip", text: `Dinner logged. Isabgol around ${formatClock(target)}.` };
  }
  if (analysis.protein_g.low >= 25) {
    return { tone: "good", text: "Good protein in this meal." };
  }
  if (tags.has("cooked_veg") || tags.has("fruit")) {
    return { tone: "good", text: "Gut-friendly choice." };
  }
  return null;
}

function toiletFeedback(event: StoredEvent, day: StoredEvent[]): Feedback | null {
  const p = payloadOf(event, "toilet");
  if (!p) return null;
  if (p.blood) {
    return {
      tone: "care",
      text: "Blood noted. If it is more than streaks on the paper, or it keeps happening, please see your doctor.",
    };
  }
  const round = roundNumber(event, day);
  if (p.passed && p.bristol === 4) {
    return { tone: "good", text: "Smooth, banana-shaped stool. That is the target shape." };
  }
  if (p.breath_hold === "no") {
    return { tone: "good", text: "Exhale-only pushing. That is exactly the skill you are building." };
  }
  if (p.duration_s > 5 * 60) {
    return { tone: "tip", text: "Over 5 minutes. Next time, stand up at 5 and walk away." };
  }
  if (round >= 3) {
    return { tone: "tip", text: "Third round today. Keep it to 5 slow breaths, then leave." };
  }
  if (p.breath_hold === "yes") {
    return { tone: "tip", text: "Breath holding crept in. Next time, keep the mouth open and let the push ride on the exhale." };
  }
  return null;
}

function isabgolFeedback(day: StoredEvent[], ctx: FeedbackContext): Feedback | null {
  const gap = isabgolGapAfterDinner(day);
  if (gap === null) {
    return lastDinner(day) ? null : { tone: "tip", text: "Isabgol logged. Log dinner too, so the app can time tomorrow's reminder." };
  }
  if (gap >= 60 && gap <= 150) {
    return { tone: "good", text: "On time. About 90 minutes after dinner gives it the night to work." };
  }
  if (gap > 150) {
    const isabgol = day.filter((e) => e.kind === "isabgol").at(-1);
    const at = isabgol ? formatClock(localParts(isabgol.occurred_at, ctx.settings.tz).minutes) : "late";
    return { tone: "tip", text: `Isabgol at ${at} was late. Aim for about 90 minutes after dinner tomorrow.` };
  }
  return { tone: "tip", text: "Isabgol came soon after dinner. About 90 minutes after works best." };
}

function liquidFeedback(day: StoredEvent[], ctx: FeedbackContext): Feedback | null {
  if (ctx.ladderStep !== "morning_liquids") return null;
  const firstVisitDone = day.some((e) => e.kind === "toilet");
  if (firstVisitDone) return null;
  // Before the first toilet visit, sum everything drunk so far this morning.
  const total = day.reduce((sum, e) => {
    if (e.kind === "water") return sum + (payloadOf(e, "water")?.ml ?? 0);
    if (e.kind === "drink") return sum + (payloadOf(e, "drink")?.ml ?? 0);
    return sum;
  }, 0);
  return total > 400
    ? { tone: "tip", text: "That is over 400 ml this morning. This week's habit is 1 to 1.5 glasses before the first visit." }
    : null;
}
