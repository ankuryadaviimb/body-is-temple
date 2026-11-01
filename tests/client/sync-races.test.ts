import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearDevice, db, kvGet, kvSet } from "@/lib/client/db";
import { logEvent, updateEvent } from "@/lib/client/log";
import { addTombstone, refreshFromServer, resumeSync, retryFailed, stopSync, syncNow } from "@/lib/client/sync";
import type { StoredEvent } from "@/lib/domain/events";
import { logicalDayFor } from "@/lib/domain/logical-day";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { addDays } from "@/lib/domain/time";

/**
 * Races between a slow refresh and the outbox, replayed against a fake server whose GET
 * reads its rows when the request arrives and then answers late (like /api/today, which
 * reads events first and then builds the streak and the card).
 */

const TZ = "Asia/Kolkata";
type Row = StoredEvent & { deleted?: boolean };
const server = new Map<string, Row>();
const holds = new Map<string, { arrived: () => void; wait: Promise<void> }>();
let failNext: { key: string; status: number; commitFirst?: boolean } | null = null;

function hold(key: string) {
  let release!: () => void;
  let arrived!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  const arrival = new Promise<void>((r) => (arrived = r));
  holds.set(key, { arrived, wait });
  return { arrival, release: () => release() };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const todayDay = () => logicalDayFor(new Date().toISOString(), [], TZ);
const visible = (r: Row): StoredEvent => {
  const { deleted, ...rest } = r;
  void deleted;
  return rest;
};
function stored(e: { id: string; kind: string; occurred_at: string; payload: Record<string, unknown> }): Row {
  const now = new Date().toISOString();
  return { id: e.id, kind: e.kind as Row["kind"], occurred_at: e.occurred_at, logical_day: logicalDayFor(e.occurred_at, [], TZ), source: "app", payload: e.payload, meta: {}, created_at: now, updated_at: now };
}
function saveCreates(body: { events: Row[] }): StoredEvent[] {
  const out: StoredEvent[] = [];
  for (const e of body.events) {
    if (!server.has(e.id)) server.set(e.id, stored(e));
    const row = server.get(e.id)!;
    if (!row.deleted) out.push(visible(row));
  }
  return out;
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://temple.test");
  const method = init?.method ?? "GET";
  const key = `${method} ${url.pathname}`;
  // The snapshot is read when the request arrives, before any hold.
  let snapshot: StoredEvent[] | null = null;
  if (key === "GET /api/today") {
    const t = todayDay();
    snapshot = [...server.values()].filter((r) => !r.deleted && r.logical_day >= addDays(t, -1) && r.logical_day <= t).map((r) => structuredClone(visible(r)));
  }
  const h = holds.get(key);
  if (h) {
    holds.delete(key);
    h.arrived();
    await h.wait;
  }
  if (failNext && key.startsWith(failNext.key)) {
    const { status, commitFirst } = failNext;
    failNext = null;
    if (commitFirst && key === "POST /api/events") saveCreates(JSON.parse(String(init?.body)));
    return json(status, { error: "Rejected" });
  }
  if (snapshot) {
    return json(200, {
      today: todayDay(),
      settings: { ...DEFAULT_SETTINGS, tz: TZ },
      events: snapshot,
      streak: {},
      ladder: { index: 0, heldInWindow: 0, startedOn: null },
      recentVisitCounts: [],
      coachCard: null,
      coachCardPending: false,
    });
  }
  if (method === "POST" && url.pathname === "/api/events") return json(200, { events: saveCreates(JSON.parse(String(init?.body))) });
  if (method === "POST" && url.pathname === "/api/meals/photo") {
    const e = JSON.parse(String((init?.body as FormData).get("event"))) as Row;
    if (server.get(e.id)?.deleted) return json(409, { error: "Could not save" });
    if (!server.has(e.id)) server.set(e.id, stored({ ...e, payload: { ...e.payload, media_id: e.id } }));
    return json(200, { event: visible(server.get(e.id)!) });
  }
  const m = url.pathname.match(/^\/api\/events\/([\w-]+)$/);
  if (m && method === "PATCH") {
    const row = server.get(m[1]);
    if (!row || row.deleted) return json(404, { error: "Not found" });
    const patch = JSON.parse(String(init?.body)) as { occurred_at?: string; payload?: Record<string, unknown> };
    if (patch.payload?.ml === 1999) return json(400, { error: "Invalid request" });
    const next = { ...row, payload: { ...row.payload, ...(patch.payload ?? {}) }, occurred_at: patch.occurred_at ?? row.occurred_at, updated_at: new Date().toISOString() };
    server.set(row.id, next);
    return json(200, { event: visible(next) });
  }
  return json(404, { error: "Not found" });
}) as typeof fetch;

function setOnline(on: boolean) {
  Object.defineProperty(globalThis.navigator, "onLine", { value: on, configurable: true });
}
async function settle() {
  for (let i = 0; i < 6; i++) await syncNow();
}

beforeEach(async () => {
  server.clear();
  holds.clear();
  failNext = null;
  setOnline(true);
  resumeSync();
  await kvSet("snapshot", { settings: { ...DEFAULT_SETTINGS, tz: TZ }, today: todayDay(), streak: {}, ladder: { index: 0, heldInWindow: 0, startedOn: null }, recentVisitCounts: [], fetchedAt: 0 });
  await kvSet("tz_adopted", true);
});
afterEach(async () => {
  stopSync();
  await clearDevice();
});

