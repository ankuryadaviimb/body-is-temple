"use client";

import Dexie, { type Table } from "dexie";
import type { ClientEventInput, StoredEvent } from "@/lib/domain/events";

/**
 * On-device store (IndexedDB). Every tap is written here first, so logging is instant
 * and works offline; the outbox then syncs to the server in the background.
 * No auth tokens are stored here (the session lives in HttpOnly cookies).
 */

/** synced_at: when the server last confirmed this copy (a reply older than that never overwrites it). */
export type LocalEvent = StoredEvent & { sync: "pending" | "synced" | "error"; synced_at?: number };

/**
 * sent: the request is going out (or went out) on this attempt.
 * everSent: it went out at least once, so the server may have it. Never reset: such an op
 * is frozen, edits become their own patch and deletes always reach the server.
 * failed: the server rejected it; it is kept (paused) until the person retries.
 */
type OpBase = { id?: number; eventId: string; tries: number; createdAt: number; sent?: boolean; everSent?: boolean; failed?: boolean; lastError?: string };

/** Older ops (before everSent existed) only know "sent". */
export const mayBeOnServer = (op: { sent?: boolean; everSent?: boolean }) => Boolean(op.everSent ?? op.sent);

export type OutboxOp =
  | (OpBase & { type: "create"; input: ClientEventInput })
  | (OpBase & { type: "patch"; patch: { occurred_at?: string; payload?: Record<string, unknown> } })
  | (OpBase & { type: "delete" })
  | (OpBase & { type: "photo"; input: ClientEventInput; blob: Blob });

export type KvRow = { key: string; value: unknown };

class TempleDB extends Dexie {
  events!: Table<LocalEvent, string>;
  outbox!: Table<OutboxOp, number>;
  photos!: Table<{ eventId: string; blob: Blob }, string>;
  kv!: Table<KvRow, string>;

  constructor() {
    super("temple");
    this.version(1).stores({
      events: "id, logical_day, occurred_at, kind",
      outbox: "++id, eventId, type",
      photos: "eventId",
      kv: "key",
    });
  }
}

let instance: TempleDB | null = null;

export function db(): TempleDB {
  if (!instance) instance = new TempleDB();
  return instance;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db().kv.get(key))?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db().kv.put({ key, value });
}

/** Wipes everything on this device (used on sign out). */
export async function clearDevice(): Promise<void> {
  await db().delete();
  instance = null;
}
