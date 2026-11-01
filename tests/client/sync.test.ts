import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearDevice, db, kvSet } from "@/lib/client/db";
import { logEvent, removeEvent, updateEvent } from "@/lib/client/log";
import { mergeServerRange, resumeSync, retryFailed, stopSync, syncNow } from "@/lib/client/sync";
import type { StoredEvent } from "@/lib/domain/events";
import { logicalDayFor } from "@/lib/domain/logical-day";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";

/**
 * The offline sync rules, replayed against a fake server that can hold a request "in
 * flight": edits and undos during an upload, rejected entries, refreshes during deletes.
 */

const TZ = "Asia/Kolkata";
type Row = StoredEvent & { deleted?: boolean };
const server = new Map<string, Row>();
const holds = new Map<string, { arrived: () => void; wait: Promise<void>; release: () => void }>();
const calls: string[] = [];
let failPatch500 = false;
let htmlFor: string | null = null;

function hold(key: string) {
  let release!: () => void;
  let arrived!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  const arrival = new Promise<void>((r) => (arrived = r));
  holds.set(key, { arrived, wait, release });
  return { arrival, release: () => release() };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stored(e: { id: string; kind: string; occurred_at: string; payload: Record<string, unknown> }): Row {
  return {
    id: e.id,
    kind: e.kind as Row["kind"],
    occurred_at: e.occurred_at,
    logical_day: logicalDayFor(e.occurred_at, [], TZ),
    source: "app",
    payload: e.payload,
    meta: {},
    created_at: e.occurred_at,
    updated_at: e.occurred_at,
  };
}

const visible = (r: Row): StoredEvent => {
  const { deleted, ...rest } = r;
  void deleted;
  return rest;
};

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://temple.test");
  const method = init?.method ?? "GET";
  const key = `${method} ${url.pathname}`;
  calls.push(key);
  const h = holds.get(key);
  if (h) {
    holds.delete(key);
    h.arrived();
    await h.wait;
  }
  if (htmlFor === key) return new Response("<html>Login to Wi-Fi</html>", { status: 200, headers: { "content-type": "text/html" } });
  if (method === "POST" && url.pathname === "/api/events") {
    const body = JSON.parse(String(init?.body)) as { events: Row[] };
    if (body.events.some((e) => e.payload?.ml === 1999)) return json(400, { error: "Invalid request" });
    const out: StoredEvent[] = [];
    for (const e of body.events) {
      if (!server.has(e.id)) server.set(e.id, stored(e));
      const row = server.get(e.id)!;
      if (!row.deleted) out.push(visible(row));
    }
    return json(200, { events: out });
  }
  const m = url.pathname.match(/^\/api\/events\/([\w-]+)$/);
  if (m && method === "PATCH") {
    if (failPatch500) return json(500, { error: "Something went wrong" });
    const row = server.get(m[1]);
    if (!row || row.deleted) return json(404, { error: "Not found" });
    const patch = JSON.parse(String(init?.body)) as { occurred_at?: string; payload?: Record<string, unknown> };
    const next = { ...row, payload: { ...row.payload, ...(patch.payload ?? {}) }, occurred_at: patch.occurred_at ?? row.occurred_at };
    server.set(row.id, next);
    return json(200, { event: visible(next) });
  }
  if (m && method === "DELETE") {
    const row = server.get(m[1]);
    if (!row) return json(404, { error: "Not found" });
    server.set(row.id, { ...row, deleted: true, payload: {} });
    return json(200, { ok: true });
  }
  return json(404, { error: "Not found" });
}) as typeof fetch;

function setOnline(on: boolean) {
  Object.defineProperty(globalThis.navigator, "onLine", { value: on, configurable: true });
}

async function settle() {
  // Let background syncs finish: each pass awaits fake IndexedDB and fake fetch.
  for (let i = 0; i < 5; i++) await syncNow();
}

beforeEach(async () => {
  server.clear();
  holds.clear();
  calls.length = 0;
  failPatch500 = false;
  htmlFor = null;
  setOnline(true);
  resumeSync();
  await kvSet("snapshot", { settings: { ...DEFAULT_SETTINGS, tz: TZ }, today: "2026-11-02", streak: {}, ladder: { index: 0, heldInWindow: 0, startedOn: null }, recentVisitCounts: [], fetchedAt: 0 });
  await kvSet("tz_adopted", true);
});

afterEach(async () => {
  stopSync();
  await clearDevice();
});

