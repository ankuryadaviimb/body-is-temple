"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiSend } from "@/lib/client/api";
import { useDayEvents, useSettings, useSnapshot, useSyncState, useToday } from "@/lib/client/hooks";
import { timeLabel } from "@/lib/client/labels";
import { dayEvents, logEvent, updateEvent } from "@/lib/client/log";
import { usePendingDeletes } from "@/lib/client/pending-delete";
import { refreshFromServer } from "@/lib/client/sync";
import { mainMeals, ofKind, waterMl } from "@/lib/domain/day";
import { mealAnalysisOf, payloadOf } from "@/lib/domain/events";
import { buildMorningCard, LADDER } from "@/lib/domain/ladder";
import { computeRings } from "@/lib/domain/rings";
import { nextUp } from "@/lib/domain/next-up";
import { feedbackFor } from "@/lib/domain/rules-feedback";
import { addDays, localParts, minutesBetween } from "@/lib/domain/time";
import {
  ChevronRightIcon,
  CloudOffIcon,
  CupIcon,
  DotsIcon,
  DropIcon,
  FeatherIcon,
  FlameIcon,
  LeafIcon,
  MoonIcon,
  SeatIcon,
  SpoonIcon,
  SunIcon,
  WalkIcon,
  WindIcon,
} from "../icons";
import { Sheet } from "../sheet";
import { TriageSheet } from "../coach/triage-sheet";
import { GasSheet } from "../gas-sheet";
import { useToast } from "../toast";
import { AskCard } from "./ask-card";
import { CoachCardView } from "./coach-card";
import { MealTile } from "./meal-button";
import { MorningCardView } from "./morning-card";
import { MoreSheet } from "./more-sheet";
import { NextUpCard } from "./next-up-card";
import { CornerPill, ProgressBar, RailButton, SectionTitle, Tile } from "./quick-tiles";
import { RingsHero } from "./rings-hero";
import { Timeline } from "./timeline";

function dateLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

function greeting(minutes: number): string {
  if (minutes >= 4 * 60 && minutes < 12 * 60) return "Good morning";
  if (minutes >= 12 * 60 && minutes < 17 * 60) return "Good afternoon";
  return "Good evening";
}

const TEA_SIZES = [
  { ml: 150, label: "Small cup" },
  { ml: 300, label: "Coffee mug" },
  { ml: 400, label: "Large mug" },
];

