import { ofKind } from "../day";
import { payloadOf, type StoredEvent } from "../events";

/**
 * Red flags always win over coaching: Temple names them and points to a doctor.
 * Text checks are deliberately broad (a false alarm here costs little); context words
 * such as "blood test" or "black tea" do not count.
 */

export type RedFlag = { id: string; label: string };

const STOOL = "(stool|stools|poo|poop|motion|motions|potty|feces|faeces|bowel movement)";

const TEXT_FLAGS: { id: string; label: string; re: RegExp }[] = [
  {
    id: "bleeding",
    label: "bleeding",
    re: /\b(blood|bleed|bleeding|bloody)\b(?!\s*(test|tests|report|reports|work|sugar|pressure|group|count|levels?))/i,
  },
  {
    id: "black_stool",
    label: "black or tarry stool",
    re: new RegExp(`\\b(black|tarry|tar[- ]like)\\b[^.]{0,30}\\b${STOOL}\\b|\\b${STOOL}\\b[^.]{0,30}\\b(black|tarry)\\b`, "i"),
  },
  { id: "fever", label: "fever", re: /\b(fever|feverish|chills)\b/i },
  { id: "vomiting", label: "vomiting", re: /\b(vomit|vomiting|vomited|throwing up|threw up)\b/i },
  { id: "weight_loss", label: "weight loss you cannot explain", re: /\b(losing weight|lost weight|weight loss)\b/i },
  {
    id: "severe_pain",
    label: "severe pain",
    re: /\b(severe|unbearable|excruciating|worst|intense)\b[^.]{0,40}\bpain\b|\bpain\b[^.]{0,40}\b(severe|unbearable|excruciating)\b/i,
  },
  { id: "no_gas", label: "not passing gas", re: /\b(cannot|can not|can't|cant|unable to)\s+(pass|release)\s+(gas|wind)\b/i },
];

export function redFlagsInText(text: string): RedFlag[] {
  return TEXT_FLAGS.filter((f) => f.re.test(text)).map(({ id, label }) => ({ id, label }));
}

/** Flags from recent logs: blood on a toilet visit, a bleeding symptom, or strong pain. */
export function redFlagsInEvents(events: StoredEvent[]): RedFlag[] {
  const flags = new Map<string, RedFlag>();
  for (const e of ofKind(events, "toilet")) {
    const p = payloadOf(e, "toilet");
    if (p?.blood) flags.set("bleeding", { id: "bleeding", label: "bleeding" });
    if ((p?.pain ?? 0) >= 3) flags.set("severe_pain", { id: "severe_pain", label: "strong pain" });
  }
  for (const e of ofKind(events, "symptom")) {
    const p = payloadOf(e, "symptom");
    if (p?.type === "bleeding") flags.set("bleeding", { id: "bleeding", label: "bleeding" });
    if (p?.type === "pain" && (p.severity ?? 0) >= 3) flags.set("severe_pain", { id: "severe_pain", label: "strong pain" });
  }
  return [...flags.values()];
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function doctorNote(flags: RedFlag[], source: "text" | "logs"): string | null {
  if (flags.length === 0) return null;
  const urgent = "Go today if it is heavy or black, or comes with fever, vomiting or severe pain.";
  if (source === "logs" && flags.every((f) => f.id === "bleeding")) {
    return `Your recent logs show bleeding. A small streak on the paper can come from a fissure, but new or repeated bleeding needs a doctor's check. ${urgent}`;
  }
  const what = joinNatural([...new Set(flags.map((f) => f.label))]);
  const lead = source === "text" ? `You mentioned ${what}.` : `Your recent logs show ${what}.`;
  return `${lead} That needs a doctor, not an app. Please see your doctor soon. ${urgent}`;
}
