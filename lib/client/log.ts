"use client";

import { inferMealSlot, mealSlotOf } from "@/lib/domain/day";
import { ClientEventInput, type EventKind, type Payload } from "@/lib/domain/events";
import { LADDER } from "@/lib/domain/ladder";
import { logicalDayFor, type Anchor } from "@/lib/domain/logical-day";
import { feedbackFor, type Feedback } from "@/lib/domain/rules-feedback";
import { withDefaults, type Settings } from "@/lib/domain/settings";
import type { CachedSnapshot } from "@/lib/domain/snapshot";
import { addDays, localParts } from "@/lib/domain/time";
import { db, kvGet, type LocalEvent } from "./db";
import { deviceSettings } from "./device";
import { pollForAnalysis, syncNow } from "./sync";

export async function currentSettings(): Promise<Settings> {
  const cached = (await kvGet<CachedSnapshot>("snapshot"))?.settings;
  // Older cached copies may miss newer fields, so fill them in.
  return cached ? withDefaults(cached) : deviceSettings();
}

async function localAnchors(aroundIso: string, tz: string): Promise<Anchor[]> {
  const date = localParts(aroundIso, tz).date;
  const rows = await db()
    .events.where("kind")
    .anyOf(["wake", "sleep"])
    .filter((e) => {
      const d = localParts(e.occurred_at, tz).date;
      return d === date || d === addDays(date, -1) || d === addDays(date, 1);
    })
    .toArray();
  return rows.map((r) => ({ kind: r.kind as Anchor["kind"], at: r.occurred_at }));
}

export async function dayEvents(day: string): Promise<LocalEvent[]> {
  return db().events.where("logical_day").equals(day).sortBy("occurred_at");
}

export async function logicalDayOf(iso: string, settings?: Settings): Promise<string> {
  const s = settings ?? (await currentSettings());
  return logicalDayFor(iso, await localAnchors(iso, s.tz), s.tz, s.day_start_hour);
}

export async function todayLocal(): Promise<string> {
  return logicalDayOf(new Date().toISOString());
}

async function ladderStepId(): Promise<string> {
  const snap = await kvGet<CachedSnapshot>("snapshot");
  return LADDER[snap?.ladder.index ?? 0]?.id ?? LADDER[0].id;
}

export type LogResult = { event: LocalEvent; feedback: Feedback | null };

/**
 * Logs one event: saved on the phone at once, feedback computed on the phone,
 * then synced in the background. Never waits for the network.
 */
export async function logEvent<K extends EventKind>(
  kind: K,
  payload: Payload<K>,
  opts: { at?: Date; photo?: Blob } = {},
): Promise<LogResult> {
  const settings = await currentSettings();
  const occurred_at = (opts.at ?? new Date()).toISOString();
  const id = crypto.randomUUID();
  const anchors = await localAnchors(occurred_at, settings.tz);
  if (kind === "wake" || kind === "sleep") anchors.push({ kind, at: occurred_at });
  const logical_day = logicalDayFor(occurred_at, anchors, settings.tz, settings.day_start_hour);

  let finalPayload = { ...payload } as Record<string, unknown>;
  let meta: Record<string, unknown> = {};
  if (kind === "meal") {
    const sameDay = await dayEvents(logical_day);
    const earlier = sameDay
      .filter((e) => e.kind === "meal" && e.occurred_at < occurred_at)
      .map((e) => mealSlotOf(e))
      .filter((s): s is NonNullable<typeof s> => s !== null);
    const wakeAt = sameDay.find((e) => e.kind === "wake")?.occurred_at ?? null;
    const slot = (payload as Payload<"meal">).slot ?? inferMealSlot(occurred_at, earlier, settings.tz, undefined, wakeAt);
    finalPayload = { ...finalPayload, slot };
    const hasText = typeof finalPayload.text === "string" && (finalPayload.text as string).length > 0;
    meta = { ai_status: opts.photo || hasText ? "pending" : "skipped" };
  }

  const input = ClientEventInput.parse({ id, kind, occurred_at, payload: finalPayload });
  const now = new Date().toISOString();
  const local: LocalEvent = {
    id,
    kind,
    occurred_at,
    logical_day,
    source: "app",
    payload: finalPayload,
    meta,
    created_at: now,
    updated_at: now,
    sync: "pending",
  };

  await db().transaction("rw", db().events, db().outbox, db().photos, async () => {
    await db().events.put(local);
    if (opts.photo) {
      await db().photos.put({ eventId: id, blob: opts.photo });
      await db().outbox.add({ type: "photo", eventId: id, input, blob: opts.photo, tries: 0, createdAt: Date.now() });
    } else {
      await db().outbox.add({ type: "create", eventId: id, input, tries: 0, createdAt: Date.now() });
    }
  });

  void syncNow().then(() => {
    if (kind === "meal" && meta.ai_status === "pending") pollForAnalysis();
  });

  const feedback = feedbackFor(local, await dayEvents(logical_day), { settings, ladderStep: await ladderStepId() });
  return { event: local, feedback };
}

/** Edits time or payload. If the create has not synced yet, the edit is folded into it. */
export async function updateEvent(
  id: string,
  patch: { occurred_at?: string; payload?: Record<string, unknown> },
): Promise<void> {
  const settings = await currentSettings();
  const current = await db().events.get(id);
  if (!current) return;
  const occurred_at = patch.occurred_at ?? current.occurred_at;
  const payload = patch.payload ? { ...current.payload, ...patch.payload } : current.payload;
  const logical_day = await logicalDayOf(occurred_at, settings);
  const reanalyze = current.kind === "meal" && typeof patch.payload?.text === "string" && patch.payload.text.length > 0;
  const meta = reanalyze ? { ...current.meta, ai_status: "pending" } : current.meta;

  await db().transaction("rw", db().events, db().outbox, async () => {
    await db().events.put({
      ...current,
      occurred_at,
      payload,
      meta,
      logical_day,
      sync: "pending",
      updated_at: new Date().toISOString(),
    });
    const pendingCreate = await db()
      .outbox.where("eventId")
      .equals(id)
      .filter((o) => o.type === "create" || o.type === "photo")
      .first();
    if (pendingCreate && (pendingCreate.type === "create" || pendingCreate.type === "photo")) {
      const input = ClientEventInput.parse({ ...pendingCreate.input, occurred_at, payload });
      await db().outbox.put({ ...pendingCreate, input });
    } else {
      await db().outbox.add({ type: "patch", eventId: id, patch, tries: 0, createdAt: Date.now() });
    }
  });
  void syncNow().then(() => {
    if (reanalyze) pollForAnalysis();
  });
}

export async function removeEvent(id: string): Promise<void> {
  await db().transaction("rw", db().events, db().outbox, db().photos, async () => {
    const ops = await db().outbox.where("eventId").equals(id).toArray();
    const unsynced = ops.some((o) => o.type === "create" || o.type === "photo");
    await db().outbox.bulkDelete(ops.map((o) => o.id!));
    await db().events.delete(id);
    await db().photos.delete(id);
    if (!unsynced) await db().outbox.add({ type: "delete", eventId: id, tries: 0, createdAt: Date.now() });
  });
  void syncNow();
}
