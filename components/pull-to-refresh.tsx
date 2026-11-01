"use client";

import { useEffect, useRef, useState } from "react";
import { refreshFromServer, syncNow, unsyncedCount } from "@/lib/client/sync";

/**
 * Pull down at the top of a screen to sync now: sends anything waiting on the phone,
 * then pulls the latest from the server. Home Screen apps on iPhone have no built-in
 * pull to refresh, so this adds one. Fixed states only (no inline styles, CSP safe).
 */

type Phase = "idle" | "pulling" | "ready" | "syncing" | "done" | "offline";

const THRESHOLD = 72;

export function PullToRefresh() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState(0);
  const start = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    const set = (p: Phase) => {
      phaseRef.current = p;
      setPhase(p);
    };
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || phaseRef.current === "syncing") return;
      start.current = e.touches[0]?.clientY ?? null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - start.current;
      if (dy <= 8 || window.scrollY > 0) {
        if (phaseRef.current === "pulling" || phaseRef.current === "ready") set("idle");
        return;
      }
      set(dy >= THRESHOLD ? "ready" : "pulling");
    };
    const onEnd = async () => {
      const wasReady = phaseRef.current === "ready";
      start.current = null;
      if (!wasReady) {
        if (phaseRef.current === "pulling") set("idle");
        return;
      }
      set("syncing");
      await syncNow();
      const snap = await refreshFromServer();
      const left = await unsyncedCount();
      setPending(left);
      set(snap ? "done" : "offline");
      setTimeout(() => {
        if (phaseRef.current === "done" || phaseRef.current === "offline") set("idle");
      }, 2200);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (phase === "idle") return null;
  const text =
    phase === "pulling"
      ? "Pull to sync"
      : phase === "ready"
        ? "Release to sync"
        : phase === "syncing"
          ? "Syncing..."
          : phase === "done"
            ? pending > 0
              ? `${pending} not saved to the server yet`
              : "All saved. Up to date."
            : "Offline. Your logs are safe on this phone.";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 flex justify-center" role="status" aria-live="polite">
      <span
        className={`fade-in flex h-9 items-center gap-2 rounded-full border border-line bg-surface-2/95 px-4 text-[13px] font-semibold shadow-card backdrop-blur-xl ${phase === "ready" || phase === "done" ? "text-brand" : "text-ink-2"}`}
      >
        {phase === "syncing" ? <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden /> : null}
        {text}
      </span>
    </div>
  );
}
