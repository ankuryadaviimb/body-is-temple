"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDayEvents, useToday } from "@/lib/client/hooks";
import { logEvent } from "@/lib/client/log";
import { ofKind } from "@/lib/domain/day";
import { payloadOf, type Payload } from "@/lib/domain/events";
import { BRISTOL_LABELS } from "@/lib/domain/ladder";
import { BreathPacer, useBreathCycle, useWakeLock } from "../breath-pacer";
import { Choice } from "../sheet";
import { useToast } from "../toast";

const CUES = ["Feet up on a stool, knees above hips", "Lean forward, back straight", "Loose jaw, teeth apart", "Let urine flow first, no pushing"];

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ToiletSession() {
  const router = useRouter();
  const today = useToday();
  const events = useDayEvents(today);
  const { showFeedback } = useToast();
  const [startedAt] = useState(() => new Date());
  const [now, setNow] = useState(() => Date.now());
  const [stage, setStage] = useState<"sit" | "rate">("sit");
  const [passed, setPassed] = useState<boolean>(true);
  const [rating, setRating] = useState<Partial<Payload<"toilet">>>({});
  const [saving, setSaving] = useState(false);
  const { phase, breaths } = useBreathCycle(stage === "sit");
  useWakeLock(stage === "sit");

  useEffect(() => {
    if (stage !== "sit") return;
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

  const elapsed = now - startedAt.getTime();
  const overFive = elapsed >= 5 * 60_000;
  const capBreaths = round >= 3 ? 5 : null;
  const capReached = capBreaths !== null && breaths >= capBreaths;

  const prompt = useMemo(() => {
    if (capReached) return "That was 5 breaths. Stand up, wash, and walk away. Whatever is left can wait.";
    if (overFive) return "5 minutes. Time to stand up and leave, even if it does not feel finished.";
    if (capBreaths) return `Round ${round}: only ${capBreaths} slow breaths this time.`;
    return null;
  }, [capReached, overFive, capBreaths, round]);

  function finish(didPass: boolean) {
    setPassed(didPass);
    setStage("rate");
  }

  async function save() {
    setSaving(true);
    const payload: Payload<"toilet"> = {
      duration_s: Math.round(elapsed / 1000),
      passed,
      breaths,
      ...values,
      ...(passed ? {} : { bristol: undefined, complete: undefined }),
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)) as Payload<"toilet">;
    const { feedback } = await logEvent("toilet", clean, { at: startedAt });
    showFeedback(feedback, "Saved.");
    router.push("/");
  }

  if (stage === "sit") {
    return (
      <main className="flex flex-col items-center gap-6 pt-4">
        <div className="flex w-full items-center justify-between">
          <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-medium">Round {round} today</span>
          <span className={`text-2xl font-semibold tabular-nums ${overFive ? "text-care" : ""}`}>{mmss(elapsed)}</span>
        </div>
        <BreathPacer phase={phase} />
        <p className="text-sm text-ink-2">{breaths} slow breaths</p>
        {prompt ? <p className="w-full rounded-2xl bg-tip/10 px-4 py-3 text-center text-sm font-medium">{prompt}</p> : null}
        <ul className="w-full space-y-1 rounded-2xl bg-surface p-4 text-sm text-ink-2">
          {CUES.map((c) => (
            <li key={c}>· {c}</li>
          ))}
          <li className="pt-1 font-medium text-ink">Push only on the out-breath. Never hold your breath.</li>
        </ul>
        <div className="grid w-full grid-cols-2 gap-3">
          <button type="button" onClick={() => finish(false)} className="h-14 rounded-2xl border border-line bg-surface font-semibold">
            Nothing came
          </button>
          <button type="button" onClick={() => finish(true)} className="h-14 rounded-2xl bg-brand font-semibold text-brand-ink">
            Done, it came
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-4">
      <h1 className="mb-1 text-xl font-semibold">Quick rating</h1>
      <p className="mb-5 text-sm text-ink-2">A few taps. Skip anything you are unsure of.</p>
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
        onChange={(v) =>
          setRating((r) => ({ ...r, blood: v === "blood", pain: v === "pain" ? 2 : v === "blood" ? r.pain : 0 }))
        }
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
      <button type="button" disabled={saving} onClick={() => void save()} className="mt-2 h-14 w-full rounded-2xl bg-brand font-semibold text-brand-ink disabled:opacity-60">
        {saving ? "Saving..." : "Save"}
      </button>
    </main>
  );
}
