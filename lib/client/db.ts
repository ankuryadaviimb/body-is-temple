"use client";

import Dexie, { type Table } from "dexie";
import type { ClientEventInput, StoredEvent } from "@/lib/domain/events";

/**
 * On-device store (IndexedDB). Every tap is written here first, so logging is instant
 * and works offline; the outbox then syncs to the server in the background.
 * No auth tokens are stored here (the session lives in HttpOnly cookies).
 */

export type LocalEvent = StoredEvent & { sync: "pending" | "synced" | "error" };

export type OutboxOp =
  | { id?: number; type: "create"; eventId: string; input: ClientEventInput; tries: number; createdAt: number }
  | {
      id?: number;
      type: "patch";
      eventId: string;
      patch: { occurred_at?: string; payload?: Record<string, unknown> };
      tries: number;
      createdAt: number;
    }
  | { id?: number; type: "delete"; eventId: string; tries: number; createdAt: number }
  | { id?: number; type: "photo"; eventId: string; input: ClientEventInput; blob: Blob; tries: number; createdAt: number };

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
