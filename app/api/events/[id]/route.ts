import { after } from "next/server";
import { z } from "zod";
import { analyzeMealEvent } from "@/lib/ai/meal";
import { EventPatch } from "@/lib/domain/events";
import { assertWriteAllowed, handleError, HttpError, json, rateLimit, readJson } from "@/lib/http/guard";
import { deleteEvent, patchEvent } from "@/lib/server/events";
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
    rateLimit(`patch:${ctx.userId}`, 600, 60 * 60_000);
    const patch = await readJson(req, EventPatch, 16_000);
    const settings = await loadSettings(ctx);
    let textChanged = false;
    // Meal flags are written in the same atomic write as the edit, from the row as it is then.
    const event = await patchEvent(ctx, id, patch, settings, (current) => {
      if (current.kind !== "meal") return null;
      const fields: Record<string, unknown> = {};
      // A slot picked by hand is final: the AI no longer corrects it.
      if (typeof patch.payload?.slot === "string") fields.slot_locked = true;
      // A new description triggers a fresh background read.
      textChanged = typeof patch.payload?.text === "string" && patch.payload.text.trim().length > 0 && patch.payload.text !== current.payload.text;
      if (textChanged) fields.ai_status = "pending";
      return Object.keys(fields).length ? fields : null;
    });
    if (textChanged) after(() => analyzeMealEvent(ctx, event, settings));
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