describe("a slow refresh never undoes newer work", () => {
  it("keeps an entry logged and confirmed while the refresh was in flight", async () => {
    const h = hold("GET /api/today");
    const refresh = refreshFromServer();
    await h.arrival;
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    expect(server.has(event.id)).toBe(true);
    h.release();
    await refresh;
    expect(await db().events.get(event.id)).toBeDefined();
  });

  it("keeps an edit confirmed while the refresh was in flight", async () => {
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    const h = hold("GET /api/today");
    const refresh = refreshFromServer();
    await h.arrival;
    await updateEvent(event.id, { payload: { ml: 400 } });
    await settle();
    h.release();
    await refresh;
    expect((await db().events.get(event.id))?.payload).toEqual({ ml: 400 });
  });

  it("an older refresh that finishes after a newer one keeps a confirmed entry", async () => {
    const old = hold("GET /api/today");
    const first = refreshFromServer();
    await old.arrival;
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    // The newer refresh starts strictly after the confirmation (no same-millisecond luck).
    await new Promise((r) => setTimeout(r, 3));
    await refreshFromServer();
    old.release();
    await first;
    expect(await db().events.get(event.id)).toBeDefined();
  });

  it("an older refresh that finishes after a newer one keeps a confirmed edit", async () => {
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    const old = hold("GET /api/today");
    const first = refreshFromServer();
    await old.arrival;
    await updateEvent(event.id, { payload: { ml: 400 } });
    await settle();
    // The newer refresh starts strictly after the confirmation (no same-millisecond luck).
    await new Promise((r) => setTimeout(r, 3));
    await refreshFromServer();
    old.release();
    await first;
    expect((await db().events.get(event.id))?.payload).toEqual({ ml: 400 });
  });

  it("still removes an entry deleted on another device before the refresh began", async () => {
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    server.set(event.id, { ...server.get(event.id)!, deleted: true });
    await new Promise((r) => setTimeout(r, 2));
    await refreshFromServer();
    expect(await db().events.get(event.id)).toBeUndefined();
  });
});

describe("outbox ordering", () => {
  it("an edit made while a photo is uploading reaches the server and stays on the phone", async () => {
    setOnline(false);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const { event } = await logEvent("meal", { text: "rice" } as never, { photo: blob });
    setOnline(true);
    const h = hold("POST /api/meals/photo");
    const run = syncNow();
    await h.arrival;
    await updateEvent(event.id, { payload: { text: "rice and dal" } });
    h.release();
    await run;
    await settle();
    expect(server.get(event.id)?.payload.text).toBe("rice and dal");
    expect((await db().events.get(event.id))?.payload.text).toBe("rice and dal");
  });

  it("a newer edit replaces an older rejected one instead of being overwritten by its retry", async () => {
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    failNext = { key: `PATCH /api/events/${event.id}`, status: 403 };
    await updateEvent(event.id, { payload: { ml: 400 } });
    await settle();
    expect((await db().outbox.toArray()).map((o) => [o.type, !!o.failed])).toEqual([["patch", true]]);
    await updateEvent(event.id, { payload: { ml: 300 } });
    await settle();
    await retryFailed(event.id);
    await settle();
    expect(server.get(event.id)?.payload).toEqual({ ml: 300 });
    expect((await db().events.get(event.id))?.payload).toEqual({ ml: 300 });
    expect(await db().outbox.count()).toBe(0);
  });

  it("a value the server refuses can be fixed by editing it again", async () => {
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    await updateEvent(event.id, { payload: { ml: 1999 } });
    await settle();
    expect((await db().events.get(event.id))?.sync).toBe("error");
    await updateEvent(event.id, { payload: { ml: 300 } });
    await settle();
    expect(server.get(event.id)?.payload).toEqual({ ml: 300 });
    expect((await db().events.get(event.id))?.sync).toBe("synced");
    expect(await db().outbox.count()).toBe(0);
  });

  it("an edit to an entry deleted on another device removes it here instead of failing forever", async () => {
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    server.set(event.id, { ...server.get(event.id)!, deleted: true });
    await updateEvent(event.id, { payload: { ml: 300 } });
    await settle();
    expect(await db().events.get(event.id)).toBeUndefined();
    expect(await db().outbox.count()).toBe(0);
  });

  it("a photo for an entry already deleted on the server is dropped, not retried forever", async () => {
    setOnline(false);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const { event } = await logEvent("meal", { text: "rice" } as never, { photo: blob });
    server.set(event.id, { ...(await db().events.get(event.id))!, deleted: true } as Row);
    setOnline(true);
    await settle();
    expect(await db().events.get(event.id)).toBeUndefined();
    expect(await db().outbox.count()).toBe(0);
  });

  it("a fix to an entry the server saved but answered with an error still reaches the server", async () => {
    failNext = { key: "POST /api/events", status: 403, commitFirst: true };
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    expect(server.get(event.id)?.payload).toEqual({ ml: 250 });
    expect((await db().events.get(event.id))?.sync).toBe("error");
    await updateEvent(event.id, { payload: { ml: 500 } });
    await settle();
    expect(server.get(event.id)?.payload).toEqual({ ml: 500 });
    expect((await db().events.get(event.id))?.payload).toEqual({ ml: 500 });
    expect(await db().outbox.count()).toBe(0);
  });

  it("deletes committed together keep every tombstone", async () => {
    await Promise.all([addTombstone("a"), addTombstone("b"), addTombstone("c")]);
    const t = (await kvGet<Record<string, number>>("tombstones")) ?? {};
    expect(Object.keys(t).sort()).toEqual(["a", "b", "c"]);
  });
});
