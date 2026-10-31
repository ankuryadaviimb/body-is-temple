import type { MorningCard } from "@/lib/domain/ladder";
import { BulbIcon } from "../icons";

/** This week's habit, how often it held, yesterday in chips, and one tip. */
export function MorningCardView({ card }: { card: MorningCard }) {
  const { focus } = card;
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-brand-soft p-5" aria-label="This week's habit">
      <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-brand/15 blur-2xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-brand">
            This week · habit {focus.number} of {focus.total}
          </p>
          <div className="flex items-center gap-1" aria-label={`Held ${focus.heldDays} of ${focus.needed} days`}>
            {Array.from({ length: focus.needed }, (_, i) => (
              <span key={i} className={`size-2 rounded-full ${i < focus.heldDays ? "bg-brand" : "bg-brand/20"}`} />
            ))}
          </div>
        </div>
        <h2 className="mt-3 text-[21px] font-semibold leading-snug tracking-tight">{focus.gut}</h2>
        <p className="mt-1.5 text-[15px] text-ink-2">
          <span className="font-medium text-ink">Also:</span> {focus.other}
        </p>
        <p className="mt-2 text-xs text-ink-3">
          {focus.heldDays >= focus.needed
            ? "Held. The next habit unlocks tomorrow."
            : `Hold it on ${focus.needed - focus.heldDays} more ${focus.needed - focus.heldDays === 1 ? "day" : "days"} this week to unlock the next one.`}
        </p>

        {card.yesterday.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Yesterday</p>
            <ul className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
              {card.yesterday.map((line) => (
                <li key={line} className="shrink-0 whitespace-nowrap rounded-full bg-surface/70 px-3 py-1.5 text-[13px] font-medium">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {card.tip ? (
          <div className="mt-4 flex gap-3 rounded-2xl bg-surface/80 p-3.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tip/15 text-tip">
              <BulbIcon className="size-4" />
            </span>
            <p className="text-sm leading-relaxed">{card.tip}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
