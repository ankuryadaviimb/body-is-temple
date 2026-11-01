"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useSettings } from "@/lib/client/hooks";
import { logEvent, logUsualFood } from "@/lib/client/log";
import { prepareMealPhoto } from "@/lib/client/photo";
import { MEAL_SLOTS, type MealSlot } from "@/lib/domain/events";
import { addDays, localParts } from "@/lib/domain/time";
import type { UsualFood } from "@/lib/domain/usual-foods";
import { defaultWhen, describeWhen, readWhen, type WhenValue } from "@/lib/domain/when";
import { USUAL_ICON } from "../event-visuals";
import { CameraIcon, ImageIcon, PlusIcon } from "../icons";
import { Choice, Sheet } from "../sheet";
import { useToast } from "../toast";
import { WhenPicker } from "../when-picker";

/**
 * Every way to log food in one place: type it, take a photo, pick photos, or tap a usual
 * food. Starts at "now"; the time and meal can be changed in one tap, so the same form
 * also adds an earlier meal. Nothing here waits for the network or the AI.
 */

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", late: "Late" };

export function MealSheet({ open, onClose, earlier = false }: { open: boolean; onClose: () => void; earlier?: boolean }) {
  if (!open) return null;
  return (
    <Sheet open title={earlier ? "Add an earlier meal" : "Log a meal"} onClose={onClose}>
      <MealComposer onDone={onClose} earlier={earlier} />
    </Sheet>
  );
}

export function MealComposer({ onDone, earlier = false }: { onDone: () => void; earlier?: boolean }) {
  const settings = useSettings();
  const { logged, show } = useToast();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [when, setWhen] = useState<WhenValue>(() => defaultWhen(settings.tz));
  const [detailsOpen, setDetailsOpen] = useState(earlier);
  const [slot, setSlot] = useState<MealSlot | "auto">("auto");
  const [busy, setBusy] = useState(false);

  const now = new Date();
  const { at: pickedAt } = readWhen(when, settings.tz, now);
  // The time only counts once it was opened; otherwise every log is "now" at the tap.
  const atFor = () => (detailsOpen ? readWhen(when, settings.tz).at : new Date());
  const whenText = detailsOpen ? describeWhen(pickedAt, settings.tz, now) : "Now";
  const slotPayload = slot !== "auto" ? { slot, slot_chosen: true } : {};
  const note = (at: Date) => (detailsOpen ? ` for ${describeWhen(at, settings.tz)}` : "");

  async function saveText() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const at = atFor();
      logged(await logEvent("meal", { text: t.slice(0, 500), ...slotPayload }, { at }), `Meal saved${note(at)}. Details appear in a few seconds.`);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function savePhotos(files: FileList | null, fromCamera: boolean) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let failed = 0;
    let saved = 0;
    const t = text.trim();
    try {
      // One unreadable photo never stops the rest of the pick.
      for (const file of Array.from(files).slice(0, 6)) {
        try {
          const { blob, takenAt } = await prepareMealPhoto(file, fromCamera);
          const at = photoTime(takenAt, fromCamera) ?? atFor();
          const payload = { ...(t ? { text: t.slice(0, 500) } : {}), ...slotPayload };
          logged(await logEvent("meal", payload, { at, photo: blob }), `Meal saved${note(at)}. Details appear in a few seconds.`);
          saved += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) show(`Could not read ${failed === 1 ? "one photo" : `${failed} photos`}. Try again, or type the meal.`, "tip");
      if (saved > 0) onDone();
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (library.current) library.current.value = "";
    }
  }

  /** A library photo's own "date taken" is when the meal happened, if it is today or yesterday. */
  function photoTime(takenAt: Date | null, fromCamera: boolean): Date | null {
    if (fromCamera || !takenAt) return null;
    const p = localParts(takenAt, settings.tz);
    const today = localParts(new Date(), settings.tz).date;
    if (p.date === today || p.date === addDays(today, -1)) return takenAt;
    return null;
  }

  async function tapUsual(food: UsualFood) {
    const at = atFor();
    logged(await logUsualFood(food, at), `${food.label} logged${note(at)} · ${round(food.protein_g)} g protein`);
    onDone();
  }

  return (
    <div>
      <label className="mb-3 block">
        <span className="mb-2 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">What did you eat?</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={2}
          enterKeyHint="done"
          placeholder="e.g. 2 roti, moong dal, curd"
          className="w-full rounded-2xl bg-surface-2 p-4 text-[16px] leading-relaxed outline-none"
        />
      </label>

      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        className="pressable mb-3 flex h-10 w-full items-center justify-between rounded-xl px-1 text-[14px] text-ink-2"
        aria-expanded={detailsOpen}
      >
        <span>
          <span className="font-semibold text-ink">{whenText}</span>
          {" · "}
          {slot === "auto" ? "meal picked from the time" : SLOT_LABEL[slot]}
        </span>
        <span className="font-semibold text-brand">{detailsOpen ? "Done" : "Change"}</span>
      </button>
      {detailsOpen ? (
        <div className="fade-in">
          <WhenPicker value={when} onChange={setWhen} tz={settings.tz} />
          <Choice
            label="Meal"
            value={slot}
            onChange={setSlot}
            options={[{ value: "auto" as const, label: "Auto" }, ...MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))]}
          />
        </div>
      ) : null}

      <button
        type="button"
        disabled={!text.trim() || busy}
        onClick={() => void saveText()}
        className="pressable mb-3 h-12 w-full rounded-2xl bg-brand font-semibold text-brand-ink disabled:opacity-40"
      >
        {busy ? "Saving..." : "Save meal"}
      </button>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => camera.current?.click()}
          className="pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[15px] font-semibold"
        >
          <CameraIcon className="size-5 text-fuel" /> Take a photo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => library.current?.click()}
          className="pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[15px] font-semibold"
        >
          <ImageIcon className="size-5 text-fuel" /> From photos
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void savePhotos(e.target.files, true)} />
      <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void savePhotos(e.target.files, false)} />

      <UsualFoodGrid foods={settings.usual_foods} onTap={(f) => void tapUsual(f)} onManage={onDone} />
    </div>
  );
}

