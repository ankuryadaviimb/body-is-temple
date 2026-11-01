import { describe, expect, it } from "vitest";
import type { StoredEvent } from "@/lib/domain/events";
import { buildDiary } from "@/lib/domain/report";
import { ev, TZ } from "../helpers";

function group(events: StoredEvent[]) {
  const map = new Map<string, StoredEvent[]>();
  for (const e of events) map.set(e.logical_day, [...(map.get(e.logical_day) ?? []), e]);
  return map;
}

describe("gut diary", () => {
  const events = [
    ev("toilet", "2026-11-02 08:00", { duration_s: 400, passed: true, bristol: 6, complete: "partly", strain: 2, breath_hold: "some", bladder_full: true }),
    ev("toilet", "2026-11-02 08:40", { duration_s: 200, passed: true, bristol: 6, strain: 1, breath_hold: "no" }),
    ev("meal", "2026-11-02 21:00", { slot: "dinner" }),
    ev("isabgol", "2026-11-02 22:30", { tsp: 1, water_ml: 200 }),
    ev("gas", "2026-11-02 21:45", { level: 3 }),
    ev("toilet", "2026-11-03 08:10", { duration_s: 240, passed: true, bristol: 4, complete: "yes", strain: 0, breath_hold: "no", blood: true }),
    ev("symptom", "2026-11-03 12:00", { type: "pain", severity: 1, text: "sore after" }),
  ];
  const { summary, rows } = buildDiary(group(events), "2026-11-01", "2026-11-03", TZ);

  it("makes one row per day, newest first, including empty days", () => {
    expect(rows.map((r) => r.day)).toEqual(["2026-11-03", "2026-11-02", "2026-11-01"]);
    expect(rows[2].logged).toBe(false);
    expect(rows[1]).toMatchObject({ rounds: 2, firstType: 6, firstComplete: "partly", strainMax: 2, breathHold: "some", bladderFull: true, longVisits: 1, gasMax: 3, isabgolGap: 90 });
    expect(rows[0].blood).toBe(true);
    expect(rows[0].notes).toEqual(["pain: sore after"]);
  });

  it("summarizes the facts a doctor asks for", () => {
    expect(summary.daysLogged).toBe(2);
    expect(summary.avgRounds).toBe(1.5);
    expect(summary.smoothShare).toBe(0.5);
    expect(summary.commonType).toBe(4);
    expect(summary.breathHoldShare).toBe(0.33);
    expect(summary.longVisitShare).toBe(0.33);
    expect(summary.bloodDays).toEqual(["2026-11-03"]);
    expect(summary.isabgolMedianGap).toBe(90);
    expect(summary.isabgolOnTimeShare).toBe(1);
  });
});
