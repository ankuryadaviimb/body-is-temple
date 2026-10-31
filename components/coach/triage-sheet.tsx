"use client";

import Link from "next/link";
import { useState } from "react";
import { useDayEvents, useSettings, useToday } from "@/lib/client/hooks";
import { usePendingDeletes } from "@/lib/client/pending-delete";
import { FEELINGS, triage, type Feeling, type Verdict } from "@/lib/domain/coach/triage";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from "../icons";
import { Sheet } from "../sheet";

/** "Should I go?": two taps, an instant answer from rules, no waiting on AI. */

const VERDICT_STYLE: Record<Verdict, { badge: string; label: string }> = {
  go: { badge: "bg-good/15 text-good", label: "Go" },
  reset_first: { badge: "bg-tip/15 text-tip", label: "Reset first" },
  wait: { badge: "bg-rest/15 text-rest", label: "Wait" },
};

export function TriageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const close = () => {
    setFeeling(null);
    onClose();
  };
  return (
    <Sheet open={open} title="Should I go?" onClose={close}>
      {feeling ? <Verdict feeling={feeling} onBack={() => setFeeling(null)} onDone={close} /> : <Pick onPick={setFeeling} />}
    </Sheet>
  );
}

function Pick({ onPick }: { onPick: (f: Feeling) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="mb-1 text-[15px] text-ink-2">What do you feel right now?</p>
      {FEELINGS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onPick(f.id)}
          className="pressable flex min-h-[64px] items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold">{f.label}</span>
            <span className="block text-[14px] text-ink-2">{f.hint}</span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
        </button>
      ))}
    </div>
  );
}

function Verdict({ feeling, onBack, onDone }: { feeling: Feeling; onBack: () => void; onDone: () => void }) {
  const today = useToday();
  const settings = useSettings();
  const events = useDayEvents(today);
  const pending = usePendingDeletes();
  if (!events) return null;
  const r = triage(feeling, events.filter((e) => !pending.has(e.id)), new Date(), settings.tz);
  const style = VERDICT_STYLE[r.verdict];
  return (
    <div className="fade-in flex flex-col gap-4">
      <div>
        <span className={`inline-flex h-7 items-center rounded-full px-3 text-[13px] font-bold uppercase tracking-wide ${style.badge}`}>{style.label}</span>
        <h3 className="mt-2.5 text-[22px] font-bold leading-tight tracking-tight">{r.title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{r.lead}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {r.steps.map((s, i) => (
          <li key={s} className="flex gap-2.5 text-[15px] leading-relaxed">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
        <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Why I said this</p>
        <ul className="flex flex-col gap-1 text-[14px] text-ink-2">
          {r.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <Link href={r.primary.href} onClick={onDone} className="pressable flex h-[52px] items-center justify-center rounded-2xl bg-brand text-[17px] font-semibold text-brand-ink">
          {r.primary.label}
        </Link>
        {r.secondary ? (
          <Link href={r.secondary.href} onClick={onDone} className="pressable flex h-12 items-center justify-center rounded-2xl bg-surface-2 text-[15px] font-semibold">
            {r.secondary.label}
          </Link>
        ) : null}
        <button type="button" onClick={onBack} className="pressable flex h-10 items-center justify-center gap-1 text-[14px] font-medium text-ink-3">
          <ChevronLeftIcon className="size-4" /> Feels different
        </button>
      </div>
      <p className="flex gap-2 text-[13px] leading-relaxed text-ink-3">
        <AlertIcon className="mt-0.5 size-4 shrink-0" />
        Sharp pain, bleeding more than a streak, or black stool? See your doctor.
      </p>
    </div>
  );
}
