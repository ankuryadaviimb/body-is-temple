import { isabgolGapAfterDinner, ISABGOL_WINDOW, ofKind, practiceMinutes } from "./day";
import { payloadOf, type StoredEvent } from "./events";
import { addDays, daysBetween, formatClock, localParts } from "./time";

/**
 * The bowel and gut diary a doctor or pelvic floor physio asks for: one row per day
 * and a short summary. Facts from the person's own logs only; no interpretation.
 */

const BREATH_RANK = { no: 0, some: 1, yes: 2 } as const;

export type DiaryRow = {
  day: string;
  logged: boolean;
  rounds: number;
  passes: number;
  firstType: number | null;
  firstComplete: "yes" | "partly" | "no" | null;
  strainMax: number | null;
  breathHold: "no" | "some" | "yes" | null;
  bladderFull: boolean;
  longVisits: number;
  blood: boolean;
  painMax: number | null;
  gasMax: number | null;
  heavyResets: number;
  isabgolGap: number | null;
  bedtime: string | null;
  notes: string[];
};

export type DiarySummary = {
  from: string;
  to: string;
  days: number;
  daysLogged: number;
  daysWithToilet: number;
  avgRounds: number | null;
  smoothShare: number | null;
  commonType: number | null;
  avgStrain: number | null;
  breathHoldShare: number | null;
  bladderShare: number | null;
  longVisitShare: number | null;
  bloodDays: string[];
  painDays: string[];
  avgGas: number | null;
  heavyPerDay: number | null;
  isabgolMedianGap: number | null;
  isabgolOnTimeShare: number | null;
  workouts: number;
  practiceDays: number;
};

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const share = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) / 100 : null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function diaryRow(day: string, events: StoredEvent[], tz: string): DiaryRow {
  const visits = ofKind(events, "toilet")
    .map((e) => payloadOf(e, "toilet"))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const passes = visits.filter((v) => v.passed);
  const strains = visits.map((v) => v.strain).filter((x): x is number => typeof x === "number");
  const holds = visits.map((v) => v.breath_hold).filter((x): x is "no" | "some" | "yes" => typeof x === "string");
  const pains = visits.map((v) => v.pain).filter((x): x is number => typeof x === "number" && x > 0);
  const gas = ofKind(events, "gas").map((g) => payloadOf(g, "gas")?.level).filter((x): x is number => typeof x === "number");
  const sleep = ofKind(events, "sleep").at(-1);
  const notes: string[] = [];
  for (const s of ofKind(events, "symptom")) {
    const p = payloadOf(s, "symptom");
    if (p) notes.push(`${p.type}${p.text ? `: ${p.text.slice(0, 80)}` : ""}`);
  }
  for (const n of ofKind(events, "note")) {
    const t = payloadOf(n, "note")?.text;
    if (t) notes.push(t.slice(0, 80));
  }
  return {
    day,
    logged: events.length > 0,
    rounds: visits.length,
    passes: passes.length,
    firstType: passes[0]?.bristol ?? null,
    firstComplete: passes[0]?.complete ?? null,
    strainMax: strains.length ? Math.max(...strains) : null,
    breathHold: holds.length ? holds.reduce((w, h) => (BREATH_RANK[h] > BREATH_RANK[w] ? h : w), holds[0]) : null,
    bladderFull: visits.some((v) => v.bladder_full === true),
    longVisits: visits.filter((v) => v.duration_s > 5 * 60).length,
    blood: visits.some((v) => v.blood === true) || ofKind(events, "symptom").some((s) => payloadOf(s, "symptom")?.type === "bleeding"),
    painMax: pains.length ? Math.max(...pains) : null,
    gasMax: gas.length ? Math.max(...gas) : null,
    heavyResets: ofKind(events, "sensation").filter((s) => payloadOf(s, "sensation")?.type === "heavy").length,
    isabgolGap: isabgolGapAfterDinner(events),
    bedtime: sleep ? formatClock(localParts(sleep.occurred_at, tz).minutes) : null,
    notes,
  };
}

export function buildDiary(byDay: Map<string, StoredEvent[]>, from: string, to: string, tz: string): { summary: DiarySummary; rows: DiaryRow[] } {
  const span = Math.max(0, daysBetween(from, to));
  const rows = Array.from({ length: span + 1 }, (_, i) => addDays(to, -i)).map((d) => diaryRow(d, byDay.get(d) ?? [], tz));
  const withToilet = rows.filter((r) => r.rounds > 0);
  const allVisits = [...byDay.entries()]
    .filter(([d]) => d >= from && d <= to)
    .flatMap(([, evs]) => ofKind(evs, "toilet").map((e) => payloadOf(e, "toilet")))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const types = withToilet.map((r) => r.firstType).filter((x): x is number => x !== null);
  const counts = new Map<number, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const commonType = types.length ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : null;
  const gaps = rows.map((r) => r.isabgolGap).filter((x): x is number => x !== null);
  const logged = rows.filter((r) => r.logged);
  const inRange = [...byDay.entries()].filter(([d]) => d >= from && d <= to).map(([, e]) => e);

  return {
    summary: {
      from,
      to,
      days: rows.length,
      daysLogged: logged.length,
      daysWithToilet: withToilet.length,
      avgRounds: avg(withToilet.map((r) => r.rounds)),
      smoothShare: share(types.filter((t) => t === 3 || t === 4).length, types.length),
      commonType,
      avgStrain: avg(allVisits.map((v) => v.strain).filter((x): x is number => typeof x === "number")),
      breathHoldShare: share(allVisits.filter((v) => v.breath_hold === "some" || v.breath_hold === "yes").length, allVisits.filter((v) => v.breath_hold).length),
      bladderShare: share(allVisits.filter((v) => v.bladder_full === true).length, allVisits.filter((v) => v.bladder_full !== undefined).length),
      longVisitShare: share(allVisits.filter((v) => v.duration_s > 5 * 60).length, allVisits.length),
      bloodDays: rows.filter((r) => r.blood).map((r) => r.day),
      painDays: rows.filter((r) => r.painMax !== null).map((r) => r.day),
      avgGas: avg(rows.map((r) => r.gasMax).filter((x): x is number => x !== null)),
      heavyPerDay: logged.length ? Math.round((rows.reduce((s, r) => s + r.heavyResets, 0) / logged.length) * 10) / 10 : null,
      isabgolMedianGap: median(gaps),
      isabgolOnTimeShare: share(gaps.filter((g) => g >= ISABGOL_WINDOW.minAfterDinner && g <= ISABGOL_WINDOW.maxAfterDinner).length, gaps.length),
      workouts: inRange.reduce((s, e) => s + ofKind(e, "workout").length, 0),
      practiceDays: inRange.filter((e) => practiceMinutes(e) >= 4).length,
    },
    rows,
  };
}
