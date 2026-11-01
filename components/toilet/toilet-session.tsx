"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDayEvents, useToday } from "@/lib/client/hooks";
import { logEvent } from "@/lib/client/log";
import { clearVisit, startVisit, useOpenVisit } from "@/lib/client/toilet-visit";
import { ofKind } from "@/lib/domain/day";
import { payloadOf, type Payload } from "@/lib/domain/events";
import { BRISTOL_LABELS } from "@/lib/domain/ladder";
import { defaultWhen, resolveWhen, type WhenValue } from "@/lib/domain/when";
import { useSettings } from "@/lib/client/hooks";
import { BreathPacer, SessionHeader, useBreathCycle, useWakeLock } from "../breath-pacer";
import { ExerciseFigure } from "../exercise-figure";
import { WhenPicker } from "../when-picker";
import { ChevronRightIcon, ClockIcon, SeatIcon } from "../icons";
import { Choice } from "../sheet";
import { useToast } from "../toast";

/**
 * Toilet visits, built for leaving the phone outside:
 * - "I just went": say when and about how long, then rate it.
 * - "Going now": the start time is saved; rate it when you are back.
 * - A breathing guide is still there for anyone who does take the phone in.
 */

const CUES = ["Feet up, knees above hips", "Lean forward, back straight", "Loose jaw", "Pee first, no pushing"];

/** Minutes ago; -1 means "pick a day and time". */
const AGO = [
  { value: 0, label: "Just now" },
  { value: 15, label: "15 min ago" },
  { value: 30, label: "30 min ago" },
  { value: 60, label: "1 hour ago" },
  { value: -1, label: "Earlier..." },
];

const LENGTHS = [
  { value: 90, label: "Under 2 min" },
  { value: 210, label: "2 to 5 min" },
  { value: 450, label: "5 to 10 min" },
  { value: 720, label: "Over 10 min" },
];

function nearestLength(seconds: number): number {
  return LENGTHS.reduce((best, l) => (Math.abs(l.value - seconds) < Math.abs(best - seconds) ? l.value : best), LENGTHS[0].value);
}

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Stage = "choose" | "away" | "when" | "sit" | "rate";

export function ToiletSession({ back = false, going = false, earlier = false }: { back?: boolean; going?: boolean; earlier?: boolean }) {
  const open = useOpenVisit();
  const started = useRef(false);
  // "Going now" from the Should I go? sheet starts the visit right away.
  useEffect(() => {
    if (!going || open !== null || started.current) return;
    started.current = true;
    void startVisit();
  }, [going, open]);
  if (open === undefined) return null;
  return <Flow key={open?.startedAt ?? "none"} back={back} earlier={earlier} openStartedAt={open?.startedAt ?? null} />;
}

