import "server-only";
import { ofKind } from "@/lib/domain/day";
import type { StoredEvent } from "@/lib/domain/events";
import { ladderState } from "@/lib/domain/ladder";
import { logicalDayFor } from "@/lib/domain/logical-day";
import type { Settings } from "@/lib/domain/settings";
import type { TodaySnapshot } from "@/lib/domain/snapshot";
import { computeStreak, isOnTrack } from "@/lib/domain/streak";
import { addDays, daysBetween, localParts, localToInstant } from "@/lib/domain/time";
import type { AuthedContext } from "@/lib/supabase/server";
import { getCoachCard } from "./coach-card";
import { anchorsBetween, listEvents } from "./events";
import { loadSettings, saveSettings } from "./settings";

export const HISTORY_DAYS = 60;

export async function currentDay(ctx: AuthedContext, settings: Settings): Promise<string> {
  const now = new Date();
  const p = localParts(now, settings.tz);
  const anchors = await anchorsBetween(
    ctx,
    localToInstant(p.date, 0, settings.tz).toISOString(),
    localToInstant(p.date, 12 * 60, settings.tz).toISOString(),
  );
  return logicalDayFor(now.toISOString(), anchors, settings.tz, settings.day_start_hour);
}

function groupByDay(events: StoredEvent[]): Map<string, StoredEvent[]> {
  const map = new Map<string, StoredEvent[]>();
  for (const e of events) {
    const list = map.get(e.logical_day) ?? [];
    list.push(e);
    map.set(e.logical_day, list);
  }
  return map;
}

/** Yesterday needs this many logs before an AI morning card is worth writing. */
const CARD_MIN_EVENTS = 3;

export async function buildToday(ctx: AuthedContext): Promise<{ snapshot: TodaySnapshot; needsCard: boolean }> {
  let settings = await loadSettings(ctx);
  const today = await currentDay(ctx, settings);
  const from = addDays(today, -(HISTORY_DAYS - 1));
  const events = await listEvents(ctx, from, today);
  const byDay = groupByDay(events);

  const firstDay = events[0]?.logical_day ?? today;
  const span = Math.max(0, daysBetween(firstDay, today));
  const allDays = Array.from({ length: span + 1 }, (_, i) => addDays(firstDay, i));

  const streak = computeStreak(allDays.map((day) => ({ day, onTrack: isOnTrack(byDay.get(day) ?? []) })));

  // Advance the habit ladder using completed days only (never today).
  const since = settings.ladder_since && settings.ladder_since > firstDay ? settings.ladder_since : firstDay;
  const completed = allDays.filter((d) => d >= since && d < today);
  const state = ladderState(completed, byDay, settings, new Map(), settings.ladder_index);
  if (state.index !== settings.ladder_index || (!settings.ladder_since && events.length > 0)) {
    settings = await saveSettings(ctx, {
      ...settings,
      ladder_index: state.index,
      ladder_since: state.index !== settings.ladder_index ? state.startedOn : since,
    });
  }

  const recentVisitCounts = allDays
    .filter((d) => d < today)
    .slice(-7)
    .filter((d) => (byDay.get(d) ?? []).length > 0)
    .map((d) => ofKind(byDay.get(d) ?? [], "toilet").length);

  const yesterday = addDays(today, -1);
  const card = await getCoachCard(ctx, today);
  const needsCard = card.status === "none" && (byDay.get(yesterday) ?? []).length >= CARD_MIN_EVENTS;
  return {
    snapshot: {
      today,
      settings,
      events: [...(byDay.get(yesterday) ?? []), ...(byDay.get(today) ?? [])],
      streak,
      ladder: { index: state.index, heldInWindow: state.heldInWindow, startedOn: state.startedOn },
      recentVisitCounts,
      coachCard: card.card,
      coachCardPending: needsCard || card.status === "pending",
    },
    needsCard,
  };
}
