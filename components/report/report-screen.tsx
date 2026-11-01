"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { db } from "@/lib/client/db";
import { useSettings, useToday } from "@/lib/client/hooks";
import { withLocalChanges } from "@/lib/client/sync";
import type { StoredEvent } from "@/lib/domain/events";
import { BRISTOL_LABELS, formatGap } from "@/lib/domain/ladder";
import { buildDiary, type DiaryRow } from "@/lib/domain/report";
import { addDays } from "@/lib/domain/time";

/**
 * Gut diary for a doctor or pelvic floor physio: a short summary and one row per day,
 * from the person's own logs. Print it, or save it as a PDF from the share sheet.
 */

const RANGES = [7, 14, 30];

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const pct = (x: number | null) => (x === null ? "-" : `${Math.round(x * 100)}%`);
const val = (x: number | null, suffix = "") => (x === null ? "-" : `${x}${suffix}`);

export function ReportScreen() {
  const today = useToday();
  const settings = useSettings();
  const [days, setDays] = useState(14);
  const [loaded, setLoaded] = useState<{ key: string; byDay: Map<string, StoredEvent[]>; offline: boolean } | null>(null);
  const from = today ? addDays(today, -(days - 1)) : null;
  const key = `${from}:${today}`;

  useEffect(() => {
    if (!today || !from) return;
    const local = () => db().events.where("logical_day").between(from, today, true, true).toArray();
    const group = (events: StoredEvent[]) => {
      const map = new Map<string, StoredEvent[]>();
      for (const e of events) map.set(e.logical_day, [...(map.get(e.logical_day) ?? []), e]);
      return map;
    };
    apiGet<{ events: StoredEvent[] }>(`/api/events?from=${from}&to=${today}`)
      .then(async ({ events }) => {
        // Changes on this phone that are not sent yet count too (edits, deletes, new entries).
        setLoaded({ key: `${from}:${today}`, byDay: group(await withLocalChanges(events, from, today)), offline: false });
      })
      .catch(async () => setLoaded({ key: `${from}:${today}`, byDay: group(await local()), offline: true }));
  }, [today, from]);

  const ready = loaded && loaded.key === key && today && from;
  const diary = ready ? buildDiary(loaded.byDay, from, today, settings.tz) : null;
  const s = diary?.summary;

  return (
    <main className="report fade-in flex flex-col gap-6 pt-2">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">For your doctor or physio</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">Gut diary</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {from && today ? `${dayLabel(from)} to ${dayLabel(today)}. ` : ""}From self-logs in Temple. Not a diagnosis.
          {loaded?.offline ? " Offline: showing what is on this phone." : ""}
        </p>
      </header>

      <div className="no-print flex items-center gap-2">
        <div className="flex flex-1 rounded-2xl bg-surface p-1 shadow-card">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              aria-pressed={days === r}
              className={`pressable h-10 flex-1 rounded-xl text-[15px] font-semibold ${days === r ? "bg-brand text-brand-ink" : "text-ink-2"}`}
            >
              {r} days
            </button>
          ))}
        </div>
        <button type="button" onClick={() => window.print()} className="pressable h-12 rounded-2xl bg-surface px-4 text-[15px] font-semibold text-brand shadow-card">
          Print or PDF
        </button>
      </div>

      {!s ? (
        <div className="h-64 animate-pulse rounded-[22px] bg-surface" aria-busy="true" />
      ) : (
        <>
          {s.bloodDays.length > 0 ? (
            <p className="rounded-2xl bg-care/10 px-4 py-3 text-[15px] leading-relaxed" role="alert">
              <span className="font-semibold">Blood noted on:</span> {s.bloodDays.map(dayLabel).join(", ")}.
            </p>
          ) : null}

          <section aria-label="Summary" className="grid grid-cols-2 gap-2.5">
            <Stat label="Days logged" value={`${s.daysLogged} of ${s.days}`} />
            <Stat label="Rounds per morning" value={val(s.avgRounds)} />
            <Stat label="Most common first stool" value={s.commonType ? `Type ${s.commonType}` : "-"} sub={s.commonType ? BRISTOL_LABELS[s.commonType] : undefined} />
            <Stat label="First passes type 3 or 4" value={pct(s.smoothShare)} />
            <Stat label="Straining (0 to 3)" value={val(s.avgStrain)} />
            <Stat label="Visits with breath holding" value={pct(s.breathHoldShare)} />
            <Stat label="Needed a full bladder" value={pct(s.bladderShare)} />
            <Stat label="Visits over 5 minutes" value={pct(s.longVisitShare)} />
            <Stat label="Evening gas (0 to 4)" value={val(s.avgGas)} />
            <Stat label="Heavy-feeling resets a day" value={val(s.heavyPerDay)} />
            <Stat label="Isabgol after dinner" value={s.isabgolMedianGap === null ? "-" : formatGap(s.isabgolMedianGap)} sub={s.isabgolOnTimeShare === null ? undefined : `${pct(s.isabgolOnTimeShare)} in the 60 to 150 min window`} />
            <Stat label="Workouts, practice days" value={`${s.workouts}, ${s.practiceDays}`} />
          </section>

          <section aria-label="Daily log">
            <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Day by day</h2>
            <div className="overflow-x-auto rounded-[22px] bg-surface shadow-card">
              <table className="w-full min-w-[640px] text-left text-[12px]">
                <thead className="text-ink-3">
                  <tr className="border-b border-line">
                    {["Day", "Rounds", "First type", "Complete", "Strain", "Breath hold", "Full bladder", "Over 5 min", "Gas", "Isabgol", "Bed", "Notes"].map((h) => (
                      <th key={h} scope="col" className="px-2.5 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diary.rows.map((r) => (
                    <Row key={r.day} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="px-1 text-[13px] leading-relaxed text-ink-3">
            Stool type uses the Bristol scale (1 hard lumps to 7 watery; 3 and 4 are the target). Straining, pain and gas are self-rated. Generated by Temple from personal logs.
          </p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[20px] bg-surface p-3.5 shadow-card">
      <p className="tabular text-[20px] font-bold leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-2">{label}</p>
      {sub ? <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{sub}</p> : null}
    </div>
  );
}

function Row({ r }: { r: DiaryRow }) {
  const cell = "px-2.5 py-2 align-top";
  if (!r.logged) {
    return (
      <tr className="border-b border-line text-ink-3 last:border-0">
        <td className={cell}>{dayLabel(r.day)}</td>
        <td className={cell} colSpan={11}>
          Nothing logged
        </td>
      </tr>
    );
  }
  return (
    <tr className={`border-b border-line last:border-0 ${r.blood ? "bg-care/10" : ""}`}>
      <td className={`${cell} whitespace-nowrap font-semibold`}>{dayLabel(r.day)}</td>
      <td className={cell}>{r.rounds}</td>
      <td className={cell}>{r.firstType ?? "-"}</td>
      <td className={cell}>{r.firstComplete ?? "-"}</td>
      <td className={cell}>{r.strainMax ?? "-"}</td>
      <td className={cell}>{r.breathHold ?? "-"}</td>
      <td className={cell}>{r.bladderFull ? "yes" : "-"}</td>
      <td className={cell}>{r.longVisits || "-"}</td>
      <td className={cell}>{r.gasMax ?? "-"}</td>
      <td className={`${cell} whitespace-nowrap`}>{r.isabgolGap === null ? "-" : `+${formatGap(r.isabgolGap)}`}</td>
      <td className={`${cell} whitespace-nowrap`}>{r.bedtime ?? "-"}</td>
      <td className={cell}>{[r.blood ? "blood" : null, r.painMax ? `pain ${r.painMax}/3` : null, ...r.notes].filter(Boolean).join("; ") || "-"}</td>
    </tr>
  );
}
