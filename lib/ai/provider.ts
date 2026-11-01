import "server-only";
import { env } from "@/lib/env";
import type { AuthedContext } from "@/lib/supabase/server";
import { localParts } from "@/lib/domain/time";
import { DAILY_CAPS, endpointFor, extraBody, MODELS, type ProviderId, type TaskKind } from "./providers-config";

/**
 * One interface for every AI provider. All three expose OpenAI-compatible chat
 * completions, so this is a single fetch with fixed endpoints (no user-controlled URLs).
 *
 * Privacy rules (see README):
 * - Cloudflare Workers AI: does not train on inputs and keeps no inputs or outputs.
 * - Groq: does not train on inputs; turn on Zero Data Retention in its Data Controls.
 * - Gemini free tier MAY use inputs to improve Google products, so it is only ever used
 *   for photo-only recognition, when the owner opts in with AI_PHOTO_PROVIDER=gemini.
 * Callers must never put names, emails or other identifiers into prompts.
 */

export type { ProviderId, TaskKind } from "./providers-config";

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

type ProviderConfig = { url: string; key: string; models: Record<TaskKind, string> } | null;

export { DAILY_CAPS };

function config(provider: ProviderId): ProviderConfig {
  const e = env();
  if (provider === "cloudflare") {
    if (!e.CLOUDFLARE_ACCOUNT_ID || !e.CLOUDFLARE_AI_TOKEN) return null;
    return { url: endpointFor("cloudflare", e.CLOUDFLARE_ACCOUNT_ID), key: e.CLOUDFLARE_AI_TOKEN, models: MODELS.cloudflare };
  }
  if (provider === "groq") {
    if (!e.GROQ_API_KEY) return null;
    return { url: endpointFor("groq"), key: e.GROQ_API_KEY, models: MODELS.groq };
  }
  if (!e.GEMINI_API_KEY) return null;
  return { url: endpointFor("gemini"), key: e.GEMINI_API_KEY, models: MODELS.gemini };
}

export function isConfigured(provider: ProviderId): boolean {
  return config(provider) !== null;
}

export class ProviderError extends Error {
  constructor(
    public provider: ProviderId,
    public reason: "not_configured" | "over_budget" | "http" | "timeout" | "empty",
    public status?: number,
  ) {
    super(`${provider}:${reason}${status ? `:${status}` : ""}`);
  }
}

/** Counts one request before it is made, so parallel calls cannot slip past the daily cap. */
async function reserveRequest(ctx: AuthedContext, provider: ProviderId, tz: string): Promise<number> {
  const day = localParts(new Date(), tz).date;
  const { data, error } = await ctx.supabase.rpc("bump_ai_usage", { p_day: day, p_provider: provider, p_in: 0, p_out: 0 });
  if (error) throw new Error("usage_write_failed");
  return typeof data === "number" ? data : 0;
}

async function recordTokens(ctx: AuthedContext, provider: ProviderId, tz: string, inTok: number, outTok: number): Promise<void> {
  if (inTok <= 0 && outTok <= 0) return;
  const day = localParts(new Date(), tz).date;
  await ctx.supabase.rpc("record_ai_tokens", { p_day: day, p_provider: provider, p_in: inTok, p_out: outTok });
}

export type ChatResult = { text: string; provider: ProviderId; model: string };

export async function chat(
  ctx: AuthedContext,
  provider: ProviderId,
  task: TaskKind,
  messages: ChatMessage[],
  opts: { tz: string; maxTokens?: number; temperature?: number; jsonObject?: boolean; timeoutMs?: number },
): Promise<ChatResult> {
  const cfg = config(provider);
  if (!cfg) throw new ProviderError(provider, "not_configured");
  // Reserve first: every attempt counts, including ones that time out.
  if ((await reserveRequest(ctx, provider, opts.tz)) > DAILY_CAPS[provider]) {
    throw new ProviderError(provider, "over_budget");
  }
  const model = cfg.models[task];
  const body: Record<string, unknown> = {
    ...extraBody(provider, task),
    model,
    messages,
    max_tokens: opts.maxTokens ?? 800,
    temperature: opts.temperature ?? 0.2,
  };
  // JSON mode is documented for Groq; for the others the prompt asks for JSON and we parse it.
  if (opts.jsonObject && provider === "groq") body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
      redirect: "error",
    });
  } catch {
    throw new ProviderError(provider, "timeout");
  }
  if (!res.ok) throw new ProviderError(provider, "http", res.status);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  await recordTokens(ctx, provider, opts.tz, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0).catch(() => undefined);
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new ProviderError(provider, "empty");
  return { text, provider, model };
}

/** Tries providers in order and returns the first success. */
export async function chatWithFallback(
  ctx: AuthedContext,
  order: ProviderId[],
  task: TaskKind,
  messages: ChatMessage[],
  opts: Parameters<typeof chat>[4],
  accept: (text: string) => boolean = () => true,
): Promise<ChatResult> {
  let lastError: unknown = null;
  for (const provider of order) {
    if (!isConfigured(provider)) continue;
    try {
      const result = await chat(ctx, provider, task, messages, opts);
      if (accept(result.text)) return result;
      lastError = new ProviderError(provider, "empty");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("no_provider_configured");
}
