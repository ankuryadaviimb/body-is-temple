"use client";

import { useState } from "react";
import { usePhotoUrl } from "@/lib/client/hooks";
import { eventDetail, eventTitle, timeLabel } from "@/lib/client/labels";
import { removeEvent, updateEvent } from "@/lib/client/log";
import type { LocalEvent } from "@/lib/client/db";
import { MEAL_SLOTS } from "@/lib/domain/events";
import { localParts, localToInstant } from "@/lib/domain/time";
import { Choice, Sheet } from "../sheet";

function Thumb({ event }: { event: LocalEvent }) {
  const mediaId = typeof event.payload.media_id === "string" ? event.payload.media_id : undefined;
  const url = usePhotoUrl(event.id, mediaId);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- private, same-origin photo
  return <img src={url} alt="" className="size-12 shrink-0 rounded-xl object-cover" />;
}

export function Timeline({ events, tz, readOnly = false }: { events: LocalEvent[]; tz: string; readOnly?: boolean }) {
  const [editing, setEditing] = useState<LocalEvent | null>(null);
  const sorted = [...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  if (sorted.length === 0) {
    return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-2">Nothing logged yet.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {sorted.map((e) => {
          const detail = eventDetail(e);
          return (
            <li key={e.id}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setEditing(e)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="w-16 shrink-0 text-xs tabular-nums text-ink-2">{timeLabel(e, tz)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{eventTitle(e)}</span>
                  {detail ? <span className="block text-sm leading-snug text-ink-2">{detail}</span> : null}
                </span>
                {e.kind === "meal" ? <Thumb event={e} /> : null}
                {e.sync !== "synced" ? (
                  <span
                    className={`size-2 shrink-0 rounded-full ${e.sync === "error" ? "bg-care" : "bg-tip"}`}
                    aria-label={e.sync === "error" ? "Not saved" : "Waiting to sync"}
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {editing ? <EditSheet event={editing} tz={tz} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function EditSheet({ event, tz, onClose }: { event: LocalEvent; tz: string; onClose: () => void }) {
  const p = localParts(event.occurred_at, tz);
  const [time, setTime] = useState(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`);
  const [slot, setSlot] = useState<string | undefined>(event.payload.slot as string | undefined);
  const [text, setText] = useState<string>(typeof event.payload.text === "string" ? event.payload.text : "");

  async function save() {
    const [h, m] = time.split(":").map(Number);
    const at = localToInstant(p.date, h * 60 + m, tz).toISOString();
    const payload: Record<string, unknown> = {};
    if (event.kind === "meal") {
      if (slot) payload.slot = slot;
      if (text.trim()) payload.text = text.trim().slice(0, 500);
    }
    await updateEvent(event.id, { occurred_at: at, ...(Object.keys(payload).length ? { payload } : {}) });
    onClose();
  }

  async function remove() {
    await removeEvent(event.id);
    onClose();
  }

  return (
    <Sheet open title={eventTitle(event)} onClose={onClose}>
      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium text-ink-2">Time</span>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base"
        />
      </label>
      {event.kind === "meal" ? (
        <>
          <Choice
            label="Meal"
            value={slot}
            onChange={(v) => setSlot(v)}
            options={MEAL_SLOTS.map((s) => ({ value: s, label: s === "late" ? "Late" : s[0].toUpperCase() + s.slice(1) }))}
          />
          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-ink-2">What was it? (optional, helps if the photo was unclear)</span>
            <input
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 2 roti, dal, curd"
              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base"
            />
          </label>
        </>
      ) : null}
      <div className="flex gap-3">
        <button type="button" onClick={remove} className="h-12 flex-1 rounded-xl border border-care/40 font-semibold text-care">
          Delete
        </button>
        <button type="button" onClick={save} className="h-12 flex-[2] rounded-xl bg-brand font-semibold text-brand-ink">
          Save
        </button>
      </div>
    </Sheet>
  );
}
