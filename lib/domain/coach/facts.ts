import { mealSlotOf } from "../day";
import { mealAnalysisOf, type MealSlot, type StoredEvent } from "../events";
import { formatGap } from "../ladder";
import { formatClock, localParts } from "../time";

/** Small wording helpers shared by the instant coach rules. */

export const SLOT_NAMES: Record<MealSlot, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  snack: "snack",
  dinner: "dinner",
  late: "late snack",
};

export function clockOf(iso: string, tz: string): string {
  return formatClock(localParts(iso, tz).minutes);
}

export function agoText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m < 2 ? "just now" : `${formatGap(m)} ago`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "poori and chana masala", from the meal analysis or the typed text. */
export function mealItems(e: StoredEvent): string | null {
  const a = mealAnalysisOf(e);
  if (a && a.items.length > 0) return joinList(a.items.slice(0, 3).map((i) => i.name.toLowerCase()));
  const text = (e.payload as { text?: unknown }).text;
  return typeof text === "string" && text.trim() ? text.trim().slice(0, 60) : null;
}

/** "Poori and chana masala (lunch, 1:30 PM)". */
export function mealPhrase(e: StoredEvent, tz: string): string {
  const slot = mealSlotOf(e);
  const when = `${slot ? SLOT_NAMES[slot] : "meal"}, ${clockOf(e.occurred_at, tz)}`;
  const items = mealItems(e);
  return items ? `${capitalize(items)} (${when})` : capitalize(when);
}
