import { z } from "zod";

/**
 * Event schemas. Every log in the app is one event: a kind, a time and a small payload.
 *
 * Security: payloads are strict objects, so unknown fields are rejected (no mass assignment),
 * and every number and string is bounded. Server-managed fields (AI analysis, round number)
 * are never accepted from the client; the server sets them.
 */

export const MEAL_SLOTS = ["breakfast", "lunch", "snack", "dinner", "late"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * "legume" means heavy beans and chickpeas (chana, chhole, rajma, lobia, soy).
 * Everyday lentil dals (moong, masoor, toor) get the lighter "dal" tag, so a normal
 * Indian lunch and dinner with dal does not trigger gas warnings.
 */
export const MEAL_TAGS = [
  "fried",
  "maida",
  "legume",
  "dal",
  "peanuts",
  "spicy",
  "raw_veg",
  "cooked_veg",
  "fruit",
  "ghee",
  "dairy",
  "caffeine",
  "high_protein",
  "sweet",
  "packaged",
  "large_portion",
] as const;
export type MealTag = (typeof MEAL_TAGS)[number];

/** Nutrients a meal can be a good source of (about a fifth of a day's need or more). */
export const NUTRIENTS = ["iron", "calcium", "vitamin_c", "b12", "folate", "potassium", "magnesium", "vitamin_a", "zinc", "omega3"] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

const Range = z.strictObject({
  low: z.number().min(0).max(5000),
  high: z.number().min(0).max(5000),
});

/** Structured result of the AI meal analysis (set by the server only). */
export const MealAnalysis = z.strictObject({
  items: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(80),
        qty: z.number().min(0).max(100).nullable(),
        unit: z.string().max(30).nullable(),
      }),
    )
    .max(20),
  tags: z.array(z.enum(MEAL_TAGS)).max(15),
  protein_g: Range,
  kcal: Range,
  /** Added later, so older analyses without them still load. */
  carbs_g: Range.optional(),
  fat_g: Range.optional(),
  fiber_g: Range.optional(),
  /** Servings of about 80 g (potato does not count as a vegetable). */
  veg_servings: z.number().min(0).max(10).optional(),
  fruit_servings: z.number().min(0).max(10).optional(),
  nutrients: z.array(z.enum(NUTRIENTS)).max(10).optional(),
  slot_guess: z.enum(MEAL_SLOTS).nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(300).nullable(),
});
export type MealAnalysis = z.infer<typeof MealAnalysis>;

const shortText = z.string().trim().max(500);

export const PayloadSchemas = {
  wake: z.strictObject({ mood: z.int().min(1).max(5).optional() }),
  sleep: z.strictObject({}),
  /** A daytime nap: logged when it starts, minutes added on waking ("I'm up"). */
  nap: z.strictObject({ minutes: z.int().min(1).max(360).optional() }),
  water: z.strictObject({ ml: z.int().min(50).max(2000) }),
  drink: z.strictObject({
    type: z.enum(["tea", "coffee", "amla", "chia", "juice", "milk", "buttermilk", "other"]),
    ml: z.int().min(20).max(2000),
  }),
  isabgol: z.strictObject({
    tsp: z.number().min(0.25).max(4),
    water_ml: z.int().min(50).max(1000),
  }),
  meal: z.strictObject({
    slot: z.enum(MEAL_SLOTS).optional(),
    /** True when the person picked the slot, so the AI never changes it. */
    slot_chosen: z.boolean().optional(),
    media_id: z.uuid().optional(),
    text: shortText.optional(),
    /** One of the person's usual foods (Settings), whose label values are known, so no AI. */
    usual: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  }),
  toilet: z.strictObject({
    duration_s: z.int().min(0).max(3600),
    passed: z.boolean(),
    bristol: z.int().min(1).max(7).optional(),
    complete: z.enum(["yes", "partly", "no"]).optional(),
    strain: z.int().min(0).max(3).optional(),
    breath_hold: z.enum(["no", "some", "yes"]).optional(),
    bladder_full: z.boolean().optional(),
    pain: z.int().min(0).max(3).optional(),
    blood: z.boolean().optional(),
    satisfaction: z.int().min(1).max(5).optional(),
    breaths: z.int().min(0).max(500).optional(),
  }),
  practice: z.strictObject({
    type: z.enum(["breathing", "reverse_kegel", "mobility"]),
    duration_s: z.int().min(0).max(7200),
  }),
  sensation: z.strictObject({
    type: z.enum(["heavy", "gas"]),
    intensity: z.int().min(1).max(5).optional(),
    reset: z.string().max(40).optional(),
    resolved: z.boolean().optional(),
  }),
  gas: z.strictObject({ level: z.int().min(0).max(4) }),
  walk: z.strictObject({ minutes: z.int().min(1).max(600) }),
  workout: z.strictObject({
    type: z.string().trim().min(1).max(60),
    duration_min: z.int().min(1).max(600),
    energy_kcal: z.int().min(0).max(5000).optional(),
    class: z.enum(["group", "yoga", "other"]).optional(),
    feel: z.enum(["easy", "ok", "hard"]).optional(),
    pelvic_pressure: z.boolean().optional(),
  }),
  weigh_in: z.strictObject({ kg: z.number().min(25).max(300) }),
  mood: z.strictObject({ level: z.int().min(1).max(5) }),
  stress: z.strictObject({ level: z.int().min(1).max(5) }),
  intimacy: z.strictObject({}),
  late_work: z.strictObject({}),
  symptom: z.strictObject({
    type: z.enum(["bleeding", "pain", "fissure", "other"]),
    severity: z.int().min(1).max(3).optional(),
    text: shortText.optional(),
  }),
  note: z.strictObject({ text: z.string().trim().min(1).max(1000) }),
} as const;

