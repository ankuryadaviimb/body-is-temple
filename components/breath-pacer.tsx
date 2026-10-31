"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Breathing guide: breathe in for 4 seconds (belly out, pelvic floor drops), then a slow
 * "Mooo" out for 7 seconds. Pushing only ever rides on the out-breath.
 */
export const INHALE_MS = 4000;
export const EXHALE_MS = 7000;

export function useBreathCycle(running: boolean) {
  const [cyclePhase, setPhase] = useState<"in" | "out">("in");
  const [breaths, setBreaths] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const inhale = () => {
      if (cancelled) return;
      setPhase("in");
      timer.current = setTimeout(exhale, INHALE_MS);
    };
    const exhale = () => {
      if (cancelled) return;
      setPhase("out");
      timer.current = setTimeout(() => {
        setBreaths((b) => b + 1);
        inhale();
      }, EXHALE_MS);
    };
    timer.current = setTimeout(inhale, 0);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [running]);

  const phase: "in" | "out" | "hold" = running ? cyclePhase : "hold";
  return { phase, breaths, reset: () => setBreaths(0) };
}

export function BreathPacer({
  phase,
  inLabel = "Breathe in, belly out, let it drop",
  outLabel = "Slow 'Mooo' out, mouth open",
}: {
  phase: "in" | "out" | "hold";
  inLabel?: string;
  outLabel?: string;
}) {
  return (
    <div data-phase={phase} className="flex flex-col items-center gap-5">
      <div className="relative flex size-60 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-brand/25" />
        <div className="pacer-circle size-60 rounded-full bg-brand/80" />
      </div>
      <p className="min-h-12 max-w-xs text-center text-lg font-medium text-ink" aria-live="polite">
        {phase === "in" ? inLabel : phase === "out" ? outLabel : "Ready"}
      </p>
    </div>
  );
}

/** Keeps the screen awake during a session where supported (Screen Wake Lock API). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* not allowed right now, ignore */
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
