"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { removeEvent, type LogResult } from "@/lib/client/log";
import { cancelDelete, scheduleDelete } from "@/lib/client/pending-delete";
import type { Feedback } from "@/lib/domain/rules-feedback";
import { AlertIcon, BulbIcon, CheckIcon, TrashIcon } from "./icons";

type Tone = Feedback["tone"] | "info";
type Action = { label: string; run: () => void | Promise<void> };
type Toast = { id: number; text: string; tone: Tone; action?: Action; icon?: "trash" };

type Ctx = {
  show: (text: string, tone?: Tone, action?: Action) => void;
  showFeedback: (f: Feedback | null, fallback?: string) => void;
  /** Shows what was just logged with an Undo button; Undo removes it from phone and server. */
  logged: (result: LogResult, fallback: string) => void;
  /** Hides an entry at once and deletes it after the Undo window, unless Undo is tapped. */
  deleteWithUndo: (eventId: string, label?: string) => void;
};

const ToastContext = createContext<Ctx | null>(null);

const TONE_ICON: Record<Tone, { Icon: (p: { className?: string }) => React.ReactNode; cls: string }> = {
  good: { Icon: CheckIcon, cls: "bg-good/15 text-good" },
  tip: { Icon: BulbIcon, cls: "bg-tip/15 text-tip" },
  care: { Icon: AlertIcon, cls: "bg-care/15 text-care" },
  info: { Icon: CheckIcon, cls: "bg-brand/15 text-brand" },
};

const UNDO_MS = 6500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-1), { ...toast, id }]);
      const readMs = Math.min(8000, 2500 + toast.text.length * 35);
      const ms = Math.max(toast.tone === "care" ? 9000 : readMs, toast.action ? UNDO_MS : 0);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const show = useCallback((text: string, tone: Tone = "info", action?: Action) => push({ text, tone, action }), [push]);

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

  const deleteWithUndo = useCallback(
    (eventId: string, label = "Deleted.") => {
      scheduleDelete(eventId);
      push({ text: label, tone: "info", icon: "trash", action: { label: "Undo", run: () => cancelDelete(eventId) } });
    },
    [push],
  );

  return (
    <ToastContext.Provider value={{ show, showFeedback, logged, deleteWithUndo }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => {
          const tone = TONE_ICON[t.tone];
          const Icon = t.icon === "trash" ? TrashIcon : tone.Icon;
          return (
            <div
              key={t.id}
              className="toast-enter pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-surface-2/95 py-2 pl-2.5 pr-2 text-[15px] leading-snug text-ink shadow-card backdrop-blur-xl"
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${t.icon === "trash" ? "bg-surface-3 text-ink-2" : tone.cls}`}>
                <Icon className="size-4" />
              </span>
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
                  className="pressable h-10 shrink-0 rounded-xl px-3.5 text-[15px] font-semibold text-brand"
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
