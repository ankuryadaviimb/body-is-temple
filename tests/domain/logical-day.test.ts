import { describe, expect, it } from "vitest";
import { logicalDayFor, type Anchor } from "@/lib/domain/logical-day";
import { addDays, daysBetween, formatClock, localParts, localToInstant } from "@/lib/domain/time";
import { ist, TZ } from "../helpers";

describe("time helpers", () => {
  it("reads local parts in India time", () => {
    const p = localParts(ist("2026-11-01 22:30"), TZ);
    expect(p).toEqual({ date: "2026-11-01", hour: 22, minute: 30, minutes: 1350 });
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
  });

  it("converts local wall time to an instant", () => {
    expect(localToInstant("2026-11-01", 22 * 60 + 30, TZ).toISOString()).toBe(ist("2026-11-01 22:30"));
  });

  it("formats clock times", () => {
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(22 * 60 + 30)).toBe("10:30 PM");
    expect(formatClock(24 * 60 + 15)).toBe("12:15 AM");
  });
});

describe("logicalDayFor", () => {
  it("puts a 1 AM Isabgol on the previous day", () => {
    expect(logicalDayFor(ist("2026-11-02 01:00"), [], TZ)).toBe("2026-11-01");
  });

  it("starts the day after the 5 AM cutoff", () => {
    expect(logicalDayFor(ist("2026-11-02 08:50"), [], TZ)).toBe("2026-11-02");
    expect(logicalDayFor(ist("2026-11-02 04:59"), [], TZ)).toBe("2026-11-01");
  });

  it("an early wake before 5 AM starts the new day from that moment", () => {
    const anchors: Anchor[] = [{ kind: "wake", at: ist("2026-11-02 04:30") }];
    expect(logicalDayFor(ist("2026-11-02 04:40"), anchors, TZ)).toBe("2026-11-02");
    expect(logicalDayFor(ist("2026-11-02 03:00"), anchors, TZ)).toBe("2026-11-01");
  });

  it("a late bedtime after 5 AM keeps the night on the previous day", () => {
    const anchors: Anchor[] = [
      { kind: "sleep", at: ist("2026-11-02 05:30") },
      { kind: "wake", at: ist("2026-11-02 11:00") },
    ];
    expect(logicalDayFor(ist("2026-11-02 05:10"), anchors, TZ)).toBe("2026-11-01");
    expect(logicalDayFor(ist("2026-11-02 05:30"), anchors, TZ)).toBe("2026-11-01");
    expect(logicalDayFor(ist("2026-11-02 11:30"), anchors, TZ)).toBe("2026-11-02");
  });

  it("ignores anchors from other mornings", () => {
    const anchors: Anchor[] = [{ kind: "sleep", at: ist("2026-11-03 06:00") }];
    expect(logicalDayFor(ist("2026-11-02 05:10"), anchors, TZ)).toBe("2026-11-02");
  });
});
