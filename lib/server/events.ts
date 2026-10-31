import "server-only";
import { inferMealSlot } from "@/lib/domain/day";
import {
  PayloadSchemas,
  type ClientEventInput,
  type EventKind,
  type EventSource,
  type MealSlot,
  type StoredEvent,
} from "@/lib/domain/events";
import { affectedCalendarDate, logicalDayFor, type Anchor } from "@/lib/domain/logical-day";
import type { Settings } from "@/lib/domain/settings";
import { addDays, localParts, localToInstant } from "@/lib/domain/time";
import { HttpError } from "@/lib/http/guard";
import type { AuthedContext } from "@/lib/supabase/server";

const COLUMNS = "id, kind, occurred_at, logical_day, source, payload, meta, created_at, updated_at";

/** Events more than 2 days in the future or 2 years in the past are rejected. */
function assertReasonableTime(iso: string) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  if (t > now + 2 * 86_400_000 || t < now - 730 * 86_400_000) {
    throw new HttpError(400, "Event time is out of range");
  }
}

export async function anchorsBetween(ctx: AuthedContext, fromIso: string, toIso: string): Promise<Anchor[]> {
  const { data, error } = await ctx.supabase
    .from("events")
    .select("kind, occurred_at")
    .eq("user_id", ctx.userId)
    .in("kind", ["wake", "sleep"])
    .is("deleted_at", null)
    .gte("occurred_at", fromIso)
    .lte("occurred_at", toIso);
  if (error) throw new Error("anchor_read_failed");
  return (data ?? []).map((r) => ({ kind: r.kind as Anchor["kind"], at: r.occurred_at as string }));
}

async function mealSlotsByDay(ctx: AuthedContext, days: string[]): Promise<Map<string, { at: string; slot: MealSlot }[]>> {
  const map = new Map<string, { at: string; slot: MealSlot }[]>();
  if (days.length === 0) return map;
  const { data, error } = await ctx.supabase
    .from("events")
    .select("logical_day, occurred_at, payload")
    .eq("user_id", ctx.userId)
    .eq("kind", "meal")
    .is("deleted_at", null)
    .in("logical_day", days);
  if (error) throw new Error("meal_read_failed");
  for (const r of data ?? []) {
    const slot = (r.payload as { slot?: MealSlot } | null)?.slot;
    if (!slot) continue;
    const list = map.get(r.logical_day as string) ?? [];
    list.push({ at: r.occurred_at as string, slot });
    map.set(r.logical_day as string, list);
  }
  return map;
}

/**
 * Stores new events idempotently: the client generates each id, so a retried sync
 * (after a dropped connection) never creates duplicates.
 */
export async function insertEvents(
  ctx: AuthedContext,
  inputs: ClientEventInput[],
  source: EventSource,
  settings: Settings,
  extraMeta: (input: ClientEventInput) => Record<string, unknown> = () => ({}),
): Promise<StoredEvent[]> {
  if (inputs.length === 0) return [];
  inputs.forEach((i) => assertReasonableTime(i.occurred_at));
  const sorted = [...inputs].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const tz = settings.tz;

  const first = new Date(sorted[0].occurred_at).getTime() - 86_400_000;
  const last = new Date(sorted.at(-1)!.occurred_at).getTime() + 86_400_000;
  const anchors = await anchorsBetween(ctx, new Date(first).toISOString(), new Date(last).toISOString());
  for (const i of sorted) {
    if (i.kind === "wake" || i.kind === "sleep") anchors.push({ kind: i.kind, at: i.occurred_at });
  }

  const withDays = sorted.map((i) => ({
    input: i,
    day: logicalDayFor(i.occurred_at, anchors, tz, settings.day_start_hour),
  }));
  const slotMap = await mealSlotsByDay(ctx, [...new Set(withDays.filter((w) => w.input.kind === "meal").map((w) => w.day))]);

  const rows = withDays.map(({ input, day }) => {
    let payload: Record<string, unknown> = { ...input.payload };
    let meta: Record<string, unknown> = {};
    if (input.kind === "meal") {
      const earlier = (slotMap.get(day) ?? []).filter((m) => m.at < input.occurred_at).map((m) => m.slot);
      const slot = input.payload.slot ?? inferMealSlot(input.occurred_at, earlier, tz);
      payload = { ...payload, slot };
      slotMap.set(day, [...(slotMap.get(day) ?? []), { at: input.occurred_at, slot }]);
      meta = { ai_status: input.payload.media_id || input.payload.text ? "pending" : "skipped" };
    }
    return {
      id: input.id,
      user_id: ctx.userId,
      kind: input.kind,
      occurred_at: input.occurred_at,
      logical_day: day,
      source,
      payload,
      meta: { ...meta, ...extraMeta(input) },
    };
  });

  const { error } = await ctx.supabase.from("events").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("event_write_failed");

  const anchorDates = new Set(
    sorted
      .filter((i) => i.kind === "wake" || i.kind === "sleep")
      .map((i) => affectedCalendarDate(i.occurred_at, tz))
      .filter((d): d is string => d !== null),
  );
  for (const date of anchorDates) await recomputeMorning(ctx, date, settings);

  return getEvents(ctx, sorted.map((i) => i.id));
}

