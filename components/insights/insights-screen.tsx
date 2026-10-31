"use client";

import { useEffect, useState } from "react";
import { refreshInsights, useInsights } from "@/lib/client/coach";
import { findingValue, MIN_DAYS, OUTCOMES, type Finding, type LearningItem } from "@/lib/domain/tolerance";
import { SectionTitle } from "../today/quick-tiles";

/**
 * "What your gut tells us": patterns from the person's own logs, computed by code.
 * Grouped by food or habit, with honest day counts and a plain caveat.
 */

const KIND_LABEL = { food: "Food", tag: "Meal type", habit: "Habit" } as const;

function groupByExposure(findings: Finding[]): Finding[][] {
  const map = new Map<string, Finding[]>();
  for (const f of findings) map.set(f.exposure.key, [...(map.get(f.exposure.key) ?? []), f]);
  return [...map.values()];
}

/** Two bars: with and without, drawn with SVG attributes (CSP safe, no inline styles). */
function Compare({ f }: { f: Finding }) {
  const scale = { evening_gas: 4, next_smooth: 1, next_rounds: 4, heavy: 3 }[f.outcome];
  const max = Math.max(scale, f.withMean, f.withoutMean);
  const w = (v: number) => Math.max(2, Math.min(100, (v / max) * 100));
  const worse = f.effect === "worse";
  return (
    <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="block h-3.5 w-full" aria-hidden>
      <rect x="0" y="0" width="100" height="5" rx="2.5" className="fill-surface-3" />
      <rect x="0" y="0" width={w(f.withMean)} height="5" rx="2.5" className={worse ? "fill-care" : "fill-good"} />
      <rect x="0" y="9" width="100" height="5" rx="2.5" className="fill-surface-3" />
      <rect x="0" y="9" width={w(f.withoutMean)} height="5" rx="2.5" className="fill-ink-3" />
    </svg>
  );
}

function outcomeLine(f: Finding): string {
  const spec = OUTCOMES[f.outcome];
  const direction = f.diff > 0 ? "More" : f.outcome === "evening_gas" ? "Less" : "Fewer";
  return `${direction} ${spec.label}`;
}

function FindingCard({ group }: { group: Finding[] }) {
  const first = group[0];
  const strength = group.some((f) => f.strength === "steady") ? "Steady pattern" : "Early pattern";
  return (
    <article className="rounded-[22px] bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{KIND_LABEL[first.exposure.kind]}</p>
          <h3 className="mt-0.5 text-[18px] font-semibold leading-snug tracking-tight">{first.exposure.label}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-ink-2">{strength}</span>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {group.map((f) => (
          <li key={f.outcome}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-medium">{outcomeLine(f)}</span>
              <span className="tabular shrink-0 text-[14px] text-ink-2">
                {findingValue(f, "with")} <span className="text-ink-3">vs</span> {findingValue(f, "without")}
              </span>
            </div>
            <Compare f={f} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-ink-3">
        {first.withDays} days with it, {first.withoutDays} without. Top bar with, bottom bar without.
      </p>
    </article>
  );
}

function LearningRow({ item }: { item: LearningItem }) {
  const have = Math.min(item.withDays, MIN_DAYS);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1 truncate text-[15px]">{item.exposure.label}</span>
      <span className="flex shrink-0 gap-1" aria-label={`${have} of ${MIN_DAYS} days`}>
        {Array.from({ length: MIN_DAYS }, (_, i) => (
          <span key={i} className={`size-2 rounded-full ${i < have ? "bg-brand" : "bg-surface-3"}`} />
        ))}
      </span>
      <span className="tabular shrink-0 whitespace-nowrap text-right text-[13px] text-ink-3">
        {have} of {MIN_DAYS}
      </span>
    </li>
  );
}

export function InsightsScreen() {
  const insights = useInsights();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void refreshInsights().finally(() => setLoading(false));
  }, []);

  if (insights === undefined || (insights === null && loading)) {
    return (
      <main className="flex flex-col gap-4 pt-2" aria-busy="true">
        <div className="mt-2 h-9 w-48 animate-pulse rounded-full bg-surface" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-[22px] bg-surface" />
        ))}
      </main>
    );
  }

  const report = insights?.report;
  const worse = groupByExposure(report?.findings.filter((f) => f.effect === "worse") ?? []);
  const better = groupByExposure(report?.findings.filter((f) => f.effect === "better") ?? []);

  return (
    <main className="fade-in flex flex-col gap-6 pt-2">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">What your gut tells us{loading ? " · updating" : ""}</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">Your patterns</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {report ? `From ${report.daysLogged} logged ${report.daysLogged === 1 ? "day" : "days"}. ` : ""}A pattern shows once a food or habit has {MIN_DAYS} days with it and {MIN_DAYS} without, so it is never a guess from one bad day.
        </p>
      </header>

      {!report ? (
        <p className="rounded-[22px] bg-surface p-4 text-[15px] text-ink-2 shadow-card">Connect to the internet once to load your patterns.</p>
      ) : null}

      {report && worse.length === 0 && better.length === 0 ? (
        <section className="relative overflow-hidden rounded-[28px] bg-brand-soft p-5">
          <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-brand/15 blur-2xl" aria-hidden />
          <h2 className="relative text-[19px] font-semibold leading-snug">Temple is still learning</h2>
          <p className="relative mt-1.5 text-[15px] leading-relaxed text-ink-2">
            Keep snapping meals and logging your rounds and evening gas. Each day teaches it a little more about what suits you.
          </p>
        </section>
      ) : null}

      {worse.length > 0 ? (
        <section aria-label="Linked to rougher days">
          <SectionTitle>Linked to rougher days</SectionTitle>
          <div className="flex flex-col gap-3">
            {worse.map((g) => (
              <FindingCard key={g[0].exposure.key} group={g} />
            ))}
          </div>
        </section>
      ) : null}

      {better.length > 0 ? (
        <section aria-label="Linked to better days">
          <SectionTitle>Linked to better days</SectionTitle>
          <div className="flex flex-col gap-3">
            {better.map((g) => (
              <FindingCard key={g[0].exposure.key} group={g} />
            ))}
          </div>
        </section>
      ) : null}

      {report && report.learning.length > 0 ? (
        <section aria-label="Still learning">
          <SectionTitle right="days with it">Still learning</SectionTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-card">
            {report.learning.map((item) => (
              <LearningRow key={item.exposure.key} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="px-1 text-[13px] leading-relaxed text-ink-3">
        Patterns, not proof. Foods often come together (poori with chana), so Temple keeps checking as days add up. Not medical advice.
      </p>
    </main>
  );
}
