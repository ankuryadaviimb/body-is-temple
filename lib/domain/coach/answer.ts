import { z } from "zod";

/**
 * The shape of every coach answer, from the instant rules or from the AI.
 * Short sections sized for a phone: what is likely going on, what to do now,
 * what to watch, and when to see a doctor.
 */

export const COACH_ACTIONS = [
  "toilet",
  "practice",
  "reset_heavy",
  "reset_gas",
  "log_walk",
  "log_gas",
  "log_water",
  "log_isabgol",
  "insights",
] as const;
export type CoachAction = (typeof COACH_ACTIONS)[number];

export const CONFIDENCE = ["low", "medium", "high"] as const;

export const CoachAnswer = z.strictObject({
  headline: z.string().min(1).max(200),
  why: z.array(z.string().min(1).max(300)).max(4),
  now: z.array(z.string().min(1).max(260)).max(3),
  watch: z.array(z.string().min(1).max(260)).max(3),
  /** What went well, so feedback is balanced and never only about mistakes. */
  good: z.array(z.string().min(1).max(240)).max(3),
  doctor: z.string().min(1).max(320).nullable(),
  actions: z.array(z.enum(COACH_ACTIONS)).max(3),
  remember: z.array(z.string().min(3).max(200)).max(2),
  confidence: z.enum(CONFIDENCE),
});
export type CoachAnswer = z.infer<typeof CoachAnswer>;

/** Cleans model text: no dashes as punctuation, no bullet markers, single spaces. */
export function tidy(text: string): string {
  return text
    .replace(/[\u2010\u2011\u2012]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1-$2")
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/^\s*(?:[-*\u2022]|\d+[.)])\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .trim();
}

/** Shortens text at a word boundary. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : cut.length).replace(/[,;:\s]+$/, "")}\u2026`;
}

function strings(value: unknown, max: number, maxLen: number): string[] {
  const raw: unknown[] = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n+/) : [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => clip(tidy(v), maxLen))
    .filter((v) => v.length > 0)
    .slice(0, max);
}

const EMPTY_DOCTOR = /^(none|null|n\/?a|no|not needed|not applicable|nothing)\.?$/i;

/** Accepts a loosely shaped model reply and returns a valid answer, or null. */
export function normalizeCoachAnswer(raw: unknown): CoachAnswer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const headline = typeof r.headline === "string" ? clip(tidy(r.headline), 200) : "";
  if (!headline) return null;
  const doctorText = typeof r.doctor === "string" ? tidy(r.doctor) : "";
  const actions = (Array.isArray(r.actions) ? r.actions : []).filter((a): a is CoachAction =>
    (COACH_ACTIONS as readonly unknown[]).includes(a),
  );
  const confidence = (CONFIDENCE as readonly unknown[]).includes(r.confidence) ? (r.confidence as CoachAnswer["confidence"]) : "low";
  const answer: CoachAnswer = {
    headline,
    why: strings(r.why, 4, 300),
    now: strings(r.now, 3, 260),
    watch: strings(r.watch, 3, 260),
    good: strings(r.good, 3, 240),
    doctor: doctorText && !EMPTY_DOCTOR.test(doctorText) ? clip(doctorText, 320) : null,
    actions: [...new Set(actions)].slice(0, 3),
    remember: strings(r.remember, 2, 200).filter((s) => s.length >= 3),
    confidence,
  };
  const parsed = CoachAnswer.safeParse(answer);
  return parsed.success ? parsed.data : null;
}

const STOP = new Set(["the", "a", "an", "and", "or", "my", "me", "i", "is", "it", "to", "of", "in", "on", "at", "for", "with", "may", "can", "be", "do", "does", "you", "your", "that", "this"]);

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Server-side checks on an AI answer, because prompts alone are not enough:
 * - A conditional warning ("see a doctor if...") is advice to watch, not an active red flag.
 * - "Remember" suggestions must repeat what the person actually said, never the model's guesses.
 * - Confidence stays at most "medium" until a steady personal pattern exists.
 */
export function refineAnswer(ai: CoachAnswer, ctx: { question: string; steadyPattern: boolean }): CoachAnswer {
  let { doctor, watch } = ai;
  if (doctor && /^\s*(if\b|(see|call|contact|visit)\b[^.]*\bif\b)/i.test(doctor)) {
    if (watch.length < 3) watch = [...watch, doctor.charAt(0).toUpperCase() + doctor.slice(1)];
    doctor = null;
  }
  const said = new Set(contentWords(ctx.question));
  const remember = ai.remember.filter((fact) => {
    const words = contentWords(fact);
    return words.length > 0 && words.filter((w) => said.has(w)).length / words.length >= 0.6;
  });
  const confidence = ai.confidence === "high" && !ctx.steadyPattern ? "medium" : ai.confidence;
  return { ...ai, doctor, watch, remember, confidence };
}

/**
 * The AI answer replaces the instant one, but the rules keep the last word on safety:
 * a rule-based doctor note always stays, and the rule actions stay available.
 */
export function mergeAnswers(quick: CoachAnswer | null, ai: CoachAnswer | null): CoachAnswer | null {
  if (!ai) return quick;
  if (!quick) return ai;
  return {
    ...ai,
    doctor: quick.doctor ?? ai.doctor,
    actions: [...new Set([...quick.actions, ...ai.actions])].slice(0, 3),
  };
}
