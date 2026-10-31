import { randomUUID } from "node:crypto";
import type { EventKind, StoredEvent } from "@/lib/domain/events";
import { logicalDayFor } from "@/lib/domain/logical-day";

/** Test fixtures only. All data here is made up. */

export const TZ = "Asia/Kolkata";

/** "2026-11-01 22:30" in India time to an ISO instant. */
export function ist(local: string): string {
  return new Date(`${local.replace(" ", "T")}:00+05:30`).toISOString();
}

export function ev(
  kind: EventKind,
  local: string,
  payload: Record<string, unknown> = {},
  meta: Record<string, unknown> = {},
): StoredEvent {
  const occurred_at = ist(local);
  return {
    id: randomUUID(),
    kind,
    occurred_at,
    logical_day: logicalDayFor(occurred_at, [], TZ),
    source: "app",
    payload,
    meta,
    created_at: occurred_at,
    updated_at: occurred_at,
  };
}

export function analysis(tags: string[], protein: [number, number] = [10, 15]) {
  return {
    ai_status: "done",
    analysis: {
      items: [{ name: "test dish", qty: 1, unit: "plate" }],
      tags,
      protein_g: { low: protein[0], high: protein[1] },
      kcal: { low: 300, high: 450 },
      slot_guess: null,
      confidence: 0.8,
      notes: null,
    },
  };
}
