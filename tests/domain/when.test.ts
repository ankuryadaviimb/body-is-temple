import { describe, expect, it } from "vitest";
import { defaultWhen, describeWhen, resolveWhen } from "@/lib/domain/when";
import { ist, TZ } from "../helpers";

const at = (local: string) => new Date(ist(local));

describe("picking an earlier time", () => {
  it("saves a past time today as today", () => {
    const now = at("2026-11-02 15:00");
    expect(resolveWhen({ day: "today", time: "13:30" }, TZ, now).toISOString()).toBe(ist("2026-11-02 13:30"));
  });

  it("reads a later time on Today as last night, never the future", () => {
    const now = at("2026-11-02 01:00");
    const r = resolveWhen({ day: "today", time: "21:00" }, TZ, now);
    expect(r.toISOString()).toBe(ist("2026-11-01 21:00"));
    expect(describeWhen(r, TZ, now)).toBe("Yesterday, 9:00 PM");
  });

  it("saves Yesterday as the calendar day before", () => {
    const now = at("2026-11-02 10:00");
    expect(resolveWhen({ day: "yesterday", time: "22:15" }, TZ, now).toISOString()).toBe(ist("2026-11-01 22:15"));
  });

  it("defaults to half an hour ago, across midnight too", () => {
    expect(defaultWhen(TZ, at("2026-11-02 15:07"))).toEqual({ day: "today", time: "14:35" });
    expect(defaultWhen(TZ, at("2026-11-02 00:10"))).toEqual({ day: "yesterday", time: "23:40" });
  });
});
