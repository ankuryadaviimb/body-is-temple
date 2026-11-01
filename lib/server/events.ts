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
import { findUsual, usualMealMeta } from "@/lib/domain/usual-foods";
import { affectedCalendarDate, logicalDayFor, type Anchor } from "@/lib/domain/logical-day";
import type { Settings } from "@/lib/domain/settings";
import { addDays, localParts, localToInstant } from "@/lib/domain/time";
import { HttpError } from "@/lib/http/guard";
import { purgeMedia } from "./media";
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
      // A usual food carries its label values, so it is done at once with no AI call.
      const usual = input.payload.media_id ? null : findUsual(settings.usual_foods, input.payload.usual);
      meta = usual ? usualMealMeta(usual) : { ai_status: input.payload.media_id || input.payload.text ? "pending" : "skipped" };
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

/** Rows per page. The database API returns at most 1,000 rows per request. */
const PAGE = 1000;
const MAX_PAGES = 10;

/**
 * Events for a range of logical days, oldest first. Reads page by page, because one
 * request is capped at 1,000 rows and a capped read would silently drop the newest days.
 */
export async function listEvents(ctx: AuthedContext, fromDay: string, toDay: string): Promise<StoredEvent[]> {
  const all: StoredEvent[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await ctx.supabase
      .from("events")
      .select(COLUMNS)
      .eq("user_id", ctx.userId)
      .gte("logical_day", fromDay)
      .lte("logical_day", toDay)
      .is("deleted_at", null)
      .order("occurred_at")
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error("event_read_failed");
    const rows = (data ?? []) as StoredEvent[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
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

export type EventChange = { payload?: Record<string, unknown>; meta?: Record<string, unknown>; occurred_at?: string; logical_day?: string };

/**
 * Changes one event starting from the row as it is now. The write only lands if nobody
 * changed the row in between (compare-and-swap on updated_at, which a trigger moves on
 * every write); otherwise the row is read again and the change worked out again. So a
 * background AI write and an edit from the phone can never undo each other.
 * `change` returns null when there is nothing to do.
 */
export async function changeEvent(
  ctx: AuthedContext,
  id: string,
  change: (current: StoredEvent) => EventChange | null | Promise<EventChange | null>,
): Promise<{ event: StoredEvent | null; written: boolean }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [current] = await getEvents(ctx, [id]);
    if (!current) return { event: null, written: false };
    const next = await change(current);
    if (!next) return { event: current, written: false };
    const { data, error } = await ctx.supabase
      .from("events")
      .update(next)
      .eq("user_id", ctx.userId)
      .eq("id", id)
      .eq("updated_at", current.updated_at)
      .is("deleted_at", null)
      .select(COLUMNS);
    if (error) throw new Error("event_write_failed");
    if (data && data.length > 0) return { event: data[0] as StoredEvent, written: true };
  }
  throw new Error("event_write_conflict");
}

/** Adds fields to an event's meta, keeping everything else on it as it is now. */
export async function mergeMeta(ctx: AuthedContext, id: string, fields: Record<string, unknown>): Promise<StoredEvent | null> {
  return (await changeEvent(ctx, id, (current) => ({ meta: { ...current.meta, ...fields } }))).event;
}

/**
 * Applies an edit from the phone. `metaFor` may add meta fields in the same atomic write
 * (for example "slot picked by hand"), worked out from the row as it is at that moment.
 */
export async function patchEvent(
  ctx: AuthedContext,
  id: string,
  patch: { occurred_at?: string; payload?: Record<string, unknown> },
  settings: Settings,
  metaFor?: (current: StoredEvent, payload: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<StoredEvent> {
  let previousAt: string | null = null;
  const { event } = await changeEvent(ctx, id, async (current) => {
    previousAt = current.occurred_at;
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
    const extra = metaFor?.(current, parsed.data as Record<string, unknown>) ?? null;
    return {
      occurred_at: occurredAt,
      payload: parsed.data as Record<string, unknown>,
      logical_day: logicalDay,
      ...(extra ? { meta: { ...current.meta, ...extra } } : {}),
    };
  });
  if (!event) throw new HttpError(404, "Not found");

  if (event.kind === "wake" || event.kind === "sleep") {
    for (const at of new Set([previousAt ?? event.occurred_at, event.occurred_at])) {
      const date = affectedCalendarDate(at, settings.tz);
      if (date) await recomputeMorning(ctx, date, settings);
    }
  }
  const [updated] = await getEvents(ctx, [id]);
  return updated ?? event;
}

/**
 * Deletes an entry. The row stays only as an id with a deletion time (so a late retry
 * from a phone cannot bring it back); its contents, kind and time are cleared and a meal
 * photo is removed.
 */
export async function deleteEvent(ctx: AuthedContext, id: string, settings: Settings): Promise<void> {
  const [current] = await getEvents(ctx, [id]);
  // Only the id and the deletion time stay: the kind and time of what was deleted go too.
  const now = new Date().toISOString();
  const tombstone = { deleted_at: now, payload: {}, meta: {}, kind: "note", occurred_at: now, logical_day: localParts(now, settings.tz).date };
  if (!current) {
    // Not here (yet): the phone may have given up waiting on a create that is still being
    // saved. A deleted placeholder makes that late create a no-op (inserts skip known ids).
    const { error } = await ctx.supabase.from("events").upsert({ id, user_id: ctx.userId, source: "app", ...tombstone }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error("event_write_failed");
  }
  // Also covers a create that landed between the read above and the placeholder.
  const { error } = await ctx.supabase.from("events").update(tombstone).eq("user_id", ctx.userId).eq("id", id).is("deleted_at", null);
  if (error) throw new Error("event_write_failed");
  if (!current) return;
  const mediaId = typeof current.payload.media_id === "string" ? current.payload.media_id : null;
  if (mediaId) await purgeMedia(ctx, mediaId).catch(() => undefined);
  if (current.kind === "wake" || current.kind === "sleep") {
    const date = affectedCalendarDate(current.occurred_at, settings.tz);
    if (date) await recomputeMorning(ctx, date, settings);
  }
}

/**
 * After a time zone or day-start change, puts every recent entry back on the right
 * logical day (the last 120 days). Returns how many entries moved.
 */
export async function replaceAllDays(ctx: AuthedContext, settings: Settings, todayIso: string): Promise<number> {
  const from = new Date(new Date(todayIso).getTime() - 121 * 86_400_000).toISOString();
  const to = new Date(new Date(todayIso).getTime() + 2 * 86_400_000).toISOString();
  const rows: { id: string; kind: string; occurred_at: string; logical_day: string }[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await ctx.supabase
      .from("events")
      .select("id, kind, occurred_at, logical_day")
      .eq("user_id", ctx.userId)
      .is("deleted_at", null)
      .gte("occurred_at", from)
      .lte("occurred_at", to)
      .order("occurred_at")
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error("event_read_failed");
    rows.push(...((data ?? []) as typeof rows));
    if ((data ?? []).length < PAGE) break;
  }
  const anchors: Anchor[] = rows.filter((r) => r.kind === "wake" || r.kind === "sleep").map((r) => ({ kind: r.kind as Anchor["kind"], at: r.occurred_at }));
  const moves = rows
    .map((r) => ({ id: r.id, day: logicalDayFor(r.occurred_at, anchors, settings.tz, settings.day_start_hour), was: r.logical_day }))
    .filter((m) => m.day !== m.was);
  let moved = 0;
  for (let i = 0; i < moves.length; i += 500) {
    const chunk = moves.slice(i, i + 500);
    const { data, error } = await ctx.supabase.rpc("set_logical_days", { p_ids: chunk.map((m) => m.id), p_days: chunk.map((m) => m.day) });
    if (error) throw new Error("event_write_failed");
    moved += typeof data === "number" ? data : 0;
  }
  return moved;
}
