"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { removeEvent, type LogResult } from "@/lib/client/log";
import type { Feedback } from "@/lib/domain/rules-feedback";

type Tone = Feedback["tone"] | "info";
type Action = { label: string; run: () => void | Promise<void> };
type Toast = { id: number; text: string; tone: Tone; action?: Action };

type Ctx = {
  show: (text: string, tone?: Tone, action?: Action) => void;
  showFeedback: (f: Feedback | null, fallback?: string) => void;
  /**
   * Shows what was just logged with an Undo button. One tap logs instantly; a mistaken
   * tap is undone with one more tap, and the event is removed from phone and server.
   */
  logged: (result: LogResult, fallback: string) => void;
};

const ToastContext = createContext<Ctx | null>(null);

const TONE: Record<Tone, string> = {
  good: "border-good/40",
  tip: "border-tip/40",
  care: "border-care/50",
  info: "border-line",
};

const UNDO_MS = 6500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (text: string, tone: Tone = "info", action?: Action) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-1), { id, text, tone, action }]);
      const readMs = Math.min(8000, 2500 + text.length * 35);
      const ms = Math.max(tone === "care" ? 9000 : readMs, action ? UNDO_MS : 0);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const showFeedback = useCallback(
    (f: Feedback | null, fallback?: string) => {
      if (f) show(f.text, f.tone);
      else if (fallback) show(fallback, "info");
    },
    [show],
  );

  const logged = useCallback(
    (result: LogResult, fallback: string) => {
      const f = result.feedback;
      show(f?.text ?? fallback, f?.tone ?? "info", {
        label: "Undo",
        run: async () => {
          await removeEvent(result.event.id);
          show("Removed.", "info");
        },
      });
    },
    [show],
  );

  return (
    <ToastContext.Provider value={{ show, showFeedback, logged }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-enter pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border bg-surface py-2 pl-4 pr-2 text-sm leading-snug text-ink shadow-lg ${TONE[t.tone]}`}
          >
            <button type="button" onClick={() => dismiss(t.id)} className="min-h-10 flex-1 py-1 text-left">
              {t.text}
            </button>
            {t.action ? (
              <button
                type="button"
                onClick={async () => {
                  dismiss(t.id);
                  await t.action?.run();
                }}
                className="h-11 shrink-0 rounded-xl bg-surface-2 px-4 font-semibold text-brand"
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
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