export type EventKind = keyof typeof PayloadSchemas;
export const EVENT_KINDS = Object.keys(PayloadSchemas) as EventKind[];

export type Payload<K extends EventKind> = z.infer<(typeof PayloadSchemas)[K]>;

const isoInstant = z.iso.datetime({ offset: true });

function eventSchema<K extends EventKind>(kind: K) {
  return z.strictObject({
    id: z.uuid(),
    kind: z.literal(kind),
    occurred_at: isoInstant,
    payload: PayloadSchemas[kind],
  });
}

/** What the app or a Shortcut may send. The server adds everything else. */
export const ClientEventInput = z.discriminatedUnion("kind", [
  eventSchema("wake"),
  eventSchema("sleep"),
  eventSchema("nap"),
  eventSchema("water"),
  eventSchema("drink"),
  eventSchema("isabgol"),
  eventSchema("meal"),
  eventSchema("toilet"),
  eventSchema("practice"),
  eventSchema("sensation"),
  eventSchema("gas"),
  eventSchema("walk"),
  eventSchema("workout"),
  eventSchema("weigh_in"),
  eventSchema("mood"),
  eventSchema("stress"),
  eventSchema("intimacy"),
  eventSchema("late_work"),
  eventSchema("symptom"),
  eventSchema("note"),
]);
export type ClientEventInput = z.infer<typeof ClientEventInput>;

export const EVENT_SOURCES = ["app", "shortcut", "health", "inferred"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** Server-managed extras stored next to the client payload. */
export type MealServerFields = {
  ai_status: "pending" | "done" | "failed" | "skipped";
  analysis?: MealAnalysis;
};

/** An event as stored and returned by the API. */
export type StoredEvent = {
  id: string;
  kind: EventKind;
  occurred_at: string;
  logical_day: string;
  source: EventSource;
  payload: Record<string, unknown>;
  /** Server-managed fields, such as meal analysis. Never set by the client. */
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** Narrowing helper for working with stored events by kind. */
export function payloadOf<K extends EventKind>(event: StoredEvent, kind: K): Payload<K> | null {
  if (event.kind !== kind) return null;
  const parsed = PayloadSchemas[kind].safeParse(event.payload);
  return parsed.success ? (parsed.data as Payload<K>) : null;
}

export function mealAnalysisOf(event: StoredEvent): MealAnalysis | null {
  if (event.kind !== "meal") return null;
  const parsed = MealAnalysis.safeParse(event.meta?.analysis);
  return parsed.success ? parsed.data : null;
}

/** Max events accepted in one sync batch (bounds request size). */
export const MAX_BATCH = 100;

export const EventBatch = z.strictObject({
  events: z.array(ClientEventInput).min(1).max(MAX_BATCH),
});

export const EventPatch = z.strictObject({
  occurred_at: isoInstant.optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
