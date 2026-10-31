import { z } from "zod";

/**
 * Memory: a few short, editable notes the coach reads before every answer.
 * Personal patterns are computed from the logs by code (see tolerance.ts), not written
 * by the AI, so memory holds only what the person or their seed notes say.
 */

export const MEMORY_SLUGS = ["profile", "gut", "fitness", "foods", "experiments", "questions", "notes"] as const;
export type MemorySlug = (typeof MEMORY_SLUGS)[number];

export const MEMORY_META: Record<MemorySlug, { title: string; hint: string }> = {
  profile: { title: "About you", hint: "Condition, history, sleep and work rhythm, diet type." },
  gut: { title: "Gut protocol", hint: "Toilet routine, breathing, Isabgol, morning liquids, resets." },
  fitness: { title: "Fitness", hint: "Classes, goals, and limits from your trainer or physio." },
  foods: { title: "Foods", hint: "What seems to bring on gas or rough mornings, and what feels gentle." },
  experiments: { title: "Experiments", hint: "Changes you are testing and what to watch." },
  questions: { title: "Open questions", hint: "Things to test, or to ask your doctor or physio." },
  notes: { title: "Things you told Temple", hint: "Facts you saved with Remember this." },
};

/** Per-file limit in characters. Keeps every coach call small and fast. */
export const MEMORY_MAX_CHARS = 4000;

export const MemoryUpdate = z.strictObject({
  slug: z.enum(MEMORY_SLUGS),
  content: z.string().max(MEMORY_MAX_CHARS),
});

export const RememberInput = z.strictObject({ text: z.string().trim().min(3).max(300) });

export type MemoryFile = { slug: MemorySlug; content: string; version: number; updated_at: string };

const NOTE_PREFIX = /^- \d{4}-\d{2}-\d{2}: /;

/** Adds a dated bullet to the notes file. Skips exact repeats; drops the oldest lines past the limit. */
export function appendNote(content: string, note: string, day: string): string {
  const clean = note.replace(/\s+/g, " ").trim();
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const exists = lines.some((l) => l.replace(NOTE_PREFIX, "").trim().toLowerCase() === clean.toLowerCase());
  if (!clean || exists) return lines.join("\n");
  lines.push(`- ${day}: ${clean}`);
  while (lines.join("\n").length > MEMORY_MAX_CHARS && lines.length > 1) lines.shift();
  return lines.join("\n");
}

function clipHead(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf("\n"), max - 200))}\n(trimmed)`;
}

function clipTail(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const nl = cut.indexOf("\n");
  return `(older notes trimmed)\n${nl >= 0 && nl < 200 ? cut.slice(nl + 1) : cut}`;
}

/**
 * Memory as prompt text: each file capped so one long note cannot crowd out the rest.
 * Notes keep their newest lines; other files keep their first lines.
 */
export function memoryForPrompt(files: MemoryFile[], perFile = 1400): string {
  const bySlug = new Map(files.map((f) => [f.slug, f]));
  const blocks: string[] = [];
  for (const slug of MEMORY_SLUGS) {
    const text = bySlug.get(slug)?.content.trim();
    if (!text) continue;
    const body = slug === "notes" ? clipTail(text, perFile) : clipHead(text, perFile);
    blocks.push(`## ${MEMORY_META[slug].title}\n${body}`);
  }
  return blocks.join("\n\n");
}
