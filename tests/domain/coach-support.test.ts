import { describe, expect, it } from "vitest";
import { dayDigest } from "@/lib/domain/digest";
import { appendNote, MEMORY_MAX_CHARS, memoryForPrompt } from "@/lib/domain/memory";
import { nextUp } from "@/lib/domain/next-up";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { zoneDisplay, zoneLabel } from "@/lib/domain/time";
import { analysis, ev, ist, TZ } from "../helpers";

const settings = { ...DEFAULT_SETTINGS, tz: TZ };
const at = (local: string) => new Date(ist(local));

describe("time zone labels", () => {
  it("shows standard names, not raw ids", () => {
    const z = zoneLabel("Asia/Kolkata", new Date("2026-11-01T06:00:00Z"));
    expect(z.name).toBe("India Standard Time");
    expect(z.offset).toBe("GMT+5:30");
    expect(z.city).toBe("Kolkata");
    expect(zoneDisplay("Asia/Kolkata")).toBe("India Standard Time (GMT+5:30)");
    expect(zoneLabel("UTC").offset).toBe("GMT+0");
    expect(zoneLabel("Not/AZone").name).toBe("Not/AZone");
  });
});

describe("memory", () => {
  it("adds dated notes, skips repeats and trims the oldest", () => {
    let notes = appendNote("", "Milk makes me bloated", "2026-11-01");
    expect(notes).toBe("- 2026-11-01: Milk makes me bloated");
    expect(appendNote(notes, "milk makes me bloated", "2026-11-02")).toBe(notes);
    for (let i = 0; i < 80; i++) notes = appendNote(notes, `Fact number ${i} with some extra words to fill space`, "2026-11-02");
    expect(notes.length).toBeLessThanOrEqual(MEMORY_MAX_CHARS);
    expect(notes).toContain("Fact number 79");
    expect(notes).not.toContain("Milk makes me bloated");
  });

  it("caps each note in the prompt", () => {
    const text = memoryForPrompt(
      [
        { slug: "profile", content: "x".repeat(3000), version: 1, updated_at: "" },
        { slug: "notes", content: "- old\n".repeat(500) + "- newest fact", version: 1, updated_at: "" },
      ],
      500,
    );
    expect(text).toContain("## About you");
    expect(text).toContain("newest fact");
    expect(text.length).toBeLessThan(1300);
  });
});

describe("daily digest", () => {
  it("summarizes a day in one local-time line", () => {
    const line = dayDigest(
      "2026-11-02",
      [
        ev("wake", "2026-11-02 07:10"),
        ev("toilet", "2026-11-02 07:40", { duration_s: 300, passed: true, bristol: 6, breath_hold: "some" }),
        ev("meal", "2026-11-02 13:30", { slot: "lunch" }, analysis(["legume"])),
        ev("gas", "2026-11-02 21:00", { level: 3 }),
      ],
      TZ,
      "yesterday",
    );
    expect(line).toContain("(yesterday)");
    expect(line).toContain("woke 7:10 AM");
    expect(line).toContain("toilet 1 rounds [7:40 AM, type 6, breath hold some, 5 min]");
    expect(line).toContain("lunch 1:30 PM: test dish [legume]");
    expect(line).toContain("gas 3/4 at 9:00 PM");
  });
});

describe("next up nudges", () => {
  it("walks after lunch, then times Isabgol after dinner", () => {
    const lunch = ev("meal", "2026-11-02 13:30", { slot: "lunch" });
    expect(nextUp([lunch], settings, at("2026-11-02 14:00"), "exhale")?.id).toBe("walk");
    const dinner = ev("meal", "2026-11-02 20:30", { slot: "dinner" });
    expect(nextUp([lunch, dinner], settings, at("2026-11-02 20:50"), "exhale")?.title).toBe("Isabgol at 10:00 PM");
    expect(nextUp([lunch, dinner], settings, at("2026-11-02 22:00"), "exhale")?.id).toBe("isabgol_now");
    const isabgol = ev("isabgol", "2026-11-02 22:00", { tsp: 1, water_ml: 200 });
    expect(nextUp([lunch, dinner, isabgol, ev("gas", "2026-11-02 21:00", { level: 1 })], settings, at("2026-11-02 22:30"), "exhale")).toBeNull();
  });

  it("asks for the gas check in the evening", () => {
    expect(nextUp([ev("water", "2026-11-02 18:00", { ml: 250 })], settings, at("2026-11-02 21:00"), "exhale")?.id).toBe("gas_check");
  });
});
