import { describe, expect, it } from "vitest";
import { buildMorningCard, LADDER, ladderState } from "@/lib/domain/ladder";
import { feedbackFor } from "@/lib/domain/rules-feedback";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { computeStreak, type DayStatus } from "@/lib/domain/streak";
import { addDays } from "@/lib/domain/time";
import { analysis, ev, TZ } from "../helpers";

function days(pattern: string, start = "2026-11-01"): DayStatus[] {
  return [...pattern].map((c, i) => ({ day: addDays(start, i), onTrack: c === "x" }));
}

describe("streak", () => {
  it("counts on-track days and forgives a single miss", () => {
    expect(computeStreak(days("xxx")).count).toBe(3);
    expect(computeStreak(days("xx.x")).count).toBe(3);
  });

  it("does not let today break the streak", () => {
    const r = computeStreak(days("xxx."));
    expect(r.count).toBe(3);
    expect(r.atRisk).toBe(false);
  });

  it("warns when yesterday was missed and today is not logged yet", () => {
    expect(computeStreak(days("xxx..")).atRisk).toBe(true);
  });

  it("uses a freeze on a second miss in a row, two per month", () => {
    const r = computeStreak(days("xx..x"));
    expect(r.count).toBe(3);
    expect(r.freezesLeft).toBe(1);
    expect(r.frozenDays).toEqual(["2026-11-04"]);
  });

  it("ends the streak once freezes run out and flags a fresh start", () => {
    const r = computeStreak(days("x..x..x...x"));
    expect(r.count).toBe(1);
    expect(r.freshStart).toBe(false);
    const ended = computeStreak(days("x..x..x..."));
    expect(ended.count).toBe(0);
  });
});

describe("habit ladder", () => {
  const settings = { ...DEFAULT_SETTINGS, tz: TZ };

  function exhaleDay(day: string) {
    return [
      ev("toilet", `${day} 09:10`, { duration_s: 200, passed: true, breath_hold: "no" }),
      ev("meal", `${day} 10:00`, { slot: "breakfast" }),
      ev("meal", `${day} 13:30`, { slot: "lunch" }),
    ];
  }

  it("unlocks step 2 after step 1 holds on 5 of 7 days", () => {
    const ordered = Array.from({ length: 7 }, (_, i) => addDays("2026-11-01", i));
    const byDay = new Map(ordered.map((d, i) => [d, i === 2 || i === 4 ? [] : exhaleDay(d)]));
    const state = ladderState(ordered, byDay, settings);
    expect(state.index).toBe(1);
    expect(state.step.id).toBe(LADDER[1].id);
  });

  it("stays on step 1 while it holds on fewer than 5 days", () => {
    const ordered = Array.from({ length: 7 }, (_, i) => addDays("2026-11-01", i));
    const byDay = new Map(ordered.map((d, i) => [d, i % 2 === 0 ? exhaleDay(d) : []]));
    const state = ladderState(ordered, byDay, settings);
    expect(state.index).toBe(0);
    expect(state.heldInWindow).toBe(4);
  });

  it("builds a morning card with yesterday's facts and one tip", () => {
    const yesterday = [
      ev("toilet", "2026-11-01 09:10", { duration_s: 200, passed: true, bristol: 6 }),
      ev("toilet", "2026-11-01 09:50", { duration_s: 200, passed: true }),
      ev("meal", "2026-11-01 13:30", { slot: "lunch" }, analysis(["fried", "legume"])),
      ev("meal", "2026-11-01 20:30", { slot: "dinner" }),
      ev("isabgol", "2026-11-02 01:00", { tsp: 1, water_ml: 200 }),
    ];
    const state = ladderState([], new Map(), settings);
    const card = buildMorningCard(yesterday, [3, 3, 2], state, settings);
    expect(card.focus.number).toBe(1);
    expect(card.yesterday[0]).toContain("2 toilet rounds");
    expect(card.yesterday[1]).toContain("curdly");
    expect(card.tip).toContain("fried food and legumes");
  });
});

describe("instant feedback", () => {
  const ctx = { settings: { ...DEFAULT_SETTINGS, tz: TZ }, ladderStep: "exhale" };

  it("praises exhale-only pushing and flags long sessions", () => {
    const good = ev("toilet", "2026-11-01 09:10", { duration_s: 200, passed: true, breath_hold: "no" });
    expect(feedbackFor(good, [good], ctx)?.tone).toBe("good");
    const long = ev("toilet", "2026-11-01 09:10", { duration_s: 480, passed: true, breath_hold: "some" });
    expect(feedbackFor(long, [long], ctx)?.text).toContain("5 minutes");
  });

  it("always points to a doctor when blood is logged", () => {
    const e = ev("toilet", "2026-11-01 09:10", { duration_s: 200, passed: true, bristol: 4, blood: true });
    expect(feedbackFor(e, [e], ctx)?.tone).toBe("care");
  });

  it("suggests an Isabgol time after dinner", () => {
    const dinner = ev("meal", "2026-11-01 20:30", { slot: "dinner" });
    expect(feedbackFor(dinner, [dinner], ctx)?.text).toContain("10:00 PM");
  });

  it("flags a heavy fried plus legume meal", () => {
    const meal = ev("meal", "2026-11-01 13:30", { slot: "lunch" }, analysis(["fried", "legume"]));
    expect(feedbackFor(meal, [meal], ctx)?.text).toContain("Heavy combo");
  });

  it("only nudges morning liquids when that habit is active", () => {
    const water = ev("water", "2026-11-01 08:50", { ml: 500 });
    expect(feedbackFor(water, [water], ctx)).toBeNull();
    expect(feedbackFor(water, [water], { ...ctx, ladderStep: "morning_liquids" })?.text).toContain("400 ml");
  });
});
