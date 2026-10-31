import { z } from "zod";
import { clip, tidy } from "./answer";

/** The AI morning card: yesterday's review and today's one thing. Rule card is the fallback. */

export const CoachCard = z.strictObject({
  headline: z.string().min(1).max(180),
  went_well: z.array(z.string().min(1).max(200)).max(3),
  to_fix: z.string().min(1).max(220).nullable(),
  one_thing: z.string().min(1).max(200),
  class_tip: z.string().min(1).max(200).nullable(),
});
export type CoachCard = z.infer<typeof CoachCard>;

export type StoredCoachCard = CoachCard & { day: string; provider: string | null };

const EMPTY = /^(none|null|n\/?a|no|nothing)\.?$/i;

function optional(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = tidy(v);
  return t && !EMPTY.test(t) ? clip(t, max) : null;
}

export function normalizeCoachCard(raw: unknown): CoachCard | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const wentWell = (Array.isArray(r.went_well) ? r.went_well : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => clip(tidy(v), 200))
    .filter(Boolean)
    .slice(0, 3);
  const card = {
    headline: optional(r.headline, 180) ?? "",
    went_well: wentWell,
    to_fix: optional(r.to_fix, 220),
    one_thing: optional(r.one_thing, 200) ?? "",
    class_tip: optional(r.class_tip, 200),
  };
  const parsed = CoachCard.safeParse(card);
  return parsed.success ? parsed.data : null;
}
