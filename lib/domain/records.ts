import { z } from "zod";
import { canonicalMarker } from "./lab-names";

export { canonicalMarker };

/**
 * Health records: blood reports, consultations, prescriptions and scans. Pure helpers:
 * what may be sent to the AI (identity lines removed), how its reply is checked, and how
 * values become trends. No I/O here.
 */

export const DOC_KINDS = ["blood_report", "consultation", "prescription", "scan", "other"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  blood_report: "Blood report",
  consultation: "Consultation",
  prescription: "Prescription",
  scan: "Scan or imaging",
  other: "Other",
};

export const DOC_STATUSES = ["pending", "done", "no_text", "image", "consent", "failed"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const MARKER_FLAGS = ["low", "high", "normal", "unknown"] as const;

export const LabMarker = z.strictObject({
  name: z.string().min(1).max(80),
  raw_name: z.string().max(120),
  value: z.number().nullable(),
  value_text: z.string().max(40),
  unit: z.string().max(30).nullable(),
  ref_low: z.number().nullable(),
  ref_high: z.number().nullable(),
  ref_text: z.string().max(60).nullable(),
  flag: z.enum(MARKER_FLAGS),
});
export type LabMarker = z.infer<typeof LabMarker>;

export const DocExtraction = z.strictObject({
  doc_date: z.iso.date().nullable(),
  markers: z.array(LabMarker).max(150),
  summary: z.array(z.string().min(1).max(240)).max(6),
});
export type DocExtraction = z.infer<typeof DocExtraction>;

export type HealthDocument = {
  id: string;
  kind: DocKind;
  title: string;
  doc_date: string | null;
  notes: string | null;
  status: DocStatus;
  extraction: DocExtraction | null;
  pages: number | null;
  mime: string | null;
  created_at: string;
  /** Last change; a read still "pending" long after this was cut off. */
  updated_at: string;
};

/** A read that has been pending this long was cut off (the server's time limit is 60 s). */
export const READ_STUCK_MS = 2 * 60_000;
export const readIsStuck = (d: Pick<HealthDocument, "status" | "updated_at">, now: number) =>
  d.status === "pending" && now - new Date(d.updated_at).getTime() > READ_STUCK_MS;

export const DocumentMeta = z.strictObject({
  kind: z.enum(DOC_KINDS).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  doc_date: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/**
 * How a record may be read by AI. Nothing is read without the person's OK: the upload
 * sheet has a "Read the values with AI" switch (on by default only for a blood report PDF,
 * where only result lines leave), and a stored record has a "Read with AI" button.
 * - A blood report PDF: result rows only, names and details removed; Groq (zero data
 *   retention), then Cloudflare.
 * - Any other PDF is free text, where a name cannot always be found: Cloudflare only.
 * - A photo cannot be redacted at all: Cloudflare only.
 */
export type ReadPolicy = { defaultRead: boolean; mode: "results" | "free_text" | "photo"; providers: ("groq" | "cloudflare")[] };
export function readPolicy(kind: DocKind, mime: string | null): ReadPolicy {
  if (mime !== "application/pdf") return { defaultRead: false, mode: "photo", providers: ["cloudflare"] };
  if (kind === "blood_report") return { defaultRead: true, mode: "results", providers: ["groq", "cloudflare"] };
  return { defaultRead: false, mode: "free_text", providers: ["cloudflare"] };
}

/** Uploads must stay under the hosting platform's 4.5 MB request limit. */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

// What of a record may be sent to the AI lives in ./redact (an allowlist with row rebuilding).
export { redactForAi, redactPages, rowsFromItems, type PositionedText, type Redacted } from "./redact";

const toNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return null;
};

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

function flagOf(value: number | null, low: number | null, high: number | null, given: unknown): LabMarker["flag"] {
  if (value !== null && (low !== null || high !== null)) {
    if (low !== null && value < low) return "low";
    if (high !== null && value > high) return "high";
    return "normal";
  }
  const g = typeof given === "string" ? given.trim().toLowerCase() : "";
  if (g === "l" || g === "low") return "low";
  if (g === "h" || g === "high") return "high";
  if (g === "normal" || g === "n") return "normal";
  return "unknown";
}

function isoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1990 ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

/** Turns a loosely shaped model reply into checked values, or null if unusable. */
export function normalizeExtraction(raw: unknown): DocExtraction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const markers: LabMarker[] = [];
  for (const item of Array.isArray(r.markers) ? r.markers : []) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    // Stored rows keep the name as printed in raw_name: names are always worked out from it
    // again, so a better rule also fixes reports read earlier.
    const rawName = text(m.raw_name, 120) ?? text(m.name, 120);
    if (!rawName) continue;
    const value = toNumber(m.value);
    const valueText = text(m.value_text ?? m.value, 40);
    if (value === null && !valueText) continue;
    const low = toNumber(m.ref_low);
    const high = toNumber(m.ref_high);
    markers.push({
      name: canonicalMarker(rawName),
      raw_name: rawName,
      value,
      value_text: valueText ?? String(value),
      unit: text(m.unit, 30),
      ref_low: low,
      ref_high: high !== null && low !== null && high < low ? null : high,
      ref_text: text(m.ref_text, 60),
      flag: flagOf(value, low, high, m.flag),
    });
    if (markers.length >= 150) break;
  }
  const summary = (Array.isArray(r.summary) ? r.summary : typeof r.summary === "string" ? r.summary.split(/\n+/) : [])
    .map((s) => text(s, 240))
    .filter((s): s is string => s !== null)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""))
    .slice(0, 6);
  const parsed = DocExtraction.safeParse({ doc_date: isoDate(r.doc_date), markers, summary });
  return parsed.success ? parsed.data : null;
}

