"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { CoachScreen } from "@/components/coach/coach-screen";
import { InsightsScreen } from "@/components/insights/insights-screen";
import { MemoryScreen } from "@/components/memory/memory-screen";
import { HistoryScreen } from "@/components/history/history-screen";
import { PracticeSession } from "@/components/practice/practice-session";
import { ResetRoutineView } from "@/components/reset/reset-routine";
import { SettingsScreen } from "@/components/settings/settings-screen";
import { ToastProvider } from "@/components/toast";
import { TodayScreen } from "@/components/today/today-screen";
import { ToiletSession } from "@/components/toilet/toilet-session";
import { db, kvSet, type LocalEvent } from "@/lib/client/db";
import { RESETS } from "@/lib/content/resets";
import type { CoachMessage } from "@/lib/domain/coach/message";
import type { EventKind } from "@/lib/domain/events";
import type { MemoryFile } from "@/lib/domain/memory";
import type { ToleranceReport } from "@/lib/domain/tolerance";
import { logicalDayFor } from "@/lib/domain/logical-day";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import type { CachedSnapshot } from "@/lib/domain/snapshot";
import { addDays, localToInstant } from "@/lib/domain/time";

const TZ = "Asia/Kolkata";

/** Made-up sample data for design review only. */
function sampleDay(day: string, items: [string, EventKind, Record<string, unknown>, Record<string, unknown>?][]): LocalEvent[] {
  return items.map(([hhmm, kind, payload, meta], i) => {
    const [h, m] = hhmm.split(":").map(Number);
    const date = h < 5 ? addDays(day, 1) : day;
    const at = localToInstant(date, h * 60 + m, TZ).toISOString();
    return {
      id: `00000000-0000-4000-8000-${String(i).padStart(4, "0")}${day.replaceAll("-", "")}`.slice(0, 36),
      kind,
      occurred_at: at,
      logical_day: logicalDayFor(at, [], TZ),
      source: "app",
      payload,
      meta: meta ?? {},
      created_at: at,
      updated_at: at,
      sync: "synced",
    };
  });
}

const meal = (items: string[], tags: string[], protein: [number, number], kcal: [number, number]) => ({
  ai_status: "done",
  analysis: {
    items: items.map((name) => ({ name, qty: null, unit: null })),
    tags,
    protein_g: { low: protein[0], high: protein[1] },
    kcal: { low: kcal[0], high: kcal[1] },
    slot_guess: null,
    confidence: 0.85,
    notes: null,
  },
});

async function seed() {
  const today = logicalDayFor(new Date().toISOString(), [], TZ);
  const yesterday = addDays(today, -1);
  const settings = { ...DEFAULT_SETTINGS, tz: TZ, weight_kg: 72, protein_target_g: 85 };
  const todayEvents = sampleDay(today, [
    ["08:50", "wake", { mood: 4 }],
    ["08:52", "water", { ml: 250 }],
    ["08:55", "drink", { type: "amla", ml: 30 }],
    ["09:20", "toilet", { duration_s: 260, passed: true, bristol: 4, breath_hold: "no", strain: 1, complete: "yes", satisfaction: 4 }],
    ["09:40", "drink", { type: "tea", ml: 300 }],
    ["10:05", "meal", { slot: "breakfast" }, meal(["poha", "papaya"], ["cooked_veg", "fruit"], [8, 12], [320, 420])],
    ["11:30", "water", { ml: 250 }],
    ["13:30", "meal", { slot: "lunch" }, meal(["2 roti", "moong dal", "cucumber raita"], ["dal", "dairy", "cooked_veg"], [16, 22], [450, 560])],
    ["13:55", "walk", { minutes: 10 }],
    ["15:10", "water", { ml: 250 }],
    ["16:00", "practice", { type: "breathing", duration_s: 300 }],
  ]);
  const yesterdayEvents = sampleDay(yesterday, [
    ["09:05", "toilet", { duration_s: 300, passed: true, bristol: 6, breath_hold: "some" }],
    ["09:50", "toilet", { duration_s: 420, passed: true, bristol: 6, bladder_full: true }],
    ["13:30", "meal", { slot: "lunch" }, meal(["poori", "chana masala"], ["fried", "legume"], [14, 20], [700, 900])],
    ["20:40", "meal", { slot: "dinner" }, meal(["idli", "sambhar"], ["dal"], [10, 14], [350, 450])],
    ["21:30", "gas", { level: 3 }],
    ["01:05", "isabgol", { tsp: 1, water_ml: 200 }],
  ]);
  await db().events.clear();
  await db().events.bulkPut([...todayEvents, ...yesterdayEvents]);
  const snapshot: CachedSnapshot = {
    today,
    settings,
    streak: { count: 4, atRisk: false, freezesLeft: 2, frozenDays: [], freshStart: false },
    ladder: { index: 0, heldInWindow: 2, startedOn: addDays(today, -3) },
    recentVisitCounts: [3, 3, 2, 3],
    fetchedAt: Date.now(),
  };
  await kvSet("snapshot", { ...snapshot, coachCard: SAMPLE_CARD(today), coachCardPending: false });
  await kvSet("tz_adopted", true);
  await kvSet("coach_messages", SAMPLE_MESSAGES(today));
  await kvSet("insights", { report: SAMPLE_REPORT, windowDays: 90, fetchedAt: Date.now() });
  await kvSet("memory", SAMPLE_MEMORY);
}

const SAMPLE_CARD = (day: string) => ({
  day,
  provider: "sample",
  headline: "A lighter day yesterday, and a calmer night",
  went_well: ["Isabgol on time, 95 minutes after dinner", "A 10-minute walk after lunch"],
  to_fix: "Two rounds this morning with some breath holding. Breathe out on every push.",
  one_thing: "Stop at 2 rounds. If the pull comes back, do the 2-minute reset first.",
  class_tip: "Class at 7 AM: sip water before, and breathe out on every effort.",
});

