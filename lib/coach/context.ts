import { evidenceFor, evidenceText } from "@/lib/coach/evidence";
import type { CoachAnswer } from "@/lib/domain/coach/answer";
import type { CoachIntent } from "@/lib/domain/coach/intents";
import { dayDigest } from "@/lib/domain/digest";
import type { StoredEvent } from "@/lib/domain/events";
import { LADDER } from "@/lib/domain/ladder";
import { memoryForPrompt, type MemoryFile, type MemorySlug } from "@/lib/domain/memory";
import { dailyTargets } from "@/lib/domain/nutrition";
import type { Settings } from "@/lib/domain/settings";
import { describeFinding, MIN_DAYS, type ToleranceReport } from "@/lib/domain/tolerance";
import { addDays, formatClock, localParts, zoneDisplay } from "@/lib/domain/time";

/**
 * Builds what the coach sees for one question: memory, a 7-day digest, today's logs,
 * computed patterns and evidence. Never the full history, so calls stay small and fast.
 * Pure (no I/O), so tests and the live smoke test can build the same prompts.
 */

export const TOLERANCE_DAYS = 90;
const DIGEST_DAYS = 7;

export type CoachData = {
  byDay: Map<string, StoredEvent[]>;
  memory: MemoryFile[];
  tolerance: ToleranceReport;
};

export function groupByDay(events: StoredEvent[]): Map<string, StoredEvent[]> {
  const map = new Map<string, StoredEvent[]>();
  for (const e of events) map.set(e.logical_day, [...(map.get(e.logical_day) ?? []), e]);
  return map;
}

