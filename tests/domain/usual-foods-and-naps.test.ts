import { describe, expect, it } from "vitest";
import { napMinutes, napMinutesUntil, openNap } from "@/lib/domain/day";
import { ClientEventInput, MealAnalysis, mealAnalysisOf } from "@/lib/domain/events";
import { dayNutrition } from "@/lib/domain/nutrition";
import { DEFAULT_SETTINGS, SettingsSchema, SettingsUpdate, withDefaults } from "@/lib/domain/settings";
import { analysisFromUsual, findUsual, usualIdFor, usualMealMeta, usualMealPayload, type UsualFood } from "@/lib/domain/usual-foods";
import { ev, ist } from "../helpers";

/** Made-up foods; any resemblance to a real product is only in the shape of the numbers. */
const BAR: UsualFood = {
  id: "test-bar",
  name: "Test cocoa protein bar",
  label: "Test bar",
  serving: "1 bar (50 g)",
  icon: "bar",
  kcal: 250,
  protein_g: 12.5,
  carbs_g: 20,
  fat_g: 13,
  fiber_g: 4,
  tags: ["packaged", "dairy"],
  nutrients: [],
  fruit_servings: 0,
  snack: true,
};

describe("usual foods", () => {
  it("turn into an exact, valid meal analysis", () => {
    const a = analysisFromUsual(BAR);
    expect(MealAnalysis.safeParse(a).success).toBe(true);
    expect(a.protein_g).toEqual({ low: 12.5, high: 12.5 });
    expect(a.kcal).toEqual({ low: 250, high: 250 });
    expect(a.confidence).toBe(1);
    expect(a.slot_guess).toBe("snack");
  });

  it("log as a snack with the food's id, which the event schema accepts", () => {
    const payload = usualMealPayload(BAR);
    expect(payload).toMatchObject({ usual: "test-bar", slot: "snack", slot_chosen: true });
    const parsed = ClientEventInput.safeParse({ id: crypto.randomUUID(), kind: "meal", occurred_at: ist("2026-11-01 16:00"), payload });
    expect(parsed.success).toBe(true);
  });

  it("a meal-by-time food leaves the slot to the clock", () => {
    expect(usualMealPayload({ ...BAR, snack: false }).slot).toBeUndefined();
  });

  it("count toward the day's protein like any analyzed meal", () => {
    const meal = ev("meal", "2026-11-01 16:00", usualMealPayload(BAR), usualMealMeta(BAR));
    expect(mealAnalysisOf(meal)?.protein_g.low).toBe(12.5);
    const n = dayNutrition([meal], DEFAULT_SETTINGS);
    expect(n.protein.low).toBeCloseTo(12.5);
  });

  it("are found by id only", () => {
    expect(findUsual([BAR], "test-bar")).toBe(BAR);
    expect(findUsual([BAR], "other")).toBeNull();
    expect(findUsual([BAR], undefined)).toBeNull();
  });

  it("get readable unique ids", () => {
    expect(usualIdFor("Protein bar", [])).toBe("protein-bar");
    expect(usualIdFor("Protein bar", ["protein-bar"])).toBe("protein-bar-2");
    expect(usualIdFor("!!!", [])).toBe("food");
  });

  it("are part of settings, checked strictly, and a bad list falls back alone", () => {
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, usual_foods: [BAR] }).success).toBe(true);
    expect(SettingsUpdate.safeParse({ usual_foods: [BAR, BAR] }).success).toBe(false);
    expect(SettingsUpdate.safeParse({ usual_foods: [{ ...BAR, protein_g: -1 }] }).success).toBe(false);
    expect(SettingsUpdate.safeParse({ usual_foods: [{ ...BAR, extra: 1 }] }).success).toBe(false);
    const repaired = withDefaults({ ...DEFAULT_SETTINGS, water_target_ml: 3000, usual_foods: "nonsense" });
    expect(repaired.usual_foods).toEqual([]);
    expect(repaired.water_target_ml).toBe(3000);
    // Older stored settings without the field still load.
    const { usual_foods: _u, ...older } = DEFAULT_SETTINGS;
    void _u;
    expect(withDefaults(older).usual_foods).toEqual([]);
  });
});

describe("naps", () => {
  it("are open until minutes are added, for up to 6 hours", () => {
    const started = ev("nap", "2026-11-01 14:10");
    expect(openNap([started], new Date(ist("2026-11-01 14:40")))?.id).toBe(started.id);
    expect(openNap([started], new Date(ist("2026-11-01 20:30")))).toBeNull();
    const done = { ...started, payload: { minutes: 35 } };
    expect(openNap([done], new Date(ist("2026-11-01 14:40")))).toBeNull();
    expect(napMinutes([done])).toBe(35);
  });

  it("measure minutes from start to waking, within range", () => {
    const n = ev("nap", "2026-11-01 14:10");
    expect(napMinutesUntil(n, new Date(ist("2026-11-01 14:55")))).toBe(45);
    expect(napMinutesUntil(n, new Date(ist("2026-11-01 14:10")))).toBe(1);
    expect(napMinutesUntil(n, new Date(ist("2026-11-02 14:10")))).toBe(360);
  });

  it("validate like every other log", () => {
    const base = { id: crypto.randomUUID(), kind: "nap", occurred_at: ist("2026-11-01 14:10") };
    expect(ClientEventInput.safeParse({ ...base, payload: {} }).success).toBe(true);
    expect(ClientEventInput.safeParse({ ...base, payload: { minutes: 40 } }).success).toBe(true);
    expect(ClientEventInput.safeParse({ ...base, payload: { minutes: 0 } }).success).toBe(false);
    expect(ClientEventInput.safeParse({ ...base, payload: { minutes: 30, dream: "x" } }).success).toBe(false);
  });
});
