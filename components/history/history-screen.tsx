"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { db, type LocalEvent } from "@/lib/client/db";
import { useSettings, useToday } from "@/lib/client/hooks";
import { usePendingDeletes } from "@/lib/client/pending-delete";
import { mergeServerRange } from "@/lib/client/sync";
import { isabgolGapAfterDinner, mainMeals, ofKind, summarizeToilet } from "@/lib/domain/day";
import { payloadOf, type StoredEvent } from "@/lib/domain/events";
import { BRISTOL_LABELS, formatGap } from "@/lib/domain/ladder";
import { isOnTrack } from "@/lib/domain/streak";
import { addDays } from "@/lib/domain/time";
import { ChevronRightIcon } from "../icons";
import { Timeline } from "../today/timeline";

const DAYS = 14;

function label(day: string, today: string) {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-[22px] bg-surface p-4 shadow-card">
      <p className="tabular text-[26px] font-bold leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-xs leading-snug text-ink-3">{label}</p>
    </div>
  );
}

export function HistoryScreen() {
  const today = useToday();
  const settings = useSettings();
  const pending = usePendingDeletes();
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!today) return;
    const from = addDays(today, -(DAYS - 1));
    const requestedAt = Date.now();
    apiGet<{ events: StoredEvent[] }>(`/api/events?from=${from}&to=${today}`)
      // Same safe merge as Today: removes entries the server no longer has, never
      // overwrites local changes still waiting, never brings back a deleted entry.
      .then(({ events }) => mergeServerRange(from, today, events, requestedAt))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [today]);

  const byDay = useLiveQuery(async () => {
    if (!today) return new Map<string, LocalEvent[]>();
    const rows = await db().events.where("logical_day").between(addDays(today, -(DAYS - 1)), today, true, true).toArray();
    const map = new Map<string, LocalEvent[]>();
    for (const e of rows) map.set(e.logical_day, [...(map.get(e.logical_day) ?? []), e]);
    return map;
  }, [today]);

  if (!today || !byDay) {
    return (
      <main className="flex flex-col gap-4 pt-2" aria-busy="true">
        <div className="mt-2 h-9 w-40 animate-pulse rounded-full bg-surface" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-[22px] bg-surface" />
        ))}
      </main>
    );
  }

  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, -i));
  const eventsOf = (d: string) => (byDay.get(d) ?? []).filter((e) => !pending.has(e.id));
  const past = days.slice(1).map(eventsOf);
  const logged = past.filter((d) => d.length > 0);
  const onTrack = past.filter((d) => isOnTrack(d)).length;
  const visitDays = logged.map((d) => summarizeToilet(d).visits).filter((v) => v > 0);
  const avgRounds = visitDays.length ? (visitDays.reduce((a, b) => a + b, 0) / visitDays.length).toFixed(1) : "–";
  const bananas = logged.filter((d) => summarizeToilet(d).firstPassBristol === 4).length;

  return (
    <main className="fade-in flex flex-col gap-6 pt-2">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Last 2 weeks{loading ? " · updating" : ""}</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight">History</h1>
          <Link href="/report" className="pressable inline-flex h-9 items-center rounded-full bg-brand/15 px-3.5 text-[14px] font-semibold text-brand">
            Gut diary
          </Link>
        </div>
      </header>

      <section className="flex gap-3" aria-label="Summary">
        <Stat value={String(onTrack)} label={onTrack === 1 ? "day on track" : "days on track"} />
        <Stat value={avgRounds} label="rounds a morning" />
        <Stat value={String(bananas)} label="smooth first passes" />
      </section>

      <ul className="flex flex-col gap-2.5">
        {days.map((day) => {
          const events = eventsOf(day);
          const t = summarizeToilet(events);
          const gap = isabgolGapAfterDinner(events);
          const gas = ofKind(events, "gas").at(-1);
          const chips = [
            t.visits ? `${t.visits} ${t.visits === 1 ? "round" : "rounds"}` : null,
            t.firstPassBristol ? `type ${t.firstPassBristol}, ${BRISTOL_LABELS[t.firstPassBristol]}` : null,
            mainMeals(events).length ? `${mainMeals(events).length} meals` : null,
            gap !== null ? `Isabgol +${formatGap(gap)}` : null,
            gas ? `gas ${payloadOf(gas, "gas")?.level}/4` : null,
          ].filter((c): c is string => Boolean(c));
          const expanded = open === day;
          if (events.length === 0) {
            return (
              <li key={day} className="flex items-center gap-3 px-4 py-1.5 text-sm text-ink-3">
                <span className="size-1.5 shrink-0 rounded-full bg-surface-3" />
                <span className="flex-1">{label(day, today)}</span>
                <span>Nothing logged</span>
              </li>
            );
          }
          return (
            <li key={day} className="overflow-hidden rounded-[22px] bg-surface shadow-card">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : day)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                aria-expanded={expanded}
              >
                <span className={`size-2.5 shrink-0 rounded-full ${isOnTrack(events) ? "bg-brand" : "bg-surface-3"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{label(day, today)}</span>
                  {chips.length ? (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {chips.map((c) => (
                        <span key={c} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                          {c}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="block text-sm text-ink-3">Nothing logged</span>
                  )}
                </span>
                {events.length ? <ChevronRightIcon className={`size-4 shrink-0 text-ink-3 transition-transform ${expanded ? "rotate-90" : ""}`} /> : null}
              </button>
              {expanded && events.length > 0 ? (
                <div className="border-t border-line p-2">
                  <Timeline events={events} tz={settings.tz} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
