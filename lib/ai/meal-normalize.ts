import { MEAL_SLOTS, MEAL_TAGS, MealAnalysis, type MealSlot } from "@/lib/domain/events";

/**
 * Prompt and response normalizer for meal recognition. Pure functions, unit tested.
 * The prompt is generic on purpose: it carries no personal or health information.
 */

export const MEAL_SYSTEM_PROMPT = `You identify food in meal photos or short meal descriptions. Most meals are Indian home food.
Reply with ONLY one JSON object, no other text, in exactly this shape:
{"items":[{"name":"poha","qty":1,"unit":"plate"}],"tags":["cooked_veg"],"protein_g":{"low":8,"high":12},"kcal":{"low":300,"high":420},"slot_guess":"breakfast","confidence":0.8,"notes":null}

Rules:
- items: each dish or drink you can see or that is described, with a count or portion if clear (qty and unit may be null).
- tags: choose only from this list, and only when clearly true:
  fried (deep or shallow fried: poori, pakora, samosa, bhatura, vada),
  maida (refined flour: naan, white bread, biscuits, pastry, bhatura, maggi),
  legume (heavy beans: chana, chhole, rajma, lobia, soy, whole urad),
  dal (everyday lentil dal: moong, masoor, toor, sambhar),
  peanuts (peanuts or peanut chutney or chikki),
  spicy (visibly chili-heavy), raw_veg (raw salad or raw vegetables), cooked_veg (cooked vegetables or sabzi),
  fruit, ghee (visible ghee or butter), dairy (milk, curd, paneer, buttermilk, cheese), caffeine (tea or coffee),
  high_protein (about 20 g protein or more), sweet (dessert or sugary), packaged (packaged snack or drink),
  large_portion (clearly more than one normal serving).
- protein_g and kcal: a realistic low to high range for everything listed.
- slot_guess: one of breakfast, lunch, snack, dinner, late, or null.
- confidence: 0 to 1. If the photo is not food, return empty items, empty tags, zero ranges and confidence 0.
- notes: null, or one short sentence about the food only. Never describe people, places or text that is not about the food.`;

export function mealUserPrompt(slotHint: MealSlot | null, description: string | null): string {
  const parts = ["Identify this meal."];
  if (slotHint) parts.push(`It was eaten as ${slotHint}.`);
  if (description) parts.push(`Description: ${description.slice(0, 500)}`);
  return parts.join(" ");
}

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const range = (v: unknown, max: number): { low: number; high: number } => {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const low = Math.round(num(o.low, 0, max, 0));
  const high = Math.round(num(o.high, 0, max, low));
  return low <= high ? { low, high } : { low: high, high: low };
};

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Turns a loosely shaped model reply into a valid MealAnalysis, or null if unusable. */
export function normalizeMealAnalysis(raw: unknown): MealAnalysis | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const items = (Array.isArray(r.items) ? r.items : [])
    .map((it) => {
      const o = (typeof it === "object" && it !== null ? it : { name: it }) as Record<string, unknown>;
      const name = cleanText(o.name, 80);
      if (!name) return null;
      const qty = o.qty === null || o.qty === undefined ? null : num(o.qty, 0, 100, 1);
      return { name, qty, unit: cleanText(o.unit, 30) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 20);

  const allowed = new Set<string>(MEAL_TAGS);
  const tags = [
    ...new Set((Array.isArray(r.tags) ? r.tags : []).map((t) => String(t).trim().toLowerCase()).filter((t) => allowed.has(t))),
  ].slice(0, 15) as MealAnalysis["tags"];

  const slot = typeof r.slot_guess === "string" && (MEAL_SLOTS as readonly string[]).includes(r.slot_guess)
    ? (r.slot_guess as MealSlot)
    : null;

  const candidate = {
    items,
    tags,
    protein_g: range(r.protein_g, 300),
    kcal: range(r.kcal, 5000),
    slot_guess: slot,
    confidence: num(r.confidence, 0, 1, 0.5),
    notes: cleanText(r.notes, 300),
  };
  const parsed = MealAnalysis.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
