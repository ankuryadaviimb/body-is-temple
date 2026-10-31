import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/lib/ai/json";
import { MEAL_SYSTEM_PROMPT, mealUserPrompt, normalizeMealAnalysis } from "@/lib/ai/meal-normalize";
import { detectType } from "@/lib/domain/file-type";

describe("extractJsonObject", () => {
  it("reads plain, fenced and chatty replies", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":{"b":"}"}}\n```')).toEqual({ a: { b: "}" } });
    expect(extractJsonObject('Sure! Here it is: {"items":[]} hope that helps')).toEqual({ items: [] });
  });

  it("returns null for broken or missing JSON", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject('{"a": 1,')).toBeNull();
  });
});

describe("normalizeMealAnalysis", () => {
  it("cleans a loose model reply into a valid analysis", () => {
    const a = normalizeMealAnalysis({
      items: [{ name: "Poori", qty: "7", unit: "pieces" }, "chana masala", { name: "" }],
      tags: ["FRIED", "legume", "made-up-tag"],
      protein_g: { low: 30, high: 18 },
      kcal: { low: "900", high: 1200 },
      slot_guess: "lunch",
      confidence: 3,
      notes: "Fried bread with chickpea curry",
    });
    expect(a).not.toBeNull();
    expect(a!.items).toEqual([
      { name: "Poori", qty: 7, unit: "pieces" },
      { name: "chana masala", qty: null, unit: null },
    ]);
    expect(a!.tags).toEqual(["fried", "legume"]);
    expect(a!.protein_g).toEqual({ low: 18, high: 30 });
    expect(a!.kcal).toEqual({ low: 900, high: 1200 });
    expect(a!.confidence).toBe(1);
  });

  it("handles a non-food photo reply", () => {
    const a = normalizeMealAnalysis({ items: [], tags: [], protein_g: { low: 0, high: 0 }, kcal: { low: 0, high: 0 }, confidence: 0 });
    expect(a?.items).toEqual([]);
    expect(a?.slot_guess).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(normalizeMealAnalysis(null)).toBeNull();
    expect(normalizeMealAnalysis("poha")).toBeNull();
  });

  it("keeps prompts generic, with no personal or health details", () => {
    const text = `${MEAL_SYSTEM_PROMPT} ${mealUserPrompt("dinner", "2 roti and dal")}`.toLowerCase();
    for (const word of ["dyssynergia", "isabgol", "pelvic", "doctor", "@", "name:"]) {
      expect(text).not.toContain(word);
    }
  });
});

describe("detectType", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it("detects real file signatures", () => {
    expect(detectType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(detectType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    expect(detectType(new TextEncoder().encode("RIFF1234WEBPVP8 "))?.mime).toBe("image/webp");
    expect(detectType(new TextEncoder().encode("%PDF-1.7"))?.mime).toBe("application/pdf");
  });

  it("rejects scripts and HTML pretending to be images", () => {
    expect(detectType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(detectType(bytes())).toBeNull();
  });
});
