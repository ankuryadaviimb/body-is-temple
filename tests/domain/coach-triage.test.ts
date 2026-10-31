import { describe, expect, it } from "vitest";
import { triage } from "@/lib/domain/coach/triage";
import { analysis, ev, ist, TZ } from "../helpers";

const at = (local: string) => new Date(ist(local));

describe("should I go triage", () => {
  it("says go for a real urge, with a short visit from round 3", () => {
    const day = [
      ev("wake", "2026-11-02 07:00"),
      ev("toilet", "2026-11-02 07:30", { duration_s: 240, passed: true }),
      ev("toilet", "2026-11-02 08:00", { duration_s: 200, passed: true }),
    ];
    const r = triage("urge", day, at("2026-11-02 08:20"), TZ);
    expect(r.verdict).toBe("go");
    expect(r.primary.href).toBe("/toilet?going=1");
    expect(r.steps.join(" ")).toContain("round 3");
  });

  it("says wait for heaviness soon after a round", () => {
    const day = [ev("toilet", "2026-11-02 08:00", { duration_s: 200, passed: true })];
    const r = triage("heavy", day, at("2026-11-02 08:25"), TZ);
    expect(r.verdict).toBe("wait");
    expect(r.lead).toContain("25 min ago");
    expect(r.primary.href).toBe("/reset/heavy");
    expect(r.secondary?.href).toBe("/toilet?going=1");
  });

  it("says wait for heaviness after 3 rounds, even hours later", () => {
    const day = [
      ev("toilet", "2026-11-02 07:30", { duration_s: 200, passed: true }),
      ev("toilet", "2026-11-02 08:00", { duration_s: 200, passed: true }),
      ev("toilet", "2026-11-02 08:40", { duration_s: 200, passed: true }),
    ];
    expect(triage("heavy", day, at("2026-11-02 13:00"), TZ).verdict).toBe("wait");
  });

  it("says reset first for heaviness long after the last round", () => {
    const day = [ev("toilet", "2026-11-02 08:00", { duration_s: 200, passed: true })];
    expect(triage("heavy", day, at("2026-11-02 14:00"), TZ).verdict).toBe("reset_first");
  });

  it("sends gas pressure to the gas reset", () => {
    const r = triage("gas", [], at("2026-11-02 16:00"), TZ);
    expect(r.verdict).toBe("reset_first");
    expect(r.primary.href).toBe("/reset/gas");
  });

  it("says go when unsure in the hour after a meal with no rounds yet", () => {
    const day = [ev("meal", "2026-11-02 09:30", { slot: "breakfast" }, analysis(["cooked_veg"]))];
    const r = triage("unsure", day, at("2026-11-02 10:00"), TZ);
    expect(r.verdict).toBe("go");
    expect(r.reasons.join(" ")).toContain("Breakfast 30 min ago");
  });

  it("tests gas or stool when unsure, away from the best times", () => {
    const day = [ev("toilet", "2026-11-02 08:00", { duration_s: 200, passed: true })];
    const r = triage("unsure", day, at("2026-11-02 16:00"), TZ);
    expect(r.verdict).toBe("reset_first");
    expect(r.title).toContain("gas or stool");
    expect(r.primary.href).toBe("/reset/gas");
    expect(r.steps.join(" ")).toContain("Do not sit on the toilet to push gas out");
  });

  it("ignores visits logged in the future", () => {
    const day = [ev("toilet", "2026-11-02 09:00", { duration_s: 200, passed: true })];
    expect(triage("heavy", day, at("2026-11-02 08:30"), TZ).reasons[0]).toBe("No rounds logged yet today");
  });
});
