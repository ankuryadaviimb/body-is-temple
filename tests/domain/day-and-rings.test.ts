import { describe, expect, it } from "vitest";
import {
  inferMealSlot,
  isabgolGapAfterDinner,
  isabgolOnTime,
  morningLiquidsMl,
  roundNumber,
  summarizeToilet,
} from "@/lib/domain/day";
import { computeRings, ringProgress } from "@/lib/domain/rings";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { analysis, ev, TZ } from "../helpers";

describe("meal slots", () => {
  it("infers slots from time and earlier meals", () => {
    expect(inferMealSlot(ev("meal", "2026-11-01 09:40").occurred_at, [], TZ)).toBe("breakfast");
    expect(inferMealSlot(ev("meal", "2026-11-01 11:00").occurred_at, ["breakfast"], TZ)).toBe("snack");
    expect(inferMealSlot(ev("meal", "2026-11-01 13:30").occurred_at, ["breakfast"], TZ)).toBe("lunch");
    expect(inferMealSlot(ev("meal", "2026-11-01 17:30").occurred_at, ["breakfast", "lunch"], TZ)).toBe("snack");
    expect(inferMealSlot(ev("meal", "2026-11-01 20:45").occurred_at, ["lunch"], TZ)).toBe("dinner");
    expect(inferMealSlot(ev("meal", "2026-11-01 23:30").occurred_at, ["dinner"], TZ)).toBe("late");
  });
});

describe("toilet rounds", () => {
  it("numbers visits by time and summarizes the day", () => {
    const a = ev("toilet", "2026-11-01 09:10", { duration_s: 200, passed: true, bristol: 6, breath_hold: "yes" });
    const b = ev("toilet", "2026-11-01 09:55", { duration_s: 420, passed: true, bristol: 6, bladder_full: true });
    const c = ev("toilet", "2026-11-01 10:40", { duration_s: 120, passed: false, breath_hold: "no" });
    const day = [c, a, b];
    expect(roundNumber(a, day)).toBe(1);
    expect(roundNumber(c, day)).toBe(3);
    const s = summarizeToilet(day);
    expect(s.visits).toBe(3);
    expect(s.passes).toBe(2);
    expect(s.firstPassBristol).toBe(6);
    expect(s.overFiveMinutes).toBe(1);
    expect(s.breathHoldFree).toBe(1);
    expect(s.bladderFull).toBe(1);
  });
});

describe("isabgol timing", () => {
  it("is on time 60 to 150 minutes after dinner", () => {
    const dinner = ev("meal", "2026-11-01 20:30", { slot: "dinner" });
    const onTime = ev("isabgol", "2026-11-01 22:00", { tsp: 1, water_ml: 200 });
    expect(isabgolGapAfterDinner([dinner, onTime])).toBe(90);
    expect(isabgolOnTime([dinner, onTime])).toBe(true);
    const late = ev("isabgol", "2026-11-02 01:00", { tsp: 1, water_ml: 200 });
    expect(isabgolOnTime([dinner, late])).toBe(false);
    expect(isabgolOnTime([onTime])).toBe(null);
  });
});

describe("morning liquids", () => {
  it("sums drinks up to the first toilet visit", () => {
    const day = [
      ev("water", "2026-11-01 08:50", { ml: 250 }),
      ev("drink", "2026-11-01 08:55", { type: "amla", ml: 30 }),
      ev("toilet", "2026-11-01 09:20", { duration_s: 200, passed: true }),
      ev("drink", "2026-11-01 09:40", { type: "tea", ml: 300 }),
    ];
    expect(morningLiquidsMl(day)).toBe(280);
    expect(morningLiquidsMl([day[0]])).toBe(null);
  });
});

describe("rings", () => {
  const settings = { ...DEFAULT_SETTINGS, tz: TZ, protein_target_g: 80 };

  it("fills gut and fuel segments from logs", () => {
    const day = [
      ev("toilet", "2026-11-01 09:10", { duration_s: 200, passed: true }),
      ev("practice", "2026-11-01 15:00", { type: "breathing", duration_s: 300 }),
      ev("meal", "2026-11-01 10:00", { slot: "breakfast" }, analysis(["cooked_veg"], [20, 30])),
      ev("meal", "2026-11-01 13:30", { slot: "lunch" }, analysis(["legume"], [25, 35])),
      ev("meal", "2026-11-01 20:30", { slot: "dinner" }, analysis(["dairy"], [20, 30])),
      ev("isabgol", "2026-11-01 22:00", { tsp: 1, water_ml: 200 }),
      ev("water", "2026-11-01 12:00", { ml: 1500 }),
      ev("water", "2026-11-01 17:00", { ml: 1000 }),
    ];
    const rings = computeRings(day, { settings, weekday: 0, isToday: false, sleepMinutes: null, steps: null });
    const gut = rings.find((r) => r.id === "gut")!;
    const fuel = rings.find((r) => r.id === "fuel")!;
    expect(ringProgress(gut)).toEqual({ done: 3, applicable: 3, ratio: 1 });
    expect(ringProgress(fuel)).toEqual({ done: 3, applicable: 3, ratio: 1 });
  });

  it("counts open items today, so a ring is only full when everything is done", () => {
    const rings = computeRings([], { settings, weekday: 1, isToday: true, sleepMinutes: null, steps: null });
    expect(rings[0].segments.every((s) => s.done === false)).toBe(true);
    const fuel = computeRings([ev("meal", "2026-11-01 10:00", { slot: "breakfast" }), ev("meal", "2026-11-01 13:30", { slot: "lunch" })], {
      settings: { ...settings, protein_target_g: null },
      weekday: 1,
      isToday: true,
      sleepMinutes: null,
      steps: null,
    })[1];
    expect(ringProgress(fuel)).toEqual({ done: 1, applicable: 2, ratio: 0.5 });
    // An unlogged bedtime is open tonight, but unknown (not missed) on past days.
    expect(rings[3].segments[0].done).toBe(false);
    expect(computeRings([], { settings, weekday: 1, isToday: false, sleepMinutes: null, steps: null })[3].segments[0].done).toBeNull();
    const past = computeRings([], { settings, weekday: 1, isToday: false, sleepMinutes: null, steps: null });
    expect(past[0].segments[0].done).toBe(false);
  });

  it("only expects a workout on scheduled class days", () => {
    const withClass = {
      ...settings,
      classes: [{ weekday: 1, start_min: 7 * 60, label: "Morning class", kind: "group" as const }],
    };
    const monday = computeRings([], { settings: withClass, weekday: 1, isToday: false, sleepMinutes: null, steps: null });
    const tuesday = computeRings([], { settings: withClass, weekday: 2, isToday: false, sleepMinutes: null, steps: null });
    expect(monday[2].segments[0].done).toBe(false);
    expect(tuesday[2].segments[0].done).toBe(null);
  });

  it("counts a bedtime after midnight against a late target", () => {
    const day = [ev("sleep", "2026-11-02 00:40")];
    const rings = computeRings(day, { settings, weekday: 0, isToday: false, sleepMinutes: 7 * 60 + 10, steps: null });
    const rest = rings.find((r) => r.id === "rest")!;
    expect(rest.segments[0].done).toBe(true);
    expect(rest.segments[1].done).toBe(true);
    const late = computeRings([ev("sleep", "2026-11-02 01:45")], {
      settings,
      weekday: 0,
      isToday: false,
      sleepMinutes: 6 * 60,
      steps: null,
    });
    expect(late[3].segments[0].done).toBe(false);
    expect(late[3].segments[1].done).toBe(false);
  });
});
