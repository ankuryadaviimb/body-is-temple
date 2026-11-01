"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { chipFor, classifyIntent, type CoachChip, type CoachIntent } from "@/lib/domain/coach/intents";
import type { CoachMessage } from "@/lib/domain/coach/message";
import { quickTake } from "@/lib/domain/coach/quick";
import type { MemoryFile, MemorySlug } from "@/lib/domain/memory";
import { addDays } from "@/lib/domain/time";
import type { ToleranceReport } from "@/lib/domain/tolerance";
import { apiGet, apiSend } from "./api";
import { db, kvGet, kvSet } from "./db";
import { currentSettings, dayEvents, todayLocal } from "./log";

/**
 * Coach on the phone: the instant rule answer is computed here (works offline), then the
 * question goes to the server for the AI answer. Questions, patterns and memory are cached
 * on the device so the screens open instantly.
 */

const MESSAGES = "coach_messages";
const INSIGHTS = "insights";
const MEMORY = "memory";
const KEEP = 40;

export type CachedInsights = { report: ToleranceReport; windowDays: number; fetchedAt: number };

let chain: Promise<unknown> = Promise.resolve();

/** Serializes read-modify-write updates, so two questions in flight never overwrite each other. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

function sortNewest(list: CoachMessage[]): CoachMessage[] {
  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, KEEP);
}

async function upsert(message: CoachMessage): Promise<void> {
  await withLock(async () => {
    const list = (await kvGet<CoachMessage[]>(MESSAGES)) ?? [];
    await kvSet(MESSAGES, sortNewest([message, ...list.filter((m) => m.id !== message.id)]));
  });
}

export function useCoachMessages(): CoachMessage[] | undefined {
  return useLiveQuery(async () => (await kvGet<CoachMessage[]>(MESSAGES)) ?? [], []);
}

export function useInsights(): CachedInsights | null | undefined {
  return useLiveQuery(async () => (await kvGet<CachedInsights>(INSIGHTS)) ?? null, []);
}

export function useMemory(): MemoryFile[] | null | undefined {
  return useLiveQuery(async () => (await kvGet<MemoryFile[]>(MEMORY)) ?? null, []);
}

async function send(m: CoachMessage): Promise<void> {
  try {
    const { message } = await apiSend<{ message: CoachMessage }>("POST", "/api/coach", { id: m.id, question: m.question, intent: m.intent });
    await upsert(message);
  } catch {
    await upsert({ ...m, status: m.quick ? "rules_only" : "failed" });
  }
}

/** Asks a question: the instant answer shows at once, the AI answer replaces it when ready. */
export async function askCoach(question: string, intent?: CoachIntent): Promise<string> {
  const id = crypto.randomUUID();
  const resolved = intent ?? classifyIntent(question);
  const settings = await currentSettings();
  const today = await todayLocal();
  const [todayEvents, yesterday] = await Promise.all([dayEvents(today), dayEvents(addDays(today, -1))]);
  const tolerance = (await kvGet<CachedInsights>(INSIGHTS))?.report ?? null;
  const quick = quickTake({ intent: resolved, question, now: new Date(), settings, today: todayEvents, yesterday, tolerance });
  const pending: CoachMessage = {
    id,
    created_at: new Date().toISOString(),
    logical_day: today,
    intent: resolved,
    question,
    quick,
    answer: null,
    status: "pending",
    provider: null,
  };
  await upsert(pending);
  void send(pending);
  return id;
}

export async function retryCoach(id: string): Promise<void> {
  const m = ((await kvGet<CoachMessage[]>(MESSAGES)) ?? []).find((x) => x.id === id);
  if (!m) return;
  await upsert({ ...m, status: "pending" });
  await send(m);
}

/** Server history plus anything still waiting on this phone. */
export async function refreshCoach(): Promise<void> {
  try {
    const { messages } = await apiGet<{ messages: CoachMessage[] }>("/api/coach");
    await withLock(async () => {
      const local = (await kvGet<CoachMessage[]>(MESSAGES)) ?? [];
      const serverIds = new Set(messages.map((m) => m.id));
      const unsent = local.filter((m) => !serverIds.has(m.id) && (m.status === "pending" || m.status === "rules_only" || m.status === "failed"));
      await kvSet(MESSAGES, sortNewest([...messages, ...unsent]));
    });
  } catch {
    // Offline: the cached history stays.
  }
}

export async function deleteCoachMessage(id: string): Promise<void> {
  await withLock(async () => {
    const list = (await kvGet<CoachMessage[]>(MESSAGES)) ?? [];
    await kvSet(MESSAGES, list.filter((m) => m.id !== id));
  });
  await apiSend("DELETE", `/api/coach/${id}`).catch(() => undefined);
}

export async function refreshInsights(): Promise<CachedInsights | null> {
  try {
    const res = await apiGet<{ report: ToleranceReport; windowDays: number }>("/api/insights");
    const cached = { ...res, fetchedAt: Date.now() };
    await kvSet(INSIGHTS, cached);
    return cached;
  } catch {
    return null;
  }
}

export async function refreshMemory(): Promise<void> {
  try {
    const { files } = await apiGet<{ files: MemoryFile[] }>("/api/memory");
    await kvSet(MEMORY, files);
  } catch {
    // Offline: the cached notes stay.
  }
}

export async function saveMemoryNote(slug: MemorySlug, content: string): Promise<void> {
  const { files } = await apiSend<{ files: MemoryFile[] }>("PUT", "/api/memory", { slug, content });
  await kvSet(MEMORY, files);
}

/** "Remember this": saves one fact to the notes file. */
export async function rememberFact(text: string): Promise<void> {
  const { files } = await apiSend<{ files: MemoryFile[] }>("POST", "/api/memory", { text });
  await kvSet(MEMORY, files);
}

const PENDING_ASK = "pending_ask";

/** Today's quick chips: remember the question for the Coach screen to ask on open. */
export async function queueAsk(intent: CoachChip["intent"]): Promise<void> {
  await kvSet(PENDING_ASK, { intent, at: Date.now() });
}

/** The queued question, if it was left in the last 30 seconds; it is used once. */
export async function takePendingAsk(): Promise<CoachChip | null> {
  const pending = await kvGet<{ intent: CoachChip["intent"]; at: number }>(PENDING_ASK);
  if (!pending) return null;
  await db().kv.delete(PENDING_ASK);
  if (Date.now() - pending.at > 30_000) return null;
  return chipFor(pending.intent) ?? null;
}
