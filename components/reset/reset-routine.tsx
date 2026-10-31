"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logEvent, updateEvent } from "@/lib/client/log";
import type { ResetRoutine } from "@/lib/content/resets";
import { SessionHeader, useWakeLock } from "../breath-pacer";
import { ExerciseFigure } from "../exercise-figure";
import { useToast } from "../toast";

/** Step-by-step guided reset with a timer per step. Logs the episode when it starts. */
export function ResetRoutineView({ routine }: { routine: ResetRoutine }) {
  const router = useRouter();
  const { show } = useToast();
  const [variantId, setVariantId] = useState(routine.variants[0].id);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [stepStartedAt, setStepStartedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const eventId = useRef<string | null>(null);
  const variant = routine.variants.find((v) => v.id === variantId) ?? routine.variants[0];
  const step = stepIndex !== null ? variant.steps[stepIndex] : null;
  const done = stepIndex !== null && stepIndex >= variant.steps.length;
  useWakeLock(stepIndex !== null && !done);

  useEffect(() => {
    if (!step) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [step]);

  const left = step ? Math.max(0, step.seconds - Math.floor((now - stepStartedAt) / 1000)) : 0;

  function goTo(index: number) {
    const t = Date.now();
    setStepStartedAt(t);
    setNow(t);
    setStepIndex(index);
  }

  async function start() {
    const { event } = await logEvent("sensation", { type: routine.kind, reset: variant.id });
    eventId.current = event.id;
    goTo(0);
  }

  async function finish(resolved: boolean) {
    if (eventId.current) await updateEvent(eventId.current, { payload: { resolved } });
    show(resolved ? "Good. Back to your day." : "Noted. If it keeps coming back, mention it to your doctor or physio.", "info");
    router.push("/");
  }

  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = step ? left / step.seconds : 0;

  return (
    <main className="fade-in flex min-h-[calc(100dvh-5rem)] flex-col gap-5">
      <SessionHeader title={routine.title} />

      {stepIndex === null ? (
        <>
          <p className="text-center text-[15px] leading-relaxed text-ink-2">{routine.intro}</p>
          {routine.variants.length > 1 ? (
            <div className="flex rounded-2xl bg-surface p-1 shadow-card">
              {routine.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  aria-pressed={v.id === variantId}
                  className={`pressable h-10 flex-1 rounded-xl text-[15px] font-semibold ${v.id === variantId ? "bg-brand text-brand-ink" : "text-ink-2"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          ) : null}
          <ol className="space-y-2.5">
            {variant.steps.map((s, i) => (
              <li key={s.title} className="rounded-[22px] bg-surface p-4 shadow-card">
                {s.pose ? <ExerciseFigure pose={s.pose} mirror={s.mirror} className="mb-2 h-28 w-full" /> : null}
                <div className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">{i + 1}</span>
                  <div>
                    <p className="text-[15px] font-semibold">
                      {s.title} <span className="font-normal text-ink-3">· {s.seconds} s</span>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.text}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="rounded-[22px] bg-brand-soft px-4 py-3.5 text-sm leading-relaxed">{routine.reframe}</p>
          <button type="button" onClick={() => void start()} className="pressable mt-auto h-14 rounded-2xl bg-brand font-semibold text-brand-ink">
            Start
          </button>
        </>
      ) : done ? (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <p className="mb-3 text-center text-[22px] font-semibold tracking-tight">Done. How do you feel?</p>
          <button type="button" onClick={() => void finish(true)} className="pressable h-14 rounded-2xl bg-brand font-semibold text-brand-ink">
            Better
          </button>
          <button type="button" onClick={() => void finish(false)} className="pressable h-14 rounded-2xl bg-surface font-semibold shadow-card">
            About the same
          </button>
        </div>
      ) : step ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">
            Step {stepIndex + 1} of {variant.steps.length}
          </p>
          {step.pose ? <ExerciseFigure pose={step.pose} mirror={step.mirror} className="h-44 w-full max-w-sm" /> : null}
          <div className={`relative flex items-center justify-center ${step.pose ? "size-28" : "size-44"}`}>
            <svg viewBox="0 0 100 100" className="absolute inset-0 size-full text-brand" aria-hidden>
              <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="5" />
              <circle
                className="ring-arc"
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${frac * c} ${c}`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <span className={`tabular font-semibold ${step.pose ? "text-3xl" : "text-5xl"}`}>{left}</span>
          </div>
          <h2 className="text-[24px] font-semibold tracking-tight">{step.title}</h2>
          <p className="max-w-sm text-[15px] leading-relaxed text-ink-2">{step.text}</p>
          <button
            type="button"
            onClick={() => goTo(stepIndex + 1)}
            className={`pressable mt-2 h-14 w-full rounded-2xl font-semibold ${left === 0 ? "bg-brand text-brand-ink" : "bg-surface shadow-card"}`}
          >
            {stepIndex + 1 < variant.steps.length ? "Next step" : "Finish"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
