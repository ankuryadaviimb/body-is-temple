"use client";

import Link from "next/link";
import { useState } from "react";
import { logEvent } from "@/lib/client/log";
import type { CoachAction } from "@/lib/domain/coach/answer";
import { GasSheet } from "../gas-sheet";
import { ChartIcon, DropIcon, FeatherIcon, SeatIcon, SpoonIcon, WalkIcon, WindIcon } from "../icons";
import { useToast } from "../toast";

/** Buttons a coach answer can offer. Each maps to a fixed screen or one-tap log, never a URL from the AI. */
const LINKS: Partial<Record<CoachAction, { href: string; label: string; Icon: typeof SeatIcon }>> = {
  toilet: { href: "/toilet", label: "Toilet session", Icon: SeatIcon },
  practice: { href: "/practice", label: "Breathing practice", Icon: FeatherIcon },
  reset_heavy: { href: "/reset/heavy", label: "2-minute reset", Icon: FeatherIcon },
  reset_gas: { href: "/reset/gas", label: "Gas relief", Icon: WindIcon },
  insights: { href: "/insights", label: "Your patterns", Icon: ChartIcon },
};

const PILL = "pressable inline-flex h-10 items-center gap-1.5 rounded-full bg-brand/15 px-3.5 text-[14px] font-semibold text-brand";

export function CoachActions({ actions }: { actions: CoachAction[] }) {
  const { logged } = useToast();
  const [gasOpen, setGasOpen] = useState(false);
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => {
        const link = LINKS[a];
        if (link) {
          return (
            <Link key={a} href={link.href} className={PILL}>
              <link.Icon className="size-4" />
              {link.label}
            </Link>
          );
        }
        const log = async () => {
          if (a === "log_walk") logged(await logEvent("walk", { minutes: 10 }), "10-minute walk logged.");
          else if (a === "log_water") logged(await logEvent("water", { ml: 250 }), "Water logged.");
          else if (a === "log_isabgol") logged(await logEvent("isabgol", { tsp: 1, water_ml: 200 }), "Isabgol logged.");
          else if (a === "log_gas") setGasOpen(true);
        };
        const meta =
          a === "log_walk"
            ? { label: "Log a walk", Icon: WalkIcon }
            : a === "log_water"
              ? { label: "Log water", Icon: DropIcon }
              : a === "log_isabgol"
                ? { label: "Log Isabgol", Icon: SpoonIcon }
                : { label: "Rate gas", Icon: WindIcon };
        return (
          <button key={a} type="button" onClick={() => void log()} className={PILL}>
            <meta.Icon className="size-4" />
            {meta.label}
          </button>
        );
      })}
      <GasSheet open={gasOpen} onClose={() => setGasOpen(false)} />
    </div>
  );
}
