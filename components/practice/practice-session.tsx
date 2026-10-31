"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logEvent } from "@/lib/client/log";
import { PRACTICE_STEPS } from "@/lib/content/resets";
import { BreathPacer, useBreathCycle, useWakeLock } from "../breath-pacer";
import { useToast } from "../toast";

const TARGET_MS = 5 * 60_000;

/** Five minutes of belly breathing with a pelvic floor "drop". Logs itself when done. */
export function PracticeSession() {
  const router = useRouter();
  const { showFeedback } = useToast();
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saved, setSaved] = useState(false);
  const { phase, breaths } = useBreathCycle(running);
  useWakeLock(running);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const elapsed = startedAt ? now - startedAt : 0;
  const remaining = Math.max(0, TARGET_MS - elapsed);

  useEffect(() => {
    if (running && remaining === 0 && !saved) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, running, saved]);

  async function finish() {
    setRunning(false);
    if (saved) return;
    setSaved(true);
    const seconds = Math.round(elapsed / 1000);
    if (seconds >= 60) {
      const { feedback } = await logEvent("practice", { type: "breathing", duration_s: seconds }, { at: new Date(startedAt ?? Date.now()) });
      showFeedback(feedback, "Practice saved.");
    }
    router.push("/");
  }

  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);

  return (
    <main className="flex flex-col items-center gap-6 pt-4">
      <h1 className="self-start text-xl font-semibold">Breathing practice</h1>
      {!running && !startedAt ? (
        <ol className="space-y-2 rounded-2xl bg-surface p-4 text-sm leading-relaxed">
          {PRACTICE_STEPS.map((s, i) => (
            <li key={s}>
              <span className="font-semibold">{i + 1}.</span> {s}
            </li>
          ))}
        </ol>
      ) : null}
      <BreathPacer phase={phase} inLabel="Breathe in, let the pelvic floor drop" outLabel="Slow breath out, stay soft below" />
      <p className="text-3xl font-semibold tabular-nums">
        {mins}:{String(secs).padStart(2, "0")}
      </p>
      <p className="text-sm text-ink-2">{breaths} breaths</p>
      {running ? (
        <button type="button" onClick={() => void finish()} className="h-14 w-full rounded-2xl border border-line bg-surface font-semibold">
          Finish now
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setStartedAt(Date.now());
            setNow(Date.now());
            setRunning(true);
          }}
          className="h-14 w-full rounded-2xl bg-brand font-semibold text-brand-ink"
        >
          Start 5 minutes
        </button>
      )}
    </main>
  );
}
