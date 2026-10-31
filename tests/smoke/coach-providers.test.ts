import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARD_SYSTEM_PROMPT, COACH_SYSTEM_PROMPT } from "@/lib/ai/coach-prompts";
import { extractJsonObject } from "@/lib/ai/json";
import { endpointFor, extraBody, MODELS, type ProviderId } from "@/lib/ai/providers-config";
import { askPrompt, cardPrompt } from "@/lib/coach/context";
import { normalizeCoachAnswer } from "@/lib/domain/coach/answer";
import { normalizeCoachCard } from "@/lib/domain/coach/card";
import { quickTake } from "@/lib/domain/coach/quick";
import { addDays } from "@/lib/domain/time";
import { SAMPLE_SETTINGS, SAMPLE_TODAY, sampleData } from "../fixtures/coach-sample";

/**
 * Live check of the coach prompts with your own keys and made-up sample data:
 *   RUN_AI_SMOKE=1 npx vitest run tests/smoke/coach-providers.test.ts
 */

const enabled = process.env.RUN_AI_SMOKE === "1";
if (enabled && existsSync(".env.local")) process.loadEnvFile(".env.local");

const keys: Partial<Record<ProviderId, string | undefined>> = {
  cloudflare: process.env.CLOUDFLARE_AI_TOKEN,
  groq: process.env.GROQ_API_KEY,
};

async function call(provider: ProviderId, system: string, user: string) {
  const started = Date.now();
  const res = await fetch(endpointFor(provider, process.env.CLOUDFLARE_ACCOUNT_ID), {
    method: "POST",
    headers: { authorization: `Bearer ${keys[provider]}`, "content-type": "application/json" },
    body: JSON.stringify({
      ...extraBody(provider, "text"),
      model: MODELS[provider].text,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 900,
      temperature: 0.3,
      ...(provider === "groq" ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { status: res.status, ms: Date.now() - started, text: body.choices?.[0]?.message?.content ?? "", usage: body.usage };
}

describe.skipIf(!enabled)("coach prompts (live)", () => {
  const data = sampleData();
  const question = "Why do I feel so gassy tonight?";
  const quick = quickTake({
    intent: "gas",
    question,
    now: new Date(),
    settings: SAMPLE_SETTINGS,
    today: data.byDay.get(SAMPLE_TODAY) ?? [],
    yesterday: data.byDay.get(addDays(SAMPLE_TODAY, -1)) ?? [],
    tolerance: data.tolerance,
  });
  const ask = askPrompt({ question, intent: "gas", quick, data, settings: SAMPLE_SETTINGS, today: SAMPLE_TODAY, ladderIndex: 0, earlier: [] });
  const card = cardPrompt({ data, settings: SAMPLE_SETTINGS, today: SAMPLE_TODAY, ladderIndex: 0 });

  for (const provider of ["cloudflare", "groq"] as const) {
    it.skipIf(!keys[provider])(`${provider}: answers a question as valid JSON`, async () => {
      const r = await call(provider, COACH_SYSTEM_PROMPT, ask);
      const answer = normalizeCoachAnswer(extractJsonObject(r.text));
      if (process.env.DUMP) process.stderr.write(`${JSON.stringify(answer, null, 1)}\n`);
      process.stderr.write(`${provider} answer ${r.status} ${r.ms} ms ${JSON.stringify(r.usage)} ${answer?.headline}\n`);
      expect(r.status).toBe(200);
      expect(answer).not.toBeNull();
    }, 60_000);

    it.skipIf(!keys[provider])(`${provider}: writes the morning card as valid JSON`, async () => {
      const r = await call(provider, CARD_SYSTEM_PROMPT, card);
      const parsed = normalizeCoachCard(extractJsonObject(r.text));
      process.stderr.write(`${provider} card ${r.status} ${r.ms} ms ${JSON.stringify(r.usage)} ${parsed?.headline}\n`);
      expect(r.status).toBe(200);
      expect(parsed).not.toBeNull();
    }, 60_000);
  }
});
