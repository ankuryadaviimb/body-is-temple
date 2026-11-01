import "server-only";
import { env } from "@/lib/env";
import { mealSlotOf, refineMealSlot } from "@/lib/domain/day";
import { payloadOf, type MealAnalysis, type MealSlot, type StoredEvent } from "@/lib/domain/events";
import { localParts } from "@/lib/domain/time";
import type { Settings } from "@/lib/domain/settings";
import { readMedia } from "@/lib/server/media";
import { changeEvent, listEvents } from "@/lib/server/events";
import type { AuthedContext } from "@/lib/supabase/server";
import { extractJsonObject } from "./json";
import { MEAL_SYSTEM_PROMPT, mealUserPrompt, normalizeMealAnalysis } from "./meal-normalize";
import { chatWithFallback, type ContentPart, type ProviderId } from "./provider";

/** Photo providers after Gemini (which is tried separately, with the image alone). */
const TRUSTED: ProviderId[] = ["cloudflare", "groq"];

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Analyzes one meal event in the background and stores the result in its meta.
 * Logging never waits for this; the UI shows the result when it arrives.
 *
 * Privacy: Gemini (opt-in only) receives the photo and a generic question, never the
 * typed description or the meal slot. Cloudflare and Groq get both.
 */
export async function analyzeMealEvent(ctx: AuthedContext, event: StoredEvent, settings: Settings): Promise<void> {
  const payload = payloadOf(event, "meal");
  if (!payload) return;
  let image: ContentPart | null = null;
  if (payload.media_id) {
    const media = await readMedia(ctx, payload.media_id);
    if (media && media.mime.startsWith("image/")) image = { type: "image_url", image_url: { url: `data:${media.mime};base64,${toBase64(media.bytes)}` } };
  }
  if (!image && !payload.text) {
    await saveResult(ctx, event, { ai_status: "skipped" });
    return;
  }

  const full: ContentPart[] = [...(image ? [image] : []), { type: "text", text: mealUserPrompt(payload.slot ?? null, payload.text ?? null) }];
  const accept = (text: string) => normalizeMealAnalysis(extractJsonObject(text)) !== null;
  const opts = { tz: settings.tz, maxTokens: 1200, temperature: 0.1, jsonObject: true };
  try {
    let result: { text: string; provider: ProviderId } | null = null;
    if (image && env().AI_PHOTO_PROVIDER === "gemini") {
      try {
        result = await chatWithFallback(
          ctx,
          ["gemini"],
          "vision",
          [
            { role: "system", content: MEAL_SYSTEM_PROMPT },
            { role: "user", content: [image, { type: "text", text: mealUserPrompt(null, null) }] },
          ],
          opts,
          accept,
        );
      } catch {
        result = null;
      }
    }
    result ??= await chatWithFallback(ctx, TRUSTED, image ? "vision" : "text", [
      { role: "system", content: MEAL_SYSTEM_PROMPT },
      { role: "user", content: full },
    ], opts, accept);
    const analysis = normalizeMealAnalysis(extractJsonObject(result.text));
    await saveResult(
      ctx,
      event,
      { ai_status: analysis ? "done" : "failed", ...(analysis ? { analysis } : {}), ai_provider: result.provider, analyzed_at: new Date().toISOString() },
      analysis ? (fresh) => correctSlot(ctx, fresh, analysis, settings) : undefined,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 60) : "unknown";
    console.error(JSON.stringify({ level: "warn", task: "meal_analysis", reason }));
    await saveResult(ctx, event, { ai_status: "failed" }).catch(() => undefined);
  }
}

/**
 * Writes the AI fields onto the meal as it is now, not as it was when the read began, so
 * an edit made meanwhile is kept. If the description changed meanwhile, a newer read is
 * already on its way and this one is dropped.
 */
async function saveResult(
  ctx: AuthedContext,
  started: StoredEvent,
  fields: Record<string, unknown>,
  after?: (fresh: StoredEvent) => Promise<void>,
): Promise<void> {
  const { event, written } = await changeEvent(ctx, started.id, (current) =>
    (current.payload.text ?? null) !== (started.payload.text ?? null) ? null : { meta: { ...current.meta, ...fields } },
  );
  if (written && event && after) await after(event);
}

/**
 * Uses the food itself as a second opinion on the meal slot (late breakfast, skipped
 * breakfast). Never overrides a slot the person picked in the edit sheet.
 */
async function correctSlot(ctx: AuthedContext, event: StoredEvent, analysis: MealAnalysis, settings: Settings): Promise<void> {
  const payload = payloadOf(event, "meal");
  if (!payload?.slot || payload.slot_chosen === true || event.meta?.slot_locked === true || !analysis.slot_guess) return;
  const earlier = (await listEvents(ctx, event.logical_day, event.logical_day))
    .filter((e) => e.kind === "meal" && e.id !== event.id && e.occurred_at < event.occurred_at)
    .map((e) => mealSlotOf(e))
    .filter((x): x is MealSlot => x !== null);
  const minutes = localParts(event.occurred_at, settings.tz).minutes;
  const next = refineMealSlot(payload.slot, analysis.slot_guess, minutes, earlier);
  if (next === payload.slot) return;
  // Only the slot changes, and only if the meal is still exactly as this decision saw it.
  await changeEvent(ctx, event.id, (current) => {
    const now = payloadOf(current, "meal");
    const unchanged =
      now && now.slot === payload.slot && now.slot_chosen !== true && current.meta?.slot_locked !== true && (now.text ?? null) === (payload.text ?? null) && current.occurred_at === event.occurred_at;
    return unchanged ? { payload: { ...current.payload, slot: next } } : null;
  });
}
