"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDayEvents, useSettings, useSnapshot, useSyncState, useToday } from "@/lib/client/hooks";
import { logEvent, updateEvent } from "@/lib/client/log";
import { ofKind } from "@/lib/domain/day";
import { mealAnalysisOf } from "@/lib/domain/events";
import { buildMorningCard, LADDER } from "@/lib/domain/ladder";
import { computeRings } from "@/lib/domain/rings";
import { feedbackFor } from "@/lib/domain/rules-feedback";
import { addDays, localParts, minutesBetween } from "@/lib/domain/time";
import { CloudOffIcon, CupIcon, DropIcon, FeatherIcon, FlameIcon, LeafIcon, MoonIcon, SeatIcon, SpoonIcon, SunIcon, WalkIcon, WindIcon } from "../icons";
import { RingView } from "../ring";
import { Choice, Sheet } from "../sheet";
import { useToast } from "../toast";
import { MealButtons } from "./meal-button";
import { MorningCardView } from "./morning-card";
import { MoreSheet } from "./more-sheet";
import { Timeline } from "./timeline";

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function TodayScreen() {
  const today = useToday();
  const settings = useSettings();
  const snapshot = useSnapshot();
  const sync = useSyncState();
  const events = useDayEvents(today);
  const yesterdayEvents = useDayEvents(today ? addDays(today, -1) : undefined);
  const { show, showFeedback } = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [gasOpen, setGasOpen] = useState(false);
  const [moodFor, setMoodFor] = useState<string | null>(null);

  const ladderIndex = snapshot?.ladder.index ?? 0;
  const ladderStep = LADDER[ladderIndex] ?? LADDER[0];

  const card = useMemo(
    () =>
      buildMorningCard(
        yesterdayEvents ?? null,
        snapshot?.recentVisitCounts ?? [],
        { index: ladderIndex, step: ladderStep, heldInWindow: snapshot?.ladder.heldInWindow ?? 0, startedOn: snapshot?.ladder.startedOn ?? null },
        settings,
      ),
    [yesterdayEvents, snapshot, ladderIndex, ladderStep, settings],
  );

  const rings = useMemo(() => {
    if (!today || !events) return null;
    const wake = ofKind(events, "wake")[0];
    const lastSleep = ofKind(yesterdayEvents ?? [], "sleep").at(-1);
    const sleepMinutes = wake && lastSleep ? Math.round(minutesBetween(lastSleep.occurred_at, wake.occurred_at)) : null;
    return computeRings(events, {
      settings,
      weekday: weekdayOf(today),
      isToday: true,
      sleepMinutes: sleepMinutes !== null && sleepMinutes > 0 && sleepMinutes < 16 * 60 ? sleepMinutes : null,
      steps: null,
    });
  }, [today, events, yesterdayEvents, settings]);

  // When a meal analysis arrives during this session, show its feedback once.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!events) return;
    const analyzed = events.filter((e) => e.kind === "meal" && mealAnalysisOf(e));
    if (seen.current === null) {
      seen.current = new Set(analyzed.map((e) => e.id));
      return;
    }
    for (const e of analyzed) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      showFeedback(feedbackFor(e, events, { settings, ladderStep: ladderStep.id }));
    }
  }, [events, settings, ladderStep.id, showFeedback]);

  if (!today || !events) {
    return <div className="py-20 text-center text-ink-2">Loading...</div>;
  }

  const hasWake = events.some((e) => e.kind === "wake");
  const hasSleep = events.some((e) => e.kind === "sleep");
  const nowMinutes = localParts(new Date(), settings.tz).minutes;
  const nightTime = nowMinutes >= 21 * 60 || nowMinutes < settings.day_start_hour * 60;

  async function quickLog(kind: "water" | "tea" | "isabgol" | "amla" | "walk") {
    const result =
      kind === "water"
        ? await logEvent("water", { ml: 250 })
        : kind === "tea"
          ? await logEvent("drink", { type: "tea", ml: 150 })
          : kind === "amla"
            ? await logEvent("drink", { type: "amla", ml: 30 })
            : kind === "walk"
              ? await logEvent("walk", { minutes: 10 })
              : await logEvent("isabgol", { tsp: 1, water_ml: 200 });
    const fallback: Record<typeof kind, string> = {
      water: "Water logged.",
      tea: "Small cup of tea logged.",
      amla: "Amla logged.",
      walk: "Walk logged.",
      isabgol: "Isabgol logged.",
    };
    showFeedback(result.feedback, fallback[kind]);
  }

  async function goodMorning() {
    const { event } = await logEvent("wake", {});
    setMoodFor(event.id);
  }

  async function goodNight() {
    await logEvent("sleep", {});
    show("Good night. Sleep well.", "info");
  }

  const streak = snapshot?.streak;

  return (
    <main className="flex flex-col gap-5 pt-2">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-2">{dayLabel(today)}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        </div>
        <div className="flex items-center gap-2">
          {!sync.online || sync.pending > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-2" role="status">
              <CloudOffIcon className="size-4" />
              {sync.online ? `${sync.pending} to sync` : "Offline"}
            </span>
          ) : null}
          {streak && streak.count > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-fuel/15 px-3 py-1 text-sm font-semibold" title="Days on track">
              <FlameIcon className="size-4 text-fuel" />
              {streak.count}
            </span>
          ) : null}
        </div>
      </header>

      {!hasWake && !nightTime ? (
        <button type="button" onClick={goodMorning} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-surface font-semibold shadow-sm">
          <SunIcon className="size-6 text-fuel" /> Good morning
        </button>
      ) : null}

      {moodFor ? (
        <div className="rounded-2xl bg-surface p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium">How do you feel this morning? (optional)</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((m) => (
              <button
                key={m}
                type="button"
                onClick={async () => {
                  await updateEvent(moodFor, { payload: { mood: m } });
                  setMoodFor(null);
                }}
                className="h-11 flex-1 rounded-xl bg-surface-2 font-semibold"
              >
                {m}
              </button>
            ))}
            <button type="button" onClick={() => setMoodFor(null)} className="h-11 rounded-xl px-3 text-sm text-ink-2">
              Skip
            </button>
          </div>
        </div>
      ) : null}

      <MorningCardView card={card} />

      {streak?.atRisk ? (
        <p className="rounded-2xl bg-tip/10 px-4 py-3 text-sm">Yesterday was a miss, and that is fine. One log today keeps your streak going.</p>
      ) : null}

      {rings ? (
        <section className="flex justify-between rounded-3xl bg-surface px-4 py-4 shadow-sm" aria-label="Rings">
          {rings.map((r) => (
            <RingView key={r.id} ring={r} />
          ))}
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3" aria-label="Quick log">
        <MealButtons />
        <Link href="/toilet" className="flex h-24 flex-col items-center justify-center gap-1 rounded-3xl bg-gut/15 font-semibold">
          <SeatIcon className="size-8 text-gut" />
          Toilet
        </Link>
        <button type="button" onClick={() => void quickLog("water")} className="flex h-20 flex-col items-center justify-center gap-1 rounded-3xl bg-surface font-semibold shadow-sm">
          <DropIcon className="size-7 text-rest" />
          Water +1
        </button>
        <button type="button" onClick={() => void quickLog("tea")} className="flex h-20 flex-col items-center justify-center gap-1 rounded-3xl bg-surface font-semibold shadow-sm">
          <CupIcon className="size-7 text-fuel" />
          Tea (small)
        </button>
      </section>

      <section className="flex flex-wrap gap-2" aria-label="More quick logs">
        <Chip onClick={() => void quickLog("isabgol")} icon={<SpoonIcon className="size-5" />} label="Isabgol" />
        <Chip onClick={() => void quickLog("amla")} icon={<LeafIcon className="size-5" />} label="Amla" />
        <Chip onClick={() => void quickLog("walk")} icon={<WalkIcon className="size-5" />} label="Walk 10 min" />
        <Chip href="/practice" icon={<FeatherIcon className="size-5" />} label="Breathing practice" />
        <Chip onClick={() => setGasOpen(true)} icon={<WindIcon className="size-5" />} label="Gas level" />
        <Chip onClick={() => setMoreOpen(true)} label="More..." />
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="Feeling off">
        <Link href="/reset/heavy" className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold">
          Feeling heavy
          <span className="block text-xs font-normal text-ink-2">2-minute reset</span>
        </Link>
        <Link href="/reset/gas" className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold">
          Gassy or bloated
          <span className="block text-xs font-normal text-ink-2">2-minute relief</span>
        </Link>
      </section>

      {nightTime && !hasSleep ? (
        <button type="button" onClick={() => void goodNight()} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-rest/15 font-semibold">
          <MoonIcon className="size-6 text-rest" /> Good night
        </button>
      ) : null}

      <section aria-label="Today's log">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-2">Today&apos;s log</h2>
        <Timeline events={events} tz={settings.tz} />
      </section>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <GasSheet open={gasOpen} onClose={() => setGasOpen(false)} />
    </main>
  );
}

function Chip({ label, icon, onClick, href }: { label: string; icon?: React.ReactNode; onClick?: () => void; href?: string }) {
  const cls = "flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-medium";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  );
}

function GasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showFeedback } = useToast();
  return (
    <Sheet open={open} title="How gassy do you feel?" onClose={onClose}>
      <Choice
        label="0 is none, 4 is very bloated"
        value={undefined}
        onChange={async (level: number) => {
          const { feedback } = await logEvent("gas", { level });
          showFeedback(feedback, "Saved.");
          onClose();
        }}
        options={[0, 1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))}
      />
    </Sheet>
  );
}
