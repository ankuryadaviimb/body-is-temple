"use client";

import { useState } from "react";
import { MAX_USUAL_FOODS, USUAL_ICONS, UsualFood, usualIdFor, type UsualIcon } from "@/lib/domain/usual-foods";
import { USUAL_ICON } from "../event-visuals";
import { ChevronRightIcon, PlusIcon, TrashIcon } from "../icons";
import { Choice, Sheet } from "../sheet";

/**
 * Settings group for usual foods: the one-tap foods on Today, each with its label values.
 * Each change saves at once (the parent saves it).
 */
export function UsualFoodsGroup({ foods, onChange }: { foods: UsualFood[]; onChange: (next: UsualFood[]) => void }) {
  const [editing, setEditing] = useState<UsualFood | "new" | null>(null);
  const editingFood = editing === "new" ? null : editing;
  return (
    <section id="usual-foods" className="scroll-mt-4">
      <h2 className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Usual foods</h2>
      <div className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-card">
        {foods.map((f) => {
          const Icon = USUAL_ICON[f.icon];
          return (
            <button key={f.id} type="button" onClick={() => setEditing(f)} className="pressable flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fuel/15 text-fuel">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px]">{f.label}</span>
                <span className="block truncate text-[13px] text-ink-3">
                  {f.serving} · {Math.round(f.protein_g)} g protein · {Math.round(f.kcal)} kcal
                </span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
            </button>
          );
        })}
        <button
          type="button"
          disabled={foods.length >= MAX_USUAL_FOODS}
          onClick={() => setEditing("new")}
          className="pressable flex h-12 w-full items-center gap-2 px-4 text-[15px] font-semibold text-brand disabled:opacity-50"
        >
          <PlusIcon className="size-5" /> Add a usual food
        </button>
      </div>
      <p className="mt-2 px-4 text-xs leading-relaxed text-ink-3">
        Foods you eat often, with values from the pack label. One tap on Today logs them with exact protein and calories, with no AI and no waiting.
      </p>
      {editing ? (
        <UsualFoodEditor
          food={editingFood}
          takenIds={foods.map((f) => f.id)}
          onClose={() => setEditing(null)}
          onSave={(food) => {
            onChange(editingFood ? foods.map((f) => (f.id === editingFood.id ? food : f)) : [...foods, food]);
            setEditing(null);
          }}
          onRemove={
            editingFood
              ? () => {
                  onChange(foods.filter((f) => f.id !== editingFood.id));
                  setEditing(null);
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}

type Draft = {
  label: string;
  name: string;
  serving: string;
  icon: UsualIcon;
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
  snack: boolean;
};

const NUM_FIELDS: { key: "protein_g" | "kcal" | "carbs_g" | "fat_g" | "fiber_g"; label: string; unit: string }[] = [
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "kcal", label: "Energy", unit: "kcal" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "fiber_g", label: "Fibre", unit: "g" },
];

function toDraft(f: UsualFood | null): Draft {
  const n = (v: number | undefined) => (v === undefined ? "" : String(v));
  return {
    label: f?.label ?? "",
    name: f?.name ?? "",
    serving: f?.serving ?? "",
    icon: f?.icon ?? "plate",
    kcal: n(f?.kcal),
    protein_g: n(f?.protein_g),
    carbs_g: n(f?.carbs_g),
    fat_g: n(f?.fat_g),
    fiber_g: n(f?.fiber_g),
    snack: f?.snack ?? true,
  };
}

function UsualFoodEditor({
  food,
  takenIds,
  onClose,
  onSave,
  onRemove,
}: {
  food: UsualFood | null;
  takenIds: string[];
  onClose: () => void;
  onSave: (f: UsualFood) => void;
  onRemove?: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(food));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const num = (t: string) => (t.trim() === "" ? 0 : Number(t));
  const candidate = {
    id: food?.id ?? usualIdFor(d.label, takenIds),
    name: (d.name.trim() || d.label.trim()).slice(0, 80),
    label: d.label.trim(),
    serving: d.serving.trim() || "1 serving",
    icon: d.icon,
    kcal: num(d.kcal),
    protein_g: num(d.protein_g),
    carbs_g: num(d.carbs_g),
    fat_g: num(d.fat_g),
    fiber_g: num(d.fiber_g),
    tags: food?.tags ?? [],
    nutrients: food?.nutrients ?? [],
    fruit_servings: food?.fruit_servings ?? 0,
    snack: d.snack,
  };
  const parsed = UsualFood.safeParse(candidate);
  const missing = !d.label.trim() ? "Give it a short name." : d.protein_g.trim() === "" || d.kcal.trim() === "" ? "Add protein and energy from the label." : null;
  const invalid = missing ?? (parsed.success ? null : "Check the numbers: each must be a plain number within label range.");
  const input = "h-11 w-full rounded-xl bg-surface-2 px-3 text-[16px] outline-none";

  return (
    <Sheet open title={food ? `Edit ${food.label}` : "Add a usual food"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">Short name, on the button</span>
          <input value={d.label} maxLength={14} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Protein bar" className={input} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">Full name (optional)</span>
          <input value={d.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="Brand and flavour" className={input} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold uppercase tracking-wide text-ink-3">One tap is</span>
          <input value={d.serving} maxLength={40} onChange={(e) => set("serving", e.target.value)} placeholder="e.g. 1 bar (52 g)" className={input} />
        </label>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Icon</legend>
          <div className="flex flex-wrap gap-2">
            {USUAL_ICONS.map((i) => {
              const Icon = USUAL_ICON[i];
              const active = d.icon === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => set("icon", i)}
                  aria-pressed={active}
                  aria-label={i}
                  className={`pressable flex size-11 items-center justify-center rounded-full ${active ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-2"}`}
                >
                  <Icon className="size-5" />
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2">
          {NUM_FIELDS.map((f) => (
            <label key={f.key} className="flex h-12 items-center gap-3 px-4">
              <span className="flex-1 text-[16px]">{f.label}</span>
              <input
                inputMode="decimal"
                value={d[f.key]}
                onChange={(e) => {
                  const t = e.target.value.replace(",", ".").trim();
                  if (/^\d*\.?\d*$/.test(t)) set(f.key, t);
                }}
                placeholder="0"
                className="tabular w-24 bg-transparent text-right text-[16px] outline-none placeholder:text-ink-3"
              />
              <span className="w-10 text-[14px] text-ink-3">{f.unit}</span>
            </label>
          ))}
        </div>
        <Choice
          label="Counts as"
          value={d.snack}
          onChange={(v) => set("snack", v)}
          options={[
            { value: true, label: "A snack" },
            { value: false, label: "Meal by time of day" },
          ]}
        />
        {invalid ? (
          <p className="-mt-2 text-[13px] text-care" role="alert">
            {invalid}
          </p>
        ) : null}
        <div className="flex gap-3">
          {onRemove ? (
            <button type="button" onClick={onRemove} className="pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-care/10 px-4 font-semibold text-care" aria-label="Remove this usual food">
              <TrashIcon className="size-[18px]" />
            </button>
          ) : null}
          <button
            type="button"
            disabled={invalid !== null || !parsed.success}
            onClick={() => parsed.success && onSave(parsed.data)}
            className="pressable h-12 flex-1 rounded-2xl bg-brand font-semibold text-brand-ink disabled:opacity-50"
          >
            {food ? "Done" : "Add"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
