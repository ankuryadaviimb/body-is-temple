"use client";

import Link from "next/link";
import { useDayEvents, useSettings, useToday } from "@/lib/client/hooks";
import { timeLabel } from "@/lib/client/labels";
import { usePendingDeletes } from "@/lib/client/pending-delete";
import { mealSlotOf, ofKind } from "@/lib/domain/day";
import { mealAnalysisOf } from "@/lib/domain/events";
import {
  about,
  autoProtein,
  CHIA_FIBER_PER_TBSP,
  dailyTargets,
  dayNutrition,
  gaps,
  ISABGOL_FIBER_PER_TSP,
  NUTRIENT_LABEL,
  type Range,
} from "@/lib/domain/nutrition";
import { SectionTitle } from "../today/quick-tiles";
import { ProgressBar } from "../today/quick-tiles";

/** Today's nutrition in detail: totals with ranges, targets and why, per meal, and what to add. */

const SLOT: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", late: "Late snack" };

const fmt = (v: number) => v.toLocaleString("en-IN");
const r = (x: Range) => (x.low === x.high ? fmt(x.low) : `${fmt(x.low)} to ${fmt(x.high)}`);

export function NutritionScreen() {
  const today = useToday();
  const settings = useSettings();
  const raw = useDayEvents(today);
  const pending = usePendingDeletes();
  if (!today || !raw) return <main className="h-64 animate-pulse rounded-[22px] bg-surface" aria-busy="true" />;
  const events = raw.filter((e) => !pending.has(e.id));
  const now = new Date();
  const n = dayNutrition(events, settings);
  const t = dailyTargets(settings, now);
  const behind = gaps(n, t, now, settings.tz);
  const auto = settings.protein_auto ? autoProtein(settings.weight_kg, settings.height_cm) : null;
  const meals = ofKind(events, "meal");

  return (
    <main className="fade-in flex flex-col gap-6 pt-2">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Today</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">Nutrition</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Estimated from your meal photos. Photo estimates are often 20 to 30% off, so use them for trends, not exact counts.</p>
      </header>

      <section aria-label="Totals" className="flex flex-col gap-4 rounded-[24px] bg-surface p-4 shadow-card">
        <Total label="Protein" have={about(n.protein)} range={n.protein} target={t.protein} unit="g" color="text-fuel" />
        <Total label="Fiber" have={about(n.fiber)} range={n.fiber} target={t.fiber} unit="g" color="text-move" />
        <Total label="Calories" have={about(n.kcal)} range={n.kcal} target={t.kcal?.high ?? null} targetText={t.kcal ? `${r(t.kcal)} kcal` : null} unit="kcal" color="text-rest" />
        {n.macrosKnown ? (
          <>
            <Total label="Carbs" have={about(n.carbs)} range={n.carbs} target={t.carbs?.high ?? null} targetText={t.carbs ? `${r(t.carbs)} g` : null} unit="g" color="text-gut" />
            <Total label="Fat" have={about(n.fat)} range={n.fat} target={t.fat?.high ?? null} targetText={t.fat ? `${r(t.fat)} g` : null} unit="g" color="text-tip" />
          </>
        ) : null}
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[15px] font-medium">Vegetables and fruit</span>
          <span className="tabular text-[14px] text-ink-2">
            {n.veg + n.fruit} of {t.plants} servings
          </span>
        </div>
        <div>
          <p className="mb-2 text-[15px] font-medium">Key nutrients</p>
          <div className="flex flex-wrap gap-1.5">
            {n.covered.map((k) => (
              <span key={k} className="rounded-full bg-good/15 px-2.5 py-1 text-[12px] font-medium text-good">
                {NUTRIENT_LABEL[k]}
              </span>
            ))}
            {n.missing.map((k) => (
              <span key={k} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink-3">
                {NUTRIENT_LABEL[k]}: not yet
              </span>
            ))}
          </div>
        </div>
      </section>

      {behind.length > 0 ? (
        <section aria-label="What to add">
          <SectionTitle>What to add</SectionTitle>
          <ul className="flex flex-col gap-2">
            {behind.map((g) => (
              <li key={g.key} className="rounded-2xl bg-tip/10 px-4 py-3 text-[15px] leading-relaxed">
                {g.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Meals">
        <SectionTitle right={n.pending ? `${n.pending} still reading` : undefined}>Meals</SectionTitle>
        {meals.length === 0 ? (
          <p className="rounded-[22px] bg-surface p-4 text-[15px] text-ink-2 shadow-card">No meals logged yet today.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {meals.map((m) => {
              const a = mealAnalysisOf(m);
              const slot = mealSlotOf(m);
              return (
                <li key={m.id} className="rounded-[22px] bg-surface p-4 shadow-card">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[16px] font-semibold">{slot ? SLOT[slot] : "Meal"}</span>
                    <span className="text-[13px] text-ink-3">{timeLabel(m, settings.tz)}</span>
                  </div>
                  {a ? (
                    <>
                      <p className="mt-0.5 text-[14px] text-ink-2">{a.items.map((i) => (i.qty && i.qty > 1 ? `${i.qty} ${i.name}` : i.name)).join(", ")}</p>
                      <p className="tabular mt-2 text-[13px] text-ink-2">
                        Protein {r(a.protein_g)} g{a.carbs_g ? ` · Carbs ${r(a.carbs_g)} g` : ""}
                        {a.fat_g ? ` · Fat ${r(a.fat_g)} g` : ""}
                        {a.fiber_g ? ` · Fiber ${r(a.fiber_g)} g` : ""} · {r(a.kcal)} kcal
                      </p>
                      {a.nutrients && a.nutrients.length > 0 ? (
                        <p className="mt-1 text-[13px] text-good">Good source of {a.nutrients.map((k) => NUTRIENT_LABEL[k].toLowerCase()).join(", ")}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-0.5 text-[14px] text-ink-3">{m.meta?.ai_status === "pending" ? "Reading the photo..." : "Not read yet. Tap the meal on Today to describe it."}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Your targets">
        <SectionTitle>Your targets</SectionTitle>
        <ul className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface text-[14px] leading-relaxed shadow-card">
          <li className="px-4 py-3">
            <span className="font-semibold">Protein {t.protein ? `${t.protein} g` : "not set"}.</span>{" "}
            {auto
              ? `${auto.perKg} g per kg of ${auto.basisKg} kg${auto.capped ? " (the healthy weight for your height, so the target does not grow with body fat)" : " (your weight)"}, a common target when you train most days and want to lose fat.`
              : t.protein
                ? "Set by you in Settings."
                : "Add your weight and height in Settings."}
          </li>
          <li className="px-4 py-3">
            <span className="font-semibold">Fiber {t.fiber} g.</span> Includes Isabgol (about {ISABGOL_FIBER_PER_TSP} g a teaspoon) and chia seeds (about {CHIA_FIBER_PER_TBSP} g a tablespoon).
            {n.extraFiber > 0 ? ` ${n.extraFiber} g of today's fiber came from them.` : ""}
          </li>
          <li className="px-4 py-3">
            <span className="font-semibold">Calories {t.kcal ? `${r(t.kcal)}` : "not set"}.</span>{" "}
            {t.kcal ? "About 80 to 90% of what you burn on a training day, for steady fat loss." : "Add your birth year and sex in Settings for a calorie target."}
          </li>
        </ul>
        <Link href="/settings" className="pressable mt-3 flex h-11 items-center justify-center rounded-2xl bg-surface-2 text-[15px] font-semibold text-brand">
          Change body details
        </Link>
      </section>
    </main>
  );
}

function Total({
  label,
  have,
  range,
  target,
  targetText,
  unit,
  color,
}: {
  label: string;
  have: number;
  range: Range;
  target: number | null;
  targetText?: string | null;
  unit: string;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="tabular text-right text-[14px] text-ink-2">
          about {have.toLocaleString("en-IN")} {unit}
          {target ? <span className="text-ink-3"> of {targetText ?? `${target} ${unit}`}</span> : null}
        </span>
      </div>
      {target ? <ProgressBar value={have} max={target} colorClass={color} /> : null}
      <p className="mt-1 text-[12px] text-ink-3">
        Range {r(range)} {unit}
      </p>
    </div>
  );
}
