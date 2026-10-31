import type { StoredEvent } from "./events";
import type { Settings } from "./settings";
import type { StreakResult } from "./streak";

/** What GET /api/today returns. Shared by server and client. */
export type TodaySnapshot = {
  today: string;
  settings: Settings;
  /** Events for yesterday and today. */
  events: StoredEvent[];
  streak: StreakResult;
  ladder: { index: number; heldInWindow: number; startedOn: string | null };
  recentVisitCounts: number[];
};

/** The cached part of the snapshot kept on the device (events live in their own table). */
export type CachedSnapshot = Omit<TodaySnapshot, "events"> & { fetchedAt: number };
