import { describe, expect, it } from "vitest";
import type { StoredEvent } from "@/lib/domain/events";
import { normalizeFood } from "@/lib/domain/foods";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { addDays } from "@/lib/domain/time";
import { computeTolerance, describeFinding, MIN_DAYS } from "@/lib/domain/tolerance";
import { ev, TZ } from "../helpers";

const settings = { ...DEFAULT_SETTINGS, tz: TZ };

function meal(day: string, time: string, items: string[], tags: string[]) {
  return ev("meal", `${day} ${time}`, { slot: "lunch" }, {
    ai_status: "done",
    analysis: {
      items: items.map((name) => ({ name, qty: null, unit: null })),
      tags,
      protein_g: { low: 10, high: 15 },
      kcal: { low: 400, high: 500 },
      slot_guess: null,
      confidence: 0.8,
      notes: null,
    },
  });
}

/** Builds N days: chana days have gas 3 and 3 rounds next morning; others gas 1 and 2 rounds. */
function history(chanaDays: number, otherDays: number) {
  const byDay = new Map<string, StoredEvent[]>();
  const start = "2026-10-01";
  const total = chanaDays + otherDays;
  for (let i = 0; i < total; i++) {
    const day = addDays(start, i);
    const isChana = i < chanaDays * 2 && i % 2 === 0;
    const events = [
      ev("wake", `${day} 07:00`),
      isChana ? meal(day, "13:30", ["chana masala", "2 rotis"], ["legume"]) : meal(day, "13:30", ["moong dal", "rice"], ["dal"]),
      ev("gas", `${day} 21:00`, { level: isChana ? 3 : 1 }),
    ];
    byDay.set(day, [...(byDay.get(day) ?? []), ...events]);
    // Next morning's rounds (belongs to the next logical day).
    const next = addDays(day, 1);
    const rounds = isChana ? 3 : 2;
    const visits = Array.from({ length: rounds }, (_, k) =>
      ev("toilet", `${next} 0${7 + k}:30`, { duration_s: 200, passed: true, bristol: isChana ? 6 : 4 }),
    );
    byDay.set(next, [...(byDay.get(next) ?? []), ...visits]);
  }
  return byDay;
}

describe("food names", () => {
  it("normalizes quantities and synonyms", () => {
    expect(normalizeFood("2 Rotis")).toBe("roti");
    expect(normalizeFood("Chole masala")).toBe("chana");
    expect(normalizeFood("Bowl of curd (dahi)")).toBe("curd");
    expect(normalizeFood("Moong dal")).toBe("moong dal");
    expect(normalizeFood("2")).toBeNull();
  });
});

describe("tolerance engine", () => {
  it("stays quiet until both sides have enough days", () => {
    const report = computeTolerance(history(3, 3), settings);
    expect(report.findings).toHaveLength(0);
    const chana = report.learning.find((l) => l.exposure.key === "food:chana");
    expect(chana?.withDays).toBe(3);
  });

  it("finds a clear pattern once there are 5 days on each side", () => {
    const report = computeTolerance(history(6, 6), settings);
    const gas = report.findings.find((f) => f.exposure.key === "food:chana" && f.outcome === "evening_gas");
    expect(gas).toBeDefined();
    expect(gas!.effect).toBe("worse");
    expect(gas!.withMean).toBe(3);
    expect(gas!.withoutMean).toBe(1);
    expect(gas!.withDays).toBeGreaterThanOrEqual(MIN_DAYS);
    expect(describeFinding(gas!)).toContain("Chana: more gas that day (3 vs 1");
    const rounds = report.findings.find((f) => f.exposure.key === "tag:legume" && f.outcome === "next_rounds");
    expect(rounds?.effect).toBe("worse");
    const smooth = report.findings.find((f) => f.exposure.key === "tag:legume" && f.outcome === "next_smooth");
    expect(smooth?.diff).toBe(-1);
    expect(smooth?.effect).toBe("worse");
  });

  it("reports a better outcome as better", () => {
    const report = computeTolerance(history(6, 6), settings);
    const dal = report.findings.find((f) => f.exposure.key === "tag:dal" && f.outcome === "evening_gas");
    expect(dal?.effect).toBe("better");
    expect(describeFinding(dal!)).toContain("less gas");
  });

  it("does not count foods seen only once", () => {
    const byDay = history(6, 6);
    const day = "2026-10-03";
    byDay.set(day, [...(byDay.get(day) ?? []), meal(day, "20:30", ["pav bhaji"], ["maida"])]);
    const report = computeTolerance(byDay, settings);
    expect(report.learning.some((l) => l.exposure.key === "food:pav bhaji")).toBe(false);
  });
});
