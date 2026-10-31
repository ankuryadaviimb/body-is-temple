"use client";

import { useEffect } from "react";
import { CloseIcon } from "./icons";

/** Bottom sheet dialog. Closes on backdrop tap or Escape. */
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

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="pb-safe relative w-full max-w-md rounded-t-3xl bg-surface px-5 pt-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-ink-2" aria-label="Close">
            <CloseIcon className="size-5" />
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto pb-4">{children}</div>
      </div>
    </div>
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
    <fieldset className="mb-4">
      <legend className="mb-2 text-sm font-medium text-ink-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
              value === o.value ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface-2 text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
