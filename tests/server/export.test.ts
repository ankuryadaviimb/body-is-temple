import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** A stand-in for the database: each table is a list of rows, read with range(). */
function fakeDb(tables: Record<string, Record<string, unknown>[]>, failOn?: string) {
  const reads: string[] = [];
  const from = (table: string) => {
    let range: [number, number] = [0, 999];
    const orders: string[] = [];
    const q = {
      select: () => q,
      eq: () => q,
      is: () => q,
      order: (col: string) => (orders.push(col), q),
      range: (a: number, b: number) => ((range = [a, b]), q),
      then(resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => void) {
        reads.push(`${table}:${orders.join(",")}`);
        if (failOn === table) return resolve({ data: null, error: { message: "boom" } });
        resolve({ data: (tables[table] ?? []).slice(range[0], range[1] + 1), error: null });
      },
    };
    return q;
  };
  return { ctx: { userId: "u1", supabase: { from } } as never, reads };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("data export", () => {
  it("streams every row of a large history as valid JSON, ordered on unique keys", async () => {
    const { exportStream } = await import("@/lib/server/export");
    const events = Array.from({ length: 2500 }, (_, i) => ({ id: `e${i}`, kind: "water", payload: { ml: 250 } }));
    const { ctx, reads } = fakeDb({ settings: [{ data: { tz: "Asia/Kolkata" } }], events, health_documents: [{ id: "d1" }] });
    const parsed = JSON.parse(await readAll(exportStream(ctx)));
    expect(parsed.app).toBe("Temple");
    expect(parsed.settings).toEqual({ tz: "Asia/Kolkata" });
    expect(parsed.events).toHaveLength(2500);
    expect(new Set(parsed.events.map((e: { id: string }) => e.id)).size).toBe(2500);
    expect(parsed.health_documents).toEqual([{ id: "d1" }]);
    expect(reads.filter((r) => r.startsWith("events:"))).toEqual(["events:occurred_at,id", "events:occurred_at,id", "events:occurred_at,id"]);
  });

  it("ends in an error (never a complete-looking file) when a read fails part way", async () => {
    const { exportStream } = await import("@/lib/server/export");
    const { ctx } = fakeDb({ settings: [{ data: {} }], events: [{ id: "e1" }] }, "coach_messages");
    await expect(readAll(exportStream(ctx))).rejects.toThrow();
  });
});