const SAMPLE_MESSAGES = (day: string): CoachMessage[] => [
  {
    id: "00000000-0000-4000-8000-00000000c001",
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    logical_day: day,
    intent: "gas",
    question: "Why do I feel so gassy?",
    quick: null,
    answer: {
      headline: "Most likely yesterday's poori and chana lunch, with a late Isabgol",
      why: [
        "Poori and chana masala at lunch yesterday (1:30 PM): beans plus fried food, a common gas maker.",
        "Your logs: gas 3.1 vs 1.4 on days with chana (6 days with, 9 without).",
        "No walk after lunch yesterday.",
      ],
      good: ["Today's lunch was gentle: roti, moong dal and raita"],
      now: ["Walk for 10 minutes.", "Then knees to chest or hips up for 2 minutes."],
      watch: ["Tonight's gas level, so Temple can confirm the chana pattern."],
      doctor: null,
      actions: ["log_walk", "reset_gas", "log_gas"],
      remember: ["Chana at lunch gives me gas by evening"],
      confidence: "medium",
    },
    status: "done",
    provider: "sample",
  },
  {
    id: "00000000-0000-4000-8000-00000000c002",
    created_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    logical_day: addDays(day, -1),
    intent: "dinner",
    question: "What should I eat for dinner tonight?",
    quick: null,
    answer: {
      headline: "Keep dinner light tonight",
      why: ["You already had poori and chana at lunch."],
      good: [],
      now: ["Moong dal khichdi with curd", "Roti with lauki sabzi", "Curd rice"],
      watch: ["Finish by 10:00 PM, then Isabgol about 90 minutes later."],
      doctor: null,
      actions: [],
      remember: [],
      confidence: "medium",
    },
    status: "done",
    provider: "sample",
  },
];

const SAMPLE_REPORT: ToleranceReport = {
  daysLogged: 24,
  daysWithMeals: 21,
  findings: [
    {
      exposure: { key: "food:chana", label: "Chana", kind: "food" },
      outcome: "evening_gas",
      withDays: 6,
      withoutDays: 9,
      withMean: 3.1,
      withoutMean: 1.4,
      diff: 1.7,
      effect: "worse",
      strength: "early",
    },
    {
      exposure: { key: "food:chana", label: "Chana", kind: "food" },
      outcome: "next_rounds",
      withDays: 6,
      withoutDays: 9,
      withMean: 2.8,
      withoutMean: 2.1,
      diff: 0.7,
      effect: "worse",
      strength: "early",
    },
    {
      exposure: { key: "habit:isabgol_late", label: "Isabgol over 2.5 h after dinner", kind: "habit" },
      outcome: "next_smooth",
      withDays: 8,
      withoutDays: 7,
      withMean: 0.25,
      withoutMean: 0.57,
      diff: -0.32,
      effect: "worse",
      strength: "early",
    },
    {
      exposure: { key: "habit:walk_after_meal", label: "Walk after a meal", kind: "habit" },
      outcome: "evening_gas",
      withDays: 10,
      withoutDays: 11,
      withMean: 1.3,
      withoutMean: 2.4,
      diff: -1.1,
      effect: "better",
      strength: "steady",
    },
  ],
  learning: [
    { exposure: { key: "food:peanuts", label: "Peanuts", kind: "food" }, withDays: 3, withoutDays: 18 },
    { exposure: { key: "food:poori", label: "Poori", kind: "food" }, withDays: 2, withoutDays: 19 },
    { exposure: { key: "tag:raw_night", label: "Raw salad at night", kind: "tag" }, withDays: 1, withoutDays: 20 },
  ],
  outcomeDays: { evening_gas: 15, next_rounds: 20, next_smooth: 17, heavy: 21 },
};

const SAMPLE_MEMORY: MemoryFile[] = [
  { slug: "profile", content: "- Sample note: usually 2 to 3 morning rounds.\n- Sample note: a heavy feeling some afternoons.", version: 1, updated_at: new Date().toISOString() },
  { slug: "gut", content: "- Feet on a stool, breathe out on every push.\n- 5 minutes at most.\n- Isabgol about 90 minutes after dinner.", version: 2, updated_at: new Date().toISOString() },
  { slug: "foods", content: "- Idea to test: chana and fried food at the same meal.", version: 1, updated_at: new Date().toISOString() },
];

export function PreviewClient({ screen }: { screen: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void seed().then(() => setReady(true));
  }, []);
  if (!ready) return null;
  const body =
    screen === "toilet" ? (
      <ToiletSession />
    ) : screen === "practice" ? (
      <PracticeSession />
    ) : screen === "reset" ? (
      <ResetRoutineView routine={RESETS.heavy} />
    ) : screen === "history" ? (
      <HistoryScreen />
    ) : screen === "settings" ? (
      <SettingsScreen />
    ) : screen === "coach" ? (
      <CoachScreen />
    ) : screen === "insights" ? (
      <InsightsScreen />
    ) : screen === "memory" ? (
      <MemoryScreen />
    ) : (
      <TodayScreen />
    );
  const focus = ["toilet", "practice", "reset"].includes(screen);
  return (
    <ToastProvider>
      <div aria-hidden className="fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-bg" />
      <div className={`pt-safe mx-auto min-h-dvh max-w-md px-4 ${focus ? "pb-safe" : "pb-32"}`}>{body}</div>
      {!focus ? <BottomNav /> : null}
    </ToastProvider>
  );
}