function round(v: number): number {
  return Math.round(v);
}

/** One-tap buttons for usual foods, with a way to add more. Shared by Today and the meal sheet. */
export function UsualFoodGrid({ foods, onTap, onManage }: { foods: UsualFood[]; onTap: (f: UsualFood) => void; onManage?: () => void }) {
  return (
    <section aria-label="Usual foods">
      <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Usual foods, one tap</h3>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3">
        {foods.map((f) => (
          <UsualFoodButton key={f.id} food={f} onTap={() => onTap(f)} />
        ))}
        <Link href="/settings#usual-foods" onClick={onManage} className="pressable flex flex-col items-center gap-1.5">
          <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-line text-ink-3">
            <PlusIcon className="size-5" />
          </span>
          <span className="text-center text-[11px] font-medium leading-tight text-ink-3">{foods.length ? "Edit" : "Add one"}</span>
        </Link>
      </div>
    </section>
  );
}

export function UsualFoodButton({ food, onTap }: { food: UsualFood; onTap: () => void }) {
  const Icon = USUAL_ICON[food.icon];
  return (
    <button type="button" onClick={onTap} className="pressable flex min-w-0 flex-col items-center gap-1.5" aria-label={`Log ${food.name}, ${food.serving}, ${round(food.protein_g)} grams protein`}>
      <span className="flex size-12 items-center justify-center rounded-full bg-fuel/15 text-fuel">
        <Icon className="size-6" />
      </span>
      <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-ink-2">{food.label}</span>
      <span className="-mt-1 text-[10px] font-semibold tabular text-ink-3">{round(food.protein_g)} g protein</span>
    </button>
  );
}
