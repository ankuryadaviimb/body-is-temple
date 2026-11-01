/**
 * Redaction corpus: made-up Indian lab reports, consultations and prescriptions, built as
 * real PDFs and read exactly as on the server. Each case lists what must never reach the AI
 * (secrets) and what must survive (keep). No real person, lab or place.
 */
import { appendFileSync } from "node:fs";
import { expect } from "vitest";
import { pdfRows } from "@/lib/server/pdf-text";
import { redactPages, redactForAi } from "@/lib/domain/redact";
import { buildPdfX, type Item } from "./pdfx";

export type Kind = "blood_report" | "consultation" | "prescription" | "scan" | "other";
export type Case = { id: string; note?: string; kind: Kind; rows: string[][]; out: string; leaks: string[]; missing: string[] };

/** secrets: substrings that must not appear (case-insensitive). keep: substrings/regexes that must appear. */
export async function pdfCase(id: string, kind: Kind, pages: Item[][], secrets: string[], keep: (string | RegExp)[] = [], note?: string) {
  const { pages: rows } = await pdfRows(buildPdfX(pages));
  return record(id, kind, rows, redactPages(rows, kind).text, secrets, keep, note);
}
export function textCase(id: string, kind: Kind, text: string, secrets: string[], keep: (string | RegExp)[] = [], note?: string) {
  return record(id, kind, [text.split("\n")], redactForAi(text, kind).text, secrets, keep, note);
}
export function rowsCase(id: string, kind: Kind, rows: string[][], secrets: string[], keep: (string | RegExp)[] = [], note?: string) {
  return record(id, kind, rows, redactPages(rows, kind).text, secrets, keep, note);
}
function record(id: string, kind: Kind, rows: string[][], out: string, secrets: string[], keep: (string | RegExp)[], note?: string) {
  // pdf.js reads the micro sign as Greek mu: compare them as one letter.
  const mu = (t: string) => t.replace(/\u03bc/g, "\u00b5");
  const low = mu(out).toLowerCase();
  const leaks = secrets.filter((s) => low.includes(mu(s).toLowerCase()));
  const missing = keep.filter((k) => (typeof k === "string" ? !mu(out).includes(mu(k)) : !k.test(mu(out)))).map(String);
  const c = { id, note, kind, rows, out, leaks, missing };
  // REDACT_REPORT=<file> writes every case (input rows and output) for review.
  if (process.env.REDACT_REPORT) appendFileSync(process.env.REDACT_REPORT, JSON.stringify(c) + "\n");
  // Soft: every case in a group is checked and reported, not only the first failure.
  expect.soft(leaks, `${id}: leaked into what the AI would get\n${out}`).toEqual([]);
  expect.soft(missing, `${id}: results lost\n${out}`).toEqual([]);
  return c;
}

// Layout helpers (Helvetica 10 pt).
export const at = (x: number, y: number, s: string, extra: Partial<{ size: number; rot: number; indic: boolean }> = {}): Item => ({ x, y, s, ...extra });
/** A table drawn column by column (as some lab software does): one column of strings per x. */
export function tableByColumn(y0: number, xs: number[], rows: string[][], step = 16): Item[] {
  const out: Item[] = [];
  xs.forEach((x, c) => rows.forEach((r, i) => r[c] && out.push(at(x, y0 - i * step, r[c]))));
  return out;
}
/** The same table drawn row by row. */
export function tableByRow(y0: number, xs: number[], rows: string[][], step = 16): Item[] {
  const out: Item[] = [];
  rows.forEach((r, i) => xs.forEach((x, c) => r[c] && out.push(at(x, y0 - i * step, r[c]))));
  return out;
}
export const COLS = [40, 235, 305, 385];
export const HEADER: Item[] = [at(40, 640, "Test Description"), at(235, 640, "Result"), at(305, 640, "Unit"), at(385, 640, "Biological Ref. Interval")];
