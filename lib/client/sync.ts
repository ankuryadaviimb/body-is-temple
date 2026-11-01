"use client";

import type { StoredEvent } from "@/lib/domain/events";
import type { CachedSnapshot, TodaySnapshot } from "@/lib/domain/snapshot";
import { addDays } from "@/lib/domain/time";
import { ApiError, apiGet, apiSend, apiUpload } from "./api";
import { db, kvGet, kvSet, type LocalEvent, type OutboxOp } from "./db";

/**
 * Background sync. Every log is saved on the phone first; the outbox then sends creates
 * (batched), photos, edits and deletes to the server.
 *
 * Rules that keep data safe:
 * - An op is marked "sent" before its request goes out. A sent create is never edited
 *   in place (an edit becomes its own patch), and deleting it always queues a delete.
 * - A server copy never overwrites a local entry that still has ops waiting, and never
 *   brings back an entry deleted on this phone (tombstones).
 * - A request the server rejects is kept and paused, not dropped, so "tap to fix" can
 *   send it again and sign out can warn about it.
 * - One failing entry never blocks the others, and only one sync runs at a time, even
 *   across tabs.
 */

export type SyncState = { pending: number; failed: number; lastError: string | null; online: boolean; lastSyncedAt: number | null };

let current: Promise<void> | null = null;
let rerun = false;
let stopped = false;
let backoffMs = 2_000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(state: SyncState) => void>();
let state: SyncState = { pending: 0, failed: 0, lastError: null, online: true, lastSyncedAt: null };

