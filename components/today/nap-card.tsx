"use client";

import { useEffect, useState } from "react";
import { durationLabel, timeLabel } from "@/lib/client/labels";
import { updateEvent } from "@/lib/client/log";
import { napMinutesUntil } from "@/lib/domain/day";
import type { StoredEvent } from "@/lib/domain/events";
import { CloseIcon, NapIcon } from "../icons";
import { useToast } from "../toast";

/** A nap in progress: one tap on "I'm up" saves how long it lasted. */
export function NapCard({ nap, tz }: { nap: StoredEvent; tz: string }) {
  const [now, setNow] = useState(() => new Date());
  const { show, deleteWithUndo } = useToast();
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const minutes = napMinutesUntil(nap, now);

  async function wokeUp() {
    const m = napMinutesUntil(nap, new Date());
    await updateEvent(nap.id, { payload: { minutes: m } });
    show(`Nap saved: ${durationLabel(m)}.${m > 45 ? " Naps over 45 minutes can make it harder to fall asleep tonight." : ""}`, "good");
  }

  return (
    <section aria-label="Nap in progress" className="fade-in -mt-2 flex items-center gap-3 rounded-[22px] bg-rest/10 p-3.5 shadow-card">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-rest/20 text-rest">
        <NapIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-snug">Napping since {timeLabel(nap, tz)}</span>
        <span className="block text-[13px] leading-snug text-ink-2">{durationLabel(minutes)} so far</span>
      </span>
      <button type="button" onClick={() => void wokeUp()} className="pressable flex h-10 shrink-0 items-center rounded-full bg-brand px-4 text-[14px] font-semibold text-brand-ink">
        I&apos;m up
      </button>
      <button
        type="button"
        onClick={() => deleteWithUndo(nap.id, "Nap removed.")}
        aria-label="Remove this nap"
        className="pressable -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3"
      >
        <CloseIcon className="size-4" />
      </button>
    </section>
  );
}
