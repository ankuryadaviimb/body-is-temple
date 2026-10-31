"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";

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

/**
 * The guide: a soft glow and a solid core that grow on the in-breath and settle on the
 * out-breath, inside a faint guide ring. An optional progress ring shows session time.
 */
export function BreathPacer({
  phase,
  inLabel = "Breathe in, let the belly rise",
  outLabel = "Slow “Mooo” out, mouth open",
  readyLabel = "Ready when you are",
  progress,
}: {
  phase: "in" | "out" | "hold";
  inLabel?: string;
  outLabel?: string;
  readyLabel?: string;
  /** 0 to 1, drawn as a thin ring around the guide. */
  progress?: number;
}) {
  const r = 47;
  const c = 2 * Math.PI * r;
  const p = progress === undefined ? null : Math.max(0, Math.min(1, progress));
  return (
    <div data-phase={phase} className="flex flex-col items-center gap-6">
      <div className="relative flex size-64 items-center justify-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full text-brand" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="1.2" />
          {p !== null && p > 0 ? (
            <circle
              className="ring-arc"
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeDasharray={`${p * c} ${c}`}
              transform="rotate(-90 50 50)"
            />
          ) : null}
        </svg>
        <div className="pacer-glow absolute size-60 rounded-full bg-brand/40 blur-2xl" />
        <div className="pacer-core relative size-52 rounded-full bg-linear-to-b from-brand to-brand/60 shadow-[0_0_60px_-10px_var(--brand)]" />
      </div>
      <p className="min-h-14 max-w-xs text-center text-[22px] font-semibold leading-snug tracking-tight" aria-live="polite">
        {phase === "in" ? inLabel : phase === "out" ? outLabel : readyLabel}
      </p>
    </div>
  );
}

/** Header for focused, full-screen sessions: close on the left, context on the right. */
export function SessionHeader({ title, right, href = "/" }: { title?: string; right?: React.ReactNode; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <Link href={href} aria-label="Close" className="pressable flex size-10 items-center justify-center rounded-full bg-surface text-ink-2 shadow-card">
        <CloseIcon className="size-5" />
      </Link>
      {title ? <p className="flex-1 truncate text-center text-[15px] font-semibold text-ink-2">{title}</p> : <span className="flex-1" />}
      <div className="flex min-w-10 justify-end">{right}</div>
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
