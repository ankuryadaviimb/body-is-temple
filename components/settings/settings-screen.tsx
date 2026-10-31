"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiSend } from "@/lib/client/api";
import { clearDevice } from "@/lib/client/db";
import { useSettings } from "@/lib/client/hooks";
import { refreshFromServer } from "@/lib/client/sync";
import type { Settings } from "@/lib/domain/settings";
import { useToast } from "../toast";

type ClassRow = Settings["classes"][number];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toTime = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const fromTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function SettingsScreen() {
  const settings = useSettings();
  // Re-mount the form when the saved settings change, so it always starts from them.
  return <SettingsForm key={JSON.stringify(settings)} initial={settings} />;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const { show } = useToast();
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      const { ladder_index: _i, ladder_since: _s, ...editable } = form;
      void _i;
      void _s;
      await apiSend("PUT", "/api/settings", editable);
      await refreshFromServer();
      show("Settings saved.", "good");
    } catch {
      show("Could not save. Check your connection and try again.", "tip");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    try {
      await apiSend("POST", "/api/auth/sign-out");
    } finally {
      await clearDevice();
      router.replace("/login");
      router.refresh();
    }
  }

  const input = "h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base";
  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <main className="flex flex-col gap-6 pt-2">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-4">
        <h2 className="font-semibold">Body</h2>
        <label className="text-sm text-ink-2">
          Weight (kg)
          <input inputMode="decimal" className={input} value={form.weight_kg ?? ""} onChange={(e) => set("weight_kg", num(e.target.value))} />
        </label>
        <label className="text-sm text-ink-2">
          Height (cm)
          <input inputMode="decimal" className={input} value={form.height_cm ?? ""} onChange={(e) => set("height_cm", num(e.target.value))} />
        </label>
        <label className="text-sm text-ink-2">
          Protein target (g per day, set from weight if empty)
          <input inputMode="numeric" className={input} value={form.protein_target_g ?? ""} onChange={(e) => set("protein_target_g", num(e.target.value))} />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-4">
        <h2 className="font-semibold">Daily targets</h2>
        <label className="text-sm text-ink-2">
          Water (ml per day)
          <input inputMode="numeric" className={input} value={form.water_target_ml} onChange={(e) => set("water_target_ml", Number(e.target.value) || 0)} />
        </label>
        <label className="text-sm text-ink-2">
          Usual tea (ml per cup, logged by one tap)
          <input inputMode="numeric" className={input} value={form.tea_ml} onChange={(e) => set("tea_ml", Number(e.target.value) || 0)} />
        </label>
        <label className="text-sm text-ink-2">
          Bedtime target
          <input
            type="time"
            className={input}
            value={toTime(form.bedtime_target_min)}
            onChange={(e) => {
              const m = fromTime(e.target.value);
              set("bedtime_target_min", m < 12 * 60 ? m + 24 * 60 : m);
            }}
          />
        </label>
        <label className="text-sm text-ink-2">
          Isabgol, minutes after dinner
          <input inputMode="numeric" className={input} value={form.isabgol_delay_min} onChange={(e) => set("isabgol_delay_min", Number(e.target.value) || 0)} />
        </label>
        <label className="text-sm text-ink-2">
          Time zone
          <input className={input} value={form.tz} onChange={(e) => set("tz", e.target.value)} />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-4">
        <h2 className="font-semibold">Weekly classes</h2>
        <p className="text-sm text-ink-2">Your class days, so rest days never count against you.</p>
        {form.classes.map((c, i) => (
          <div key={`${c.weekday}-${c.start_min}-${i}`} className="flex items-center gap-2">
            <select
              className="h-11 rounded-xl border border-line bg-surface-2 px-2"
              value={c.weekday}
              onChange={(e) => set("classes", form.classes.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))}
            >
              {WEEKDAYS.map((d, n) => (
                <option key={d} value={n}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              className="h-11 rounded-xl border border-line bg-surface-2 px-2"
              value={toTime(c.start_min)}
              onChange={(e) => set("classes", form.classes.map((x, j) => (j === i ? { ...x, start_min: fromTime(e.target.value) } : x)))}
            />
            <select
              className="h-11 flex-1 rounded-xl border border-line bg-surface-2 px-2"
              value={c.kind}
              onChange={(e) =>
                set("classes", form.classes.map((x, j) => (j === i ? { ...x, kind: e.target.value as ClassRow["kind"], label: e.target.value === "yoga" ? "Yoga" : e.target.value === "group" ? "Group class" : "Class" } : x)))
              }
            >
              <option value="group">Group class</option>
              <option value="yoga">Yoga</option>
              <option value="other">Other</option>
            </select>
            <button type="button" onClick={() => set("classes", form.classes.filter((_, j) => j !== i))} className="h-11 px-2 text-sm text-care" aria-label="Remove class">
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={form.classes.length >= 21}
          onClick={() => set("classes", [...form.classes, { weekday: 1, start_min: 7 * 60, label: "Group class", kind: "group" }])}
          className="h-11 rounded-xl border border-dashed border-line text-sm font-medium"
        >
          Add a class
        </button>
      </section>

      <button type="button" disabled={saving} onClick={() => void save()} className="h-14 rounded-2xl bg-brand font-semibold text-brand-ink disabled:opacity-60">
        {saving ? "Saving..." : "Save settings"}
      </button>

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-4">
        <h2 className="font-semibold">Privacy</h2>
        <p className="text-sm leading-relaxed text-ink-2">
          Your logs live in your own database and on this phone. Photos are shrunk on the phone first, which removes location and device details. AI providers used for analysis do not train on your data.
        </p>
        <button type="button" onClick={() => void signOut()} className="h-12 rounded-xl border border-care/40 font-semibold text-care">
          Sign out and clear this phone
        </button>
      </section>
    </main>
  );
}