export type MarkerPoint = {
  date: string;
  value: number | null;
  value_text: string;
  unit: string | null;
  flag: LabMarker["flag"];
  doc_id: string;
  /** When the report was added (orders results that share a date). */
  uploaded_at: string;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
};
export type MarkerTrend = {
  name: string;
  latest: MarkerPoint;
  /** The newest result from an earlier date, in the latest result's unit (never another unit). */
  previous: MarkerPoint | null;
  /** Every result, newest first, duplicates (the same report added twice) removed. */
  points: MarkerPoint[];
  /** Results in the latest result's unit, newest first: the only ones safe to compare or chart. */
  comparable: MarkerPoint[];
  ref_text: string | null;
};

/** "ng/mL", "ng / ml" and "NG/ML" are the same unit; micro signs are written as u. */
export function unitKey(unit: string | null): string {
  return (unit ?? "").toLowerCase().replace(/\s+/g, "").replace(/[\u00b5\u03bc]/g, "u");
}

function rangeText(p: MarkerPoint): string | null {
  if (p.ref_text) return p.ref_text;
  if (p.ref_low !== null && p.ref_high !== null) return `${p.ref_low} to ${p.ref_high}`;
  if (p.ref_low !== null) return `above ${p.ref_low}`;
  if (p.ref_high !== null) return `below ${p.ref_high}`;
  return null;
}

/**
 * Latest value per marker across all documents, newest first, out-of-range markers on
 * top. Values are only compared within one unit: a vitamin D in nmol/L is never shown as
 * "before" a vitamin D in ng/mL.
 */
