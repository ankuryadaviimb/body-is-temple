"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useSettings } from "@/lib/client/hooks";
import { logEvent } from "@/lib/client/log";
import { prepareMealPhoto } from "@/lib/client/photo";
import { MEAL_SLOTS, type MealSlot } from "@/lib/domain/events";
import { addDays, localParts } from "@/lib/domain/time";
import { defaultWhen, describeWhen, resolveWhen, timeOf, type WhenValue } from "@/lib/domain/when";
import { CupIcon, DropIcon, DumbbellIcon, ImageIcon, LeafIcon, PlateIcon, SeatIcon, SeedsIcon, SpoonIcon, WalkIcon, WindIcon } from "../icons";
import { Choice, Sheet } from "../sheet";
import { useToast } from "../toast";
import { WhenPicker } from "../when-picker";

/**
 * "Add an earlier entry": anything you could not log in the moment, at the time it
 * happened, today or yesterday. Meals can be typed, with an optional photo.
 */

type Kind = "meal" | "toilet" | "water" | "tea" | "amla" | "chia" | "isabgol" | "walk" | "gas" | "workout";

const KINDS: { kind: Kind; label: string; Icon: typeof PlateIcon; tint: string }[] = [
  { kind: "meal", label: "Meal", Icon: PlateIcon, tint: "bg-fuel/15 text-fuel" },
  { kind: "toilet", label: "Toilet", Icon: SeatIcon, tint: "bg-gut/15 text-gut" },
  { kind: "water", label: "Water", Icon: DropIcon, tint: "bg-rest/15 text-rest" },
  { kind: "tea", label: "Tea", Icon: CupIcon, tint: "bg-fuel/15 text-fuel" },
  { kind: "amla", label: "Amla water", Icon: LeafIcon, tint: "bg-move/15 text-move" },
  { kind: "chia", label: "Chia water", Icon: SeedsIcon, tint: "bg-rest/15 text-rest" },
  { kind: "isabgol", label: "Isabgol", Icon: SpoonIcon, tint: "bg-gut/15 text-gut" },
  { kind: "walk", label: "Walk", Icon: WalkIcon, tint: "bg-move/15 text-move" },
  { kind: "gas", label: "Gas", Icon: WindIcon, tint: "bg-surface-3 text-ink-2" },
  { kind: "workout", label: "Workout", Icon: DumbbellIcon, tint: "bg-move/15 text-move" },
];

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", late: "Late" };

export function BackfillSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Backfill onClose={onClose} />;
}

