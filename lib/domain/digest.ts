import { isabgolGapAfterDinner, mealSlotOf, ofKind, practiceMinutes, summarizeToilet, waterMl } from "./day";
import { mealAnalysisOf, payloadOf, type StoredEvent } from "./events";
import { formatGap } from "./ladder";
import { about, dailyTargets, dayNutrition, NUTRIENT_LABEL } from "./nutrition";
import type { Settings } from "./settings";
import { formatClock, localParts } from "./time";

/**
 * One compact line per logical day, for AI context. Local clock times, no ids,
 * no names. Typed meal text and notes are cut short.
 */

const clock = (iso: string, tz: string) => formatClock(localParts(iso, tz).minutes);

function dayName(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function dayDigest(day: string, events: StoredEvent[], tz: string, label?: string, settings?: Settings): string {
  const parts: string[] = [];
  const wake = ofKind(events, "wake")[0];
  if (wake) parts.push(`woke ${clock(wake.occurred_at, tz)}`);

  const visits = ofKind(events, "toilet");
  if (visits.length > 0) {
    const t = summarizeToilet(events);
    const details = visits
      .map((v) => {
        const p = payloadOf(v, "toilet");
        if (!p) return null;
        const bits = [
          clock(v.occurred_at, tz),
          p.passed ? (p.bristol ? `type ${p.bristol}` : "passed") : "nothing came",
          p.complete ? `complete ${p.complete}` : null,
          typeof p.strain === "number" ? `strain ${p.strain}/3` : null,
          p.breath_hold ? `breath hold ${p.breath_hold}` : null,
          p.bladder_full ? "needed full bladder" : null,
          `${Math.round(p.duration_s / 60)} min`,
          p.blood ? "BLOOD" : null,
          typeof p.pain === "number" && p.pain > 0 ? `pain ${p.pain}/3` : null,
          typeof p.satisfaction === "number" ? `satisfied ${p.satisfaction}/5` : null,
        ].filter(Boolean);
        return bits.join(", ");
      })
      .filter(Boolean);
    parts.push(`toilet ${t.visits} rounds [${details.join("; ")}]`);
  }

  for (const m of ofKind(events, "meal")) {
    const a = mealAnalysisOf(m);
    const slot = mealSlotOf(m) ?? "meal";
    const text = (m.payload as { text?: unknown }).text;
    if (a) {
      const items = a.items.slice(0, 5).map((i) => i.name).join(", ");
      const macros = [
        `protein ~${about(a.protein_g)} g`,
        a.carbs_g ? `carbs ~${about(a.carbs_g)} g` : null,
        a.fat_g ? `fat ~${about(a.fat_g)} g` : null,
        a.fiber_g ? `fiber ~${about(a.fiber_g)} g` : null,
        `~${about(a.kcal)} kcal`,
      ].filter(Boolean);
      parts.push(`${slot} ${clock(m.occurred_at, tz)}: ${items} [${a.tags.join(", ")}] ${macros.join(", ")}`);
    } else {
      parts.push(`${slot} ${clock(m.occurred_at, tz)}: ${typeof text === "string" && text ? text.slice(0, 80) : "photo not analyzed"}`);
    }
  }

  const water = waterMl(events);
  if (water > 0) parts.push(`water ${water} ml`);
  const drinks = ofKind(events, "drink").map((d) => payloadOf(d, "drink")).filter((p): p is NonNullable<typeof p> => p !== null);
  if (drinks.length) parts.push(drinks.map((d) => `${d.type} ${d.ml} ml`).join(", "));

  for (const i of ofKind(events, "isabgol")) {
    const p = payloadOf(i, "isabgol");
    const gap = isabgolGapAfterDinner(events);
    parts.push(`isabgol ${clock(i.occurred_at, tz)}${p ? ` ${p.tsp} tsp` : ""}${gap !== null ? ` (${formatGap(gap)} after dinner)` : ""}`);
  }
  for (const g of ofKind(events, "gas")) parts.push(`gas ${payloadOf(g, "gas")?.level ?? "?"}/4 at ${clock(g.occurred_at, tz)}`);
  const sensations = ofKind(events, "sensation").map((s) => payloadOf(s, "sensation")?.type).filter(Boolean);
  if (sensations.length) parts.push(`resets: ${sensations.join(", ")}`);
  for (const w of ofKind(events, "walk")) parts.push(`walk ${payloadOf(w, "walk")?.minutes ?? "?"} min at ${clock(w.occurred_at, tz)}`);
  for (const w of ofKind(events, "workout")) {
    const p = payloadOf(w, "workout");
    if (p) parts.push(`workout ${p.type} ${p.duration_min} min${p.feel ? `, felt ${p.feel}` : ""}${p.pelvic_pressure ? ", pelvic pressure" : ""}`);
  }
  const practice = practiceMinutes(events);
  if (practice > 0) parts.push(`breathing practice ${practice} min`);
  for (const s of ofKind(events, "stress")) parts.push(`stress ${payloadOf(s, "stress")?.level}/5`);
  for (const s of ofKind(events, "mood")) parts.push(`mood ${payloadOf(s, "mood")?.level}/5`);
  if (ofKind(events, "late_work").length) parts.push("worked late");
  for (const s of ofKind(events, "symptom")) {
    const p = payloadOf(s, "symptom");
    if (p) parts.push(`symptom ${p.type}${p.severity ? ` ${p.severity}/3` : ""}${p.text ? `: ${p.text.slice(0, 60)}` : ""}`);
  }
  for (const n of ofKind(events, "note")) parts.push(`note: ${(payloadOf(n, "note")?.text ?? "").slice(0, 100)}`);
  for (const w of ofKind(events, "weigh_in")) parts.push(`weight ${payloadOf(w, "weigh_in")?.kg} kg`);
  const sleep = ofKind(events, "sleep").at(-1);
  if (sleep) parts.push(`bed ${clock(sleep.occurred_at, tz)}`);

  if (settings) {
    const n = dayNutrition(events, settings);
    if (n.analyzed > 0) {
      const t = dailyTargets(settings);
      parts.push(
        `nutrition total: protein ~${about(n.protein)} g${t.protein ? ` of ${t.protein}` : ""}, fiber ~${about(n.fiber)} g of ${t.fiber}, ~${about(n.kcal)} kcal${t.kcal ? ` of ${t.kcal.low} to ${t.kcal.high}` : ""}, veg and fruit ${n.veg + n.fruit} of ${t.plants} servings, nutrients covered: ${n.covered.map((k) => NUTRIENT_LABEL[k]).join(", ") || "none"}`,
      );
    }
  }

  const head = `${dayName(day)}${label ? ` (${label})` : ""}`;
  return parts.length ? `${head}: ${parts.join("; ")}` : `${head}: nothing logged`;
}
