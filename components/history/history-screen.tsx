"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { db, type LocalEvent } from "@/lib/client/db";
import { useSettings, useToday } from "@/lib/client/hooks";
import { isabgolGapAfterDinner, mainMeals, ofKind, summarizeToilet } from "@/lib/domain/day";
import { payloadOf, type StoredEvent } from "@/lib/domain/events";
import { BRISTOL_LABELS } from "@/lib/domain/ladder";
import { addDays } from "@/lib/domain/time";
import { Timeline } from "../today/timeline";

const DAYS = 14;

function label(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function HistoryScreen() {
  const today = useToday();
  const settings = useSettings();
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!today) return;
    const from = addDays(today, -(DAYS - 1));
    apiGet<{ events: StoredEvent[] }>(`/api/events?from=${from}&to=${today}`)
      .then(async ({ events }) => {
        const pending = new Set(
          (await db().events.where("logical_day").between(from, today, true, true).toArray())
            .filter((e) => e.sync !== "synced")
            .map((e) => e.id),
        );
        await db().events.bulkPut(events.filter((e) => !pending.has(e.id)).map((e) => ({ ...e, sync: "synced" as const })));
      })
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

  if (!today || !byDay) return <div className="py-20 text-center text-ink-2">Loading...</div>;

  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, -i));

  return (
    <main className="pt-2">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">History</h1>
      <p className="mb-4 text-sm text-ink-2">Last 2 weeks. Tap a day to see everything you logged.{loading ? " Updating..." : ""}</p>
      <ul className="flex flex-col gap-2">
        {days.map((day) => {
          const events = byDay.get(day) ?? [];
          const t = summarizeToilet(events);
          const gap = isabgolGapAfterDinner(events);
          const gas = ofKind(events, "gas").at(-1);
          const facts = [
            t.visits ? `${t.visits} ${t.visits === 1 ? "round" : "rounds"}` : null,
            t.firstPassBristol ? `type ${t.firstPassBristol} (${BRISTOL_LABELS[t.firstPassBristol]})` : null,
            `${mainMeals(events).length} meals`,
            gap !== null ? `Isabgol +${gap} min` : null,
            gas ? `gas ${payloadOf(gas, "gas")?.level}/4` : null,
          ].filter(Boolean);
          return (
            <li key={day} className="rounded-2xl border border-line bg-surface">
              <button type="button" onClick={() => setOpen(open === day ? null : day)} className="w-full px-4 py-3 text-left" aria-expanded={open === day}>
                <span className="block font-semibold">{day === today ? "Today" : label(day)}</span>
                <span className="block text-sm text-ink-2">{events.length ? facts.join(" · ") : "Nothing logged"}</span>
              </button>
              {open === day && events.length > 0 ? (
                <div className="px-2 pb-2">
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
