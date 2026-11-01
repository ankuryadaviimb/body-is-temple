"use client";

import { inferMealSlot, mealSlotOf } from "@/lib/domain/day";
import { ClientEventInput, type EventKind, type Payload } from "@/lib/domain/events";
import { LADDER } from "@/lib/domain/ladder";
import { logicalDayFor, type Anchor } from "@/lib/domain/logical-day";
import { feedbackFor, type Feedback } from "@/lib/domain/rules-feedback";
import { withDefaults, type Settings } from "@/lib/domain/settings";
import type { CachedSnapshot } from "@/lib/domain/snapshot";
import { addDays, localParts } from "@/lib/domain/time";
import { findUsual, usualMealMeta, type UsualFood, usualMealPayload } from "@/lib/domain/usual-foods";
import { apiSend } from "./api";
import { db, kvGet, mayBeOnServer, type LocalEvent, type OutboxOp } from "./db";
import { deviceSettings } from "./device";
import { addTombstone, pollForAnalysis, syncNow } from "./sync";

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
    // Same rule as the server: a usual food shows its label values at once, even offline.
    const usual = opts.photo ? null : findUsual(settings.usual_foods, finalPayload.usual);
    meta = usual ? usualMealMeta(usual) : { ai_status: opts.photo || hasText ? "pending" : "skipped" };
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

  if (kind === "wake" || kind === "sleep") {
    const date = morningOf(occurred_at, settings.tz);
    if (date) await replaceMorning(date, settings);
  }

  void syncNow().then(() => {
    if (kind === "meal" && meta.ai_status === "pending") pollForAnalysis();
  });

  const feedback = feedbackFor(local, await dayEvents(logical_day), { settings, ladderStep: await ladderStepId() });
  return { event: local, feedback };
}

/** One tap on a usual food: a meal with its known values. */
export async function logUsualFood(food: UsualFood, at?: Date): Promise<LogResult> {
  return logEvent("meal", usualMealPayload(food), at ? { at } : {});
}

/**
 * Wake and sleep times decide which day nearby entries belong to. After one changes,
 * the entries of that calendar morning are placed again (the server does the same).
 */
async function replaceMorning(date: string, settings: Settings): Promise<void> {
  const rows = await db()
    .events.filter((e) => {
      const p = localParts(e.occurred_at, settings.tz);
      return p.date === date && p.minutes < 12 * 60;
    })
    .toArray();
  for (const e of rows) {
    const day = logicalDayFor(e.occurred_at, await localAnchors(e.occurred_at, settings.tz), settings.tz, settings.day_start_hour);
    if (day !== e.logical_day) await db().events.update(e.id, { logical_day: day });
  }
}

function morningOf(iso: string, tz: string): string | null {
  const p = localParts(iso, tz);
  return p.minutes < 12 * 60 ? p.date : null;
}

/**
 * Edits time or payload. While the create has not been sent, the edit is folded into it;
 * once it may have reached the server, the edit becomes its own patch, so it can never be
 * lost to the create's reply. A rejected create is fixed by folding the edit into it and
 * sending it again.
 */