export function TodayScreen() {
  const today = useToday();
  const settings = useSettings();
  const snapshot = useSnapshot();
  const sync = useSyncState();
  const rawEvents = useDayEvents(today);
  const yesterdayEvents = useDayEvents(today ? addDays(today, -1) : undefined);
  const pendingDeletes = usePendingDeletes();
  const { showFeedback, logged } = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [gasOpen, setGasOpen] = useState(false);
  const [teaOpen, setTeaOpen] = useState(false);
  const [moodFor, setMoodFor] = useState<string | null>(null);
  const [triageOpen, setTriageOpen] = useState(false);

  const events = useMemo(() => rawEvents?.filter((e) => !pendingDeletes.has(e.id)), [rawEvents, pendingDeletes]);
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

  // Show a meal's feedback once, only when its analysis finishes while you are watching
  // (pending, then done). Meals analyzed earlier never pop up when the app opens.
  const watching = useRef(new Set<string>());
  const announced = useRef(new Set<string>());
  useEffect(() => {
    if (!events) return;
    for (const e of events) {
      if (e.kind !== "meal") continue;
      if (e.meta?.ai_status === "pending") watching.current.add(e.id);
      else if (watching.current.has(e.id) && !announced.current.has(e.id) && mealAnalysisOf(e)) {
        announced.current.add(e.id);
        showFeedback(feedbackFor(e, events, { settings, ladderStep: ladderStep.id }));
      }
    }
  }, [events, settings, ladderStep.id, showFeedback]);

  if (!today || !events || !rings) return <TodaySkeleton />;

  const nowMinutes = localParts(new Date(), settings.tz).minutes;
  const wake = ofKind(events, "wake")[0];
  const hasSleep = events.some((e) => e.kind === "sleep");
  const nightTime = nowMinutes >= 21 * 60 || nowMinutes < settings.day_start_hour * 60;

  const meals = mainMeals(events);
  const lastMeal = ofKind(events, "meal").at(-1);
  const visits = ofKind(events, "toilet");
  const lastVisit = visits.at(-1);
  const water = waterMl(events);
  const teas = ofKind(events, "drink").filter((e) => payloadOf(e, "drink")?.type === "tea");

  async function quickLog(kind: "water" | "tea" | "isabgol" | "amla" | "walk", teaMl = settings.tea_ml) {
    const result =
      kind === "water"
        ? await logEvent("water", { ml: 250 })
        : kind === "tea"
          ? await logEvent("drink", { type: "tea", ml: teaMl })
          : kind === "amla"
            ? await logEvent("drink", { type: "amla", ml: 30 })
            : kind === "walk"
              ? await logEvent("walk", { minutes: 10 })
              : await logEvent("isabgol", { tsp: 1, water_ml: 200 });
    const sameKind = (await dayEvents(result.event.logical_day)).filter((e) => e.kind === "water").length;
    const fallback: Record<typeof kind, string> = {
      water: `Water logged · ${(sameKind * 250).toLocaleString("en-IN")} ml today`,
      tea: `Tea logged · ${teaMl} ml`,
      amla: "Amla logged.",
      walk: "10-minute walk logged.",
      isabgol: "Isabgol logged.",
    };
    logged(result, fallback[kind]);
  }

  async function goodMorning() {
    const result = await logEvent("wake", {});
    setMoodFor(result.event.id);
    logged(result, "Wake-up time logged.");
  }

  const nudge = nextUp(events, settings, new Date(), ladderStep.id);
  const coachCard = snapshot?.coachCard && snapshot.coachCard.day === today ? snapshot.coachCard : null;
  const morning = nowMinutes < 12 * 60 && nowMinutes >= settings.day_start_hour * 60;

  const streak = snapshot?.streak;
  const showMood = moodFor !== null && events.some((e) => e.id === moodFor);

  return (
    <main className="fade-in flex flex-col gap-6 pt-2">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">{dateLabel(today)}</p>
          <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">{greeting(nowMinutes)}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-1.5">
          {!sync.online || sync.pending > 0 ? (
            <span className="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-medium text-ink-2 shadow-card" role="status">
              <CloudOffIcon className="size-4" />
              {sync.online ? `${sync.pending} to sync` : "Offline"}
            </span>
          ) : null}
          <span
            className={`flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold shadow-card ${streak && streak.count > 0 ? "bg-fuel/15 text-fuel" : "bg-surface text-ink-3"}`}
            title="Days on track"
          >
            <FlameIcon className="size-4" />
            {streak?.count ?? 0}
          </span>
        </div>
      </header>

      {!wake && !nightTime ? (
        <button type="button" onClick={() => void goodMorning()} className="pressable -mt-2 flex h-14 items-center gap-3 rounded-2xl bg-surface px-4 text-left shadow-card">
          <span className="flex size-9 items-center justify-center rounded-full bg-fuel/15 text-fuel">
            <SunIcon className="size-5" />
          </span>
          <span className="flex-1 text-[15px] font-semibold">Just woke up? Tap to log it</span>
          <ChevronRightIcon className="size-4 text-ink-3" />
        </button>
      ) : null}

      {showMood ? (
        <div className="fade-in -mt-2 rounded-2xl bg-surface p-4 shadow-card">
          <p className="mb-3 text-[15px] font-semibold">How do you feel this morning?</p>
          <div className="flex gap-2">
            {[
              { v: 1, l: "Low" },
              { v: 2, l: "Meh" },
              { v: 3, l: "OK" },
              { v: 4, l: "Good" },
              { v: 5, l: "Great" },
            ].map((m) => (
              <button
                key={m.v}
                type="button"
                onClick={async () => {
                  await updateEvent(moodFor!, { payload: { mood: m.v } });
                  setMoodFor(null);
                }}
                className="pressable h-12 flex-1 rounded-2xl bg-surface-2 text-sm font-semibold"
              >
                {m.l}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setMoodFor(null)} className="mt-2 h-8 w-full text-center text-xs text-ink-3">
            Skip
          </button>
        </div>
      ) : null}

      <RingsHero rings={rings} />

      {nudge ? <NextUpCard nudge={nudge} /> : null}

      {coachCard && morning ? <CoachCardView card={coachCard} /> : null}

      {streak?.atRisk ? (
        <p className="-mt-2 rounded-2xl bg-tip/10 px-4 py-3 text-sm leading-relaxed">
          Yesterday was a miss, and that is fine. One log today keeps your streak going.
        </p>
      ) : null}

      <section aria-label="Quick log">
        <SectionTitle>Log in one tap</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <MealTile
            sub={
              meals.length > 0
                ? `${meals.length} of 3 meals${lastMeal ? ` · ${timeLabel(lastMeal, settings.tz)}` : ""}`
                : "Snap your first meal"
            }
          />
          <Tile
            href="/toilet"
            icon={<SeatIcon className="size-6" />}
            tint="bg-gut/15 text-gut"
            title="Toilet"
            sub={lastVisit ? `${visits.length} today · last ${timeLabel(lastVisit, settings.tz)}` : "Start a guided session"}
            label="Start a toilet session"
          />
          <Tile
            onClick={() => void quickLog("water")}
            icon={<DropIcon className="size-6" />}
            tint="bg-rest/15 text-rest"
            title="Water"
            sub={`${water.toLocaleString("en-IN")} of ${settings.water_target_ml.toLocaleString("en-IN")} ml`}
            label="Log a glass of water, 250 ml"
            corner={<span className="rounded-full bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink-2">+250</span>}
            footer={<ProgressBar value={water} max={settings.water_target_ml} colorClass="text-rest" />}
          />
          <Tile
            onClick={() => void quickLog("tea")}
            icon={<CupIcon className="size-6" />}
            tint="bg-fuel/15 text-fuel"
            title="Tea"
            sub={`${settings.tea_ml} ml${teas.length ? ` · ${teas.length} today` : ""}`}
            label={`Log tea, ${settings.tea_ml} ml`}
            footer={<TeaDots count={teas.length} />}
            corner={
              <CornerPill onClick={() => setTeaOpen(true)} label="Choose a different cup size">
                Size
              </CornerPill>
            }
          />
        </div>

        <div className="no-scrollbar mt-4 flex justify-between gap-1 overflow-x-auto pb-1">
          <RailButton onClick={() => void quickLog("isabgol")} icon={<SpoonIcon className="size-6" />} tint="bg-gut/15 text-gut" label="Isabgol" />
          <RailButton onClick={() => void quickLog("amla")} icon={<LeafIcon className="size-6" />} tint="bg-move/15 text-move" label="Amla" />
          <RailButton onClick={() => void quickLog("walk")} icon={<WalkIcon className="size-6" />} tint="bg-move/15 text-move" label="Walk" />
          <RailButton href="/practice" icon={<FeatherIcon className="size-6" />} tint="bg-gut/15 text-gut" label="Breathe" />
          <RailButton onClick={() => setGasOpen(true)} icon={<WindIcon className="size-6" />} tint="bg-surface text-ink-2 shadow-card" label="Gas" />
          <RailButton onClick={() => setMoreOpen(true)} icon={<DotsIcon className="size-6" />} tint="bg-surface text-ink-2 shadow-card" label="More" />
        </div>
      </section>

      {coachCard && !morning ? <CoachCardView card={coachCard} /> : null}

      <MorningCardView card={card} />

      <AskCard />

      <section aria-label="Feeling off">
        <SectionTitle>Feeling off?</SectionTitle>
        <button
          type="button"
          onClick={() => setTriageOpen(true)}
          className="pressable mb-3 flex w-full items-center gap-3 rounded-[22px] bg-surface p-3.5 text-left shadow-card"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gut/15 text-gut">
            <SeatIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-tight">Feel the urge? Should I go?</span>
            <span className="block text-xs text-ink-3">Two taps, an instant answer</span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
        </button>
        <div className="grid grid-cols-2 gap-3">
          <ResetCard href="/reset/heavy" title="Feeling heavy" sub="2-minute reset" icon={<FeatherIcon className="size-5" />} />
          <ResetCard href="/reset/gas" title="Gas or bloating" sub="2-minute relief" icon={<WindIcon className="size-5" />} />
        </div>
      </section>

      {nightTime && !hasSleep ? (
        <button
          type="button"
          onClick={async () => logged(await logEvent("sleep", {}), "Bedtime logged. Sleep well.")}
          className="pressable flex h-14 items-center gap-3 rounded-2xl bg-rest/15 px-4 text-left"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-rest/20 text-rest">
            <MoonIcon className="size-5" />
          </span>
          <span className="flex-1 text-[15px] font-semibold">Going to bed? Tap to log it</span>
          <ChevronRightIcon className="size-4 text-ink-3" />
        </button>
      ) : null}

      <section aria-label="Today's log">
        <SectionTitle right={events.length ? `${events.length} ${events.length === 1 ? "entry" : "entries"}` : undefined}>Today&apos;s log</SectionTitle>
        <Timeline events={events} tz={settings.tz} />
      </section>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <GasSheet open={gasOpen} onClose={() => setGasOpen(false)} />
      <TriageSheet open={triageOpen} onClose={() => setTriageOpen(false)} />
      <Sheet open={teaOpen} title="Which cup?" onClose={() => setTeaOpen(false)}>
        <p className="mb-4 text-sm leading-relaxed text-ink-2">Logs this cup now and makes it your usual, so one tap on Tea logs it next time.</p>
        <div className="flex flex-col gap-2">
          {TEA_SIZES.map((c) => (
            <button
              key={c.ml}
              type="button"
              onClick={async () => {
                setTeaOpen(false);
                await quickLog("tea", c.ml);
                if (c.ml !== settings.tea_ml) {
                  await apiSend("PUT", "/api/settings", { tea_ml: c.ml }).catch(() => undefined);
                  await refreshFromServer();
                }
              }}
              className={`pressable flex h-14 items-center justify-between rounded-2xl px-4 text-[15px] font-semibold ${c.ml === settings.tea_ml ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
            >
              <span>{c.label}</span>
              <span className="tabular font-medium opacity-80">{c.ml} ml</span>
            </button>
          ))}
        </div>
      </Sheet>
    </main>
  );
}

/** One small dot per cup today, so the Tea tile lines up with the Water tile's bar. */
function TeaDots({ count }: { count: number }) {
  return (
    <span className="flex h-1.5 items-center gap-1" aria-hidden>
      {Array.from({ length: Math.min(count, 8) }, (_, i) => (
        <span key={i} className="size-1.5 rounded-full bg-fuel" />
      ))}
      {count === 0 ? <span className="h-1.5 w-full rounded-full bg-fuel/15" /> : null}
    </span>
  );
}

function ResetCard({ href, title, sub, icon }: { href: string; title: string; sub: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="pressable flex items-center gap-3 rounded-[22px] bg-surface p-3.5 shadow-card">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-ink-2">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-tight">{title}</span>
        <span className="block text-xs text-ink-3">{sub}</span>
      </span>
    </Link>
  );
}

function TodaySkeleton() {
  const block = "animate-pulse rounded-[24px] bg-surface";
  return (
    <main className="flex flex-col gap-6 pt-2" aria-busy="true" aria-label="Loading">
      <div>
        <div className="h-3 w-40 animate-pulse rounded-full bg-surface" />
        <div className="mt-3 h-8 w-56 animate-pulse rounded-full bg-surface" />
      </div>
      <div className={`${block} h-[172px]`} />
      <div className={`${block} h-44 bg-brand-soft`} />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-[136px]`} />
        ))}
      </div>
    </main>
  );
}
