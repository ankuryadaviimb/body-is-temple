"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { withDefaults, type Settings } from "@/lib/domain/settings";
import type { CachedSnapshot } from "@/lib/domain/snapshot";
import { db, kvGet, type LocalEvent } from "./db";
import { deviceSettings } from "./device";
import { todayLocal } from "./log";
import { onSyncState, type SyncState } from "./sync";

export function useSnapshot(): CachedSnapshot | undefined {
  return useLiveQuery(() => kvGet<CachedSnapshot>("snapshot"), []);
}

export function useSettings(): Settings {
  const stored = useSnapshot()?.settings;
  // Older cached copies may miss newer fields, so fill them in.
  return useMemo(() => (stored ? withDefaults(stored) : deviceSettings()), [stored]);
}

/** The current logical day, recomputed every minute and whenever wake/sleep events change. */
export function useToday(): string | undefined {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const anchorsVersion = useLiveQuery(() => db().events.where("kind").anyOf(["wake", "sleep"]).count(), []);
  const snapshot = useSnapshot();
  return useLiveQuery(() => todayLocal(), [tick, anchorsVersion, snapshot?.settings.tz, snapshot?.settings.day_start_hour]);
}

export function useDayEvents(day: string | undefined): LocalEvent[] | undefined {
  return useLiveQuery(
    () => (day ? db().events.where("logical_day").equals(day).sortBy("occurred_at") : Promise.resolve([] as LocalEvent[])),
    [day],
  );
}

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>({ pending: 0, lastError: null, online: true });
  useEffect(() => onSyncState(setState), []);
  return state;
}

/** Local preview while the photo is on the phone, then the private same-origin URL. */
export function usePhotoUrl(eventId: string, mediaId: string | undefined): string | null {
  const blob = useLiveQuery(() => db().photos.get(eventId), [eventId]);
  const objectUrl = useMemo(() => (blob?.blob ? URL.createObjectURL(blob.blob) : null), [blob]);
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );
  return objectUrl ?? (mediaId ? `/api/media/${mediaId}` : null);
}
