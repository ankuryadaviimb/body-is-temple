"use client";

import type { StoredEvent } from "@/lib/domain/events";
import type { CachedSnapshot, TodaySnapshot } from "@/lib/domain/snapshot";
import { addDays } from "@/lib/domain/time";
import { ApiError, apiGet, apiSend, apiUpload } from "./api";
import { db, kvGet, kvSet, type LocalEvent, type OutboxOp } from "./db";

/**
 * Background sync. The outbox is flushed in order: creates (batched), photos,
 * patches, deletes. Failures retry with backoff; a request the server rejects as
 * invalid is dropped so it cannot block the queue.
 */

let running = false;
let rerun = false;
let backoffMs = 2_000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(state: SyncState) => void>();

export type SyncState = { pending: number; lastError: string | null; online: boolean };
let state: SyncState = { pending: 0, lastError: null, online: true };

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

async function putServerEvents(events: StoredEvent[]) {
  if (events.length === 0) return;
  await db().events.bulkPut(events.map((e) => ({ ...e, sync: "synced" as const })));
}

const isPermanent = (err: unknown) =>
  err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429 && err.status !== 408;

async function markError(op: OutboxOp) {
  await db().outbox.delete(op.id!);
  const ev = await db().events.get(op.eventId);
  if (ev) await db().events.put({ ...ev, sync: "error" });
}

async function flushOnce(): Promise<boolean> {
  const ops = await db().outbox.orderBy("id").toArray();
  emit({ pending: ops.length });
  if (ops.length === 0) return false;

  const creates = ops.filter((o): o is Extract<OutboxOp, { type: "create" }> => o.type === "create").slice(0, 100);
  if (creates.length > 0) {
    try {
      const res = await apiSend<{ events: StoredEvent[] }>("POST", "/api/events", {
        events: creates.map((c) => c.input),
      });
      await putServerEvents(res.events);
      // An id the server did not return was deleted elsewhere; drop the local copy too.
      const returned = new Set(res.events.map((e) => e.id));
      const gone = creates.filter((c) => !returned.has(c.eventId)).map((c) => c.eventId);
      if (gone.length > 0) await db().events.bulkDelete(gone);
      await db().outbox.bulkDelete(creates.map((c) => c.id!));
    } catch (err) {
      if (isPermanent(err) && creates.length === 1) await markError(creates[0]);
      else if (isPermanent(err)) {
        // Find the bad one by sending individually next time.
        for (const c of creates) {
          try {
            const res = await apiSend<{ events: StoredEvent[] }>("POST", "/api/events", { events: [c.input] });
            await putServerEvents(res.events);
            await db().outbox.delete(c.id!);
          } catch (inner) {
            if (isPermanent(inner)) await markError(c);
            else throw inner;
          }
        }
      } else throw err;
    }
    return true;
  }

  for (const op of ops) {
    try {
      if (op.type === "photo") {
        const form = new FormData();
        form.set("event", JSON.stringify(op.input));
        form.set("file", op.blob, "meal.jpg");
        const res = await apiUpload<{ event: StoredEvent }>("/api/meals/photo", form);
        await putServerEvents([res.event]);
      } else if (op.type === "patch") {
        const res = await apiSend<{ event: StoredEvent }>("PATCH", `/api/events/${op.eventId}`, op.patch);
        await putServerEvents([res.event]);
      } else if (op.type === "delete") {
        await apiSend("DELETE", `/api/events/${op.eventId}`);
      } else {
        continue;
      }
      await db().outbox.delete(op.id!);
    } catch (err) {
      if (isPermanent(err)) await markError(op);
      else throw err;
    }
  }
  return (await db().outbox.count()) > 0;
}

export async function syncNow(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    emit({ online: false });
    return;
  }
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      while (await flushOnce()) {
        /* keep flushing until the outbox is empty */
      }
    } while (rerun);
    backoffMs = 2_000;
    emit({ lastError: null, online: true, pending: 0 });
  } catch (err) {
    emit({ lastError: err instanceof Error ? err.message : "Sync failed", pending: await db().outbox.count() });
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void syncNow(), backoffMs);
    backoffMs = Math.min(backoffMs * 2, 60_000);
  } finally {
    running = false;
  }
}

/** Pulls the latest snapshot and replaces synced events for yesterday and today. */
export async function refreshFromServer(): Promise<TodaySnapshot | null> {
  try {
    const snap = await apiGet<TodaySnapshot>("/api/today");
    const days = [addDays(snap.today, -1), snap.today];
    await db().transaction("rw", db().events, async () => {
      const local = await db().events.where("logical_day").anyOf(days).toArray();
      const serverIds = new Set(snap.events.map((e) => e.id));
      const stale = local.filter((e) => e.sync === "synced" && !serverIds.has(e.id)).map((e) => e.id);
      await db().events.bulkDelete(stale);
      const pendingIds = new Set(local.filter((e) => e.sync !== "synced").map((e) => e.id));
      await db().events.bulkPut(
        snap.events.filter((e) => !pendingIds.has(e.id)).map((e) => ({ ...e, sync: "synced" as const }) as LocalEvent),
      );
    });
    const cached: CachedSnapshot = {
      today: snap.today,
      settings: snap.settings,
      streak: snap.streak,
      ladder: snap.ladder,
      recentVisitCounts: snap.recentVisitCounts,
      fetchedAt: Date.now(),
    };
    await kvSet("snapshot", cached);
    emit({ online: true });
    if (await adoptDeviceTimeZone(snap)) return refreshFromServer();
    return snap;
  } catch (err) {
    if (err instanceof TypeError) emit({ online: false });
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

/** Refreshes a few times while meal analyses are still running on the server. */
export function pollForAnalysis() {
  for (const delay of [6_000, 15_000, 35_000]) {
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

let started = false;

export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => {
    emit({ online: true });
    void syncNow().then(() => refreshFromServer());
  });
  window.addEventListener("offline", () => emit({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow().then(() => refreshFromServer());
  });
  void syncNow().then(() => refreshFromServer());
}