function Backfill({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const settings = useSettings();
  const { logged: notify, show } = useToast();
  const logged = (result: Parameters<typeof notify>[0], text: string) => notify({ ...result, feedback: null }, text);
  const photoInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [when, setWhen] = useState<WhenValue>(() => defaultWhen(settings.tz));
  const [text, setText] = useState("");
  const [slot, setSlot] = useState<MealSlot | "auto">("auto");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [count, setCount] = useState(1);
  const [size, setSize] = useState<number | null>(null);
  const [tsp, setTsp] = useState(1);
  const [minutes, setMinutes] = useState(10);
  const [gas, setGas] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const glass = size ?? settings.water_glass_ml;
  const cup = size ?? settings.tea_ml;

  function pick(k: Kind) {
    if (k === "toilet") {
      onClose();
      router.push("/toilet?earlier=1");
      return;
    }
    setCount(1);
    setSize(null);
    setText("");
    setMinutes(k === "workout" ? 45 : 10);
    setKind(k);
  }

  async function onPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const { blob, takenAt } = await prepareMealPhoto(file, false);
      setPhoto(blob);
      // A photo's own time is the best guess for when the meal happened, when that is today
      // or yesterday (the days an earlier entry can go on). An older photo keeps the time set here.
      if (takenAt) {
        const p = localParts(takenAt, settings.tz);
        const today = localParts(new Date(), settings.tz).date;
        if (p.date === today || p.date === addDays(today, -1)) setWhen({ day: p.date === today ? "today" : "yesterday", time: timeOf(p.minutes) });
        else show("This photo is from an earlier day, so its time was not used. Pick the time below.", "tip");
      }
    } catch {
      show("Could not read that photo. Try another one, or just type the meal.", "tip");
    }
  }

  const ready =
    kind === "meal" ? text.trim().length > 0 || photo !== null : kind === "gas" ? gas !== undefined : kind === "workout" ? text.trim().length > 0 && minutes > 0 : kind !== null;

  async function save() {
    if (!kind || !ready) return;
    setSaving(true);
    const at = resolveWhen(when, settings.tz);
    const label = describeWhen(at, settings.tz);
    try {
      if (kind === "meal") {
        const payload = {
          ...(text.trim() ? { text: text.trim().slice(0, 500) } : {}),
          ...(slot !== "auto" ? { slot, slot_chosen: true } : {}),
        };
        logged(await logEvent("meal", payload, { at, ...(photo ? { photo } : {}) }), `Meal saved for ${label}. Details appear in a few seconds.`);
      } else if (kind === "water") {
        logged(await logEvent("water", { ml: Math.min(2000, count * glass) }, { at }), `Water ${count * glass} ml saved for ${label}.`);
      } else if (kind === "tea") {
        logged(await logEvent("drink", { type: "tea", ml: Math.min(2000, count * cup) }, { at }), `Tea saved for ${label}.`);
      } else if (kind === "amla" || kind === "chia") {
        logged(await logEvent("drink", { type: kind, ml: Math.min(2000, count * glass) }, { at }), `${kind === "amla" ? "Amla" : "Chia"} water saved for ${label}.`);
      } else if (kind === "isabgol") {
        logged(await logEvent("isabgol", { tsp, water_ml: 200 }, { at }), `Isabgol saved for ${label}.`);
      } else if (kind === "walk") {
        logged(await logEvent("walk", { minutes }, { at }), `Walk saved for ${label}.`);
      } else if (kind === "gas" && gas !== undefined) {
        logged(await logEvent("gas", { level: gas }, { at }), `Gas ${gas} of 4 saved for ${label}.`);
      } else if (kind === "workout") {
        logged(await logEvent("workout", { type: text.trim().slice(0, 60), duration_min: minutes }, { at }), `Workout saved for ${label}.`);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const title = kind ? `Earlier ${KINDS.find((k) => k.kind === kind)?.label.toLowerCase()}` : "Add an earlier entry";

  return (
    <Sheet open title={title} onClose={onClose}>
      {!kind ? (
        <>
          <p className="mb-4 text-[14px] leading-relaxed text-ink-2">Missed logging something? Pick it, then set the time it happened, today or yesterday.</p>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map(({ kind: k, label, Icon, tint }) => (
              <button key={k} type="button" onClick={() => pick(k)} className="pressable flex h-14 items-center gap-2.5 rounded-2xl bg-surface-2 px-3 text-left text-[15px] font-semibold">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${tint}`}>
                  <Icon className="size-4" />
                </span>
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div>
          <WhenPicker value={when} onChange={setWhen} tz={settings.tz} />

          {kind === "meal" ? (
            <>
              <label className="mb-4 block">
                <span className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">What did you eat?</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="e.g. 2 roti, moong dal, curd"
                  className="w-full rounded-2xl bg-surface-2 p-4 text-[16px] leading-relaxed outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                className="pressable mb-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[15px] font-semibold text-brand"
              >
                <ImageIcon className="size-5" /> {photo ? "Photo added, tap to change" : "Add a photo (optional)"}
              </button>
              <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onPhoto(e.target.files)} />
              <Choice
                label="Meal"
                value={slot}
                onChange={setSlot}
                options={[{ value: "auto" as const, label: "Auto" }, ...MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))]}
              />
            </>
          ) : null}

          {kind === "water" || kind === "amla" || kind === "chia" ? (
            <>
              <Choice label="How many glasses?" value={count} onChange={setCount} options={[1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} />
              <Choice label="Glass size" value={glass} onChange={setSize} options={[200, 250, 300, 400, 500].map((v) => ({ value: v, label: `${v} ml` }))} />
            </>
          ) : null}

          {kind === "tea" ? (
            <>
              <Choice label="How many cups?" value={count} onChange={setCount} options={[1, 2, 3].map((v) => ({ value: v, label: String(v) }))} />
              <Choice label="Cup size" value={cup} onChange={setSize} options={[150, 300, 400].map((v) => ({ value: v, label: `${v} ml` }))} />
            </>
          ) : null}

          {kind === "isabgol" ? (
            <Choice label="Teaspoons" value={tsp} onChange={setTsp} options={[0.5, 1, 1.5, 2].map((v) => ({ value: v, label: String(v) }))} />
          ) : null}

          {kind === "walk" ? (
            <Choice label="Minutes" value={minutes} onChange={setMinutes} options={[10, 20, 30, 45, 60].map((v) => ({ value: v, label: String(v) }))} />
          ) : null}

          {kind === "gas" ? (
            <Choice
              label="0 is none, 4 is very bloated"
              value={gas}
              onChange={setGas}
              options={[0, 1, 2, 3, 4].map((v) => ({ value: v, label: v === 0 ? "0 · None" : v === 4 ? "4 · Very" : String(v) }))}
            />
          ) : null}

          {kind === "workout" ? (
            <>
              <label className="mb-4 block">
                <span className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">What was it?</span>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. HIIT class, yoga, run"
                  className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-[16px] outline-none"
                />
              </label>
              <Choice label="Minutes" value={minutes} onChange={setMinutes} options={[20, 30, 45, 60, 90].map((v) => ({ value: v, label: String(v) }))} />
            </>
          ) : null}

          <div className="flex gap-3">
            <button type="button" onClick={() => setKind(null)} className="pressable h-12 flex-1 rounded-2xl bg-surface-2 font-semibold">
              Back
            </button>
            <button type="button" disabled={!ready || saving} onClick={() => void save()} className="pressable h-12 flex-[2] rounded-2xl bg-brand font-semibold text-brand-ink disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
