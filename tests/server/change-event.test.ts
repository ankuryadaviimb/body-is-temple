import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredEvent } from "@/lib/domain/events";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";

/**
 * Background AI writes and edits from the phone, interleaved against an in-memory table
 * that behaves like the real one: a trigger moves updated_at on every write, and a write
 * filtered on an old updated_at changes nothing (checked against the hosted database).
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: () => ({ AI_PHOTO_PROVIDER: "cloudflare" }) }));
vi.mock("@/lib/server/media", () => ({ readMedia: async () => null, purgeMedia: async () => true }));
const ai = { during: null as (() => void) | null };
vi.mock("@/lib/ai/provider", () => ({
  chatWithFallback: async () => {
    ai.during?.();
    return {
      provider: "groq",
      model: "m",
      text: JSON.stringify({ items: [{ name: "poha", qty: 1, unit: "plate" }], tags: [], protein_g: { low: 7, high: 10 }, kcal: { low: 300, high: 400 }, slot_guess: "breakfast", confidence: 0.8, notes: null }),
    };
  },
}));

type Row = StoredEvent & { user_id: string; deleted_at: string | null };
const table = new Map<string, Row>();
const hooks = { beforeWrite: null as (() => void) | null, onList: null as (() => void) | null };
let tick = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 1, 6, 0, 0) + ++tick).toISOString();

/** A tiny stand-in for the Supabase query builder: filters, then select or update. */
function query() {
  const filters: ((r: Row) => boolean)[] = [];
  let update: Record<string, unknown> | null = null;
  let range: [number, number] | null = null;
  let listing = false;
  let upsert: { row: Row; skipKnown: boolean } | null = null;
  const q = {
    select: () => q,
    update: (next: Record<string, unknown>) => ((update = next), q),
    upsert: (row: Row, opts?: { ignoreDuplicates?: boolean }) => ((upsert = { row, skipKnown: Boolean(opts?.ignoreDuplicates) }), q),
    eq: (col: string, v: unknown) => (filters.push((r) => String((r as Record<string, unknown>)[col]) === String(v)), q),
    in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes((r as Record<string, unknown>)[col])), q),
    is: (col: string, v: unknown) => (filters.push((r) => (r as Record<string, unknown>)[col] === v), q),
    gte: (col: string, v: string) => ((listing ||= col === "logical_day"), filters.push((r) => String((r as Record<string, unknown>)[col]) >= v), q),
    lte: (col: string, v: string) => (filters.push((r) => String((r as Record<string, unknown>)[col]) <= v), q),
    order: () => q,
    range: (a: number, b: number) => ((range = [a, b]), q),
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      if (upsert) {
        if (!(upsert.skipKnown && table.has(upsert.row.id))) table.set(upsert.row.id, { ...upsert.row, created_at: stamp(), updated_at: stamp() } as Row);
        resolve({ data: [], error: null });
        return;
      }
      if (update) {
        hooks.beforeWrite?.();
        hooks.beforeWrite = null;
        const hit = [...table.values()].filter((r) => filters.every((f) => f(r)));
        for (const r of hit) table.set(r.id, { ...r, ...update, updated_at: stamp() } as Row);
        resolve({ data: hit.map((r) => structuredClone(table.get(r.id)!)), error: null });
        return;
      }
      if (listing) hooks.onList?.();
      let rows = [...table.values()].filter((r) => filters.every((f) => f(r))).map((r) => structuredClone(r));
      if (range) rows = rows.slice(range[0], range[1] + 1);
      resolve({ data: rows, error: null });
    },
  };
  return q;
}
const ctx = { userId: "u1", supabase: { from: () => query() } } as never;
const settings = { ...DEFAULT_SETTINGS, tz: "Asia/Kolkata" };
const ID = "11111111-1111-4111-8111-111111111111";

/** Another request writing the row (it moves updated_at, like the real trigger). */
function concurrent(change: (r: Row) => Partial<Row>) {
  const r = table.get(ID)!;
  table.set(ID, { ...r, ...change(r), updated_at: stamp() });
}

beforeEach(() => {
  table.clear();
  hooks.beforeWrite = null;
  hooks.onList = null;
  ai.during = null;
  const at = stamp();
  table.set(ID, {
    id: ID,
    user_id: "u1",
    deleted_at: null,
    kind: "meal",
    occurred_at: "2026-11-01T06:00:00Z", // 11:30 in India: the automatic slot is lunch
    logical_day: "2026-11-01",
    source: "app",
    payload: { text: "poha", slot: "lunch" },
    meta: { ai_status: "pending" },
    created_at: at,
    updated_at: at,
  });
});

