import { ofKind } from "../day";
import type { StoredEvent } from "../events";
import type { Settings } from "../settings";
import { minutesBetween } from "../time";
import type { ToleranceReport } from "../tolerance";
import type { CoachAction, CoachAnswer } from "./answer";
import { dinnerAdvice } from "./dinner";
import { reviewEating } from "./eating";
import { agoText, capitalize } from "./facts";
import { gasCulprits } from "./gas";
import type { CoachIntent } from "./intents";
import { reviewMorning } from "./morning";
import { doctorNote, redFlagsInEvents, redFlagsInText } from "./red-flags";
import { triage } from "./triage";

/**
 * The instant answer for a question, built from rules on the phone (no AI, works offline).
 * The AI answer, when it arrives, replaces it; the rule-based doctor note always stays.
 */

export type QuickInput = {
  intent: CoachIntent;
  question: string;
  now: Date;
  settings: Settings;
  today: StoredEvent[];
  yesterday: StoredEvent[];
  tolerance: ToleranceReport | null;
};

type Body = Omit<CoachAnswer, "doctor" | "remember"> & { doctor?: string | null };

/** A meal scores this high only with beans, peanuts, fried food or a big portion in the 2 to 14 hour window. */
const STRONG_CULPRIT = 1.5;

const answer = (b: Body): CoachAnswer => ({ ...b, doctor: b.doctor ?? null, remember: [] });

function hrefToAction(href: string): CoachAction {
  if (href.startsWith("/toilet")) return "toilet";
  if (href === "/reset/gas") return "reset_gas";
  return "reset_heavy";
}

function build(input: QuickInput): CoachAnswer | null {
  const { settings, today, yesterday, now, tolerance } = input;
  const tz = settings.tz;
  switch (input.intent) {
    case "should_go": {
      const r = triage("unsure", today, now, tz);
      return answer({
        headline: r.title,
        why: [r.lead, ...r.reasons].slice(0, 4),
        now: r.steps,
        watch: [],
        good: [],
        actions: [hrefToAction(r.primary.href), ...(r.secondary ? [hrefToAction(r.secondary.href)] : [])],
        confidence: "medium",
      });
    }
    case "gas": {
      const culprits = gasCulprits([...yesterday, ...today], now, tz, tolerance);
      const watch = ["Gas with severe pain, a hard swollen belly, vomiting or fever needs a doctor today."];
      if (culprits.length === 0) {
        return answer({
          headline: "Nothing in your recent logs stands out",
          why: ["No gassy foods in the meals logged over the last day."],
          now: ["Walk for 10 minutes. Movement helps gas pass.", "Then knees to chest or hips up for 2 minutes."],
          watch: ["Log meals with a photo, so I can spot what brings it on.", ...watch],
          good: [],
          actions: ["log_walk", "reset_gas", "log_gas"],
          confidence: "low",
        });
      }
      const top = culprits[0];
      // Only a strong gas maker, or the person's own pattern, is named as the likely cause.
      const strong = top.score >= STRONG_CULPRIT || top.detail.includes("Your logs");
      return answer({
        headline: strong
          ? `Likely from ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)}`
          : "No clear cause in your logs. A few small possible factors",
        why: culprits.map((c) => (c.detail ? `${c.title}: ${c.detail}` : c.title)),
        now: ["Walk for 10 minutes. Movement helps gas pass.", "Then knees to chest or hips up for 2 minutes."],
        watch,
        good: [],
        actions: ["log_walk", "reset_gas", "log_gas"],
        confidence: top.detail.includes("Your logs") ? "medium" : "low",
      });
    }
    case "morning": {
      const r = reviewMorning(yesterday, today, settings, tolerance);
      return answer({
        headline: r.headline,
        why: r.factors,
        now: r.next,
        watch: [],
        good: r.wins,
        actions: r.good || r.noData ? [] : ["reset_heavy", "practice"],
        confidence: r.factors.length > 0 ? "medium" : "low",
      });
    }
    case "heavy": {
      const visits = ofKind(today, "toilet");
      const last = visits.at(-1);
      const since = last ? minutesBetween(last.occurred_at, now) : null;
      const why =
        last && since !== null && since <= 180
          ? [`You went ${agoText(since)}, round ${visits.length} today.`]
          : [];
      why.push("With a tight pelvic floor, a heavy or unfinished feeling is common even when you are nearly empty.");
      return answer({
        headline: "Most likely the false alarm, not a real need",
        why,
        now: ["Do the 2-minute heavy reset.", "Then shift your focus for 20 minutes. The feeling usually fades."],
        watch: ["If it turns into a real urge, a wave that builds, go then, with the breathing."],
        good: [],
        actions: ["reset_heavy", "practice"],
        confidence: "medium",
      });
    }
    case "ate_right": {
      const r = reviewEating(today, settings, now);
      const next = r.fixes.some((f) => f.startsWith("Protein"))
        ? ["Next meal: add paneer, curd, tofu or dal."]
        : r.fixes.length > 0
          ? ["Keep the next meal simple: dal, roti or rice, and a cooked sabzi."]
          : [];
      return answer({
        headline: r.headline,
        why: r.fixes,
        now: next,
        watch: r.pending > 0 ? [`${r.pending === 1 ? "1 meal is" : `${r.pending} meals are`} still being read, so this may change.`] : [],
        good: r.wins,
        actions: [],
        confidence: r.wins.length + r.fixes.length > 0 ? "medium" : "low",
      });
    }
    case "dinner": {
      const r = dinnerAdvice(today, settings, now, tolerance);
      return answer({
        headline: r.headline,
        why: r.why,
        now: r.ideas.map((i) => capitalize(i)),
        watch: [...(r.skip ? [r.skip] : []), ...r.timing].slice(0, 3),
        good: [],
        actions: [],
        confidence: "medium",
      });
    }
    default:
      return null;
  }
}

export function quickTake(input: QuickInput): CoachAnswer | null {
  const doctor =
    doctorNote(redFlagsInText(input.question), "text") ?? doctorNote(redFlagsInEvents([...input.yesterday, ...input.today]), "logs");
  const base = build(input);
  if (!base) {
    return doctor
      ? { headline: "Please check this with a doctor", why: [], now: [], watch: [], good: [], doctor, actions: [], remember: [], confidence: "high" }
      : null;
  }
  return { ...base, doctor: doctor ?? base.doctor };
}
