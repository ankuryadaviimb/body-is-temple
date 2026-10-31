import { describe, expect, it } from "vitest";
import { mergeAnswers, normalizeCoachAnswer, refineAnswer, tidy } from "@/lib/domain/coach/answer";
import { normalizeCoachCard } from "@/lib/domain/coach/card";
import { dinnerAdvice } from "@/lib/domain/coach/dinner";
import { reviewEating } from "@/lib/domain/coach/eating";
import { gasCulprits } from "@/lib/domain/coach/gas";
import { classifyIntent } from "@/lib/domain/coach/intents";
import { reviewMorning } from "@/lib/domain/coach/morning";
import { quickTake } from "@/lib/domain/coach/quick";
import { doctorNote, redFlagsInEvents, redFlagsInText } from "@/lib/domain/coach/red-flags";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { ev, ist, TZ } from "../helpers";

const settings = { ...DEFAULT_SETTINGS, tz: TZ, protein_target_g: 80 };
const at = (local: string) => new Date(ist(local));

function meal(local: string, slot: string, items: string[], tags: string[], protein: [number, number] = [10, 14]) {
  return ev("meal", local, { slot }, {
    ai_status: "done",
    analysis: {
      items: items.map((name) => ({ name, qty: null, unit: null })),
      tags,
      protein_g: { low: protein[0], high: protein[1] },
      kcal: { low: 400, high: 600 },
      slot_guess: null,
      confidence: 0.8,
      notes: null,
    },
  });
}

describe("intent routing", () => {
  it("routes typed questions to the frequent problems", () => {
    expect(classifyIntent("I feel like pooping, should I go or not?")).toBe("should_go");
    expect(classifyIntent("Why do I feel so gassy and bloated?")).toBe("gas");
    expect(classifyIntent("Why was my morning so rough, 3 rounds again")).toBe("morning");
    expect(classifyIntent("I still feel heavy and dirty inside")).toBe("heavy");
    expect(classifyIntent("What should I eat for dinner tonight?")).toBe("dinner");
    expect(classifyIntent("Did I eat right today?")).toBe("ate_right");
    expect(classifyIntent("Can I do crunches in class?")).toBe("free");
  });
});

describe("red flags", () => {
  it("catches warning signs but not everyday words", () => {
    expect(redFlagsInText("I saw blood on the paper").map((f) => f.id)).toEqual(["bleeding"]);
    expect(redFlagsInText("my stool looks black and sticky").map((f) => f.id)).toContain("black_stool");
    expect(redFlagsInText("Should I get a blood test? I had black tea and kala chana")).toEqual([]);
    expect(redFlagsInText("severe pain in my belly and fever").map((f) => f.id).sort()).toEqual(["fever", "severe_pain"]);
  });

  it("reads blood from toilet logs and words it for a fissure history", () => {
    const flags = redFlagsInEvents([ev("toilet", "2026-11-02 08:00", { duration_s: 200, passed: true, blood: true })]);
    expect(flags.map((f) => f.id)).toEqual(["bleeding"]);
    expect(doctorNote(flags, "logs")).toContain("fissure");
    expect(doctorNote([], "text")).toBeNull();
  });
});

describe("gas culprits", () => {
  it("ranks a legume lunch above a gentle breakfast", () => {
    const events = [
      meal("2026-11-02 09:00", "breakfast", ["poha"], ["cooked_veg"]),
      meal("2026-11-02 13:30", "lunch", ["poori", "chana masala"], ["fried", "legume"]),
    ];
    const culprits = gasCulprits(events, at("2026-11-02 19:00"), TZ, null);
    expect(culprits[0].title).toBe("Poori and chana masala (lunch, 1:30 PM)");
    expect(culprits[0].detail).toContain("beans or chickpeas and fried food");
    expect(culprits.some((c) => c.title === "No walk after meals")).toBe(true);
    expect(culprits.some((c) => c.title.startsWith("Poha"))).toBe(false);
  });

  it("drops the no-walk point after a walk", () => {
    const events = [meal("2026-11-02 13:30", "lunch", ["rajma", "rice"], ["legume"]), ev("walk", "2026-11-02 13:50", { minutes: 10 })];
    expect(gasCulprits(events, at("2026-11-02 18:00"), TZ, null).some((c) => c.title === "No walk after meals")).toBe(false);
  });
});

