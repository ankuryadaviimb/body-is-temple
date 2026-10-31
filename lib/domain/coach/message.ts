import { z } from "zod";
import { CoachAnswer } from "./answer";
import { COACH_INTENTS, type CoachIntent } from "./intents";

/** One question and its answers, as stored on the server and cached on the phone. */
export type CoachMessage = {
  id: string;
  created_at: string;
  logical_day: string;
  intent: CoachIntent;
  question: string;
  /** Instant rule-based answer (null when no rule applies). */
  quick: CoachAnswer | null;
  /** AI answer merged with the rule answer (null if the AI was unavailable). */
  answer: CoachAnswer | null;
  /** "pending" exists only on the phone while waiting for the server. */
  status: "pending" | "done" | "failed" | "rules_only";
  provider: string | null;
};

export const CoachAsk = z.strictObject({
  id: z.uuid(),
  question: z.string().trim().min(2).max(500),
  intent: z.enum(COACH_INTENTS).optional(),
});
export type CoachAsk = z.infer<typeof CoachAsk>;

/** Reads a stored row defensively: anything malformed becomes null instead of breaking the screen. */
export function parseStoredAnswer(value: unknown): CoachAnswer | null {
  const parsed = CoachAnswer.safeParse(value);
  return parsed.success ? parsed.data : null;
}
