"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { HistoryScreen } from "@/components/history/history-screen";
import { PracticeSession } from "@/components/practice/practice-session";
import { ResetRoutineView } from "@/components/reset/reset-routine";
import { SettingsScreen } from "@/components/settings/settings-screen";
import { ToastProvider } from "@/components/toast";
import { TodayScreen } from "@/components/today/today-screen";
import { ToiletSession } from "@/components/toilet/toilet-session";
import { db, kvSet, type LocalEvent } from "@/lib/client/db";
import { RESETS } from "@/lib/content/resets";
import type { EventKind } from "@/lib/domain/events";
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
  await kvSet("snapshot", snapshot);
  await kvSet("tz_adopted", true);
}

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