describe("eating review", () => {
  it("flags a heavy combo and low protein, and credits a walk", () => {
    const today = [
      meal("2026-11-02 09:00", "breakfast", ["poha"], ["cooked_veg"], [6, 8]),
      meal("2026-11-02 13:30", "lunch", ["poori", "chana"], ["fried", "legume"], [12, 16]),
      ev("walk", "2026-11-02 14:00", { minutes: 10 }),
    ];
    const r = reviewEating(today, settings, at("2026-11-02 15:00"));
    expect(r.fixes.join(" ")).toContain("heavy combo");
    expect(r.fixes.join(" ")).toContain("Protein is low");
    expect(r.wins.join(" ")).toContain("Walked after lunch");
    expect(r.headline).toContain("A heavy day");
  });

  it("says yes to a gentle day on target", () => {
    const today = [
      meal("2026-11-02 09:00", "breakfast", ["paneer paratha", "curd"], ["dairy", "high_protein"], [24, 28]),
      meal("2026-11-02 13:30", "lunch", ["moong dal", "rice", "lauki sabzi"], ["dal", "cooked_veg"], [24, 28]),
    ];
    const r = reviewEating(today, settings, at("2026-11-02 15:00"));
    expect(r.fixes).toEqual([]);
    expect(r.headline).toContain("Yes");
  });

  it("waits while meals are still being read", () => {
    const pending = ev("meal", "2026-11-02 13:30", { slot: "lunch" }, { ai_status: "pending" });
    expect(reviewEating([pending], settings, at("2026-11-02 14:00")).headline).toContain("still being read");
  });
});

describe("rough morning review", () => {
  it("points to late Isabgol, a late heavy dinner and breath holding", () => {
    const yesterday = [
      meal("2026-11-01 22:15", "dinner", ["chole bhature"], ["fried", "legume", "maida"]),
      ev("isabgol", "2026-11-02 01:10", { tsp: 1, water_ml: 200 }),
      ev("sleep", "2026-11-02 01:40"),
    ];
    const today = [
      ev("wake", "2026-11-02 08:30"),
      ev("toilet", "2026-11-02 09:00", { duration_s: 360, passed: true, bristol: 6, breath_hold: "yes" }),
      ev("toilet", "2026-11-02 09:40", { duration_s: 200, passed: true }),
      ev("toilet", "2026-11-02 10:20", { duration_s: 200, passed: false }),
    ];
    const r = reviewMorning(yesterday, today, settings, null);
    expect(r.good).toBe(false);
    expect(r.headline).toContain("3 rounds");
    const text = r.factors.join(" ");
    expect(text).toContain("Isabgol came 2 h 55 min after dinner");
    expect(text).toContain("Dinner was late");
    expect(r.next.join(" ")).toContain("Isabgol about 90 minutes");
  });

  it("asks for a log when there are no rounds yet", () => {
    expect(reviewMorning([], [ev("wake", "2026-11-02 08:00")], settings, null).noData).toBe(true);
  });
});

describe("dinner advice", () => {
  it("keeps it light after a heavy lunch and times Isabgol", () => {
    const today = [meal("2026-11-02 13:30", "lunch", ["poori", "chana"], ["fried", "legume"])];
    const r = dinnerAdvice(today, settings, at("2026-11-02 19:30"), null);
    expect(r.headline).toBe("Keep dinner light tonight");
    expect(r.timing.join(" ")).toContain("Finish by 10:00 PM");
    expect(r.skip).toContain("beans and chickpeas");
  });
});

