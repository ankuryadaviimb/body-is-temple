import type { StoredCoachCard } from "@/lib/domain/coach/card";
import { BulbIcon, CheckIcon, DumbbellIcon, SparkIcon } from "../icons";

/** The AI morning card: yesterday in one line, what went well, one fix, and today's one thing. */
export function CoachCardView({ card }: { card: StoredCoachCard }) {
  return (
    <section aria-label="From your coach" className="fade-in rounded-[28px] bg-surface p-5 shadow-card">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-brand">
        <SparkIcon className="size-4" /> From your coach
      </p>
      <h2 className="mt-2.5 text-[20px] font-semibold leading-snug tracking-tight">{card.headline}</h2>
      {card.went_well.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {card.went_well.map((w) => (
            <li key={w} className="flex gap-2.5 text-[15px] leading-relaxed">
              <CheckIcon className="mt-1 size-4 shrink-0 text-good" />
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      {card.to_fix ? (
        <p className="mt-3 rounded-2xl bg-tip/10 px-3.5 py-3 text-[15px] leading-relaxed">
          <span className="font-semibold">To fix: </span>
          {card.to_fix}
        </p>
      ) : null}
      <div className="mt-3 flex gap-3 rounded-2xl bg-brand-soft p-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <BulbIcon className="size-4" />
        </span>
        <p className="text-[15px] leading-relaxed">
          <span className="font-semibold">Today&apos;s one thing: </span>
          {card.one_thing}
        </p>
      </div>
      {card.class_tip ? (
        <p className="mt-3 flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
          <DumbbellIcon className="mt-0.5 size-4 shrink-0 text-move" />
          {card.class_tip}
        </p>
      ) : null}
    </section>
  );
}
