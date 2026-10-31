"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logEvent, updateEvent } from "@/lib/client/log";
import type { ResetRoutine } from "@/lib/content/resets";
import { useWakeLock } from "../breath-pacer";
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

  return (
    <main className="flex flex-col gap-5 pt-4">
      <div>
        <h1 className="text-xl font-semibold">{routine.title}</h1>
        <p className="mt-1 text-sm text-ink-2">{routine.intro}</p>
      </div>

      {stepIndex === null ? (
        <>
          {routine.variants.length > 1 ? (
            <div className="flex gap-2">
              {routine.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  aria-pressed={v.id === variantId}
                  className={`h-11 flex-1 rounded-xl border font-medium ${v.id === variantId ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          ) : null}
          <ol className="space-y-3">
            {variant.steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl bg-surface p-4">
                <p className="font-semibold">
                  {i + 1}. {s.title} <span className="font-normal text-ink-2">· {s.seconds} s</span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm leading-relaxed">{routine.reframe}</p>
          <button type="button" onClick={() => void start()} className="h-14 rounded-2xl bg-brand font-semibold text-brand-ink">
            Start
          </button>
        </>
      ) : done ? (
        <div className="flex flex-col gap-3">
          <p className="text-lg font-semibold">Done. How do you feel?</p>
          <button type="button" onClick={() => void finish(true)} className="h-14 rounded-2xl bg-brand font-semibold text-brand-ink">
            Better
          </button>
          <button type="button" onClick={() => void finish(false)} className="h-14 rounded-2xl border border-line bg-surface font-semibold">
            About the same
          </button>
        </div>
      ) : step ? (
        <div className="flex flex-col items-center gap-5 rounded-3xl bg-surface p-6 text-center">
          <p className="text-sm text-ink-2">
            Step {stepIndex + 1} of {variant.steps.length}
          </p>
          <h2 className="text-2xl font-semibold">{step.title}</h2>
          <p className="leading-relaxed">{step.text}</p>
          <p className="text-5xl font-semibold tabular-nums">{left}</p>
          <button
            type="button"
            onClick={() => goTo(stepIndex + 1)}
            className={`h-14 w-full rounded-2xl font-semibold ${left === 0 ? "bg-brand text-brand-ink" : "border border-line"}`}
          >
            {stepIndex + 1 < variant.steps.length ? "Next step" : "Finish"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
