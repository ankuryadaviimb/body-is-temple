"use client";

import Link from "next/link";
import { useState } from "react";
import { logEvent } from "@/lib/client/log";
import type { Nudge } from "@/lib/domain/next-up";
import { GasSheet } from "../gas-sheet";
import { ClockIcon, SeatIcon, SpoonIcon, WalkIcon, WindIcon } from "../icons";
import { useToast } from "../toast";

/** The one most useful thing to do now (Isabgol window, post-meal walk, gas check, and so on). */
export function NextUpCard({ nudge }: { nudge: Nudge }) {
  const { logged } = useToast();
  const [gasOpen, setGasOpen] = useState(false);
  const Icon =
    nudge.action === "log_walk" ? WalkIcon : nudge.action === "log_gas" ? WindIcon : nudge.action === "toilet" ? SeatIcon : nudge.action === "log_isabgol" ? SpoonIcon : ClockIcon;
  const tint = nudge.tone === "tip" ? "bg-tip/15 text-tip" : "bg-brand/15 text-brand";
  const button = "pressable flex h-10 shrink-0 items-center rounded-full bg-brand px-4 text-[14px] font-semibold text-brand-ink";

  return (
    <section aria-label="Next up" className="fade-in -mt-2 flex items-center gap-3 rounded-[22px] bg-surface p-3.5 shadow-card">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${tint}`}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-wide text-ink-3">Next up</span>
        <span className="block text-[16px] font-semibold leading-snug">{nudge.title}</span>
        <span className="block text-[13px] leading-snug text-ink-2">{nudge.text}</span>
      </span>
      {nudge.action === "toilet" ? (
        <Link href="/toilet" className={button}>
          Start
        </Link>
      ) : nudge.action === "log_gas" ? (
        <button type="button" onClick={() => setGasOpen(true)} className={button}>
          Rate
        </button>
      ) : nudge.action === "log_walk" || nudge.action === "log_isabgol" ? (
        <button
          type="button"
          onClick={async () => {
            if (nudge.action === "log_walk") logged(await logEvent("walk", { minutes: 10 }), "10-minute walk logged.");
            else logged(await logEvent("isabgol", { tsp: 1, water_ml: 200 }), "Isabgol logged.");
          }}
          className={button}
        >
          Log
        </button>
      ) : null}
      <GasSheet open={gasOpen} onClose={() => setGasOpen(false)} />
    </section>
  );
}
