"use client";

import { useState } from "react";
import { rememberFact } from "@/lib/client/coach";
import type { CoachAnswer } from "@/lib/domain/coach/answer";
import type { CoachMessage } from "@/lib/domain/coach/message";
import { AlertIcon, CheckIcon, PlusIcon, SparkIcon } from "../icons";
import { useToast } from "../toast";
import { CoachActions } from "./actions";

/**
 * One answer, sized for a phone: an optional doctor note first, then the direct answer,
 * what the logs show, what went well, what to do now, and what to watch.
 */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      {children}
    </div>
  );
}

function Bullets({ items, tone = "dot" }: { items: string[]; tone?: "dot" | "check" | "number" }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((text, i) => (
        <li key={`${i}-${text}`} className="flex gap-2.5 text-[15px] leading-relaxed">
          {tone === "check" ? (
            <CheckIcon className="mt-1 size-4 shrink-0 text-good" />
          ) : tone === "number" ? (
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">{i + 1}</span>
          ) : (
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-3" />
          )}
          <span className="min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  );
}

function Remember({ facts }: { facts: string[] }) {
  const { show } = useToast();
  const [saved, setSaved] = useState<string[]>([]);
  if (facts.length === 0) return null;
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <p className="mb-2 text-[13px] text-ink-2">Remember this for next time?</p>
      <div className="flex flex-wrap gap-2">
        {facts.map((f) => {
          const done = saved.includes(f);
          return (
            <button
              key={f}
              type="button"
              disabled={done}
              onClick={async () => {
                try {
                  await rememberFact(f);
                  setSaved((s) => [...s, f]);
                  show("Saved to memory.", "good");
                } catch {
                  show("Could not save. Try again when online.", "tip");
                }
              }}
              className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-left text-[14px] font-medium disabled:opacity-60"
            >
              {done ? <CheckIcon className="size-4 text-good" /> : <PlusIcon className="size-4 text-brand" />}
              {f}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AnswerBody({ answer }: { answer: CoachAnswer }) {
  return (
    <div className="flex flex-col gap-4">
      {answer.doctor ? (
        <div className="flex gap-3 rounded-2xl bg-care/10 p-3.5" role="alert">
          <AlertIcon className="mt-0.5 size-5 shrink-0 text-care" />
          <p className="text-[15px] leading-relaxed">{answer.doctor}</p>
        </div>
      ) : null}
      <h3 className="text-[19px] font-semibold leading-snug tracking-tight">{answer.headline}</h3>
      {answer.why.length > 0 ? (
        <Section label="What I see">
          <Bullets items={answer.why} />
        </Section>
      ) : null}
      {answer.good.length > 0 ? (
        <Section label="Went well">
          <Bullets items={answer.good} tone="check" />
        </Section>
      ) : null}
      {answer.now.length > 0 ? (
        <Section label="Do now">
          <Bullets items={answer.now} tone="number" />
        </Section>
      ) : null}
      <CoachActions actions={answer.actions} />
      {answer.watch.length > 0 ? (
        <Section label="Watch">
          <Bullets items={answer.watch} />
        </Section>
      ) : null}
      <Remember facts={answer.remember} />
    </div>
  );
}

const CONFIDENCE: Record<CoachAnswer["confidence"], string> = {
  low: "Low confidence, little data yet",
  medium: "Medium confidence",
  high: "High confidence",
};

export function AnswerView({ message, onRetry }: { message: CoachMessage; onRetry: () => void }) {
  const shown = message.answer ?? message.quick;
  const pending = message.status === "pending";
  return (
    <div className="flex flex-col gap-4">
      {shown ? (
        <AnswerBody answer={shown} />
      ) : pending ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          <div className="h-5 w-4/5 animate-pulse rounded-full bg-surface-2" />
          <div className="h-4 w-full animate-pulse rounded-full bg-surface-2" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-2" />
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t border-line pt-3 text-[13px] text-ink-3">
        {pending ? (
          <>
            <SparkIcon className="size-4 shrink-0 animate-pulse text-brand" />
            <span>{shown ? "Quick take. Reading your logs and notes for more" : "Reading your logs and notes"}</span>
          </>
        ) : message.answer ? (
          <>
            <SparkIcon className="size-4 shrink-0 text-brand" />
            <span>
              From your logs and notes · {CONFIDENCE[message.answer.confidence]}. Not medical advice.
            </span>
          </>
        ) : (
          <>
            <span className="flex-1">{shown ? "Quick take from simple rules. The fuller answer did not come through." : "Could not reach the coach."}</span>
            <button type="button" onClick={onRetry} className="pressable h-8 shrink-0 rounded-full bg-surface-2 px-3 text-[13px] font-semibold text-brand">
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
