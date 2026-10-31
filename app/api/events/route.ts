import { after } from "next/server";
import { z } from "zod";
import { analyzeMealEvent } from "@/lib/ai/meal";
import { EventBatch } from "@/lib/domain/events";
import { assertWriteAllowed, handleError, HttpError, json, readJson } from "@/lib/http/guard";
import { ensureCoachCard } from "@/lib/server/coach-card";
import { insertEvents, listEvents } from "@/lib/server/events";
import { loadSettings } from "@/lib/server/settings";
import { requireUser } from "@/lib/supabase/server";
import { addDays, daysBetween } from "@/lib/domain/time";

export const maxDuration = 60;

const Range = z.strictObject({ from: z.iso.date(), to: z.iso.date() });

/** GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD (at most 92 days). */
export async function GET(req: Request) {
  try {
    const ctx = await requireUser();
    const url = new URL(req.url);
    const parsed = Range.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    const span = daysBetween(parsed.data.from, parsed.data.to);
    if (span < 0 || span > 92) throw new HttpError(400, "Invalid range");
    return json({ events: await listEvents(ctx, parsed.data.from, parsed.data.to) });
  } catch (err) {
    return handleError(err, "events.get");
  }
}

/** POST /api/events with { events: [...] }. Idempotent by client-generated id. */
export async function POST(req: Request) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    const { events } = await readJson(req, EventBatch, 200_000);
    const settings = await loadSettings(ctx);
    const stored = await insertEvents(ctx, events, "app", settings);

    // Text-described meals get analyzed in the background; logging never waits.
    const textMeals = stored.filter(
      (e) => e.kind === "meal" && e.meta?.ai_status === "pending" && typeof e.payload.text === "string",
    );
    if (textMeals.length > 0) {
      after(async () => {
        for (const meal of textMeals) await analyzeMealEvent(ctx, meal, settings);
      });
    }

    // Logging bedtime closes the day, so tomorrow's morning card can be written tonight.
    const sleep = stored.filter((e) => e.kind === "sleep").at(-1);
    if (sleep && Date.now() - new Date(sleep.occurred_at).getTime() < 12 * 3_600_000) {
      after(() => ensureCoachCard(ctx, settings, addDays(sleep.logical_day, 1)));
    }
    return json({ events: stored });
  } catch (err) {
    return handleError(err, "events.post");
  }
}