/** Only the memory notes a question needs, so less personal text leaves the database. */
const MEMORY_BY_INTENT: Record<CoachIntent, MemorySlug[]> = {
  should_go: ["profile", "gut", "experiments", "notes"],
  heavy: ["profile", "gut", "experiments", "notes"],
  morning: ["profile", "gut", "foods", "experiments", "notes"],
  gas: ["profile", "gut", "foods", "notes"],
  ate_right: ["profile", "foods", "fitness", "notes"],
  dinner: ["profile", "foods", "fitness", "notes"],
  free: ["profile", "gut", "fitness", "foods", "experiments", "questions", "notes"],
};
const CARD_MEMORY: MemorySlug[] = ["profile", "gut", "fitness", "foods", "experiments", "notes"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function classSummary(settings: Settings): string | null {
  if (settings.classes.length === 0) return null;
  const groups = new Map<string, number[]>();
  for (const c of settings.classes) {
    const key = `${formatClock(c.start_min)} ${c.label}`;
    groups.set(key, [...(groups.get(key) ?? []), c.weekday]);
  }
  return [...groups]
    .map(([what, days]) => `${[...new Set(days)].sort().map((d) => WEEKDAYS[d]).join(", ")} ${what}`)
    .join("; ");
}

function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function classesOn(settings: Settings, day: string): string | null {
  const list = settings.classes.filter((c) => c.weekday === weekdayOf(day)).sort((a, b) => a.start_min - b.start_min);
  return list.length ? list.map((c) => `${c.label} at ${formatClock(c.start_min)}`).join(", ") : null;
}

function targetsLine(settings: Settings): string {
  const t = dailyTargets(settings);
  return [
    `water ${settings.water_target_ml} ml`,
    t.protein ? `protein ${t.protein} g` : "protein target unknown (no weight set)",
    `fiber ${t.fiber} g`,
    t.kcal ? `calories ${t.kcal.low} to ${t.kcal.high} kcal` : null,
    `bedtime ${formatClock(settings.bedtime_target_min)}`,
    `Isabgol ${settings.isabgol_delay_min} min after dinner`,
    `usual tea ${settings.tea_ml} ml`,
    settings.weight_kg ? `weight ${settings.weight_kg} kg` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

function patternsText(report: ToleranceReport): string {
  const worse = report.findings.filter((f) => f.effect === "worse").slice(0, 5);
  const better = report.findings.filter((f) => f.effect === "better").slice(0, 3);
  const lines = [...worse, ...better].map((f) => `- ${describeFinding(f)}`);
  const learning = report.learning
    .slice(0, 5)
    .map((l) => `${l.exposure.label.toLowerCase()} (${l.withDays} of ${MIN_DAYS} days)`);
  return [
    `From ${report.daysLogged} logged days.`,
    lines.length ? lines.join("\n") : `- No patterns yet. Each needs ${MIN_DAYS} days with it and ${MIN_DAYS} without.`,
    learning.length ? `Still learning: ${learning.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function logsText(byDay: Map<string, StoredEvent[]>, today: string, settings: Settings, includeToday: boolean): string {
  const lines: string[] = [];
  for (let i = DIGEST_DAYS - 1; i >= (includeToday ? 0 : 1); i--) {
    const day = addDays(today, -i);
    const label = i === 0 ? "today so far" : i === 1 ? "yesterday" : undefined;
    lines.push(dayDigest(day, byDay.get(day) ?? [], settings.tz, label, settings));
  }
  return lines.join("\n");
}

function nowLine(settings: Settings, today: string): string {
  const now = new Date();
  const local = localParts(now, settings.tz);
  const date = new Date(`${local.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `${date}, ${formatClock(local.minutes)}, ${zoneDisplay(settings.tz, now)}. Logical day ${today} (days run from waking to waking).`;
}

export type EarlierQuestion = { question: string; headline: string | null };

export function askPrompt(input: {
  question: string;
  intent: CoachIntent;
  quick: CoachAnswer | null;
  data: CoachData;
  settings: Settings;
  today: string;
  ladderIndex: number;
  earlier: EarlierQuestion[];
}): string {
  const { data, settings, today } = input;
  const step = LADDER[input.ladderIndex] ?? LADDER[0];
  const classes = classSummary(settings);
  const sections = [
    `NOW: ${nowLine(settings, today)}`,
    `QUESTION (type: ${input.intent}): ${input.question}`,
    `QUICK TAKE: ${input.quick ? JSON.stringify(input.quick) : "none"}`,
    `TARGETS: ${targetsLine(settings)}. Classes: ${classes ?? "no schedule set"}. Today: ${classesOn(settings, today) ?? "no class"}.`,
    `HABIT THIS WEEK: ${step.gut} Also: ${step.other}`,
    `MEMORY:\n${memoryForPrompt(data.memory.filter((m) => MEMORY_BY_INTENT[input.intent].includes(m.slug))) || "No memory notes yet."}`,
    `LOGS (last ${DIGEST_DAYS} days, oldest first):\n${logsText(data.byDay, today, settings, true)}`,
    `PATTERNS:\n${patternsText(data.tolerance)}`,
    `EVIDENCE:\n${evidenceText(evidenceFor(input.intent))}`,
  ];
  if (input.earlier.length) {
    sections.push(`EARLIER QUESTIONS:\n${input.earlier.map((e) => `- ${e.question} -> ${e.headline ?? "no answer"}`).join("\n")}`);
  }
  return sections.join("\n\n");
}

export function cardPrompt(input: { data: CoachData; settings: Settings; today: string; ladderIndex: number }): string {
  const { data, settings, today } = input;
  const step = LADDER[input.ladderIndex] ?? LADDER[0];
  const cardDay = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return [
    `CARD FOR: the morning of ${cardDay}. Written at: ${nowLine(settings, today)}`,
    `TARGETS: ${targetsLine(settings)}. Class that day: ${classesOn(settings, today) ?? "none"}.`,
    `HABIT THIS WEEK: ${step.gut} Also: ${step.other}`,
    `MEMORY:\n${memoryForPrompt(data.memory.filter((m) => CARD_MEMORY.includes(m.slug))) || "No memory notes yet."}`,
    `LOGS (last ${DIGEST_DAYS - 1} days, yesterday last):\n${logsText(data.byDay, today, settings, false)}`,
    `THIS MORNING SO FAR:\n${dayDigest(today, data.byDay.get(today) ?? [], settings.tz, "today", settings)}`,
    `PATTERNS:\n${patternsText(data.tolerance)}`,
    `EVIDENCE:\n${evidenceText(evidenceFor("morning"))}`,
  ].join("\n\n");
}