export function markerTrends(docs: HealthDocument[]): MarkerTrend[] {
  const byName = new Map<string, MarkerPoint[]>();
  for (const d of docs) {
    if (!d.extraction) continue;
    const date = d.doc_date ?? d.extraction.doc_date ?? d.created_at.slice(0, 10);
    for (const m of d.extraction.markers) {
      const list = byName.get(m.name) ?? [];
      list.push({
        date,
        value: m.value,
        value_text: m.value_text,
        unit: m.unit,
        flag: m.flag,
        doc_id: d.id,
        uploaded_at: d.created_at,
        ref_low: m.ref_low,
        ref_high: m.ref_high,
        ref_text: m.ref_text,
      });
      byName.set(m.name, list);
    }
  }
  const trends: MarkerTrend[] = [];
  for (const [name, raw] of byName) {
    const seen = new Set<string>();
    // Newest date first; on one date, an out-of-range result first (so a red flag is never
    // hidden by a normal repeat), then the report added last.
    const severity = (p: MarkerPoint) => (p.flag === "low" || p.flag === "high" ? 0 : 1);
    const points = [...raw]
      .sort((a, b) => b.date.localeCompare(a.date) || severity(a) - severity(b) || b.uploaded_at.localeCompare(a.uploaded_at) || a.doc_id.localeCompare(b.doc_id))
      .filter((p) => {
        const key = `${p.date}|${p.value_text}|${unitKey(p.unit)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const latest = points[0];
    const comparable = points.filter((p) => unitKey(p.unit) === unitKey(latest.unit));
    const ref = rangeText(latest) ?? comparable.map(rangeText).find((r) => r !== null) ?? null;
    const previous = comparable.find((p) => p.date < latest.date) ?? null;
    trends.push({ name, latest, previous, points, comparable, ref_text: ref });
  }
  const rank = (t: MarkerTrend) => (t.latest.flag === "low" || t.latest.flag === "high" ? 0 : 1);
  return trends.sort((a, b) => rank(a) - rank(b) || b.latest.date.localeCompare(a.latest.date) || a.name.localeCompare(b.name));
}

/** Lab findings a doctor should see promptly (anemia signs). */
export function labRedFlags(trends: MarkerTrend[], now: Date = new Date()): string[] {
  const recent = (t: MarkerTrend) => now.getTime() - new Date(`${t.latest.date}T12:00:00Z`).getTime() < 180 * 86_400_000;
  const out: string[] = [];
  for (const t of trends) {
    if (!recent(t) || t.latest.flag !== "low") continue;
    if (t.name === "Hemoglobin") out.push("low hemoglobin on your last blood test");
    if (t.name === "Ferritin") out.push("low ferritin (iron stores) on your last blood test");
  }
  return out;
}

/** Compact lines for the coach prompt: flagged markers first, then a few key ones. */
/**
 * Recent doctor visits for the coach: the person's own notes on consultations,
 * prescriptions and scans, plus what was read from them (only ever read after their OK).
 * Short and plain, latest first, within a year.
 */
export function visitsForPrompt(docs: HealthDocument[], today: string, limit = 3): string {
  const since = new Date(`${today}T12:00:00Z`).getTime() - 365 * 86_400_000;
  return docs
    .filter((d) => d.kind !== "blood_report" && (d.notes || d.extraction?.summary.length))
    .map((d) => ({ d, date: d.doc_date ?? d.created_at.slice(0, 10) }))
    .filter(({ date }) => new Date(`${date}T12:00:00Z`).getTime() >= since)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(({ d, date }) => {
      const end = (t: string) => t.replace(/[.;,\s]+$/, "");
      const notes = d.notes ? ` Your note: ${end(promptSafe(d.notes, 240, 45))}.` : "";
      const read = d.extraction?.summary.length ? ` Read from it: ${d.extraction.summary.slice(0, 2).map((x) => end(promptSafe(x, 160, 30))).join("; ")}.` : "";
      return `- ${DOC_KIND_LABEL[d.kind]} on ${date}.${notes}${read}`;
    })
    .join("\n");
}

/**
 * Text the AI wrote from a document goes into every coach prompt, so it is cut down to
 * short, test-like strings: a crafted report cannot plant a lasting instruction there.
 */
function promptSafe(value: string | null, max: number, words = 8): string {
  const plain = (value ?? "").replace(/[^\p{L}\p{N} ().,%/+<>=^:-]/gu, " ").replace(/\s+/g, " ").trim();
  return plain.split(" ").slice(0, words).join(" ").slice(0, max);
}

export function labsForPrompt(trends: MarkerTrend[], limit = 14): string {
  const KEY = new Set(["Hemoglobin", "Ferritin", "Iron", "Vitamin B12", "Vitamin D (25-OH)", "TSH", "HbA1c", "Fasting glucose", "Calcium", "CRP", "Creatinine"]);
  const chosen = trends.filter((t) => t.latest.flag === "low" || t.latest.flag === "high" || KEY.has(t.name)).slice(0, limit);
  return chosen
    .map((t) => {
      const unit = promptSafe(t.latest.unit, 16, 2);
      const v = `${promptSafe(t.latest.value_text, 16, 3)}${unit ? ` ${unit}` : ""}`;
      const range = promptSafe(t.ref_text, 24, 5);
      const flag = t.latest.flag === "low" || t.latest.flag === "high" ? ` (${t.latest.flag}${range ? `, range ${range}` : ""})` : "";
      const prev = t.previous ? `; before ${promptSafe(t.previous.value_text, 16, 3)} on ${t.previous.date}` : "";
      return `- ${promptSafe(t.name, 40, 6)} ${v}${flag} on ${t.latest.date}${prev}`;
    })
    .join("\n");
}
