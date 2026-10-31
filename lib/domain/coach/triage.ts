import { mealSlotOf, ofKind } from "../day";
import type { StoredEvent } from "../events";
import { localParts, minutesBetween } from "../time";
import { agoText, capitalize, clockOf, SLOT_NAMES } from "./facts";

/**
 * "I feel the urge. Should I go?" answered instantly from rules, no AI.
 *
 * With a tight pelvic floor, a heavy or unfinished feeling soon after a round is often a
 * false alarm, and sitting again tends to mean straining. A real urge (a wave low down
 * that builds) is worth acting on, with breathing and a time limit.
 */

export type Feeling = "urge" | "heavy" | "gas" | "unsure";
export type Verdict = "go" | "reset_first" | "wait";

export const FEELINGS: { id: Feeling; label: string; hint: string }[] = [
  { id: "urge", label: "A real urge", hint: "Pressure low down that builds, like a wave" },
  { id: "heavy", label: "Heavy or not empty", hint: "A dull, full or unfinished feeling" },
  { id: "gas", label: "Gas pressure", hint: "Bloated, or wind that wants out" },
  { id: "unsure", label: "Not sure", hint: "Something is there, but it is hard to tell" },
];

export type TriageLink = { label: string; href: string };

export type TriageResult = {
  verdict: Verdict;
  title: string;
  lead: string;
  steps: string[];
  reasons: string[];
  primary: TriageLink;
  secondary: TriageLink | null;
};

const TOILET: TriageLink = { label: "Start toilet session", href: "/toilet" };
const HEAVY_RESET: TriageLink = { label: "Start 2-minute reset", href: "/reset/heavy" };
const GAS_RESET: TriageLink = { label: "Start 2-minute gas relief", href: "/reset/gas" };

export function triage(feeling: Feeling, today: StoredEvent[], now: Date, tz: string): TriageResult {
  const visits = ofKind(today, "toilet").filter((v) => minutesBetween(v.occurred_at, now) >= 0);
  const rounds = visits.length;
  const last = visits.at(-1);
  const sinceLast = last ? Math.round(minutesBetween(last.occurred_at, now)) : null;
  const wake = ofKind(today, "wake")[0];
  const sinceWake = wake ? minutesBetween(wake.occurred_at, now) : null;
  const local = localParts(now, tz).minutes;
  const morning = local >= 4 * 60 && local < 12 * 60 && (sinceWake === null || sinceWake <= 180);
  const meal = ofKind(today, "meal")
    .filter((m) => minutesBetween(m.occurred_at, now) >= 0)
    .at(-1);
  const sinceMeal = meal ? minutesBetween(meal.occurred_at, now) : null;
  const afterMeal = sinceMeal !== null && sinceMeal <= 60;
  const recent = sinceLast !== null && sinceLast < 60;

  const reasons: string[] = [];
  if (last && sinceLast !== null) {
    reasons.push(`${rounds} ${rounds === 1 ? "round" : "rounds"} today, the last ${agoText(sinceLast)} (${clockOf(last.occurred_at, tz)})`);
  } else {
    reasons.push("No rounds logged yet today");
  }
  if (afterMeal && meal && sinceMeal !== null) {
    const slot = mealSlotOf(meal);
    reasons.push(`${capitalize(slot ? SLOT_NAMES[slot] : "a meal")} ${agoText(sinceMeal)}: the gut moves most in the hour after eating`);
  } else if (morning && rounds === 0) {
    reasons.push("Soon after waking: the gut is most active in the morning");
  }

  let verdict: Verdict;
  if (feeling === "urge") verdict = "go";
  else if (feeling === "gas") verdict = "reset_first";
  else if (feeling === "heavy") verdict = recent || rounds >= 3 ? "wait" : "reset_first";
  else verdict = rounds === 0 && (morning || afterMeal) ? "go" : recent ? "wait" : "reset_first";

  if (verdict === "go") {
    return {
      verdict,
      title: "Go now",
      lead: feeling === "urge" ? "That sounds like a real urge. Go while it is here." : "This is a good time to try. Go, and keep it easy.",
      steps: [
        "Feet up on a stool, lean forward, elbows on knees.",
        "Breathe in for 4, then a long, slow \"moo\" out. Let your belly soften.",
        rounds >= 2
          ? `This would be round ${rounds + 1}, so keep it short: 5 slow breaths, then get up.`
          : "No pushing while holding your breath. Get up at 5 minutes, done or not.",
      ],
      reasons,
      primary: TOILET,
      secondary: null,
    };
  }

  if (verdict === "wait") {
    const lead =
      recent && sinceLast !== null
        ? `You went ${agoText(sinceLast)}. An unfinished feeling soon after a round is common with a tight pelvic floor, and going back now usually means straining.`
        : `You have had ${rounds} rounds today. Sitting again now usually means straining for very little.`;
    return {
      verdict,
      title: "Wait. Likely a false alarm",
      lead,
      steps: [
        "Do the 2-minute reset to let the muscles drop.",
        "Then get busy with something else for 20 minutes.",
        "If a real urge comes, a wave that builds, go then.",
      ],
      reasons,
      primary: HEAVY_RESET,
      secondary: { label: "It is a real urge", href: TOILET.href },
    };
  }

  if (feeling === "gas") {
    return {
      verdict,
      title: "Release the gas first",
      lead: "Gas pressure often feels like an urge. Let it out lying down, then see what is left.",
      steps: [
        "Hips up, then knees to chest, about 2 minutes.",
        "A short walk helps too.",
        "If a real urge builds, a wave low down, go then.",
      ],
      reasons,
      primary: GAS_RESET,
      secondary: { label: "It is a real urge now", href: TOILET.href },
    };
  }

  return {
    verdict,
    title: "Reset first, then decide",
    lead: "Let the pelvic floor drop for 2 minutes. If a clear urge builds, go.",
    steps: [
      "Do the 2-minute reset.",
      "If the urge grows into a wave, go and use the breathing.",
      "If it fades, it was a false alarm. Carry on with your day.",
    ],
    reasons,
    primary: HEAVY_RESET,
    secondary: { label: "It is getting stronger", href: TOILET.href },
  };
}
