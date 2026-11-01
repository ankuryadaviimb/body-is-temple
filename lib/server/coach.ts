import "server-only";
import { COACH_SYSTEM_PROMPT } from "@/lib/ai/coach-prompts";
import { extractJsonObject } from "@/lib/ai/json";
import { chatWithFallback } from "@/lib/ai/provider";
import { mergeAnswers, normalizeCoachAnswer, refineAnswer, type CoachAnswer } from "@/lib/domain/coach/answer";
import { classifyIntent, COACH_INTENTS, type CoachIntent } from "@/lib/domain/coach/intents";
import { parseStoredAnswer, type CoachAsk, type CoachMessage } from "@/lib/domain/coach/message";
import { quickTake } from "@/lib/domain/coach/quick";
import { labRedFlags } from "@/lib/domain/records";
import { addDays } from "@/lib/domain/time";
import type { AuthedContext } from "@/lib/supabase/server";
import { askPrompt, type EarlierQuestion } from "@/lib/coach/context";
import { loadCoachData } from "./coach-context";
import { loadSettings } from "./settings";
import { currentDay } from "./today";

const COLUMNS = "id, created_at, logical_day, intent, question, quick, answer, status, provider";

type Row = {
  id: string;
  created_at: string;
  logical_day: string;
  intent: string;
  question: string;
  quick: unknown;
  answer: unknown;
  status: string;
  provider: string | null;
};

function toMessage(r: Row): CoachMessage {
  const intent = (COACH_INTENTS as readonly string[]).includes(r.intent) ? (r.intent as CoachIntent) : "free";
  const status = r.status === "done" || r.status === "rules_only" ? r.status : "failed";
  return {
    id: r.id,
    created_at: r.created_at,
    logical_day: r.logical_day,
    intent,
    question: r.question,
    quick: parseStoredAnswer(r.quick),
    answer: parseStoredAnswer(r.answer),
    status,
    provider: r.provider,
  };
}

export async function listMessages(ctx: AuthedContext, limit = 30): Promise<CoachMessage[]> {
  const { data, error } = await ctx.supabase
    .from("coach_messages")
    .select(COLUMNS)
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("coach_read_failed");
  return ((data ?? []) as Row[]).map(toMessage);
}

async function getMessage(ctx: AuthedContext, id: string): Promise<CoachMessage | null> {
  const { data, error } = await ctx.supabase.from("coach_messages").select(COLUMNS).eq("user_id", ctx.userId).eq("id", id).maybeSingle();
  if (error) throw new Error("coach_read_failed");
  return data ? toMessage(data as Row) : null;
}

export async function deleteMessage(ctx: AuthedContext, id: string): Promise<void> {
  const { error } = await ctx.supabase.from("coach_messages").delete().eq("user_id", ctx.userId).eq("id", id);
  if (error) throw new Error("coach_delete_failed");
}

/**
 * Answers one question: instant rules first, then the AI with the person's context.
 * Idempotent by the client's id, so a retried request never asks twice.
 */
export async function askCoach(ctx: AuthedContext, ask: CoachAsk): Promise<CoachMessage> {
  const existing = await getMessage(ctx, ask.id);
  if (existing) return existing;

  const settings = await loadSettings(ctx);
  const today = await currentDay(ctx, settings);
  const intent = ask.intent ?? classifyIntent(ask.question);
  const [data, recent] = await Promise.all([loadCoachData(ctx, settings, today), listMessages(ctx, 4)]);
  const now = new Date();
  let quick = quickTake({
    intent,
    question: ask.question,
    now,
    settings,
    today: data.byDay.get(today) ?? [],
    yesterday: data.byDay.get(addDays(today, -1)) ?? [],
    tolerance: data.tolerance,
  });
  // Anemia signs on a recent blood test are a doctor matter, whatever the question.
  const labFlags = labRedFlags(data.labs ?? []);
  if (labFlags.length > 0) {
    const note = `Your recent blood test shows ${labFlags.join(" and ")}. Please discuss it with your doctor soon.`;
    if (quick) quick.doctor = quick.doctor ?? note;
    else quick = { headline: "Please check this with a doctor", why: [], now: [], watch: [], good: [], doctor: note, actions: [], remember: [], confidence: "high" };
  }
  const earlier: EarlierQuestion[] = recent
    .filter((m) => now.getTime() - new Date(m.created_at).getTime() < 48 * 3_600_000)
    .slice(0, 2)
    .map((m) => ({ question: m.question, headline: (m.answer ?? m.quick)?.headline ?? null }));

  let answer: CoachAnswer | null = null;
  let provider: string | null = null;
  try {
    const result = await chatWithFallback(
      ctx,
      // Groq answers in about 1 s (Cloudflare about 2 to 6 s); Cloudflare takes over at once if Groq is busy.
      ["groq", "cloudflare"],
      "text",
      [
        { role: "system", content: COACH_SYSTEM_PROMPT },
        {
          role: "user",
          content: askPrompt({ question: ask.question, intent, quick, data, settings, today, ladderIndex: settings.ladder_index, earlier }),
        },
      ],
      { tz: settings.tz, maxTokens: 900, temperature: 0.3, jsonObject: true, timeoutMs: 12_000 },
      (text) => normalizeCoachAnswer(extractJsonObject(text)) !== null,
    );
    const parsed = normalizeCoachAnswer(extractJsonObject(result.text));
    const steadyPattern = data.tolerance.findings.some((f) => f.strength === "steady");
    answer = mergeAnswers(quick, parsed ? refineAnswer(parsed, { question: ask.question, steadyPattern }) : null);
    provider = result.provider;
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 60) : "unknown";
    console.error(JSON.stringify({ level: "warn", task: "coach_answer", reason }));
  }

  const row = {
    id: ask.id,
    user_id: ctx.userId,
    logical_day: today,
    intent,
    question: ask.question,
    quick,
    answer,
    status: answer ? "done" : quick ? "rules_only" : "failed",
    provider,
  };
  const { error } = await ctx.supabase.from("coach_messages").upsert(row, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("coach_write_failed");
  return (await getMessage(ctx, ask.id)) ?? toMessage({ ...row, created_at: now.toISOString() });
}
