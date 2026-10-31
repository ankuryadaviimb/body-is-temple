"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

const noop = () => () => {};

/**
 * iOS-style bottom sheet. Closes on backdrop tap or Escape. Rendered into <body> so no
 * transformed or clipped parent can trap it under the tab bar.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onClient = useSyncExternalStore(noop, () => true, () => false);
  if (!open || !onClient) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="fade-in absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="sheet-enter pb-safe relative w-full max-w-md rounded-t-[28px] border-t border-line bg-surface px-5 pt-2.5 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-3" aria-hidden />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} className="pressable flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2" aria-label="Close">
            <CloseIcon className="size-4" />
          </button>
        </div>
        <div className="max-h-[72dvh] overflow-y-auto pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Segmented single-choice control with large touch targets. */
export function Choice<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={`pressable min-h-11 rounded-2xl px-4 text-[15px] font-medium ${
                active ? "bg-brand text-brand-ink shadow-card" : "bg-surface-2 text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