describe("offline sync", () => {
  it("keeps an edit made while the create is in flight", async () => {
    const h = hold("POST /api/events");
    const { event } = await logEvent("wake", {});
    await h.arrival;
    await updateEvent(event.id, { payload: { mood: 3 } });
    h.release();
    await settle();
    expect(server.get(event.id)?.payload).toEqual({ mood: 3 });
    expect((await db().events.get(event.id))?.payload).toEqual({ mood: 3 });
    expect(await db().outbox.count()).toBe(0);
  });

  it("deletes an entry undone while its create is in flight, on phone and server", async () => {
    const h = hold("POST /api/events");
    const { event } = await logEvent("water", { ml: 250 });
    await h.arrival;
    await removeEvent(event.id);
    h.release();
    await settle();
    expect(await db().events.get(event.id)).toBeUndefined();
    expect(server.get(event.id)?.deleted).toBe(true);
    expect(await db().outbox.count()).toBe(0);
  });

  it("never sends a delete for an entry the server never saw", async () => {
    setOnline(false);
    const { event } = await logEvent("water", { ml: 250 });
    await removeEvent(event.id);
    setOnline(true);
    await settle();
    expect(calls).toEqual([]);
    expect(await db().outbox.count()).toBe(0);
  });

  it("keeps a rejected entry, still syncs the others, and resends it once fixed", async () => {
    setOnline(false);
    const bad = await logEvent("water", { ml: 1999 });
    const good = await logEvent("water", { ml: 250 });
    setOnline(true);
    await settle();
    expect(server.has(good.event.id)).toBe(true);
    expect(server.has(bad.event.id)).toBe(false);
    expect((await db().events.get(bad.event.id))?.sync).toBe("error");
    const op = (await db().outbox.toArray()).find((o) => o.eventId === bad.event.id);
    expect(op?.failed).toBe(true);

    await updateEvent(bad.event.id, { payload: { ml: 500 } });
    await settle();
    expect(server.get(bad.event.id)?.payload).toEqual({ ml: 500 });
    expect((await db().events.get(bad.event.id))?.sync).toBe("synced");
  });

  it("retry sends a paused entry again without edits", async () => {
    setOnline(false);
    const bad = await logEvent("water", { ml: 1999 });
    setOnline(true);
    await settle();
    expect((await db().outbox.toArray())[0]?.failed).toBe(true);
    await retryFailed(bad.event.id);
    expect((await db().events.get(bad.event.id))?.sync).toBe("error");
    expect(calls.filter((c) => c === "POST /api/events").length).toBeGreaterThanOrEqual(2);
  });

  it("does not bring back an entry deleted here when a refresh arrives first", async () => {
    const { event } = await logEvent("water", { ml: 250 });
    await settle();
    const copy = visible(server.get(event.id)!);
    setOnline(false);
    await removeEvent(event.id);
    await mergeServerRange(copy.logical_day, copy.logical_day, [copy], Date.now() + 1);
    expect(await db().events.get(event.id)).toBeUndefined();
    setOnline(true);
    await settle();
    expect(server.get(event.id)?.deleted).toBe(true);
  });

  it("removes entries deleted on another device, but never ones with local changes", async () => {
    const a = await logEvent("water", { ml: 250 });
    const b = await logEvent("water", { ml: 300 });
    await settle();
    const day = (await db().events.get(a.event.id))!.logical_day;
    setOnline(false);
    await updateEvent(b.event.id, { payload: { ml: 400 } });
    await mergeServerRange(day, day, [], Date.now() + 1);
    expect(await db().events.get(a.event.id)).toBeUndefined();
    expect((await db().events.get(b.event.id))?.payload).toEqual({ ml: 400 });
  });

  it("does not let one failing entry block another", async () => {
    const a = await logEvent("water", { ml: 250 });
    const b = await logEvent("water", { ml: 300 });
    await settle();
    failPatch500 = true;
    await updateEvent(a.event.id, { payload: { ml: 350 } });
    await removeEvent(b.event.id);
    await settle();
    expect(server.get(b.event.id)?.deleted).toBe(true);
    const left = await db().outbox.toArray();
    expect(left.map((o) => [o.type, o.eventId, !!o.failed])).toEqual([["patch", a.event.id, false]]);
  });

  it("treats a Wi-Fi login page as a failure, not a success", async () => {
    htmlFor = "POST /api/events";
    const { event } = await logEvent("water", { ml: 250 });
    await syncNow();
    expect(server.has(event.id)).toBe(false);
    expect((await db().outbox.toArray())[0]?.eventId).toBe(event.id);
    expect((await db().outbox.toArray())[0]?.failed).toBeFalsy();
  });
});
