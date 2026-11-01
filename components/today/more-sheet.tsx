"use client";

import Link from "next/link";
import { useState } from "react";
import { logEvent } from "@/lib/client/log";
import { Choice, Sheet } from "../sheet";
import { useToast } from "../toast";

type Panel = "menu" | "meal_text" | "weight" | "mood" | "stress" | "symptom" | "note" | "workout";

/** Less frequent logs. Every one is a tap or two; text is optional and short. */
export function MoreSheet({ open, onClose, onEarlier }: { open: boolean; onClose: () => void; onEarlier?: () => void }) {
  const [panel, setPanel] = useState<Panel>("menu");
  const [text, setText] = useState("");
  const [num, setNum] = useState<string>("");
  const [level, setLevel] = useState<number | undefined>(undefined);
  const [symptom, setSymptom] = useState<"bleeding" | "pain" | "fissure" | "other" | undefined>(undefined);
  const { logged } = useToast();

  function close() {
    setPanel("menu");
    setText("");
    setNum("");
    setLevel(undefined);
    setSymptom(undefined);
    onClose();
  }

  async function quick(kind: "intimacy" | "late_work") {
    logged(await logEvent(kind, {}), kind === "intimacy" ? "Logged privately." : "Logged. Late nights often show up in the next morning.");
    close();
  }

  async function submit() {
    if (panel === "meal_text" && text.trim()) {
      logged(await logEvent("meal", { text: text.trim().slice(0, 500) }), "Meal saved. Details appear in a few seconds.");
    } else if (panel === "weight" && Number(num) >= 25) {
      logged(await logEvent("weigh_in", { kg: Math.round(Number(num) * 10) / 10 }), "Weight saved.");
    } else if ((panel === "mood" || panel === "stress") && level) {
      logged(await logEvent(panel, { level }), "Saved.");
    } else if (panel === "symptom" && symptom) {
      logged(
        await logEvent("symptom", { type: symptom, ...(text.trim() ? { text: text.trim().slice(0, 500) } : {}) }),
        symptom === "bleeding"
          ? "Saved. If bleeding is more than streaks or keeps happening, please see your doctor."
          : "Saved.",
      );
    } else if (panel === "note" && text.trim()) {
      logged(await logEvent("note", { text: text.trim().slice(0, 1000) }), "Note saved.");
    } else if (panel === "workout" && text.trim() && Number(num) > 0) {
      logged(await logEvent("workout", { type: text.trim().slice(0, 60), duration_min: Math.round(Number(num)) }), "Workout saved.");
    } else {
      return;
    }
    close();
  }

  const input = "h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base";
  const titles: Record<Panel, string> = {
    menu: "Log something else",
    meal_text: "Describe a meal",
    weight: "Weight",
    mood: "Mood",
    stress: "Stress",
    symptom: "Symptom",
    note: "Note",
    workout: "Workout",
  };

  return (
    <Sheet open={open} title={titles[panel]} onClose={close}>
      {panel === "menu" ? (
        <div className="grid grid-cols-2 gap-2">
          {onEarlier ? (
            <button type="button" onClick={onEarlier} className="col-span-2 h-14 rounded-2xl bg-brand/15 font-semibold text-brand">
              Add an earlier entry (meal, toilet, water, tea...)
            </button>
          ) : null}
          <Link href="/records" onClick={close} className="col-span-2 flex h-14 items-center justify-center rounded-2xl bg-surface-2 font-medium">
            Upload a report (blood test, consultation)
          </Link>
          {(
            [
              ["meal_text", "Meal by text"],
              ["workout", "Workout"],
              ["weight", "Weight"],
              ["mood", "Mood"],
              ["stress", "Stress"],
              ["symptom", "Symptom"],
              ["note", "Note"],
            ] as [Panel, string][]
          ).map(([p, label]) => (
            <button key={p} type="button" onClick={() => setPanel(p)} className="h-14 rounded-2xl bg-surface-2 font-medium">
              {label}
            </button>
          ))}
          <button type="button" onClick={() => quick("intimacy")} className="h-14 rounded-2xl bg-surface-2 font-medium">
            Intimacy
          </button>
          <button type="button" onClick={() => quick("late_work")} className="h-14 rounded-2xl bg-surface-2 font-medium">
            Worked late
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {panel === "meal_text" || panel === "note" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={panel === "note" ? 1000 : 500}
              rows={3}
              placeholder={panel === "meal_text" ? "e.g. 2 roti, moong dal, curd" : "Anything worth remembering"}
              className="rounded-xl border border-line bg-surface-2 p-4 text-base"
            />
          ) : null}
          {panel === "weight" ? (
            <input inputMode="decimal" value={num} onChange={(e) => setNum(e.target.value)} placeholder="kg" className={input} />
          ) : null}
          {panel === "workout" ? (
            <>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. HIIT class, yoga, run" maxLength={60} className={input} />
              <input inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} placeholder="Minutes" className={input} />
            </>
          ) : null}
          {panel === "mood" || panel === "stress" ? (
            <Choice
              label={panel === "mood" ? "1 is low, 5 is great" : "1 is calm, 5 is very stressed"}
              value={level}
              onChange={setLevel}
              options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))}
            />
          ) : null}
          {panel === "symptom" ? (
            <>
              <Choice
                label="What happened?"
                value={symptom}
                onChange={setSymptom}
                options={[
                  { value: "bleeding", label: "Bleeding" },
                  { value: "pain", label: "Pain" },
                  { value: "fissure", label: "Fissure or cut" },
                  { value: "other", label: "Other" },
                ]}
              />
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Details (optional)" maxLength={500} className={input} />
            </>
          ) : null}
          <div className="flex gap-3">
            <button type="button" onClick={() => setPanel("menu")} className="h-12 flex-1 rounded-xl border border-line font-semibold">
              Back
            </button>
            <button type="button" onClick={() => void submit()} className="h-12 flex-[2] rounded-xl bg-brand font-semibold text-brand-ink">
              Save
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
