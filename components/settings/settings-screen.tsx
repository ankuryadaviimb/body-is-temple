"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiSend } from "@/lib/client/api";
import { clearDevice } from "@/lib/client/db";
import { useSettings, useSyncState } from "@/lib/client/hooks";
import { downloadExport } from "@/lib/client/export";
import { refreshFromServer, retryFailed, stopSync, syncNow, unsyncedCount } from "@/lib/client/sync";
import { SettingsUpdate, type Settings } from "@/lib/domain/settings";
import { autoProtein, calorieTarget, PROTEIN_PER_KG } from "@/lib/domain/nutrition";
import { zoneLabel } from "@/lib/domain/time";
import { BookIcon, ChartIcon, ChevronRightIcon, NoteIcon, PlusIcon, TrashIcon } from "../icons";
import { useToast } from "../toast";
import { TimeZoneSheet } from "./time-zone-sheet";
import { UsualFoodsGroup } from "./usual-foods";
import type { UsualFood } from "@/lib/domain/usual-foods";

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
  const [confirmSignOut, setConfirmSignOut] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm((f) => ({ ...f, [key]: value }));

  const { ladder_index: _i, ladder_since: _s, ...editable } = form;
  void _i;
  void _s;
  // Same rules as the server, so a bad value is caught here, next to its field.
  const check = SettingsUpdate.safeParse(editable);
  const errors: Partial<Record<keyof Settings, string>> = {};
  if (!check.success) {
    for (const issue of check.error.issues) {
      const key = String(issue.path[0]) as keyof Settings;
      if (!errors[key]) errors[key] = FIELD_HELP[key] ?? "Check this value.";
    }
  }
  const invalid = Object.keys(errors).length > 0;

  async function save() {
    if (invalid) return;
    setSaving(true);
    try {
      await apiSend("PUT", "/api/settings", editable);
      await refreshFromServer();
      show("Settings saved.", "good");
    } catch (err) {
      show(err instanceof ApiError && err.status === 400 ? "Some values are out of range. Check the highlighted fields." : "Could not save. Check your connection and try again.", "tip");
    } finally {
      setSaving(false);
    }
  }

  /** Usual foods save at once, together with any other valid edits on the page. */
  async function saveUsualFoods(list: UsualFood[]) {
    const next = { ...form, usual_foods: list };
    setForm(next);
    const { ladder_index: _a, ladder_since: _b, ...rest } = next;
    void _a;
    void _b;
    const body = SettingsUpdate.safeParse(rest).success ? rest : { usual_foods: list };
    try {
      await apiSend("PUT", "/api/settings", body);
      await refreshFromServer();
      show("Usual foods saved.", "good");
    } catch {
      show("Could not save. Check your connection and try again.", "tip");
    }
  }

  async function signOut() {
    // Signing out clears this phone, so anything not yet synced must reach the server first.
    await syncNow().catch(() => undefined);
    const unsynced = await unsyncedCount();
    if (unsynced > 0 && !confirmSignOut) {
      setConfirmSignOut(unsynced);
      return;
    }
    try {
      await apiSend("POST", "/api/auth/sign-out");
    } catch {
      // Without the server's OK the session cookie may still be valid, so keep everything.
      show("Could not sign out. Check your connection and try again.", "tip");
      return;
    }
    stopSync();
    await clearDevice();
    if ("caches" in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
    router.replace("/login");
    router.refresh();
  }

  const auto = autoProtein(form.weight_kg, form.height_cm);
  const kcal = calorieTarget(form);
  const bodyNote = [
    auto
      ? `Auto protein: ${PROTEIN_PER_KG} g per kg of ${auto.basisKg} kg${auto.capped ? " (the healthy weight for your height, so the target does not grow with body fat)" : ""}, a common target when you train most days and want to lose fat.`
      : "Add weight and height for an automatic protein target.",
    kcal ? `Calories for steady fat loss: about ${kcal.low.toLocaleString("en-IN")} to ${kcal.high.toLocaleString("en-IN")} a day.` : "Birth year and sex are optional; they add a calorie target.",
  ].join(" ");
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  return (
    <main className="fade-in flex flex-col gap-7 pt-2">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Temple</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">Settings</h1>
      </header>

      <Group title="Body" note={bodyNote} errors={pick(errors, ["weight_kg", "height_cm", "birth_year", "protein_target_g"])}>
        <Row label="Weight" unit="kg">
          <NumberField decimals placeholder="Add" invalid={!!errors.weight_kg} value={form.weight_kg} onChange={(v) => set("weight_kg", v)} />
        </Row>
        <Row label="Height" unit="cm">
          <NumberField decimals placeholder="Add" invalid={!!errors.height_cm} value={form.height_cm} onChange={(v) => set("height_cm", v)} />
        </Row>
        <Row label="Birth year">
          <NumberField placeholder="Optional" invalid={!!errors.birth_year} value={form.birth_year} onChange={(v) => set("birth_year", v)} />
        </Row>
        <div className="flex min-h-[52px] items-center gap-3 px-4">
          <span className="flex-1 text-[17px]">Sex</span>
          <Segmented
            value={form.sex ?? "unset"}
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "unset", label: "Skip" },
            ]}
            onChange={(v) => set("sex", v === "unset" ? null : (v as "male" | "female"))}
          />
        </div>
        <div className="flex min-h-[52px] items-center gap-3 px-4">
          <span className="flex-1 text-[17px]">Protein target</span>
          <Segmented
            value={form.protein_auto ? "auto" : "custom"}
            options={[
              { value: "auto", label: "Auto" },
              { value: "custom", label: "Custom" },
            ]}
            onChange={(v) => {
              set("protein_auto", v === "auto");
              if (v === "custom" && form.protein_target_g === null) set("protein_target_g", auto?.grams ?? 80);
            }}
          />
        </div>
        {form.protein_auto ? (
          <div className="flex min-h-[52px] items-center gap-3 px-4">
            <span className="flex-1 text-[17px] text-ink-2">Auto target</span>
            <span className="tabular text-[17px] font-semibold">{auto ? `${auto.grams} g a day` : "Add weight"}</span>
          </div>
        ) : (
          <Row label="Custom target" unit="g a day">
            <NumberField invalid={!!errors.protein_target_g} value={form.protein_target_g} onChange={(v) => set("protein_target_g", v)} />
          </Row>
        )}
      </Group>

      <Group title="Daily targets" errors={pick(errors, ["water_target_ml", "water_glass_ml", "chia_tbsp", "tea_ml", "isabgol_delay_min", "bedtime_target_min", "tz"])}>
        <Row label="Water" unit="ml">
          <NumberField invalid={!!errors.water_target_ml} value={form.water_target_ml} onChange={(v) => set("water_target_ml", v ?? NaN)} />
        </Row>
        <Row label="Usual glass" unit="ml">
          <NumberField invalid={!!errors.water_glass_ml} value={form.water_glass_ml} onChange={(v) => set("water_glass_ml", v ?? NaN)} />
        </Row>
        <Row label="Chia per glass" unit="tbsp">
          <NumberField decimals invalid={!!errors.chia_tbsp} value={form.chia_tbsp} onChange={(v) => set("chia_tbsp", v ?? NaN)} />
        </Row>
        <Row label="Usual tea" unit="ml a cup">
          <NumberField invalid={!!errors.tea_ml} value={form.tea_ml} onChange={(v) => set("tea_ml", v ?? NaN)} />
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
          <NumberField invalid={!!errors.isabgol_delay_min} value={form.isabgol_delay_min} onChange={(v) => set("isabgol_delay_min", v ?? NaN)} />
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

      <UsualFoodsGroup foods={form.usual_foods} onChange={(list) => void saveUsualFoods(list)} />

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
            <span className={`flex-1 text-[15px] font-medium ${invalid ? "text-care" : ""}`}>{invalid ? "Fix the highlighted values" : "Unsaved changes"}</span>
            <button type="button" onClick={() => setForm(initial)} className="pressable h-10 rounded-xl px-3 text-[15px] font-semibold text-ink-2">
              Discard
            </button>
            <button type="button" disabled={saving || invalid} onClick={() => void save()} className="pressable h-10 rounded-xl bg-brand px-4 text-[15px] font-semibold text-brand-ink disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      <Group title="Coach" note="The coach reads your notes and the patterns from your logs before it answers.">
        <NavRow href="/memory" Icon={BookIcon} label="What Temple knows about you" />
        <NavRow href="/insights" Icon={ChartIcon} label="Your patterns" />
      </Group>

      <Group title="Your data" note="Every entry saves on this phone first and in your own database within seconds. The free database plan keeps no backups, so export a copy now and then.">
        <SyncRow />
        <button
          type="button"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const how = await downloadExport();
              show(how === "shared" ? "Export ready." : "Export saved to your downloads.", "good");
            } catch {
              show("Could not export. Check your connection and try again.", "tip");
            } finally {
              setExporting(false);
            }
          }}
          className="pressable flex min-h-[52px] w-full items-center gap-3 px-4 text-left disabled:opacity-60"
        >
          <BookIcon className="size-5 shrink-0 text-brand" />
          <span className="flex-1 text-[17px]">{exporting ? "Preparing export..." : "Export all my data"}</span>
          <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
        </button>
        <NavRow href="/records" Icon={NoteIcon} label="Health records (reports, visits)" />
        <NavRow href="/report" Icon={NoteIcon} label="Gut diary for your doctor" />
      </Group>

      <Group title="Privacy" note="Photos are shrunk on the phone before upload, which removes location and device details. The AI providers used do not train on your data.">
        {confirmSignOut ? (
          <div className="px-4 py-3">
            <p className="text-[15px] leading-relaxed">
              {confirmSignOut} {confirmSignOut === 1 ? "entry has" : "entries have"} not reached the server yet (no connection). Signing out now deletes {confirmSignOut === 1 ? "it" : "them"} from this phone.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setConfirmSignOut(null)} className="pressable h-11 flex-1 rounded-xl bg-surface-2 text-[15px] font-semibold">
                Keep them
              </button>
              <button type="button" onClick={() => void signOut()} className="pressable h-11 flex-1 rounded-xl bg-care/15 text-[15px] font-semibold text-care">
                Sign out anyway
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => void signOut()} className="pressable flex h-12 w-full items-center px-4 text-[17px] font-medium text-care">
            Sign out and clear this phone
          </button>
        )}
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

