"use client";

import { useState } from "react";
import { usePhotoUrl } from "@/lib/client/hooks";
import { eventDetail, eventTitle, timeLabel } from "@/lib/client/labels";
import { updateEvent } from "@/lib/client/log";
import { usePendingDeletes } from "@/lib/client/pending-delete";
import type { LocalEvent } from "@/lib/client/db";
import { MEAL_SLOTS, type EventKind } from "@/lib/domain/events";
import { localParts, localToInstant } from "@/lib/domain/time";
import { EventIcon } from "../event-visuals";
import { TrashIcon } from "../icons";
import { Choice, Sheet } from "../sheet";
import { useToast } from "../toast";

function Thumb({ event }: { event: LocalEvent }) {
  const mediaId = typeof event.payload.media_id === "string" ? event.payload.media_id : undefined;
  const url = usePhotoUrl(event.id, mediaId);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- private, same-origin photo
  return <img src={url} alt="" className="mt-2 h-24 w-full max-w-56 rounded-2xl object-cover" />;
}

function isAnalyzing(e: LocalEvent) {
  return e.kind === "meal" && e.meta?.ai_status === "pending";
}

/** Today's log as a timeline. Tap a row to edit it; the trash button deletes with Undo. */
export function Timeline({ events, tz, readOnly = false }: { events: LocalEvent[]; tz: string; readOnly?: boolean }) {
  const [editing, setEditing] = useState<LocalEvent | null>(null);
  const pending = usePendingDeletes();
  const { deleteWithUndo } = useToast();
  const sorted = events.filter((e) => !pending.has(e.id)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  if (sorted.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-line px-6 py-8 text-center">
        <p className="font-medium">Nothing logged yet</p>
        <p className="mt-1 text-sm text-ink-2">Every tap above lands here, newest first.</p>
      </div>
    );
  }

  return (
    <>
      <ol className="overflow-hidden rounded-[24px] bg-surface shadow-card">
        {sorted.map((e, i) => {
          const detail = eventDetail(e);
          const last = i === sorted.length - 1;
          return (
            <li key={e.id} className="relative flex items-stretch">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setEditing(e)}
                className="flex min-w-0 flex-1 items-start gap-3 py-3.5 pl-4 pr-2 text-left"
              >
                <EventIcon kind={e.kind as EventKind} size="sm" />
                <span className="min-w-0 flex-1 pb-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-semibold">{eventTitle(e)}</span>
                    <span className="tabular ml-auto shrink-0 text-xs text-ink-3">{timeLabel(e, tz)}</span>
                  </span>
                  {detail ? (
                    <span className={`mt-0.5 block text-sm leading-snug ${isAnalyzing(e) ? "animate-pulse text-ink-3" : "text-ink-2"}`}>{detail}</span>
                  ) : null}
                  {e.kind === "meal" ? <Thumb event={e} /> : null}
                  {e.sync !== "synced" ? (
                    <span className={`mt-1 inline-flex items-center gap-1 text-xs ${e.sync === "error" ? "text-care" : "text-ink-3"}`}>
                      <span className={`size-1.5 rounded-full ${e.sync === "error" ? "bg-care" : "bg-tip"}`} />
                      {e.sync === "error" ? "Not saved, tap to fix" : "Waiting to sync"}
                    </span>
                  ) : null}
                </span>
              </button>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => deleteWithUndo(e.id, `${eventTitle(e)} deleted.`)}
                  className="pressable flex w-12 shrink-0 items-start justify-center pt-4 text-ink-3"
                  aria-label={`Delete ${eventTitle(e)}`}
                >
                  <TrashIcon className="size-[18px]" />
                </button>
              ) : null}
              {!last ? <span className="absolute bottom-0 left-[3.75rem] right-0 h-px bg-line" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
      {editing ? <EditSheet event={editing} tz={tz} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function EditSheet({ event, tz, onClose }: { event: LocalEvent; tz: string; onClose: () => void }) {
  const p = localParts(event.occurred_at, tz);
  const { deleteWithUndo } = useToast();
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

  return (
    <Sheet open title={eventTitle(event)} onClose={onClose}>
      <label className="mb-5 block">
        <span className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">Time</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-base" />
      </label>
      {event.kind === "meal" ? (
        <>
          <Choice
            label="Meal"
            value={slot}
            onChange={(v) => setSlot(v)}
            options={MEAL_SLOTS.map((s) => ({ value: s, label: s === "late" ? "Late" : s[0].toUpperCase() + s.slice(1) }))}
          />
          <label className="mb-5 block">
            <span className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">What was it?</span>
            <input
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 2 roti, dal, curd (helps if the photo was unclear)"
              className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-base"
            />
          </label>
        </>
      ) : null}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            deleteWithUndo(event.id, `${eventTitle(event)} deleted.`);
            onClose();
          }}
          className="pressable flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-care/10 font-semibold text-care"
        >
          <TrashIcon className="size-4" /> Delete
        </button>
        <button type="button" onClick={() => void save()} className="pressable h-12 flex-[2] rounded-2xl bg-brand font-semibold text-brand-ink">
          Save
        </button>
      </div>
    </Sheet>
  );
}
