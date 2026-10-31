/** The frequent questions, as one-tap chips, and a keyword router for typed questions. */

export const COACH_INTENTS = ["should_go", "gas", "morning", "heavy", "ate_right", "dinner", "free"] as const;
export type CoachIntent = (typeof COACH_INTENTS)[number];

export type CoachChip = { intent: Exclude<CoachIntent, "free">; label: string; question: string };

export const COACH_CHIPS: CoachChip[] = [
  { intent: "should_go", label: "Should I go?", question: "I feel the urge. Should I go now?" },
  { intent: "gas", label: "Why am I gassy?", question: "Why do I feel so gassy?" },
  { intent: "morning", label: "Why a rough morning?", question: "Why was my morning rough today?" },
  { intent: "heavy", label: "Feeling heavy", question: "I feel heavy, like I am not empty. What should I do?" },
  { intent: "ate_right", label: "Did I eat right?", question: "Did I eat right today?" },
  { intent: "dinner", label: "What for dinner?", question: "What should I eat for dinner tonight?" },
];

export function chipFor(intent: CoachIntent): CoachChip | undefined {
  return COACH_CHIPS.find((c) => c.intent === intent);
}

/** Routes a typed question to the closest frequent problem, so the instant rules can help too. */
export function classifyIntent(text: string): CoachIntent {
  const t = text.toLowerCase();
  if (/\b(should i go|go now|urge|need to go|feel like (pooping|going|i need to go)|pooping)\b/.test(t)) return "should_go";
  if (/\b(gas|gassy|bloat|bloated|bloating|fart|farting|flatulence|wind)\b/.test(t)) return "gas";
  if (/\b(morning|rounds?)\b/.test(t) && /\b(bad|rough|why|again|three|3|many|hard)\b/.test(t)) return "morning";
  if (/\b(heavy|heaviness|dirty|not empty|incomplete|unfinished)\b/.test(t)) return "heavy";
  if (/\b(dinner|tonight)\b/.test(t) && /\b(eat|have|what|should|cook)\b/.test(t)) return "dinner";
  if (/\b(eat|ate|eaten|eating|food|meals?|diet)\b/.test(t) && /\b(right|wrong|good|bad|okay|ok|well|enough)\b/.test(t)) return "ate_right";
  return "free";
}
