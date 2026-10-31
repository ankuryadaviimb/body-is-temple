import type { MorningCard } from "@/lib/domain/ladder";

export function MorningCardView({ card }: { card: MorningCard }) {
  const { focus } = card;
  return (
    <section className="rounded-3xl bg-brand-soft p-5" aria-label="Today's focus">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">
        Habit {focus.number} of {focus.total} · held {focus.heldDays} of {focus.needed} days
      </p>
      <h2 className="mt-2 text-lg font-semibold leading-snug">{focus.gut}</h2>
      <p className="mt-1 text-sm text-ink-2">Also: {focus.other}</p>
      {card.yesterday.length > 0 ? (
        <div className="mt-4 border-t border-brand/15 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Yesterday</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {card.yesterday.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {card.tip ? <p className="mt-3 rounded-2xl bg-surface/70 px-3 py-2 text-sm leading-snug">{card.tip}</p> : null}
    </section>
  );
}
