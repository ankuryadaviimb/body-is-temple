"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiSend } from "@/lib/client/api";
import { clearDevice } from "@/lib/client/db";
import { useSettings } from "@/lib/client/hooks";
import { refreshFromServer } from "@/lib/client/sync";
import type { Settings } from "@/lib/domain/settings";
import { zoneLabel } from "@/lib/domain/time";
import { BookIcon, ChartIcon, ChevronRightIcon, PlusIcon, TrashIcon } from "../icons";
import { useToast } from "../toast";
import { TimeZoneSheet } from "./time-zone-sheet";

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
  const [tzOpen, setTzOpen] = useState(false);

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

  const num = (v: string) => (v === "" ? null : Number(v));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const field = "tabular w-28 bg-transparent text-right text-[17px] text-ink outline-none placeholder:text-ink-3";

  return (
    <main className="fade-in flex flex-col gap-7 pt-2">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Temple</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">Settings</h1>
      </header>

      <Group title="Body" note="Weight sets a starting protein target of 1.2 g per kg. The coach tunes it over time.">
        <Row label="Weight" unit="kg">
          <input inputMode="decimal" placeholder="Add" className={field} value={form.weight_kg ?? ""} onChange={(e) => set("weight_kg", num(e.target.value))} />
        </Row>
        <Row label="Height" unit="cm">
          <input inputMode="decimal" placeholder="Add" className={field} value={form.height_cm ?? ""} onChange={(e) => set("height_cm", num(e.target.value))} />
        </Row>
        <Row label="Protein target" unit="g a day">
          <input inputMode="numeric" placeholder="Auto" className={field} value={form.protein_target_g ?? ""} onChange={(e) => set("protein_target_g", num(e.target.value))} />
        </Row>
      </Group>

      <Group title="Daily targets">
        <Row label="Water" unit="ml">
          <input inputMode="numeric" className={field} value={form.water_target_ml} onChange={(e) => set("water_target_ml", Number(e.target.value) || 0)} />
        </Row>
        <Row label="Usual tea" unit="ml a cup">
          <input inputMode="numeric" className={field} value={form.tea_ml} onChange={(e) => set("tea_ml", Number(e.target.value) || 0)} />
        </Row>
        <Row label="Bedtime target">
          <input
            type="time"
            className="bg-transparent text-right text-[17px] text-ink outline-none"
            value={toTime(form.bedtime_target_min)}
            onChange={(e) => {
              const m = fromTime(e.target.value);
              set("bedtime_target_min", m < 12 * 60 ? m + 24 * 60 : m);
            }}
          />
        </Row>
        <Row label="Isabgol delay" unit="min later">
          <input inputMode="numeric" className={field} value={form.isabgol_delay_min} onChange={(e) => set("isabgol_delay_min", Number(e.target.value) || 0)} />
        </Row>
        <button type="button" onClick={() => setTzOpen(true)} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left">
          <span className="flex-1 text-[17px]">Time zone</span>
          <span className="min-w-0 text-right">
            <span className="block truncate text-[15px]">{zoneLabel(form.tz).name}</span>
            <span className="block text-[13px] text-ink-3">{zoneLabel(form.tz).offset}</span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
        </button>
      </Group>

      <Group title="Weekly classes" note="Your class days, so rest days never count against you.">
        {form.classes.map((c, i) => (
          <div key={`${c.weekday}-${c.start_min}-${i}`} className="flex items-center gap-2 px-4 py-2.5">
            <select
              className="h-10 rounded-xl bg-surface-2 px-2 text-[15px]"
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
              className="h-10 rounded-xl bg-surface-2 px-2 text-[15px]"
              value={toTime(c.start_min)}
              onChange={(e) => set("classes", form.classes.map((x, j) => (j === i ? { ...x, start_min: fromTime(e.target.value) } : x)))}
            />
            <select
              className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-2 text-[15px]"
              value={c.kind}
              onChange={(e) =>
                set(
                  "classes",
                  form.classes.map((x, j) =>
                    j === i
                      ? { ...x, kind: e.target.value as ClassRow["kind"], label: e.target.value === "yoga" ? "Yoga" : e.target.value === "group" ? "Group class" : "Class" }
                      : x,
                  ),
                )
              }
            >
              <option value="group">Group class</option>
              <option value="yoga">Yoga</option>
              <option value="other">Other</option>
            </select>
            <button type="button" onClick={() => set("classes", form.classes.filter((_, j) => j !== i))} className="pressable flex size-10 items-center justify-center rounded-xl text-care" aria-label="Remove class">
              <TrashIcon className="size-[18px]" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={form.classes.length >= 21}
          onClick={() => set("classes", [...form.classes, { weekday: 1, start_min: 7 * 60, label: "Group class", kind: "group" }])}
          className="pressable flex h-12 w-full items-center gap-2 px-4 text-[15px] font-semibold text-brand"
        >
          <PlusIcon className="size-5" /> Add a class
        </button>
      </Group>

      {dirty ? (
        <div className="fade-in fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-30 px-4">
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface-2/95 p-2 pl-4 shadow-card backdrop-blur-xl">
            <span className="flex-1 text-[15px] font-medium">Unsaved changes</span>
            <button type="button" onClick={() => setForm(initial)} className="pressable h-10 rounded-xl px-3 text-[15px] font-semibold text-ink-2">
              Discard
            </button>
            <button type="button" disabled={saving} onClick={() => void save()} className="pressable h-10 rounded-xl bg-brand px-4 text-[15px] font-semibold text-brand-ink disabled:opacity-60">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      <Group title="Coach" note="The coach reads your notes and the patterns from your logs before it answers.">
        <NavRow href="/memory" Icon={BookIcon} label="What Temple knows about you" />
        <NavRow href="/insights" Icon={ChartIcon} label="Your patterns" />
      </Group>

      <Group title="Privacy" note="Photos are shrunk on the phone before upload, which removes location and device details. The AI providers used do not train on your data.">
        <button type="button" onClick={() => void signOut()} className="pressable flex h-12 w-full items-center px-4 text-[17px] font-medium text-care">
          Sign out and clear this phone
        </button>
      </Group>
      {tzOpen ? (
        <TimeZoneSheet
          value={form.tz}
          onPick={(tz) => {
            set("tz", tz);
            setTzOpen(false);
          }}
          onClose={() => setTzOpen(false)}
        />
      ) : null}
    </main>
  );
}

function NavRow({ href, Icon, label }: { href: string; Icon: typeof BookIcon; label: string }) {
  return (
    <Link href={href} className="pressable flex min-h-[52px] items-center gap-3 px-4">
      <Icon className="size-5 shrink-0 text-brand" />
      <span className="flex-1 text-[17px]">{label}</span>
      <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
    </Link>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-card">{children}</div>
      {note ? <p className="mt-2 px-4 text-xs leading-relaxed text-ink-3">{note}</p> : null}
    </section>
  );
}

function Row({ label, unit, children }: { label: string; unit?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-h-[52px] items-center gap-3 px-4">
      <span className="flex-1 text-[17px]">{label}</span>
      {children}
      {unit ? <span className="w-16 shrink-0 text-[15px] text-ink-3">{unit}</span> : null}
    </label>
  );
}
