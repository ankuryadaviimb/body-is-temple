"use client";

import { useSyncExternalStore } from "react";
import { removeEvent } from "./log";

/**
 * Delete with Undo, the way Gmail does it: the row disappears at once, and the real
 * delete happens only after the Undo window closes. If the app goes to the background
 * during the window, the delete is committed right away so the intent is never lost.
 */

const UNDO_WINDOW_MS = 6500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
const EMPTY: ReadonlySet<string> = new Set();
let snapshot: ReadonlySet<string> = EMPTY;

function emit() {
  snapshot = timers.size ? new Set(timers.keys()) : EMPTY;
  listeners.forEach((l) => l());
}

async function commit(id: string) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  emit();
  await removeEvent(id);
}

export function scheduleDelete(id: string): void {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(
    id,
    setTimeout(() => void commit(id), UNDO_WINDOW_MS),
  );
  emit();
}

export function cancelDelete(id: string): void {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  emit();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") for (const id of [...timers.keys()]) void commit(id);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ids that are hidden because a delete is waiting for its Undo window to close. */
export function usePendingDeletes(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}
