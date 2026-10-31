import "server-only";
import { CARD_SYSTEM_PROMPT } from "@/lib/ai/coach-prompts";
import { extractJsonObject } from "@/lib/ai/json";
import { chatWithFallback } from "@/lib/ai/provider";
import { normalizeCoachCard, type StoredCoachCard } from "@/lib/domain/coach/card";
import type { Settings } from "@/lib/domain/settings";
import type { AuthedContext } from "@/lib/supabase/server";
import { cardPrompt } from "@/lib/coach/context";
import { loadCoachData } from "./coach-context";

/**
 * The AI morning card, written once per day: when the person logs bedtime, or on the
 * first open of a new day. No scheduled job is needed, so no key that bypasses
 * row-level security exists anywhere. The rule-based card shows until this one is ready.
 */

export type CardState = { card: StoredCoachCard | null; status: "none" | "pending" | "done" | "failed" };

const STALE_PENDING_MS = 3 * 60_000;
const RETRY_FAILED_MS = 30 * 60_000;

export async function getCoachCard(ctx: AuthedContext, day: string): Promise<CardState> {
  const { data, error } = await ctx.supabase
    .from("coach_cards")
    .select("logical_day, status, content, provider, updated_at")
    .eq("user_id", ctx.userId)
    .eq("logical_day", day)
    .eq("kind", "morning")
    .maybeSingle();
  if (error || !data) return { card: null, status: "none" };
  const content = normalizeCoachCard(data.content);
  if (data.status === "done" && content) {
    return { card: { ...content, day, provider: (data.provider as string | null) ?? null }, status: "done" };
  }
  const age = Date.now() - new Date(data.updated_at as string).getTime();
  if (data.status === "pending") return { card: null, status: age > STALE_PENDING_MS ? "none" : "pending" };
  return { card: null, status: age > RETRY_FAILED_MS ? "none" : "failed" };
}

/** Takes the per-day lock. Returns false if another request is already writing the card. */
async function claim(ctx: AuthedContext, day: string): Promise<boolean> {
  const state = await getCoachCard(ctx, day);
  if (state.status === "done" || state.status === "pending" || state.status === "failed") return false;
  // A stale pending row or an old failure is cleared before trying again.
  await ctx.supabase.from("coach_cards").delete().eq("user_id", ctx.userId).eq("logical_day", day).eq("kind", "morning").neq("status", "done");
  const { data, error } = await ctx.supabase
    .from("coach_cards")
    .upsert({ user_id: ctx.userId, logical_day: day, kind: "morning", status: "pending" }, { onConflict: "user_id,logical_day,kind", ignoreDuplicates: true })
    .select("logical_day");
  return !error && (data?.length ?? 0) > 0;
}

export async function ensureCoachCard(ctx: AuthedContext, settings: Settings, day: string): Promise<void> {
  if (!(await claim(ctx, day))) return;
  try {
    const data = await loadCoachData(ctx, settings, day);
    // Nobody waits for the card, so the slower Cloudflare goes first and Groq stays free for questions.
    const result = await chatWithFallback(
      ctx,
      ["cloudflare", "groq"],
      "text",
      [
        { role: "system", content: CARD_SYSTEM_PROMPT },
        { role: "user", content: cardPrompt({ data, settings, today: day, ladderIndex: settings.ladder_index }) },
      ],
      { tz: settings.tz, maxTokens: 700, temperature: 0.3, jsonObject: true, timeoutMs: 20_000 },
      (text) => normalizeCoachCard(extractJsonObject(text)) !== null,
    );
    const card = normalizeCoachCard(extractJsonObject(result.text));
    await ctx.supabase
      .from("coach_cards")
      .update({ status: card ? "done" : "failed", content: card, provider: result.provider })
      .eq("user_id", ctx.userId)
      .eq("logical_day", day)
      .eq("kind", "morning");
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 60) : "unknown";
    console.error(JSON.stringify({ level: "warn", task: "coach_card", reason }));
    await ctx.supabase.from("coach_cards").update({ status: "failed" }).eq("user_id", ctx.userId).eq("logical_day", day).eq("kind", "morning");
  }
}
