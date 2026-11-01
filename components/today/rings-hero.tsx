"use client";

import { useState } from "react";
import { ringProgress, type Ring } from "@/lib/domain/rings";
import { CheckIcon, ChevronRightIcon } from "../icons";
import { Sheet } from "../sheet";

const TEXT: Record<Ring["id"], string> = { gut: "text-ring-gut", fuel: "text-ring-fuel", move: "text-ring-move", rest: "text-ring-rest" };
const DOT: Record<Ring["id"], string> = { gut: "bg-ring-gut", fuel: "bg-ring-fuel", move: "bg-ring-move", rest: "bg-ring-rest" };

const RADII = [50, 39, 28, 17];
const STROKE = 9;

function ConcentricRings({ rings, size = 132 }: { rings: Ring[]; size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Today's rings">
      {rings.map((ring, i) => {
        const r = RADII[i];
        const c = 2 * Math.PI * r;
        const { ratio } = ringProgress(ring);
        const arc = Math.max(0, Math.min(1, ratio)) * c;
        return (
          <g key={ring.id} className={TEXT[ring.id]}>
            <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth={STROKE} />
            {arc > 0 ? (
              <circle
                className="ring-arc"
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke="currentColor"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${arc} ${c}`}
                transform="rotate(-90 60 60)"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function nextStep(ring: Ring): string | null {
  return ring.segments.find((s) => s.done === null || s.done === false)?.label ?? null;
}

/** Hero card: Apple-style concentric rings with a legend. Tap for what fills each ring. */
export function RingsHero({ rings }: { rings: Ring[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex w-full items-center gap-5 rounded-[28px] bg-surface p-5 text-left shadow-card"
        aria-label="See what fills each ring"
      >
        <ConcentricRings rings={rings} />
        <ul className="min-w-0 flex-1 space-y-2.5">
          {rings.map((ring) => {
            const { done, applicable } = ringProgress(ring);
            const total = applicable || ring.segments.length;
            return (
              <li key={ring.id} className="flex items-center gap-2.5">
                <span className={`size-2.5 shrink-0 rounded-full ${DOT[ring.id]}`} />
                <span className="flex-1 text-[15px] font-semibold">{ring.label}</span>
                <span className="tabular text-[15px] text-ink-2">
                  {done}
                  <span className="text-ink-3">/{total}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
      </button>

      <Sheet open={open} title="Your rings" onClose={() => setOpen(false)}>
        <p className="mb-4 text-sm leading-relaxed text-ink-2">
          Rings fill only from things you control. How your gut responds is tracked separately, so a hard morning never costs you a ring.
        </p>
        <div className="space-y-4">
          {rings.map((ring) => (
            <section key={ring.id} className="rounded-2xl bg-surface-2 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${DOT[ring.id]}`} />
                <h3 className="font-semibold">{ring.label}</h3>
                {nextStep(ring) ? <span className="ml-auto text-xs text-ink-3">Next: {nextStep(ring)}</span> : null}
              </div>
              <ul className="space-y-2">
                {ring.segments.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 text-[15px]">
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                        s.done === true ? `${DOT[ring.id]} text-bg` : "border border-line text-ink-3"
                      }`}
                    >
                      {s.done === true ? <CheckIcon className="size-3.5" /> : null}
                    </span>
                    <span className={s.done === null ? "text-ink-3" : ""}>{s.label}</span>
                    {s.done === null ? <span className="ml-auto text-xs text-ink-3">no data yet</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}
