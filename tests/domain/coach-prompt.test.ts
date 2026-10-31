import { describe, expect, it } from "vitest";
import { COACH_SYSTEM_PROMPT } from "@/lib/ai/coach-prompts";
import { askPrompt, cardPrompt, classesOn, classSummary } from "@/lib/coach/context";
import { quickTake } from "@/lib/domain/coach/quick";
import { addDays } from "@/lib/domain/time";
import { SAMPLE_SETTINGS, SAMPLE_TODAY, sampleData } from "../fixtures/coach-sample";

describe("coach prompt", () => {
  const data = sampleData();
  const quick = quickTake({
    intent: "gas",
    question: "Why do I feel so gassy?",
    now: new Date(),
    settings: SAMPLE_SETTINGS,
    today: data.byDay.get(SAMPLE_TODAY) ?? [],
    yesterday: data.byDay.get(addDays(SAMPLE_TODAY, -1)) ?? [],
    tolerance: data.tolerance,
  });

  it("includes every section and stays small", () => {
    const text = askPrompt({ question: "Why do I feel so gassy?", intent: "gas", quick, data, settings: SAMPLE_SETTINGS, today: SAMPLE_TODAY, ladderIndex: 0, earlier: [] });
    for (const section of ["NOW:", "QUESTION (type: gas)", "QUICK TAKE:", "TARGETS:", "HABIT THIS WEEK:", "MEMORY:", "LOGS (last 7 days", "PATTERNS:", "EVIDENCE:"]) {
      expect(text).toContain(section);
    }
    expect(text).toContain("India Standard Time (GMT+5:30)");
    // Under about 4,000 tokens with the system prompt, so the Groq fallback fits too.
    expect(text.length + COACH_SYSTEM_PROMPT.length).toBeLessThan(16_000);
  });

  it("sends only the memory a question needs", () => {
    const gas = askPrompt({ question: "Why gassy?", intent: "gas", quick, data, settings: SAMPLE_SETTINGS, today: SAMPLE_TODAY, ladderIndex: 0, earlier: [] });
    expect(gas).not.toContain("Sample question for the doctor");
    const free = askPrompt({ question: "Anything?", intent: "free", quick: null, data, settings: SAMPLE_SETTINGS, today: SAMPLE_TODAY, ladderIndex: 0, earlier: [] });
    expect(free).toContain("Sample question for the doctor");
  });

  it("builds the morning card prompt and summarizes classes", () => {
    const text = cardPrompt({ data, settings: SAMPLE_SETTINGS, today: SAMPLE_TODAY, ladderIndex: 0 });
    expect(text).toContain("CARD FOR: the morning of");
    expect(text).toMatch(/Class that day: (Group class at 7:00 AM|none)/);
    expect(classesOn(SAMPLE_SETTINGS, "2026-11-02")).toBe("Group class at 7:00 AM");
    expect(classesOn(SAMPLE_SETTINGS, "2026-11-01")).toBeNull();
    expect(classSummary(SAMPLE_SETTINGS)).toBe("Mon, Tue, Wed, Thu, Fri 7:00 AM Group class");
  });
});