export async function getEvents(ctx: AuthedContext, ids: string[]): Promise<StoredEvent[]> {
  if (ids.length === 0) return [];
  const { data, error } = await ctx.supabase
    .from("events")
    .select(COLUMNS)
    .eq("user_id", ctx.userId)
    .in("id", ids)
    .is("deleted_at", null)
    .order("occurred_at");
  if (error) throw new Error("event_read_failed");
  return (data ?? []) as StoredEvent[];
}

export async function listEvents(ctx: AuthedContext, fromDay: string, toDay: string): Promise<StoredEvent[]> {
  const { data, error } = await ctx.supabase
    .from("events")
    .select(COLUMNS)
    .eq("user_id", ctx.userId)
    .gte("logical_day", fromDay)
    .lte("logical_day", toDay)
    .is("deleted_at", null)
    .order("occurred_at")
    .limit(5000);
  if (error) throw new Error("event_read_failed");
  return (data ?? []) as StoredEvent[];
}

/** Recomputes logical days for events between local midnight and noon on one date. */
export async function recomputeMorning(ctx: AuthedContext, date: string, settings: Settings): Promise<void> {
  const from = localToInstant(date, 0, settings.tz).toISOString();
  const to = localToInstant(date, 12 * 60, settings.tz).toISOString();
  const anchors = await anchorsBetween(ctx, from, to);
  const { data, error } = await ctx.supabase
    .from("events")
    .select("id, occurred_at, logical_day")
    .eq("user_id", ctx.userId)
    .is("deleted_at", null)
    .gte("occurred_at", from)
    .lt("occurred_at", to);
  if (error) throw new Error("event_read_failed");
  for (const row of data ?? []) {
    const day = logicalDayFor(row.occurred_at as string, anchors, settings.tz, settings.day_start_hour);
    if (day !== row.logical_day) {
      const { error: upErr } = await ctx.supabase
        .from("events")
        .update({ logical_day: day })
        .eq("user_id", ctx.userId)
        .eq("id", row.id);
      if (upErr) throw new Error("event_write_failed");
    }
  }
}

export async function patchEvent(
  ctx: AuthedContext,
  id: string,
  patch: { occurred_at?: string; payload?: Record<string, unknown> },
  settings: Settings,
): Promise<StoredEvent> {
  const [current] = await getEvents(ctx, [id]);
  if (!current) throw new HttpError(404, "Not found");
  const kind = current.kind as EventKind;
  const payload = patch.payload ? { ...current.payload, ...patch.payload } : current.payload;
  const parsed = PayloadSchemas[kind].safeParse(payload);
  if (!parsed.success) throw new HttpError(400, "Invalid request");
  const occurredAt = patch.occurred_at ?? current.occurred_at;
  assertReasonableTime(occurredAt);

  const p = localParts(occurredAt, settings.tz);
  const around = await anchorsBetween(
    ctx,
    localToInstant(addDays(p.date, -1), 0, settings.tz).toISOString(),
    localToInstant(addDays(p.date, 1), 0, settings.tz).toISOString(),
  );
  const anchors = around.filter((a) => !(kind === "wake" || kind === "sleep") || a.at !== current.occurred_at);
  if (kind === "wake" || kind === "sleep") anchors.push({ kind, at: occurredAt });
  const logicalDay = logicalDayFor(occurredAt, anchors, settings.tz, settings.day_start_hour);

  const { error } = await ctx.supabase
    .from("events")
    .update({ occurred_at: occurredAt, payload: parsed.data, logical_day: logicalDay })
    .eq("user_id", ctx.userId)
    .eq("id", id);
  if (error) throw new Error("event_write_failed");

  if (kind === "wake" || kind === "sleep") {
    for (const at of [current.occurred_at, occurredAt]) {
      const date = affectedCalendarDate(at, settings.tz);
      if (date) await recomputeMorning(ctx, date, settings);
    }
  }
  const [updated] = await getEvents(ctx, [id]);
  return updated;
}

/** Soft delete, so a stale offline retry can never bring a deleted event back. */
export async function deleteEvent(ctx: AuthedContext, id: string, settings: Settings): Promise<void> {
  const [current] = await getEvents(ctx, [id]);
  if (!current) return;
  const { error } = await ctx.supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", ctx.userId)
    .eq("id", id);
  if (error) throw new Error("event_write_failed");
  if (current.kind === "wake" || current.kind === "sleep") {
    const date = affectedCalendarDate(current.occurred_at, settings.tz);
    if (date) await recomputeMorning(ctx, date, settings);
  }
}

export async function updateMeta(ctx: AuthedContext, id: string, meta: Record<string, unknown>): Promise<void> {
  const { error } = await ctx.supabase
    .from("events")
    .update({ meta })
    .eq("user_id", ctx.userId)
    .eq("id", id);
  if (error) throw new Error("event_write_failed");
}
