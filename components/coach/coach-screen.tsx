"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { askCoach, deleteCoachMessage, refreshCoach, refreshInsights, refreshMemory, retryCoach, takePendingAsk, useCoachMessages, useInsights, useMemory } from "@/lib/client/coach";
import { COACH_CHIPS, classifyIntent, type CoachChip } from "@/lib/domain/coach/intents";
import type { CoachMessage } from "@/lib/domain/coach/message";
import { BookIcon, ChartIcon, NoteIcon, ChevronRightIcon, FeatherIcon, PlateIcon, SeatIcon, SendIcon, SpoonIcon, SunIcon, TrashIcon, WindIcon } from "../icons";
import { SectionTitle } from "../today/quick-tiles";
import { useToast } from "../toast";
import { AnswerView } from "./answer-view";
import { TriageSheet } from "./triage-sheet";

const CHIP_ICON: Record<CoachChip["intent"], { Icon: typeof SeatIcon; tint: string }> = {
  should_go: { Icon: SeatIcon, tint: "bg-gut/15 text-gut" },
  gas: { Icon: WindIcon, tint: "bg-rest/15 text-rest" },
  morning: { Icon: SunIcon, tint: "bg-fuel/15 text-fuel" },
  heavy: { Icon: FeatherIcon, tint: "bg-gut/15 text-gut" },
  ate_right: { Icon: PlateIcon, tint: "bg-move/15 text-move" },
  dinner: { Icon: SpoonIcon, tint: "bg-fuel/15 text-fuel" },
};

function when(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function CoachScreen() {
  const messages = useCoachMessages();
  const insights = useInsights();
  const memory = useMemory();
  const { show } = useToast();
  const [triageOpen, setTriageOpen] = useState(false);
  const [text, setText] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const asked = useRef(false);
  const latestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshCoach();
    void refreshInsights();
    void refreshMemory();
  }, []);

  // A chip tapped on Today leaves a short-lived note on this phone; ask it once. (Not a URL
  // parameter, so a link from another site cannot spend a question.)
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void takePendingAsk().then((chip) => {
      if (!chip) return;
      if (chip.intent === "should_go") setTriageOpen(true);
      else void askCoach(chip.question, chip.intent);
    });
  }, []);

  async function ask(question: string, chip?: CoachChip) {
    const q = question.trim();
    if (q.length < 2) return;
    const intent = chip?.intent ?? classifyIntent(q);
    if (intent === "should_go") setTriageOpen(true);
    if (chip?.intent === "should_go") return;
    setText("");
    await askCoach(q, intent);
    requestAnimationFrame(() => latestRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const [latest, ...earlier] = messages ?? [];
  const findings = insights?.report.findings.length ?? 0;
  const learning = insights?.report.learning.length ?? 0;
  const notes = memory?.filter((m) => m.content.trim().length > 0).length ?? 0;

  return (
    <main className="fade-in flex flex-col gap-6 pt-2">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Your coach</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">Ask Temple</h1>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
        className="-mt-2 flex items-center gap-2 rounded-[22px] bg-surface p-2 pl-4 shadow-card"
      >
        <label htmlFor="ask" className="sr-only">
          Ask a question
        </label>
        <input
          id="ask"
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Gas, food, rounds, training..."
          className="h-11 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={text.trim().length < 2}
          aria-label="Ask"
          className="pressable flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink disabled:bg-surface-2 disabled:text-ink-3"
        >
          <SendIcon className="size-5" />
        </button>
      </form>

      <section aria-label="Frequent questions">
        <SectionTitle>Frequent</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {COACH_CHIPS.map((chip) => {
            const { Icon, tint } = CHIP_ICON[chip.intent];
            return (
              <button
                key={chip.intent}
                type="button"
                onClick={() => void ask(chip.question, chip)}
                className="pressable flex min-h-[60px] items-center gap-2.5 rounded-[20px] bg-surface px-3 py-2.5 text-left shadow-card"
              >
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tint}`}>
                  <Icon className="size-5" />
                </span>
                <span className="text-[15px] font-semibold leading-tight">{chip.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {latest ? (
        <div ref={latestRef} className="scroll-mt-4">
          <MessageCard message={latest} expanded onDelete={() => void deleteCoachMessage(latest.id)} />
        </div>
      ) : messages ? (
        <p className="rounded-[22px] bg-surface px-4 py-4 text-[15px] leading-relaxed text-ink-2 shadow-card">
          Tap a question above, or type your own. Answers use your logs, your notes and published guidance. Red flags always point you to a doctor.
        </p>
      ) : null}

      <section aria-label="What Temple knows" className="flex flex-col gap-2.5">
        <LinkRow
          href="/insights"
          Icon={ChartIcon}
          tint="bg-move/15 text-move"
          title="What your gut tells us"
          sub={insights ? (findings > 0 ? `${findings} ${findings === 1 ? "pattern" : "patterns"} so far` : `Learning ${learning} foods and habits`) : "Patterns from your logs"}
        />
        <LinkRow href="/memory" Icon={BookIcon} tint="bg-rest/15 text-rest" title="What Temple knows about you" sub={memory ? `${notes} ${notes === 1 ? "note" : "notes"}, edit any time` : "Your notes"} />
        <LinkRow href="/records" Icon={NoteIcon} tint="bg-gut/15 text-gut" title="Health records" sub="Blood reports, consultations, prescriptions" />
      </section>

      {earlier.length > 0 ? (
        <section aria-label="Earlier questions">
          <SectionTitle>Earlier</SectionTitle>
          <ul className="flex flex-col gap-2.5">
            {earlier.map((m) => (
              <li key={m.id}>
                <MessageCard
                  message={m}
                  expanded={openId === m.id}
                  onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                  onDelete={() => {
                    void deleteCoachMessage(m.id);
                    show("Question removed.", "info");
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TriageSheet open={triageOpen} onClose={() => setTriageOpen(false)} />
    </main>
  );
}

function LinkRow({ href, Icon, tint, title, sub }: { href: string; Icon: typeof SeatIcon; tint: string; title: string; sub: string }) {
  return (
    <Link href={href} className="pressable flex items-center gap-3 rounded-[22px] bg-surface p-3.5 shadow-card">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${tint}`}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-tight">{title}</span>
        <span className="block truncate text-[13px] text-ink-3">{sub}</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
    </Link>
  );
}

function MessageCard({
  message,
  expanded,
  onToggle,
  onDelete,
}: {
  message: CoachMessage;
  expanded: boolean;
  onToggle?: () => void;
  onDelete: () => void;
}) {
  const shown = message.answer ?? message.quick;
  return (
    <article className="fade-in overflow-hidden rounded-[24px] bg-surface shadow-card">
      <div className="flex items-start gap-2 px-4 pt-3.5">
        <button type="button" onClick={onToggle} disabled={!onToggle} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
          <span className="block text-[13px] text-ink-3">{when(message.created_at)}</span>
          <span className="mt-0.5 block text-[15px] font-medium text-ink-2">&ldquo;{message.question}&rdquo;</span>
          {!expanded && shown ? <span className="mt-1 block text-[16px] font-semibold leading-snug">{shown.headline}</span> : null}
        </button>
        <button type="button" onClick={onDelete} aria-label="Remove this question" className="pressable -mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3">
          <TrashIcon className="size-4" />
        </button>
      </div>
      {expanded ? (
        <div className="px-4 pb-4 pt-3">
          <AnswerView message={message} onRetry={() => void retryCoach(message.id)} />
        </div>
      ) : (
        <div className="h-3.5" />
      )}
    </article>
  );
}
