import type { CoachData } from "@/lib/coach/context";
import type { StoredEvent } from "@/lib/domain/events";
import type { MemoryFile } from "@/lib/domain/memory";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { logicalDayFor } from "@/lib/domain/logical-day";
import { addDays } from "@/lib/domain/time";
import { computeTolerance } from "@/lib/domain/tolerance";
import { ev, TZ } from "../helpers";

/** Made-up sample data for prompt tests and the live smoke test. Nothing here is personal. */

export const SAMPLE_SETTINGS = {
  ...DEFAULT_SETTINGS,
  tz: TZ,
  weight_kg: 72,
  protein_target_g: 85,
  classes: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_min: 7 * 60, label: "Group class", kind: "group" as const })),
};

/** Today in India time, so the sample logs line up with the real clock in the prompt. */
export const SAMPLE_TODAY = logicalDayFor(new Date().toISOString(), [], TZ);

function meal(local: string, slot: string, items: string[], tags: string[]): StoredEvent {
  return ev("meal", local, { slot }, {
    ai_status: "done",
    analysis: {
      items: items.map((name) => ({ name, qty: null, unit: null })),
      tags,
      protein_g: { low: 10, high: 16 },
      kcal: { low: 400, high: 600 },
      slot_guess: null,
      confidence: 0.8,
      notes: null,
    },
  });
}

function day(date: string, heavy: boolean): StoredEvent[] {
  const next = addDays(date, 1);
  return [
    ev("wake", `${date} 07:40`),
    ev("toilet", `${date} 08:10`, { duration_s: 280, passed: true, bristol: heavy ? 6 : 4, breath_hold: heavy ? "some" : "no", strain: heavy ? 2 : 1 }),
    meal(`${date} 09:30`, "breakfast", ["poha", "tea"], ["cooked_veg"]),
    heavy ? meal(`${date} 13:30`, "lunch", ["poori", "chana masala"], ["fried", "legume"]) : meal(`${date} 13:30`, "lunch", ["roti", "moong dal", "lauki sabzi"], ["dal", "cooked_veg"]),
    ev("water", `${date} 15:00`, { ml: 500 }),
    meal(`${date} 21:00`, "dinner", ["khichdi", "curd"], ["dal", "dairy"]),
    ev("gas", `${date} 21:30`, { level: heavy ? 3 : 1 }),
    ev("isabgol", `${next} ${heavy ? "01:00" : "22:30"}`, { tsp: 1, water_ml: 200 }),
  ];
}

export function sampleData(): CoachData {
  const byDay = new Map<string, StoredEvent[]>();
  for (let i = 12; i >= 0; i--) {
    const d = addDays(SAMPLE_TODAY, -i);
    for (const e of day(d, i % 2 === 0)) byDay.set(e.logical_day, [...(byDay.get(e.logical_day) ?? []), e]);
  }
  const memory: MemoryFile[] = [
    { slug: "profile", content: "- Sample person, 40.\n- Usually 2 to 3 morning rounds with straining.", version: 1, updated_at: "" },
    { slug: "gut", content: "- Feet on a stool, breathe out on every push, 5 minutes at most.\n- Isabgol 1 teaspoon about 90 minutes after dinner.", version: 1, updated_at: "" },
    { slug: "foods", content: "- Idea to test: chana and fried food may bring evening gas.", version: 1, updated_at: "" },
    { slug: "questions", content: "- Sample question for the doctor.", version: 1, updated_at: "" },
  ];
  const finished = new Map([...byDay].filter(([d]) => d < SAMPLE_TODAY));
  return { byDay, memory, tolerance: computeTolerance(finished, SAMPLE_SETTINGS) };
}
