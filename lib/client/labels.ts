import { mealAnalysisOf, type StoredEvent } from "@/lib/domain/events";
import { BRISTOL_LABELS } from "@/lib/domain/ladder";
import { formatClock, localParts } from "@/lib/domain/time";

/** Human labels for the timeline. Pure functions. */

const SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
  late: "Late snack",
};

const DRINK_LABEL: Record<string, string> = {
  tea: "Tea",
  coffee: "Coffee",
  amla: "Amla water",
  chia: "Chia seed water",
  juice: "Juice",
  milk: "Milk",
  buttermilk: "Buttermilk",
  other: "Drink",
};

export function timeLabel(e: StoredEvent, tz: string): string {
  return formatClock(localParts(e.occurred_at, tz).minutes);
}

export function eventTitle(e: StoredEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.kind) {
    case "meal":
      return SLOT_LABEL[String(p.slot)] ?? "Meal";
    case "toilet":
      return p.passed ? "Toilet visit" : "Toilet visit (nothing came)";
    case "water":
      return `Water ${p.ml} ml`;
    case "drink":
      return `${DRINK_LABEL[String(p.type)] ?? "Drink"} ${p.ml} ml`;
    case "isabgol":
      return `Isabgol ${p.tsp} tsp`;
    case "wake":
      return "Woke up";
    case "sleep":
      return "Went to bed";
    case "practice":
      return "Breathing practice";
    case "sensation":
      return p.type === "gas" ? "Gas reset" : "Heavy feeling reset";
    case "gas":
      return `Gas ${p.level} of 4`;
    case "walk":
      return `Walk ${p.minutes} min`;
    case "workout":
      return `${String(p.type)} ${p.duration_min} min`;
    case "weigh_in":
      return `Weight ${p.kg} kg`;
    case "mood":
      return `Mood ${p.level} of 5`;
    case "stress":
      return `Stress ${p.level} of 5`;
    case "intimacy":
      return "Intimacy";
    case "late_work":
      return "Worked late";
    case "symptom":
      return `Symptom: ${String(p.type)}`;
    case "note":
      return "Note";
    default:
      return e.kind;
  }
}

export function eventDetail(e: StoredEvent): string | null {
  const p = e.payload as Record<string, unknown>;
  if (e.kind === "meal") {
    const a = mealAnalysisOf(e);
    if (a && a.items.length > 0) {
      const names = a.items
        .map((i) => (i.qty && i.qty > 1 ? `${i.qty} ${i.name}` : i.name))
        .join(", ");
      const mid = (x: { low: number; high: number }) => Math.round((x.low + x.high) / 2);
      const macros = [`protein ${mid(a.protein_g)} g`, a.carbs_g ? `carbs ${mid(a.carbs_g)} g` : null, a.fiber_g ? `fiber ${mid(a.fiber_g)} g` : null, `${mid(a.kcal)} kcal`].filter(Boolean);
      return `${names} · about ${macros.join(", ")}`;
    }
    const status = e.meta?.ai_status;
    if (status === "pending") return typeof p.text === "string" ? `"${p.text}" (reading it...)` : "Reading the photo...";
    if (status === "failed") return typeof p.text === "string" ? `"${p.text}" (not read yet, tap to retry)` : "Could not read the photo. Tap to retry or describe it.";
    return typeof p.text === "string" ? `"${p.text}"` : null;
  }
  if (e.kind === "toilet") {
    const parts: string[] = [];
    const mins = Math.round(Number(p.duration_s ?? 0) / 60);
    parts.push(`${mins} min`);
    if (typeof p.bristol === "number") parts.push(`type ${p.bristol}, ${BRISTOL_LABELS[p.bristol]}`);
    if (p.breath_hold === "no") parts.push("exhale only");
    if (p.blood) parts.push("blood noted");
    return parts.join(" · ");
  }
  if (e.kind === "note" || e.kind === "symptom") return typeof p.text === "string" ? p.text : null;
  return null;
}