function emit(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function onSyncState(listener: (s: SyncState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

const TOMBSTONES = "tombstones";
const TOMBSTONE_MS = 14 * 86_400_000;

async function readTombstones(): Promise<Record<string, number>> {
  return (await kvGet<Record<string, number>>(TOMBSTONES)) ?? {};
}

/**
 * Remembers that an entry was deleted here, so no late server reply can bring it back.
 * Read and written in one transaction, so deletes committed together all keep theirs.
 */
export async function addTombstone(id: string): Promise<void> {
  await db().transaction("rw", db().kv, async () => {
    const now = Date.now();
    const t = await readTombstones();
    t[id] = now;
    for (const [k, at] of Object.entries(t)) if (now - at > TOMBSTONE_MS) delete t[k];
    await kvSet(TOMBSTONES, t);
  });
}

/** Entries whose local copy must win: anything still in the outbox, or deleted here. */
async function protectedIds(): Promise<Set<string>> {
  const ops = await db().outbox.toArray();
  const t = await readTombstones();
  return new Set([...ops.map((o) => o.eventId), ...Object.keys(t)]);
}

const isPermanent = (err: unknown) =>
  err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 408 && err.status !== 429;

const errorText = (err: unknown) => (err instanceof ApiError ? `${err.status} ${err.message}` : err instanceof Error ? err.message : "error").slice(0, 120);

async function markFailed(op: OutboxOp, err: unknown) {
  await db().transaction("rw", db().outbox, db().events, async () => {
    const fresh = await db().outbox.get(op.id!);
    if (!fresh) return;
    await db().outbox.update(op.id!, { failed: true, lastError: errorText(err) });
    const ev = await db().events.get(op.eventId);
    if (ev) await db().events.put({ ...ev, sync: "error" });
  });
}

/** After a create batch succeeds: drop its ops, then keep the server copies that may win. */
async function ackCreates(ops: OutboxOp[], server: StoredEvent[]) {
  await db().transaction("rw", db().outbox, db().events, db().kv, async () => {
    await db().outbox.bulkDelete(ops.map((o) => o.id!));
    const guard = await protectedIds();
    const returned = new Set(server.map((e) => e.id));
    // Not returned: the server already had this id as deleted (another device). Drop it here too.
    const gone = ops.map((o) => o.eventId).filter((id) => !returned.has(id) && !guard.has(id));
    if (gone.length) await db().events.bulkDelete(gone);
    const keep = server.filter((e) => !guard.has(e.id));
    const at = Date.now();
    if (keep.length) await db().events.bulkPut(keep.map((e) => ({ ...e, sync: "synced" as const, synced_at: at }) as LocalEvent));
  });
}

/**
 * The server no longer has this entry (deleted on another device): drop everything waiting
 * for it here, and the local copy, like a create the server answers as already deleted.
 */
async function goneOnServer(eventId: string) {
  await db().transaction("rw", [db().outbox, db().events, db().photos, db().kv], async () => {
    const ops = await db().outbox.where("eventId").equals(eventId).toArray();
    await db().outbox.bulkDelete(ops.map((o) => o.id!));
    await db().events.delete(eventId);
    await db().photos.delete(eventId);
    await addTombstone(eventId);
  });
}

async function ackOne(op: OutboxOp, server: StoredEvent | null) {
  await db().transaction("rw", db().outbox, db().events, db().kv, async () => {
    await db().outbox.delete(op.id!);
    if (!server) return;
    const guard = await protectedIds();
    if (!guard.has(server.id)) await db().events.put({ ...server, sync: "synced", synced_at: Date.now() } as LocalEvent);
  });
}

async function flushCreates(): Promise<void> {
  // Mark the batch sent inside a transaction, so an edit made from now on becomes a patch.
  const batch = await db().transaction("rw", db().outbox, async () => {
    const list = (await db().outbox.orderBy("id").toArray()).filter((o) => o.type === "create" && !o.failed).slice(0, 100);
    if (list.length) await db().outbox.where("id").anyOf(list.map((o) => o.id!)).modify({ sent: true, everSent: true });
    return list as Extract<OutboxOp, { type: "create" }>[];
  });
  if (batch.length === 0) return;
  try {
    const res = await apiSend<{ events: StoredEvent[] }>("POST", "/api/events", { events: batch.map((c) => c.input) });
    await ackCreates(batch, res.events);
  } catch (err) {
    if (!isPermanent(err)) throw err;
    if (batch.length === 1) {
      await markFailed(batch[0], err);
      return;
    }
    // Find the rejected one by sending each on its own.
    for (const c of batch) {
      try {
        const res = await apiSend<{ events: StoredEvent[] }>("POST", "/api/events", { events: [c.input] });
        await ackCreates([c], res.events);
      } catch (inner) {
        if (isPermanent(inner)) await markFailed(c, inner);
        else throw inner;
      }
    }
  }
}

async function flushOthers(ops: OutboxOp[], paused: Set<string>): Promise<void> {
  // An entry with a paused (rejected) op waits for "retry": later edits must not jump ahead of it.
  const blocked = new Set<string>(paused);
  let transient: unknown = null;
  for (const listed of ops) {
    if (listed.type === "create" || blocked.has(listed.eventId)) continue;
    // Re-read and mark sent in one transaction: an edit saved from now on becomes its own
    // patch instead of being folded into a request that is already on its way.
    const op = await db().transaction("rw", db().outbox, async () => {
      const fresh = await db().outbox.get(listed.id!);
      if (!fresh || fresh.failed) return null;
      await db().outbox.update(fresh.id!, { sent: true, everSent: true });
      return fresh;
    });
    if (!op) continue;
    try {
      if (op.type === "photo") {
        const form = new FormData();
        form.set("event", JSON.stringify(op.input));
        form.set("file", op.blob, "meal.jpg");
        try {
          const res = await apiUpload<{ event: StoredEvent }>("/api/meals/photo", form);
          await ackOne(op, res.event);
        } catch (err) {
          // 409: this id is already deleted on the server.
          if (!(err instanceof ApiError && err.status === 409)) throw err;
          await goneOnServer(op.eventId);
        }
      } else if (op.type === "patch") {
        try {
          const res = await apiSend<{ event: StoredEvent }>("PATCH", `/api/events/${op.eventId}`, op.patch);
          await ackOne(op, res.event);
        } catch (err) {
          // 404: deleted on another device. Its create always goes first, so it is not "not yet sent".
          if (!(err instanceof ApiError && err.status === 404)) throw err;
          await goneOnServer(op.eventId);
        }
      } else if (op.type === "delete") {
        try {
          await apiSend("DELETE", `/api/events/${op.eventId}`);
        } catch (err) {
          // Already gone on the server is the goal of a delete.
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }
        await ackOne(op, null);
      }
    } catch (err) {
      blocked.add(op.eventId);
      if (isPermanent(err)) await markFailed(op, err);
      else transient = transient ?? err;
    }
  }
  if (transient) throw transient;
}

/** Ops that can go now, and the entries waiting on a rejected op (shown as "not saved"). */
async function outboxState(): Promise<{ sendable: OutboxOp[]; paused: Set<string>; stuck: number }> {
  const all = await db().outbox.orderBy("id").toArray();
  const paused = new Set(all.filter((o) => o.failed).map((o) => o.eventId));
  const sendable = all.filter((o) => !o.failed && !paused.has(o.eventId));
  return { sendable, paused, stuck: all.length - sendable.length };
}

/** One pass over the outbox. Returns true while sendable ops remain. */
async function flushOnce(): Promise<boolean> {
  if (stopped) return false;
  const { sendable, paused, stuck } = await outboxState();
  emit({ pending: sendable.length, failed: stuck });
  if (sendable.length === 0) return false;
  if (sendable.some((o) => o.type === "create")) await flushCreates();
  else await flushOthers(sendable, paused);
  return (await outboxState()).sendable.length > 0;
}

async function withLock(run: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks?.request) {
    await locks.request("temple-sync", run);
    return;
  }
  await run();
}

/**
 * Sends everything waiting. Callers can await it: if a sync is already running, they get
 * that same run (plus one more pass), so a refresh after it never races an upload.
 */
export function syncNow(): Promise<void> {
  if (stopped) return Promise.resolve();
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    emit({ online: false });
    return Promise.resolve();
  }
  if (current) {
    rerun = true;
    return current;
  }
  current = (async () => {
    try {
      await withLock(async () => {
        do {
          rerun = false;
          while (await flushOnce()) {
            /* keep flushing until nothing active is left */
          }
        } while (rerun && !stopped);
      });
      backoffMs = 2_000;
      const { stuck } = await outboxState();
      emit({ lastError: null, online: true, pending: 0, failed: stuck });
    } catch (err) {
      const { sendable, stuck } = await outboxState();
      emit({ lastError: errorText(err), pending: sendable.length, failed: stuck });
      if (retryTimer) clearTimeout(retryTimer);
      if (!stopped) retryTimer = setTimeout(() => void syncNow(), backoffMs);
      backoffMs = Math.min(backoffMs * 2, 60_000);
    } finally {
      current = null;
    }
  })();
  return current;
}

/** "Tap to fix" and the retry button: un-pause rejected ops and send them again. */
export async function retryFailed(eventId?: string): Promise<void> {
  await db().transaction("rw", db().outbox, db().events, async () => {
    const failed = (await db().outbox.toArray()).filter((o) => o.failed && (!eventId || o.eventId === eventId));
    for (const op of failed) {
      await db().outbox.update(op.id!, { failed: false, sent: op.type === "create" || op.type === "photo" ? false : op.sent, tries: op.tries + 1 });
      const ev = await db().events.get(op.eventId);
      if (ev) await db().events.put({ ...ev, sync: "pending" });
    }
  });
  await syncNow();
}

/** Everything not yet safe on the server: waiting ops plus rejected ones. */
export async function unsyncedCount(): Promise<number> {
  const ids = new Set((await db().outbox.toArray()).map((o) => o.eventId));
  const errors = await db().events.filter((e) => e.sync === "error" || e.sync === "pending").toArray();
  for (const e of errors) ids.add(e.id);
  return ids.size;
}

/**
 * Applies the server's copy of a range of days: removes local copies the server no
 * longer has, and updates the rest, without touching entries that have local changes
 * waiting, were deleted here, or were confirmed by the server after this request began
 * (`requestedAt`): the reply may have been read before that change reached the server.
 */
export async function mergeServerRange(from: string, to: string, server: StoredEvent[], requestedAt: number): Promise<void> {
  await db().transaction("rw", db().events, db().outbox, db().kv, async () => {
    const guard = await protectedIds();
    const local = await db().events.where("logical_day").between(from, to, true, true).toArray();
    const newer = (e: LocalEvent) => (e.synced_at ?? 0) >= requestedAt;
    for (const e of local) if (newer(e)) guard.add(e.id);
    const unsynced = new Set(local.filter((e) => e.sync !== "synced").map((e) => e.id));
    const serverIds = new Set(server.map((e) => e.id));
    const stale = local.filter((e) => e.sync === "synced" && !serverIds.has(e.id) && !guard.has(e.id)).map((e) => e.id);
    if (stale.length) await db().events.bulkDelete(stale);
    // A server copy may also belong to a day outside this range locally (its time was edited).
    const elsewhere = await db().events.bulkGet(server.map((e) => e.id));
    for (const e of elsewhere) if (e && (newer(e) || e.sync !== "synced")) guard.add(e.id);
    const keep = server.filter((e) => !guard.has(e.id) && !unsynced.has(e.id));
    // The reply is at least as new as the request, so an older reply still in flight can
    // never undo it.
    if (keep.length) await db().events.bulkPut(keep.map((e) => ({ ...e, sync: "synced" as const, synced_at: requestedAt }) as LocalEvent));
  });
}

/**
 * The server's copy of a range with this phone's unsent changes on top, without writing
 * anything: edits made here replace the server copy, entries deleted here are left out,
 * and entries not yet sent are added. Used by read-only views such as the gut diary.
 */
export async function withLocalChanges(server: StoredEvent[], from: string, to: string): Promise<StoredEvent[]> {
  const changed = await protectedIds();
  const inRange = (e: StoredEvent) => e.logical_day >= from && e.logical_day <= to;
  const out = new Map<string, StoredEvent>();
  for (const e of server) {
    if (!changed.has(e.id)) {
      out.set(e.id, e);
      continue;
    }
    const mine = await db().events.get(e.id);
    if (mine && inRange(mine)) out.set(e.id, mine);
  }
  const local = await db().events.where("logical_day").between(from, to, true, true).toArray();
  for (const e of local) if ((e.sync !== "synced" || changed.has(e.id)) && !out.has(e.id)) out.set(e.id, e);
  return [...out.values()];
}

/** Pulls the latest snapshot and replaces synced events for yesterday and today. */
export async function refreshFromServer(): Promise<TodaySnapshot | null> {
  if (stopped) return null;
  try {
    const requestedAt = Date.now();
    const snap = await apiGet<TodaySnapshot>("/api/today");
    if (stopped) return null;
    await mergeServerRange(addDays(snap.today, -1), snap.today, snap.events, requestedAt);
    const cached: CachedSnapshot = {
      today: snap.today,
      settings: snap.settings,
      streak: snap.streak,
      ladder: snap.ladder,
      recentVisitCounts: snap.recentVisitCounts,
      coachCard: snap.coachCard ?? null,
      coachCardPending: snap.coachCardPending ?? false,
      fetchedAt: Date.now(),
    };
    await kvSet("snapshot", cached);
    emit({ online: true, lastSyncedAt: Date.now() });
    if (snap.coachCardPending) pollForCard(snap.today);
    if (await adoptDeviceTimeZone(snap)) return refreshFromServer();
    return snap;
  } catch (err) {
    if (!(err instanceof ApiError)) emit({ online: typeof navigator === "undefined" ? true : navigator.onLine });
    return null;
  }
}

/**
 * On first run, settings start in UTC. Adopt the phone's own time zone once, so days
 * and clock times are right without asking. The user can still change it in Settings.
 */
async function adoptDeviceTimeZone(snap: TodaySnapshot): Promise<boolean> {
  if (snap.settings.tz !== "UTC" || (await kvGet<boolean>("tz_adopted"))) return false;
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await kvSet("tz_adopted", true);
  if (!deviceTz || deviceTz === "UTC") return false;
  try {
    await apiSend("PUT", "/api/settings", { tz: deviceTz });
    return true;
  } catch {
    await kvSet("tz_adopted", false);
    return false;
  }
}

let cardPollDay: string | null = null;

/** The morning card is written in the background; check back twice (once per day). */
function pollForCard(day: string) {
  if (cardPollDay === day) return;
  cardPollDay = day;
  for (const delay of [8_000, 25_000]) setTimeout(() => void refreshFromServer(), delay);
}

/** Refreshes a few times while meal analyses are still running on the server. */
export function pollForAnalysis() {
  for (const delay of [6_000, 15_000, 35_000, 70_000]) {
    setTimeout(async () => {
      const pending = await db()
        .events.where("kind")
        .equals("meal")
        .filter((e) => e.meta?.ai_status === "pending")
        .count();
      if (pending > 0) await refreshFromServer();
    }, delay);
  }
}

/** Local meal photos are only needed until the server has them; keep a few days. */
async function prunePhotos() {
  const cutoff = Date.now() - 3 * 86_400_000;
  const waiting = new Set((await db().outbox.toArray()).map((o) => o.eventId));
  const photos = await db().photos.toArray();
  const old: string[] = [];
  for (const p of photos) {
    if (waiting.has(p.eventId)) continue;
    const ev = await db().events.get(p.eventId);
    if (!ev || new Date(ev.created_at).getTime() < cutoff) old.push(p.eventId);
  }
  if (old.length) await db().photos.bulkDelete(old);
}

/** Stops all syncing (sign out), so nothing refills the device after it is cleared. */
export function stopSync() {
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** Allows syncing again (after sign in). */
export function resumeSync() {
  stopped = false;
  backoffMs = 2_000;
}

let started = false;

export function startSync() {
  if (typeof window === "undefined") return;
  resumeSync();
  if (!started) {
    started = true;
    window.addEventListener("online", () => {
      emit({ online: true });
      void syncNow().then(() => refreshFromServer());
    });
    window.addEventListener("offline", () => emit({ online: false }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void syncNow().then(() => refreshFromServer());
    });
  }
  void (async () => {
    // On a first run, learn the time zone before anything is sent, so days are right.
    if (!(await kvGet<boolean>("tz_adopted"))) await refreshFromServer();
    await syncNow();
    await refreshFromServer();
    await prunePhotos().catch(() => undefined);
  })();
}