describe("quick take", () => {
  it("does not blame a gentle meal for gas", () => {
    const q = quickTake({
      intent: "gas",
      question: "Why am I so bloated?",
      now: at("2026-11-02 21:00"),
      settings,
      today: [meal("2026-11-02 13:30", "lunch", ["roti", "moong dal", "raita"], ["dal", "dairy", "cooked_veg"])],
      yesterday: [],
      tolerance: null,
    });
    expect(q?.headline).toContain("No clear cause");
  });

  it("names a strong gas maker as the likely cause", () => {
    const q = quickTake({
      intent: "gas",
      question: "Why am I gassy?",
      now: at("2026-11-02 21:00"),
      settings,
      today: [meal("2026-11-02 13:30", "lunch", ["rajma", "rice"], ["legume"])],
      yesterday: [],
      tolerance: null,
    });
    expect(q?.headline).toBe("Likely from rajma and rice (lunch, 1:30 PM)");
  });

  it("keeps the doctor note from a typed red flag", () => {
    const q = quickTake({
      intent: "free",
      question: "There is a lot of blood when I go",
      now: at("2026-11-02 10:00"),
      settings,
      today: [],
      yesterday: [],
      tolerance: null,
    });
    expect(q?.doctor).toContain("You mentioned bleeding");
  });

  it("answers the heavy feeling with the reset", () => {
    const q = quickTake({
      intent: "heavy",
      question: "I feel heavy",
      now: at("2026-11-02 09:30"),
      settings,
      today: [ev("toilet", "2026-11-02 09:00", { duration_s: 200, passed: true })],
      yesterday: [],
      tolerance: null,
    });
    expect(q?.actions).toContain("reset_heavy");
    expect(q?.why[0]).toContain("30 min ago");
  });
});

describe("AI answer parsing", () => {
  it("accepts loose shapes, cleans dashes and drops unknown actions", () => {
    const a = normalizeCoachAnswer({
      headline: "Likely the chana \u2014 not the tea",
      why: "Chana at lunch\nPoori yesterday",
      now: ["- Walk 10 minutes"],
      watch: [],
      doctor: "none",
      actions: ["log_walk", "rm -rf", "log_walk"],
      remember: ["Milk makes me bloated"],
      confidence: "certain",
    });
    expect(a?.headline).toBe("Likely the chana, not the tea");
    expect(a?.why).toEqual(["Chana at lunch", "Poori yesterday"]);
    expect(a?.now).toEqual(["Walk 10 minutes"]);
    expect(a?.doctor).toBeNull();
    expect(a?.actions).toEqual(["log_walk"]);
    expect(a?.confidence).toBe("low");
    expect(normalizeCoachAnswer({ why: ["x"] })).toBeNull();
    expect(tidy("3\u20134 rounds")).toBe("3-4 rounds");
    expect(tidy("knees\u2011to\u2011chest, tonight\u2019s gas")).toBe("knees-to-chest, tonight's gas");
  });

  it("moves conditional warnings to watch, drops guessed facts and caps confidence", () => {
    const ai = normalizeCoachAnswer({
      headline: "Likely the chana",
      watch: ["Tonight's gas level"],
      doctor: "see your doctor if you have severe pain",
      remember: ["Chana and fried food may bring evening gas", "Milk makes me bloated"],
      confidence: "high",
    })!;
    const r = refineAnswer(ai, { question: "Milk makes me bloated. Why am I gassy?", steadyPattern: false });
    expect(r.doctor).toBeNull();
    expect(r.watch).toEqual(["Tonight's gas level", "See your doctor if you have severe pain"]);
    expect(r.remember).toEqual(["Milk makes me bloated"]);
    expect(r.confidence).toBe("medium");
    const flagged = refineAnswer({ ...ai, doctor: "Blood in the stool needs a doctor this week." }, { question: "I saw blood", steadyPattern: true });
    expect(flagged.doctor).toBe("Blood in the stool needs a doctor this week.");
    expect(flagged.confidence).toBe("high");
  });

  it("keeps the rule doctor note when merging", () => {
    const quick = normalizeCoachAnswer({ headline: "Quick", doctor: "See your doctor today.", actions: ["reset_heavy"] });
    const ai = normalizeCoachAnswer({ headline: "AI answer", doctor: null, actions: ["log_walk"] });
    const merged = mergeAnswers(quick, ai);
    expect(merged?.headline).toBe("AI answer");
    expect(merged?.doctor).toBe("See your doctor today.");
    expect(merged?.actions).toEqual(["reset_heavy", "log_walk"]);
  });

  it("parses the morning card", () => {
    const card = normalizeCoachCard({ headline: "Lighter day, calmer night", went_well: ["Isabgol on time"], to_fix: "null", one_thing: "Walk after lunch", class_tip: null });
    expect(card?.to_fix).toBeNull();
    expect(normalizeCoachCard({ headline: "x" })).toBeNull();
  });
});