function SyncRow() {
  const sync = useSyncState();
  const when = sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : null;
  const text = sync.failed > 0
    ? `${sync.failed} ${sync.failed === 1 ? "change was" : "changes were"} not accepted by the server. They are safe on this phone.`
    : !sync.online
      ? "Offline. Entries wait safely on this phone."
      : sync.pending > 0
        ? `${sync.pending} waiting to sync`
        : when
          ? `All saved. Last synced at ${when}.`
          : "All saved.";
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <span className={`size-2.5 shrink-0 rounded-full ${sync.failed > 0 ? "bg-care" : !sync.online || sync.pending > 0 ? "bg-tip" : "bg-good"}`} aria-hidden />
      <span className="flex-1 text-[15px] leading-snug text-ink-2">{text}</span>
      {sync.failed > 0 ? (
        <button type="button" onClick={() => void retryFailed()} className="pressable h-9 shrink-0 rounded-xl bg-surface-2 px-3 text-[14px] font-semibold text-brand">
          Retry
        </button>
      ) : null}
    </div>
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

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-xl bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`pressable h-9 rounded-[10px] px-3 text-[14px] font-semibold ${o.value === value ? "bg-surface text-ink shadow-card" : "text-ink-2"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Group({ title, note, errors = [], children }: { title: string; note?: string; errors?: string[]; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-card">{children}</div>
      {errors.length > 0 ? (
        <ul className="mt-2 px-4 text-[13px] leading-relaxed text-care" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="mt-2 px-4 text-xs leading-relaxed text-ink-3">{note}</p> : null}
    </section>
  );
}

const FIELD_HELP: Partial<Record<keyof Settings, string>> = {
  weight_kg: "Weight: 25 to 300 kg.",
  height_cm: "Height: 100 to 250 cm.",
  birth_year: "Birth year: 1920 to 2015, or leave it empty.",
  protein_target_g: "Protein target: a whole number from 20 to 300 g.",
  water_target_ml: "Water target: a whole number from 500 to 6,000 ml.",
  water_glass_ml: "Usual glass: a whole number from 100 to 1,000 ml.",
  chia_tbsp: "Chia: 0.5 to 4 tablespoons.",
  tea_ml: "Usual tea: a whole number from 50 to 600 ml.",
  isabgol_delay_min: "Isabgol delay: a whole number from 30 to 240 minutes.",
  bedtime_target_min: "Bedtime target: between 8 PM and 4 AM.",
  tz: "Pick a time zone from the list.",
};

function pick(errors: Partial<Record<keyof Settings, string>>, keys: (keyof Settings)[]): string[] {
  return keys.map((k) => errors[k]).filter((e): e is string => typeof e === "string");
}

const parseNumber = (text: string): number | null => (text === "" || text === "." ? null : Number(text));

/**
 * A number input that keeps exactly what you type, so "72." can become "72.5", and
 * passes the parsed number up. Letters are ignored. Resets when the saved value changes.
 */
function NumberField({
  value,
  onChange,
  decimals = false,
  placeholder,
  invalid = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  decimals?: boolean;
  placeholder?: string;
  invalid?: boolean;
}) {
  const shown = (v: number | null) => (v === null || Number.isNaN(v) ? "" : String(v));
  const [text, setText] = useState(shown(value));
  const [last, setLast] = useState<number | null>(value);
  const same = (a: number | null, b: number | null) => a === b || (a !== null && b !== null && Number.isNaN(a) && Number.isNaN(b));
  if (!same(value, last)) {
    setLast(value);
    if (!same(parseNumber(text), value)) setText(shown(value));
  }
  return (
    <input
      inputMode={decimals ? "decimal" : "numeric"}
      placeholder={placeholder}
      value={text}
      aria-invalid={invalid}
      onChange={(e) => {
        const t = e.target.value.replace(",", ".").trim();
        if (!(decimals ? /^\d*\.?\d*$/ : /^\d*$/).test(t)) return;
        const n = parseNumber(t);
        setText(t);
        setLast(n);
        onChange(n);
      }}
      className={`tabular w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-3 ${invalid ? "text-care" : "text-ink"}`}
    />
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
