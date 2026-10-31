import { describe, expect, it } from "vitest";
import { normalizeMealAnalysis } from "@/lib/ai/meal-normalize";
import { inferMealSlot, refineMealSlot, waterMl } from "@/lib/domain/day";
import { autoProtein, calorieTarget, dailyTargets, dayNutrition, gaps, proteinTarget } from "@/lib/domain/nutrition";
import { DEFAULT_SETTINGS, withDefaults } from "@/lib/domain/settings";
import { ev, ist, TZ } from "../helpers";

const settings = { ...DEFAULT_SETTINGS, tz: TZ };
const at = (local: string) => new Date(ist(local));

function meal(local: string, slot: string, extra: Record<string, unknown>) {
  return ev("meal", local, { slot }, {
    ai_status: "done",
    analysis: {
      items: [{ name: "thali", qty: null, unit: null }],
      tags: [],
      protein_g: { low: 18, high: 22 },
      kcal: { low: 500, high: 600 },
      slot_guess: null,
      confidence: 0.8,
      notes: null,
      ...extra,
    },
  });
}

describe("protein and calorie targets", () => {
  it("sets protein from weight, capped at the healthy weight for the height", () => {
    expect(autoProtein(70, 175)).toEqual({ grams: 100, perKg: 1.4, basisKg: 70, capped: false });
    const heavy = autoProtein(95, 170)!;
    expect(heavy.capped).toBe(true);
    expect(heavy.basisKg).toBe(72);
    expect(heavy.grams).toBe(100);
    expect(autoProtein(null, 170)).toBeNull();
  });

  it("follows auto or the custom number", () => {
    expect(proteinTarget({ ...settings, weight_kg: 70, height_cm: 175 })).toBe(100);
    expect(proteinTarget({ ...settings, weight_kg: 70, protein_auto: false, protein_target_g: 85 })).toBe(85);
  });

  it("needs age and sex for calories", () => {
    const base = { ...settings, weight_kg: 70, height_cm: 175 };
    expect(calorieTarget(base)).toBeNull();
    const kcal = calorieTarget({ ...base, birth_year: 1989, sex: "male" }, new Date("2026-11-01T06:00:00Z"))!;
    // Resting about 1,650 kcal, times 1.55, then 80 to 90%.
    expect(kcal.low).toBeGreaterThan(1900);
    expect(kcal.high).toBeLessThan(2400);
    expect(dailyTargets({ ...base, birth_year: 1989, sex: "male" }).carbs).not.toBeNull();
  });

  it("fills new settings for older stored documents", () => {
    const s = withDefaults({ tz: TZ, tea_ml: 300 });
    expect(s.water_glass_ml).toBe(250);
    expect(s.protein_auto).toBe(true);
    expect(s.sex).toBeNull();
  });
});

describe("daily nutrition", () => {
  it("adds meals, Isabgol and chia, and finds gaps", () => {
    const day = [
      meal("2026-11-02 09:30", "breakfast", { carbs_g: { low: 50, high: 60 }, fat_g: { low: 8, high: 10 }, fiber_g: { low: 3, high: 5 }, veg_servings: 0, fruit_servings: 1, nutrients: ["vitamin_c"] }),
      meal("2026-11-02 13:30", "lunch", { carbs_g: { low: 70, high: 80 }, fat_g: { low: 12, high: 14 }, fiber_g: { low: 5, high: 7 }, veg_servings: 1, fruit_servings: 0, nutrients: ["calcium"] }),
      ev("isabgol", "2026-11-02 22:30", { tsp: 1, water_ml: 200 }),
      ev("drink", "2026-11-02 08:00", { type: "chia", ml: 250 }),
    ];
    const s = { ...settings, weight_kg: 70, height_cm: 175 };
    const n = dayNutrition(day, s);
    expect(n.protein).toEqual({ low: 36, high: 44 });
    expect(n.extraFiber).toBe(7);
    expect(n.fiber).toEqual({ low: 15, high: 19 });
    expect(n.covered).toEqual(["calcium", "vitamin_c"]);
    expect(n.missing).toContain("iron");
    const g = gaps(n, dailyTargets(s), at("2026-11-02 15:00"), TZ);
    expect(g.map((x) => x.key)).toEqual(expect.arrayContaining(["protein", "iron"]));
    expect(g.some((x) => x.key === "plants")).toBe(false);
  });

  it("never reports unknown details as missing", () => {
    const old = meal("2026-11-02 13:30", "lunch", {});
    const n = dayNutrition([old, meal("2026-11-02 20:30", "dinner", {})], settings);
    expect(n.detailsKnown).toBe(false);
    expect(gaps(n, dailyTargets(settings), at("2026-11-02 22:00"), TZ).some((g) => g.key === "iron" || g.key === "plants")).toBe(false);
  });

  it("counts amla and chia water toward water", () => {
    const day = [ev("water", "2026-11-02 08:00", { ml: 250 }), ev("drink", "2026-11-02 08:05", { type: "amla", ml: 250 }), ev("drink", "2026-11-02 09:00", { type: "tea", ml: 300 })];
    expect(waterMl(day)).toBe(500);
  });
});

describe("meal slots", () => {
  it("keeps a late breakfast as breakfast and handles a skipped one", () => {
    const wake = ist("2026-11-02 10:30");
    expect(inferMealSlot(ist("2026-11-02 12:45"), [], TZ, undefined, wake)).toBe("breakfast");
    expect(inferMealSlot(ist("2026-11-02 13:30"), [], TZ, undefined, ist("2026-11-02 07:00"))).toBe("lunch");
    expect(inferMealSlot(ist("2026-11-02 16:00"), [], TZ)).toBe("lunch");
  });

  it("uses the food as a second opinion", () => {
    expect(refineMealSlot("lunch", "breakfast", 13 * 60, [])).toBe("breakfast");
    expect(refineMealSlot("breakfast", "lunch", 11 * 60 + 30, [])).toBe("lunch");
    expect(refineMealSlot("breakfast", "lunch", 9 * 60, [])).toBe("breakfast");
    expect(refineMealSlot("lunch", "breakfast", 13 * 60, ["breakfast"])).toBe("lunch");
  });
});

describe("meal analysis parsing", () => {
  it("reads the new nutrition fields and keeps older replies valid", () => {
    const a = normalizeMealAnalysis({
      items: [{ name: "poha", qty: 1, unit: "plate" }],
      tags: ["cooked_veg"],
      protein_g: { low: 7, high: 10 },
      carbs_g: { low: 45, high: 60 },
      fat_g: { low: 8, high: 12 },
      fiber_g: { low: 3, high: 5 },
      kcal: { low: 300, high: 400 },
      veg_servings: "0.5",
      fruit_servings: 0,
      nutrients: ["Iron", "vitamin c", "unknown"],
      slot_guess: "breakfast",
      confidence: 0.8,
      notes: null,
    });
    expect(a?.carbs_g).toEqual({ low: 45, high: 60 });
    expect(a?.veg_servings).toBe(0.5);
    expect(a?.nutrients).toEqual(["iron", "vitamin_c"]);
    const old = normalizeMealAnalysis({ items: [{ name: "dal" }], tags: [], protein_g: { low: 5, high: 8 }, kcal: { low: 100, high: 150 } });
    expect(old?.carbs_g).toBeUndefined();
  });
});