describe("atomic event writes", () => {
  it("redoes a change when another write lands in between, keeping both", async () => {
    const { changeEvent } = await import("@/lib/server/events");
    hooks.beforeWrite = () => concurrent((r) => ({ meta: { ...r.meta, slot_locked: true } }));
    const { written } = await changeEvent(ctx, ID, (cur) => ({ meta: { ...cur.meta, ai_status: "done" } }));
    expect(written).toBe(true);
    expect(table.get(ID)!.meta).toEqual({ ai_status: "done", slot_locked: true });
  });

  it("an edit to the description while the AI fixes the slot is kept, and the stale slot fix is dropped", async () => {
    const { analyzeMealEvent } = await import("@/lib/ai/meal");
    const started = structuredClone(table.get(ID)!);
    hooks.onList = () => concurrent((r) => ({ payload: { ...r.payload, text: "poha and chai" }, meta: { ...r.meta, ai_status: "pending" } }));
    await analyzeMealEvent(ctx, started, settings);
    expect(table.get(ID)!.payload).toEqual({ text: "poha and chai", slot: "lunch" });
    expect(table.get(ID)!.meta.ai_status).toBe("pending");
  });

  it("the AI moves an untouched meal to the slot its food suggests", async () => {
    const { analyzeMealEvent } = await import("@/lib/ai/meal");
    await analyzeMealEvent(ctx, structuredClone(table.get(ID)!), settings);
    expect(table.get(ID)!.payload).toEqual({ text: "poha", slot: "breakfast" });
    expect(table.get(ID)!.meta.ai_status).toBe("done");
  });

  it("a result for an old description is never saved", async () => {
    const { analyzeMealEvent } = await import("@/lib/ai/meal");
    const started = structuredClone(table.get(ID)!);
    ai.during = () => concurrent((r) => ({ payload: { ...r.payload, text: "upma" } }));
    await analyzeMealEvent(ctx, started, settings);
    expect(table.get(ID)!.meta).toEqual({ ai_status: "pending" });
    expect(table.get(ID)!.payload.text).toBe("upma");
  });

  it("a slot picked by hand and an AI result saved at the same moment both survive", async () => {
    const { patchEvent } = await import("@/lib/server/events");
    hooks.beforeWrite = () => concurrent((r) => ({ meta: { ...r.meta, ai_status: "done", analysis: { sample: true } } }));
    await patchEvent(ctx, ID, { payload: { slot: "snack" } }, settings, () => ({ slot_locked: true }));
    const row = table.get(ID)!;
    expect(row.payload.slot).toBe("snack");
    expect(row.meta).toMatchObject({ ai_status: "done", analysis: { sample: true }, slot_locked: true });
  });

  it("a delete that arrives before its create leaves a deleted placeholder, so the late create changes nothing", async () => {
    const { deleteEvent } = await import("@/lib/server/events");
    const LATE = "22222222-2222-4222-8222-222222222222";
    await deleteEvent(ctx, LATE, settings);
    expect(table.get(LATE)?.deleted_at).toBeTruthy();
    // The create that was still on its way: inserts skip ids that already exist.
    await new Promise<void>((resolve) =>
      (ctx as unknown as { supabase: { from: (t: string) => ReturnType<typeof query> } }).supabase
        .from("events")
        .upsert({ ...table.get(ID)!, id: LATE, deleted_at: null, payload: { ml: 250 }, kind: "water" } as Row, { ignoreDuplicates: true })
        .then(() => resolve()),
    );
    expect(table.get(LATE)?.deleted_at).toBeTruthy();
    expect(table.get(LATE)?.kind).toBe("note");
  });

  it("a delete clears the kind and time, keeping only the id and deletion time", async () => {
    const { deleteEvent } = await import("@/lib/server/events");
    await deleteEvent(ctx, ID, settings);
    const row = table.get(ID)!;
    expect(row.deleted_at).toBeTruthy();
    expect(row.kind).toBe("note");
    expect(row.payload).toEqual({});
    expect(row.meta).toEqual({});
    expect(row.occurred_at).toBe(row.deleted_at);
  });
});
