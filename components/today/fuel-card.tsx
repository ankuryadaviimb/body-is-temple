"use client";

import Link from "next/link";
import { about, dailyTargets, dayNutrition, gaps, NUTRIENT_LABEL } from "@/lib/domain/nutrition";
import type { StoredEvent } from "@/lib/domain/events";
import type { Settings } from "@/lib/domain/settings";
import { ChevronRightIcon } from "../icons";
import { ProgressBar } from "./quick-tiles";

/** Today's protein, fiber and calories against targets, from meal photo estimates. */
export function FuelCard({ events, settings }: { events: StoredEvent[]; settings: Settings }) {
  const now = new Date();
  const n = dayNutrition(events, settings);
  const t = dailyTargets(settings, now);
  const behind = gaps(n, t, now, settings.tz);
  const protein = about(n.protein);
  const fiber = about(n.fiber);
  const kcal = about(n.kcal);
  const plants = n.veg + n.fruit;

  return (
    <Link href="/nutrition" aria-label="Nutrition today" className="pressable block rounded-[24px] bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Fuel today</span>
        <span className="flex items-center gap-1 text-[13px] text-ink-3">
          {n.meals === 0 ? "No meals yet" : `${n.meals} ${n.meals === 1 ? "meal" : "meals"}${n.pending ? `, ${n.pending} reading` : ""}`}
          <ChevronRightIcon className="size-4" />
        </span>
      </div>

      {n.analyzed === 0 ? (
        <p className="text-[15px] leading-relaxed text-ink-2">
          {n.pending > 0
            ? "Reading your meal. Protein, carbs, fat, fiber and nutrients appear in a few seconds."
            : "Snap your meals. Each photo gives protein, carbs, fat, fiber, calories and key nutrients, and this card adds them up against your targets."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <Row label="Protein" value={t.protein ? `${protein} of ${t.protein} g` : `about ${protein} g`} bar={t.protein ? <ProgressBar value={protein} max={t.protein} colorClass="text-fuel" /> : null} />
          <Row label="Fiber" value={`${fiber} of ${t.fiber} g`} bar={<ProgressBar value={fiber} max={t.fiber} colorClass="text-move" />} />
          <Row
            label="Calories"
            value={t.kcal ? `${kcal.toLocaleString("en-IN")} of ${t.kcal.high.toLocaleString("en-IN")}` : `about ${kcal.toLocaleString("en-IN")}`}
            bar={t.kcal ? <ProgressBar value={kcal} max={t.kcal.high} colorClass="text-rest" /> : null}
          />
          <div className="flex flex-wrap gap-1.5">
            {n.macrosKnown ? (
              <>
                <Chip>Carbs about {about(n.carbs)} g</Chip>
                <Chip>Fat about {about(n.fat)} g</Chip>
              </>
            ) : null}
            {n.detailsKnown ? (
              <Chip>
                Veg and fruit {plants} of {t.plants}
              </Chip>
            ) : null}
            {n.covered.map((k) => (
              <Chip key={k} tone="good">
                {NUTRIENT_LABEL[k]}
              </Chip>
            ))}
          </div>
          {behind[0] ? <p className="rounded-2xl bg-tip/10 px-3.5 py-2.5 text-[14px] leading-relaxed">{behind[0].text}</p> : null}
        </div>
      )}
      {!t.protein ? <p className="mt-3 text-[13px] text-ink-3">Add your weight and height in Settings for a protein target.</p> : null}
    </Link>
  );
}

function Row({ label, value, bar }: { label: string; value: string; bar: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="tabular text-[14px] text-ink-2">{value}</span>
      </div>
      {bar}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "good" }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${tone === "good" ? "bg-good/15 text-good" : "bg-surface-2 text-ink-2"}`}>{children}</span>
  );
}
