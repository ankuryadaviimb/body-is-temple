import "server-only";
import { env } from "@/lib/env";
import { mealSlotOf, refineMealSlot } from "@/lib/domain/day";
import { payloadOf, type MealAnalysis, type MealSlot, type StoredEvent } from "@/lib/domain/events";
import { localParts } from "@/lib/domain/time";
import type { Settings } from "@/lib/domain/settings";
import { readMedia } from "@/lib/server/media";
import { listEvents, updateMeta, updatePayload } from "@/lib/server/events";
import type { AuthedContext } from "@/lib/supabase/server";
import { extractJsonObject } from "./json";
import { MEAL_SYSTEM_PROMPT, mealUserPrompt, normalizeMealAnalysis } from "./meal-normalize";
import { chatWithFallback, type ContentPart, type ProviderId } from "./provider";

/** Provider order for photo-only recognition. Gemini only when the owner opts in. */
function photoOrder(): ProviderId[] {
  const preferred = env().AI_PHOTO_PROVIDER;
  const order: ProviderId[] = [preferred, "cloudflare", "groq"];
  return [...new Set(order)].filter((p) => p !== "gemini" || preferred === "gemini");
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Analyzes one meal event in the background and stores the result in its meta.
 * Logging never waits for this; the UI shows the result when it arrives.
 */
export async function analyzeMealEvent(ctx: AuthedContext, event: StoredEvent, settings: Settings): Promise<void> {
  const payload = payloadOf(event, "meal");
  if (!payload) return;
  const content: ContentPart[] = [];
  if (payload.media_id) {
    const media = await readMedia(ctx, payload.media_id);
    if (media && media.mime.startsWith("image/")) {
      content.push({ type: "image_url", image_url: { url: `data:${media.mime};base64,${toBase64(media.bytes)}` } });
    }
  }
  content.push({ type: "text", text: mealUserPrompt(payload.slot ?? null, payload.text ?? null) });
  const hasImage = content.length > 1;
  if (!hasImage && !payload.text) {
    await updateMeta(ctx, event.id, { ...event.meta, ai_status: "skipped" });
    return;
  }

  try {
    const result = await chatWithFallback(
      ctx,
      hasImage ? photoOrder() : ["cloudflare", "groq"],
      hasImage ? "vision" : "text",
      [
        { role: "system", content: MEAL_SYSTEM_PROMPT },
        { role: "user", content },
      ],
      { tz: settings.tz, maxTokens: 1200, temperature: 0.1, jsonObject: true },
      (text) => normalizeMealAnalysis(extractJsonObject(text)) !== null,
    );
    const analysis = normalizeMealAnalysis(extractJsonObject(result.text));
    if (analysis) await correctSlot(ctx, event, analysis, settings);
    await updateMeta(ctx, event.id, {
      ...event.meta,
      ai_status: analysis ? "done" : "failed",
      ...(analysis ? { analysis } : {}),
      ai_provider: result.provider,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 60) : "unknown";
    console.error(JSON.stringify({ level: "warn", task: "meal_analysis", reason }));
    await updateMeta(ctx, event.id, { ...event.meta, ai_status: "failed" });
  }
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
  if (next !== payload.slot) await updatePayload(ctx, event.id, { ...event.payload, slot: next });
}
