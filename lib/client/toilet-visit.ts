"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { kvGet, kvSet, db } from "./db";

/**
 * "Going now": the start time of a visit that is not rated yet. The phone stays outside,
 * so the visit is rated on return. Expires after 3 hours.
 */

const KEY = "toilet_open";
export const OPEN_VISIT_MAX_MS = 3 * 3_600_000;

export type OpenVisit = { startedAt: string };

export async function startVisit(): Promise<void> {
  await kvSet(KEY, { startedAt: new Date().toISOString() } satisfies OpenVisit);
}

export async function clearVisit(): Promise<void> {
  await db().kv.delete(KEY);
}

export async function openVisit(): Promise<OpenVisit | null> {
  const v = await kvGet<OpenVisit>(KEY);
  if (!v) return null;
  return Date.now() - new Date(v.startedAt).getTime() <= OPEN_VISIT_MAX_MS ? v : null;
}

export function useOpenVisit(): OpenVisit | null | undefined {
  return useLiveQuery(() => openVisit(), []);
}