export async function updateEvent(
  id: string,
  patch: { occurred_at?: string; payload?: Record<string, unknown> },
): Promise<void> {
  const settings = await currentSettings();
  const current = await db().events.get(id);
  if (!current) return;
  const occurred_at = patch.occurred_at ?? current.occurred_at;
  const payload = patch.payload ? { ...current.payload, ...patch.payload } : current.payload;
  const anchorKind = current.kind === "wake" || current.kind === "sleep";
  // Like the server: the entry's own old time is not an anchor; its new time is.
  const anchors = (await localAnchors(occurred_at, settings.tz)).filter((a) => !(anchorKind && a.at === current.occurred_at));
  if (anchorKind) anchors.push({ kind: current.kind as Anchor["kind"], at: occurred_at });
  const logical_day = logicalDayFor(occurred_at, anchors, settings.tz, settings.day_start_hour);
  const textChanged = current.kind === "meal" && typeof patch.payload?.text === "string" && patch.payload.text.length > 0 && patch.payload.text !== current.payload.text;
  const meta = textChanged ? { ...current.meta, ai_status: "pending" } : current.meta;

  await db().transaction("rw", db().events, db().outbox, async () => {
    await db().events.put({ ...current, occurred_at, payload, meta, logical_day, sync: "pending", updated_at: new Date().toISOString() });
    const ops = await db().outbox.where("eventId").equals(id).toArray();
    const create = ops.find((o) => o.type === "create" || o.type === "photo");
    const send: { occurred_at?: string; payload?: Record<string, unknown> } = {};
    if (patch.occurred_at && patch.occurred_at !== current.occurred_at) send.occurred_at = patch.occurred_at;
    if (patch.payload) {
      const changed = Object.fromEntries(Object.entries(patch.payload).filter(([k, v]) => JSON.stringify(current.payload[k]) !== JSON.stringify(v)));
      if (Object.keys(changed).length) send.payload = changed;
    }
    const queuePatch = async () => {
      if (!send.occurred_at && !send.payload) {
        if (current.sync !== "pending") await db().events.update(id, { sync: current.sync });
        return;
      }
      // Patches after the last one that may be in flight have not gone out (or were
      // rejected): fold them and this edit into one, so a fix to a rejected edit replaces
      // it instead of queuing behind it.
      const patches = ops.filter((o): o is Extract<OutboxOp, { type: "patch" }> => o.type === "patch").sort((a, b) => a.id! - b.id!);
      const lastInFlight = patches.map((o) => Boolean(o.sent) && !o.failed).lastIndexOf(true);
      const foldable = patches.slice(lastInFlight + 1);
      if (foldable.length === 0) {
        await db().outbox.add({ type: "patch", eventId: id, patch: send, tries: 0, createdAt: Date.now() });
        return;
      }
      const merged: { occurred_at?: string; payload?: Record<string, unknown> } = {};
      for (const p of [...foldable.map((o) => o.patch), send]) {
        if (p.occurred_at) merged.occurred_at = p.occurred_at;
        if (p.payload) merged.payload = { ...(merged.payload ?? {}), ...p.payload };
      }
      const [first, ...rest] = foldable;
      await db().outbox.put({ ...first, patch: merged, failed: false, sent: false, lastError: undefined });
      if (rest.length) await db().outbox.bulkDelete(rest.map((o) => o.id!));
    };
    if (create && (create.type === "create" || create.type === "photo") && (!mayBeOnServer(create) || create.failed)) {
      // The create has not reached the server (or was rejected): send it again with this
      // edit in it, so a fix to a rejected entry goes out.
      const input = ClientEventInput.parse({ ...create.input, occurred_at, payload });
      await db().outbox.put({ ...create, input, failed: false, sent: false });
      if (!mayBeOnServer(create)) {
        // It never left the phone, so it now carries every change: older patches are not needed.
        const patches = ops.filter((o) => o.type === "patch").map((o) => o.id!);
        if (patches.length) await db().outbox.bulkDelete(patches);
      } else {
        // It went out once, so the server may hold the old copy (its reply was an error).
        // The patch after it brings that copy up to date; on a fresh save it changes nothing.
        await queuePatch();
      }
    } else {
      // The create may already be on the server: the edit becomes its own patch, so the
      // create's reply can never overwrite it.
      await queuePatch();
    }
  });

  if (anchorKind) {
    for (const date of new Set([morningOf(current.occurred_at, settings.tz), morningOf(occurred_at, settings.tz)])) {
      if (date) await replaceMorning(date, settings);
    }
  }
  void syncNow().then(() => {
    if (textChanged) pollForAnalysis();
  });
}

/**
 * Deletes an entry. If its create might already be on the server (sent, or long synced),
 * a delete is queued; a tombstone stops any late reply or refresh from bringing it back.
 */
export async function removeEvent(id: string): Promise<void> {
  const current = await db().events.get(id);
  await db().transaction("rw", [db().events, db().outbox, db().photos, db().kv], async () => {
    const ops = await db().outbox.where("eventId").equals(id).toArray();
    const creates = ops.filter((o) => o.type === "create" || o.type === "photo");
    // A create that ever went out may be on the server even if its reply was an error.
    const serverMayHave = creates.length === 0 || creates.some(mayBeOnServer);
    await db().outbox.bulkDelete(ops.map((o) => o.id!));
    await db().events.delete(id);
    await db().photos.delete(id);
    if (serverMayHave) await db().outbox.add({ type: "delete", eventId: id, tries: 0, createdAt: Date.now() });
    await addTombstone(id);
  });
  if (current && (current.kind === "wake" || current.kind === "sleep")) {
    const settings = await currentSettings();
    const date = morningOf(current.occurred_at, settings.tz);
    if (date) await replaceMorning(date, settings);
  }
  void syncNow();
}

/** Asks the server to read a meal again. Works only online; the timeline shows the new result. */
export async function reanalyzeMeal(id: string): Promise<void> {
  const current = await db().events.get(id);
  if (!current || current.kind !== "meal") return;
  await apiSend("POST", `/api/events/${id}/analyze`);
  await db().events.put({ ...current, meta: { ...current.meta, ai_status: "pending", requested_at: new Date().toISOString() } });
  pollForAnalysis();
}

/** A read that has been "pending" for over 3 minutes was cut off; offer to retry it. */
export function analysisStuck(e: { kind: string; meta: Record<string, unknown>; updated_at: string; created_at: string }, now: Date): boolean {
  if (e.kind !== "meal" || e.meta?.ai_status !== "pending") return false;
  const since = typeof e.meta.requested_at === "string" ? e.meta.requested_at : e.updated_at || e.created_at;
  return now.getTime() - new Date(since).getTime() > 3 * 60_000;
}
