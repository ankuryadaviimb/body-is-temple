"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { Feedback } from "@/lib/domain/rules-feedback";

type Toast = { id: number; text: string; tone: Feedback["tone"] | "info" };
type Ctx = { show: (text: string, tone?: Toast["tone"]) => void; showFeedback: (f: Feedback | null, fallback?: string) => void };

const ToastContext = createContext<Ctx | null>(null);

const TONE: Record<Toast["tone"], string> = {
  good: "border-good/40",
  tip: "border-tip/40",
  care: "border-care/50",
  info: "border-line",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-1), { id, text, tone }]);
    const ms = tone === "care" ? 9000 : Math.min(7000, 2500 + text.length * 35);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const showFeedback = useCallback(
    (f: Feedback | null, fallback?: string) => {
      if (f) show(f.text, f.tone);
      else if (fallback) show(fallback, "info");
    },
    [show],
  );

  return (
    <ToastContext.Provider value={{ show, showFeedback }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
            className={`toast-enter pointer-events-auto w-full max-w-md rounded-2xl border bg-surface px-4 py-3 text-left text-sm leading-snug text-ink shadow-lg ${TONE[t.tone]}`}
          >
            {t.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
