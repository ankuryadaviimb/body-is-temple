"use client";

import type { StreakResult } from "@/lib/domain/streak";
import { FREEZES_PER_MONTH } from "@/lib/domain/streak";
import { FlameIcon } from "../icons";
import { Sheet } from "../sheet";

/** What the flame on Today means, in plain words. */
export function StreakSheet({ open, onClose, streak, todayCounts }: { open: boolean; onClose: () => void; streak: StreakResult | null; todayCounts: boolean }) {
  const count = streak?.count ?? 0;
  const freezes = streak?.freezesLeft ?? FREEZES_PER_MONTH;
  return (
    <Sheet open={open} title="Your streak" onClose={onClose}>
      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-fuel/10 p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-fuel/20 text-fuel">
          <FlameIcon className="size-6" />
        </span>
        <span>
          <span className="block text-[22px] font-bold leading-tight tabular">
            {count} {count === 1 ? "day" : "days"} on track
          </span>
          <span className="block text-[13px] text-ink-2">{todayCounts ? "Today already counts." : "Today joins the count once you log a meal or a toilet visit."}</span>
        </span>
      </div>
      <ul className="flex flex-col gap-3 text-[15px] leading-relaxed">
        <li>
          <span className="font-semibold">A day counts</span> when it has at least one meal or one toilet visit logged. That is all. The number of rounds or how it went never matters here.
        </li>
        <li>
          <span className="font-semibold">One missed day never breaks it.</span> Only two misses in a row do, and even then a freeze covers it: {freezes} of {FREEZES_PER_MONTH} left this month.
        </li>
        <li>
          <span className="font-semibold">Why it is here:</span> logging most days is what lets the coach see your patterns. It rewards showing up, not perfect days.
        </li>
      </ul>
    </Sheet>
  );
}
