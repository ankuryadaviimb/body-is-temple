import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/lib/ai/json";
import { MEAL_SYSTEM_PROMPT, mealUserPrompt, normalizeMealAnalysis } from "@/lib/ai/meal-normalize";
import { endpointFor, extraBody, MODELS, type ProviderId } from "@/lib/ai/providers-config";

/**
 * Live check of the AI providers with your own keys. Skipped unless you run:
 *   RUN_AI_SMOKE=1 MEAL_PHOTO=/path/to/meal.jpg npx vitest run tests/smoke
 * Keys are read from .env.local. Use a photo of food only (no people), shrunk first.
 */

const enabled = process.env.RUN_AI_SMOKE === "1";
if (enabled && existsSync(".env.local")) process.loadEnvFile(".env.local");

const keys: Record<ProviderId, string | undefined> = {
  cloudflare: process.env.CLOUDFLARE_AI_TOKEN,
  groq: process.env.GROQ_API_KEY,
  gemini: process.env.AI_PHOTO_PROVIDER === "gemini" ? process.env.GEMINI_API_KEY : undefined,
};

async function ask(provider: ProviderId, imageDataUrl: string | null, text: string) {
  const started = Date.now();
  const content = [
    ...(imageDataUrl ? [{ type: "image_url", image_url: { url: imageDataUrl } }] : []),
    { type: "text", text },
  ];
  const res = await fetch(endpointFor(provider, process.env.CLOUDFLARE_ACCOUNT_ID), {
    method: "POST",
    headers: { authorization: `Bearer ${keys[provider]}`, "content-type": "application/json" },
    body: JSON.stringify({
      ...extraBody(provider),
      model: MODELS[provider][imageDataUrl ? "vision" : "text"],
      messages: [
        { role: "system", content: MEAL_SYSTEM_PROMPT },
        { role: "user", content },
      ],
      max_tokens: 1200,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { status: res.status, ms: Date.now() - started, reply: body.choices?.[0]?.message?.content ?? "" };
}

describe.skipIf(!enabled)("AI providers (live)", () => {
  const photo = process.env.MEAL_PHOTO;
  const dataUrl = photo && existsSync(photo) ? `data:image/jpeg;base64,${readFileSync(photo).toString("base64")}` : null;

  for (const provider of ["cloudflare", "groq", "gemini"] as ProviderId[]) {
    it.skipIf(!keys[provider])(`${provider} reads a text meal`, async () => {
      const r = await ask(provider, null, mealUserPrompt("lunch", "2 roti, moong dal, cucumber raita"));
      const analysis = normalizeMealAnalysis(extractJsonObject(r.reply));
      console.log(`${provider} text: HTTP ${r.status}, ${r.ms} ms`, JSON.stringify(analysis));
      expect(r.status).toBe(200);
      expect(analysis).not.toBeNull();
    }, 90_000);

    it.skipIf(!keys[provider] || !dataUrl)(`${provider} reads a meal photo`, async () => {
      const r = await ask(provider, dataUrl, mealUserPrompt(null, null));
      const analysis = normalizeMealAnalysis(extractJsonObject(r.reply));
      console.log(`${provider} photo: HTTP ${r.status}, ${r.ms} ms`, JSON.stringify(analysis));
      expect(r.status).toBe(200);
      expect(analysis).not.toBeNull();
    }, 90_000);
  }
});
