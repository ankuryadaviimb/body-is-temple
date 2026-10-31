"use client";

import { describeWhen, resolveWhen, timeOf, type WhenValue } from "@/lib/domain/when";
import { localParts } from "@/lib/domain/time";
import { Choice } from "./sheet";

/** Day (today or yesterday) and time, with quick "ago" shortcuts and a clear preview. */
export function WhenPicker({ value, onChange, tz }: { value: WhenValue; onChange: (v: WhenValue) => void; tz: string }) {
  const now = new Date();
  const at = resolveWhen(value, tz, now);
  const shortcut = (ago: number) => {
    const t = new Date(now.getTime() - ago * 60_000);
    const p = localParts(t, tz);
    onChange({ day: p.date === localParts(now, tz).date ? "today" : "yesterday", time: timeOf(Math.floor(p.minutes / 5) * 5) });
  };
  return (
    <div className="mb-5">
      <Choice
        label="Day"
        value={value.day}
        onChange={(day) => onChange({ ...value, day })}
        options={[
          { value: "today", label: "Today" },
          { value: "yesterday", label: "Yesterday" },
        ]}
      />
      <label className="block">
        <span className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">Time</span>
        <input
          type="time"
          value={value.time}
          onChange={(e) => e.target.value && onChange({ ...value, time: e.target.value })}
          className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-[17px]"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[30, 60, 120, 180].map((ago) => (
          <button key={ago} type="button" onClick={() => shortcut(ago)} className="pressable h-8 rounded-full bg-surface-2 px-3 text-[13px] font-medium text-ink-2">
            {ago < 60 ? `${ago} min ago` : `${ago / 60} h ago`}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-ink-3">
        Saves as <span className="font-semibold text-ink-2">{describeWhen(at, tz, now)}</span>
      </p>
    </div>
  );
}
