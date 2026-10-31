"use client";

import { useMemo, useState } from "react";
import { allTimeZones, zoneLabel, type ZoneLabel } from "@/lib/domain/time";
import { CheckIcon, SearchIcon } from "../icons";
import { Sheet } from "../sheet";

/** Time zone picker with standard names ("India Standard Time"), detected from the phone. */

function offsetMinutes(offset: string): number {
  const m = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const v = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -v : v;
}

/** Lower is better: a name or city that starts with the query beats a match inside an id. */
function matchRank(z: ZoneLabel, q: string): number {
  const name = z.name.toLowerCase();
  const city = z.city.toLowerCase();
  if (name.startsWith(q) || city.startsWith(q)) return 0;
  if (name.split(" ").some((w) => w.startsWith(q))) return 1;
  if (name.includes(q) || city.includes(q)) return 2;
  if (z.offset.toLowerCase().includes(q)) return 3;
  if (z.id.toLowerCase().includes(q)) return 4;
  return 9;
}

export function TimeZoneSheet({ value, onPick, onClose }: { value: string; onPick: (tz: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const device = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const zones = useMemo<ZoneLabel[]>(() => {
    const now = new Date();
    const ids = [...new Set([value, device, ...allTimeZones()])].filter(Boolean);
    return ids.map((id) => zoneLabel(id, now)).sort((a, b) => offsetMinutes(a.offset) - offsetMinutes(b.offset) || a.city.localeCompare(b.city));
  }, [value, device]);
  const q = query.trim().toLowerCase();
  const shown = q
    ? zones
        .map((z) => ({ z, rank: matchRank(z, q) }))
        .filter((x) => x.rank < 9)
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.z)
    : zones;
  const deviceLabel = zoneLabel(device);

  return (
    <Sheet open title="Time zone" onClose={onClose}>
      {device && device !== value ? (
        <button
          type="button"
          onClick={() => onPick(device)}
          className="pressable mb-3 flex w-full flex-col items-start rounded-2xl bg-brand px-4 py-3 text-left text-brand-ink"
        >
          <span className="text-[15px] font-semibold">Use this phone&apos;s time zone</span>
          <span className="text-[13px] opacity-85">
            {deviceLabel.name} ({deviceLabel.offset})
          </span>
        </button>
      ) : null}
      <label className="mb-3 flex h-11 items-center gap-2 rounded-2xl bg-surface-2 px-3">
        <SearchIcon className="size-4 shrink-0 text-ink-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="City or zone, for example India"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
          aria-label="Search time zones"
        />
      </label>
      <ul className="divide-y divide-line">
        {shown.slice(0, 200).map((z) => (
          <li key={z.id}>
            <button type="button" onClick={() => onPick(z.id)} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium">{z.name}</span>
                <span className="block truncate text-[13px] text-ink-3">
                  {z.offset} · {z.city}
                </span>
              </span>
              {z.id === value ? <CheckIcon className="size-5 shrink-0 text-brand" /> : null}
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="py-4 text-[15px] text-ink-3">No match. Try a city name.</li> : null}
      </ul>
    </Sheet>
  );
}
