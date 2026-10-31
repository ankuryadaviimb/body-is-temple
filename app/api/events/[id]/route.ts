import { after } from "next/server";
import { z } from "zod";
import { analyzeMealEvent } from "@/lib/ai/meal";
import { EventPatch } from "@/lib/domain/events";
import { assertWriteAllowed, handleError, HttpError, json, readJson } from "@/lib/http/guard";
import { deleteEvent, patchEvent, updateMeta } from "@/lib/server/events";
import { loadSettings } from "@/lib/server/settings";
import { requireUser } from "@/lib/supabase/server";

const Id = z.uuid();

async function eventId(params: Promise<{ id: string }>): Promise<string> {
  const parsed = Id.safeParse((await params).id);
  if (!parsed.success) throw new HttpError(404, "Not found");
  return parsed.data;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    const id = await eventId(params);
    const patch = await readJson(req, EventPatch, 16_000);
    const settings = await loadSettings(ctx);
    let event = await patchEvent(ctx, id, patch, settings);
    // A new description for a meal triggers a fresh background analysis.
    if (event.kind === "meal" && typeof patch.payload?.text === "string" && patch.payload.text.trim()) {
      const meta = { ...event.meta, ai_status: "pending" };
      await updateMeta(ctx, id, meta);
      event = { ...event, meta };
      const snapshot = event;
      after(() => analyzeMealEvent(ctx, snapshot, settings));
    }
    return json({ event });
  } catch (err) {
    return handleError(err, "events.patch");
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    const id = await eventId(params);
    const settings = await loadSettings(ctx);
    await deleteEvent(ctx, id, settings);
    return json({ ok: true });
  } catch (err) {
    return handleError(err, "events.delete");
  }
}
