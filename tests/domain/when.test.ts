import { describe, expect, it } from "vitest";
import { defaultWhen, describeWhen, readWhen, resolveWhen } from "@/lib/domain/when";
import { ist, TZ } from "../helpers";

const at = (local: string) => new Date(ist(local));

describe("picking an earlier time", () => {
  it("saves a past time today as today", () => {
    const now = at("2026-11-02 15:00");
    expect(resolveWhen({ day: "today", time: "13:30" }, TZ, now).toISOString()).toBe(ist("2026-11-02 13:30"));
  });

  it("reads a much later time on Today as last night, never the future", () => {
    const now = at("2026-11-02 01:00");
    const r = readWhen({ day: "today", time: "21:00" }, TZ, now);
    expect(r.at.toISOString()).toBe(ist("2026-11-01 21:00"));
    expect(r.reading).toBe("last_night");
    expect(describeWhen(r.at, TZ, now)).toBe("Yesterday, 9:00 PM");
  });

  it("reads a time a few minutes ahead as now, not as yesterday", () => {
    // Typed 3:00 PM at 2:58 PM: the meal was just now, not yesterday afternoon.
    const now = at("2026-11-01 14:58");
    const r = readWhen({ day: "today", time: "15:00" }, TZ, now);
    expect(r.reading).toBe("now");
    expect(r.at.getTime()).toBe(now.getTime());
    expect(readWhen({ day: "today", time: "16:28" }, TZ, now).reading).toBe("now");
    expect(readWhen({ day: "today", time: "16:30" }, TZ, now).reading).toBe("last_night");
  });

  it("saves Yesterday as the calendar day before", () => {
    const now = at("2026-11-02 10:00");
    expect(resolveWhen({ day: "yesterday", time: "22:15" }, TZ, now).toISOString()).toBe(ist("2026-11-01 22:15"));
  });

  it("defaults to the phone's current time, across midnight too", () => {
    expect(defaultWhen(TZ, at("2026-11-02 15:07"))).toEqual({ day: "today", time: "15:07" });
    expect(defaultWhen(TZ, at("2026-11-02 00:10"), 30)).toEqual({ day: "yesterday", time: "23:40" });
    const now = at("2026-11-02 15:07");
    expect(readWhen(defaultWhen(TZ, now), TZ, now).reading).toBe("as_set");
  });
});
