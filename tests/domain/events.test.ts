import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ClientEventInput, EventBatch } from "@/lib/domain/events";

const base = { id: randomUUID(), occurred_at: "2026-11-01T22:30:00+05:30" };

describe("ClientEventInput", () => {
  it("accepts a valid toilet session", () => {
    const parsed = ClientEventInput.safeParse({
      ...base,
      kind: "toilet",
      payload: { duration_s: 240, passed: true, bristol: 4, breath_hold: "no" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown payload fields (no mass assignment)", () => {
    const parsed = ClientEventInput.safeParse({
      ...base,
      kind: "meal",
      payload: { slot: "dinner", analysis: { items: [] } },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects out-of-range values", () => {
    expect(ClientEventInput.safeParse({ ...base, kind: "water", payload: { ml: 99999 } }).success).toBe(false);
    expect(
      ClientEventInput.safeParse({ ...base, kind: "toilet", payload: { duration_s: 10, passed: true, bristol: 9 } })
        .success,
    ).toBe(false);
  });

  it("rejects unknown kinds and bad timestamps", () => {
    expect(ClientEventInput.safeParse({ ...base, kind: "hack", payload: {} }).success).toBe(false);
    expect(
      ClientEventInput.safeParse({ ...base, occurred_at: "yesterday", kind: "sleep", payload: {} }).success,
    ).toBe(false);
  });

  it("bounds batch size", () => {
    const events = Array.from({ length: 101 }, () => ({
      id: randomUUID(),
      occurred_at: base.occurred_at,
      kind: "water",
      payload: { ml: 250 },
    }));
    expect(EventBatch.safeParse({ events }).success).toBe(false);
    expect(EventBatch.safeParse({ events: events.slice(0, 100) }).success).toBe(true);
  });
});