function Flow({ back, earlier, openStartedAt }: { back: boolean; earlier: boolean; openStartedAt: string | null }) {
  const router = useRouter();
  const settings = useSettings();
  const [when, setWhen] = useState<WhenValue>(() => defaultWhen(settings.tz));
  const today = useToday();
  const events = useDayEvents(today);
  const { logged, show } = useToast();
  const resuming = back && openStartedAt !== null;
  const [stage, setStage] = useState<Stage>(resuming ? "rate" : earlier ? "when" : openStartedAt ? "away" : "choose");
  const [ago, setAgo] = useState(earlier ? -1 : 0);
  const [length, setLength] = useState(() => (resuming ? nearestLength((Date.now() - new Date(openStartedAt!).getTime()) / 1000) : 210));
  const [sitStartedAt, setSitStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [passed, setPassed] = useState<boolean | undefined>(undefined);
  const [rating, setRating] = useState<Partial<Payload<"toilet">>>({});
  const [saving, setSaving] = useState(false);
  const { phase, breaths } = useBreathCycle(stage === "sit");
  useWakeLock(stage === "sit");

  useEffect(() => {
    if (stage !== "sit" && stage !== "away") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage]);

  const visits = events ? ofKind(events, "toilet") : [];
  const round = visits.length + 1;
  const last = visits.length ? payloadOf(visits[visits.length - 1], "toilet") : null;

  // Habits that rarely change are pre-filled from the last visit, so rating takes seconds.
  const values: Partial<Payload<"toilet">> = {
    breath_hold: last?.breath_hold,
    strain: last?.strain,
    bladder_full: last?.bladder_full,
    ...rating,
  };

  const elapsed = sitStartedAt ? now - sitStartedAt : 0;
  const overFive = elapsed >= 5 * 60_000;
  const capBreaths = round >= 3 ? 5 : null;
  const capReached = capBreaths !== null && breaths >= capBreaths;
  const prompt = useMemo(() => {
    if (capReached) return "That was 5 breaths. Stand up, wash, and walk away. Whatever is left can wait.";
    if (overFive) return "5 minutes. Time to stand up and leave, even if it does not feel finished.";
    if (capBreaths) return `Round ${round}: only ${capBreaths} slow breaths this time.`;
    return null;
  }, [capReached, overFive, capBreaths, round]);

  async function goingNow() {
    await startVisit();
    setNow(Date.now());
    setStage("away");
  }

  async function save() {
    if (passed === undefined) return;
    setSaving(true);
    const guided = sitStartedAt !== null;
    const at = guided
      ? new Date(sitStartedAt)
      : openStartedAt
        ? new Date(openStartedAt)
        : ago < 0
          ? resolveWhen(when, settings.tz)
          : new Date(Date.now() - ago * 60_000 - length * 1000);
    const payload: Payload<"toilet"> = {
      duration_s: Math.min(3600, guided ? Math.round(elapsed / 1000) : length),
      passed,
      ...(guided ? { breaths: Math.min(500, breaths) } : {}),
      ...values,
      ...(passed ? {} : { bristol: undefined, complete: undefined }),
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)) as Payload<"toilet">;
    try {
      logged(await logEvent("toilet", clean, { at }), "Toilet visit saved.");
    } catch {
      setSaving(false);
      show("Could not save this visit. Check the time and try again.", "tip");
      return;
    }
    router.push("/");
    void clearVisit();
  }

  if (stage === "choose") {
    return (
      <main className="fade-in flex min-h-[calc(100dvh-5rem)] flex-col gap-5">
        <SessionHeader title={`Round ${round} today`} />
        <div className="mt-2 flex flex-col gap-3">
          <BigChoice
            title="I just went"
            sub="Say when, then rate it in a few taps"
            Icon={SeatIcon}
            tint="bg-gut/15 text-gut"
            onClick={() => setStage("when")}
          />
          <BigChoice
            title="Going now"
            sub="Leave the phone outside. Rate it when you are back."
            Icon={ClockIcon}
            tint="bg-brand/15 text-brand"
            onClick={() => void goingNow()}
          />
        </div>
        <section className="rounded-[24px] bg-surface p-4 shadow-card">
          <ExerciseFigure pose="toilet" className="mx-auto h-36 w-full max-w-xs" />
          <p className="mt-2 text-center text-[15px] font-semibold">Feet up, lean forward, breathe out</p>
          <p className="mt-1 text-center text-[14px] leading-relaxed text-ink-2">
            Push only on a slow &ldquo;mooo&rdquo; out-breath, never while holding your breath. Stand up at 5 minutes.
          </p>
        </section>
        <button
          type="button"
          onClick={() => {
            setSitStartedAt(Date.now());
            setNow(Date.now());
            setStage("sit");
          }}
          className="pressable mt-auto h-12 text-[15px] font-semibold text-ink-3"
        >
          Phone with you? Use the breathing guide
        </button>
      </main>
    );
  }

  if (stage === "away") {
    const started = openStartedAt ? new Date(openStartedAt).getTime() : now;
    return (
      <main className="fade-in flex min-h-[calc(100dvh-5rem)] flex-col gap-5">
        <SessionHeader title="Going now" right={<span className="tabular rounded-full bg-surface px-3 py-1.5 text-[15px] font-semibold shadow-card">{mmss(now - started)}</span>} />
        <section className="rounded-[24px] bg-surface p-4 shadow-card">
          <ExerciseFigure pose="toilet" className="mx-auto h-40 w-full max-w-xs" />
          <ul className="mt-3 flex flex-col gap-2 text-[15px] leading-relaxed">
            <li>1. Pee first, without pushing.</li>
            <li>2. Feet on a stool, lean forward, elbows on knees.</li>
            <li>3. Breathe in for 4, then a long &ldquo;mooo&rdquo; out. Push only while breathing out.</li>
            <li>4. Stand up at 5 minutes, done or not.</li>
          </ul>
        </section>
        <p className="text-center text-[14px] text-ink-2">Leave the phone here. When you are back, open Temple and rate it.</p>
        <div className="mt-auto flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setLength(nearestLength((Date.now() - started) / 1000));
              setStage("rate");
            }}
            className="pressable h-14 rounded-2xl bg-brand font-semibold text-brand-ink"
          >
            I am back, rate it
          </button>
          <button
            type="button"
            onClick={() => {
              router.push("/");
              void clearVisit();
            }}
            className="pressable h-12 rounded-2xl text-[15px] font-semibold text-ink-3"
          >
            Cancel, I did not go
          </button>
        </div>
      </main>
    );
  }

  if (stage === "when") {
    return (
      <main className="fade-in flex flex-col gap-1">
        <SessionHeader title="I just went" />
        <div className="mt-5">
          <Choice label="When?" value={ago} onChange={setAgo} options={AGO} />
          {ago < 0 ? <WhenPicker value={when} onChange={setWhen} tz={settings.tz} /> : null}
          <Choice label="About how long did you sit?" value={length} onChange={setLength} options={LENGTHS} />
        </div>
        <button type="button" onClick={() => setStage("rate")} className="pressable mt-2 h-14 w-full rounded-2xl bg-brand font-semibold text-brand-ink">
          Next
        </button>
      </main>
    );
  }

  if (stage === "sit") {
    return (
      <main className="fade-in flex min-h-[calc(100dvh-5rem)] flex-col gap-5">
        <SessionHeader
          title={`Round ${round} today`}
          right={
            <span className={`tabular rounded-full px-3 py-1.5 text-[15px] font-semibold ${overFive ? "bg-care/15 text-care" : "bg-surface text-ink shadow-card"}`}>
              {mmss(elapsed)}
            </span>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <BreathPacer phase={phase} progress={Math.min(1, elapsed / (5 * 60_000))} />
          <p className="tabular text-sm text-ink-3">
            {breaths} slow {breaths === 1 ? "breath" : "breaths"}
            {capBreaths ? ` of ${capBreaths}` : ""}
          </p>
        </div>
        {prompt ? <p className="fade-in rounded-2xl bg-tip/15 px-4 py-3 text-center text-[15px] font-medium leading-snug">{prompt}</p> : null}
        <ul className="flex flex-wrap justify-center gap-1.5">
          {CUES.map((c) => (
            <li key={c} className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 shadow-card">
              {c}
            </li>
          ))}
        </ul>
        <p className="text-center text-[13px] font-medium text-ink-2">Push only on the out-breath. Never hold your breath.</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setPassed(false);
              setStage("rate");
            }}
            className="pressable h-14 rounded-2xl bg-surface font-semibold shadow-card"
          >
            Nothing came
          </button>
          <button
            type="button"
            onClick={() => {
              setPassed(true);
              setStage("rate");
            }}
            className="pressable h-14 rounded-2xl bg-brand font-semibold text-brand-ink"
          >
            Done, it came
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="fade-in flex flex-col gap-1">
      <SessionHeader title="How did it go?" />
      <p className="mb-4 mt-4 text-center text-sm text-ink-2">A few taps, pre-filled from last time. Skip anything you are unsure of.</p>
      {resuming || openStartedAt ? <Choice label="About how long did you sit?" value={length} onChange={setLength} options={LENGTHS} /> : null}
      <Choice
        label="Did anything come out?"
        value={passed}
        onChange={setPassed}
        options={[
          { value: true, label: "Yes" },
          { value: false, label: "No, nothing came" },
        ]}
      />
      {passed ? (
        <>
          <Choice
            label="What did it look like?"
            value={values.bristol}
            onChange={(v) => setRating((r) => ({ ...r, bristol: v }))}
            options={[1, 2, 3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v} · ${BRISTOL_LABELS[v]}` }))}
          />
          <Choice
            label="Did it feel complete?"
            value={values.complete}
            onChange={(v) => setRating((r) => ({ ...r, complete: v }))}
            options={[
              { value: "yes", label: "Yes" },
              { value: "partly", label: "Partly" },
              { value: "no", label: "No" },
            ]}
          />
        </>
      ) : null}
      <Choice
        label="Did you hold your breath to push?"
        value={values.breath_hold}
        onChange={(v) => setRating((r) => ({ ...r, breath_hold: v }))}
        options={[
          { value: "no", label: "No, exhale only" },
          { value: "some", label: "A little" },
          { value: "yes", label: "Yes" },
        ]}
      />
      <Choice
        label="How much did you strain?"
        value={values.strain}
        onChange={(v) => setRating((r) => ({ ...r, strain: v }))}
        options={[
          { value: 0, label: "None" },
          { value: 1, label: "A little" },
          { value: 2, label: "Some" },
          { value: 3, label: "A lot" },
        ]}
      />
      <Choice
        label="Did you need a full bladder to start?"
        value={values.bladder_full}
        onChange={(v) => setRating((r) => ({ ...r, bladder_full: v }))}
        options={[
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ]}
      />
      <Choice
        label="Pain or blood?"
        value={values.blood ? "blood" : values.pain ? "pain" : "none"}
        onChange={(v) => setRating((r) => ({ ...r, blood: v === "blood", pain: v === "pain" ? 2 : v === "blood" ? r.pain : 0 }))}
        options={[
          { value: "none", label: "None" },
          { value: "pain", label: "Pain" },
          { value: "blood", label: "Blood" },
        ]}
      />
      <Choice
        label="How satisfied do you feel?"
        value={values.satisfaction}
        onChange={(v) => setRating((r) => ({ ...r, satisfaction: v }))}
        options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))}
      />
      <button
        type="button"
        disabled={saving || passed === undefined}
        onClick={() => void save()}
        className="pressable mt-2 h-14 w-full rounded-2xl bg-brand font-semibold text-brand-ink disabled:opacity-50"
      >
        {saving ? "Saving..." : passed === undefined ? "Say if anything came out" : "Save"}
      </button>
      <Link href="/" className="pressable mt-1 flex h-11 items-center justify-center text-[14px] font-medium text-ink-3">
        Not now
      </Link>
    </main>
  );
}

function BigChoice({ title, sub, Icon, tint, onClick }: { title: string; sub: string; Icon: typeof SeatIcon; tint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="pressable flex min-h-[84px] items-center gap-4 rounded-[24px] bg-surface p-4 text-left shadow-card">
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${tint}`}>
        <Icon className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-semibold tracking-tight">{title}</span>
        <span className="block text-[14px] leading-snug text-ink-2">{sub}</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
    </button>
  );
}
