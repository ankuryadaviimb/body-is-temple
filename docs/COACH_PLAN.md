# Temple coach: from logger to doctor-like guide

Goal: Temple advises before you ask, answers questions, helps with frequent problems and keeps
learning from what you eat and do. It is a careful coach, not a doctor: red flags always point
to a real doctor, decided by rules rather than by the AI.

## Status (2026-10-31)

Built and live:

1. **Ask Temple** (Coach tab, and an Ask card on Today).
   - Six one-tap questions: Should I go? Why am I gassy? Why a rough morning? Feeling heavy. Did I eat right? What for dinner?
   - Free text, routed by keywords to the closest frequent problem.
   - Every answer uses the same short shape: what I see, went well, do now (with one-tap actions), watch, and a doctor note only for real red flags.
   - **Instant first:** a rule-based answer is computed on the phone (works offline). The AI answer replaces it when ready, but the rule-based doctor note always stays.
2. **"Should I go?" triage:** two taps (what you feel, then the verdict). The verdict is go now, reset first, or wait, and it weighs:
   - rounds today and the time since the last one,
   - the hour after a meal,
   - soon after waking.

   No AI call, so it is instant.
3. **Learning (tolerance engine, code only):** for each food, meal type and habit, it compares gas, next-morning rounds, smooth first passes and heavy feelings on days with it against logged days without it.
   - Shown only with 5 or more days on each side, and a gap that is large next to the day-to-day spread.
   - Screen: "What your gut tells us" (Patterns), with a "still learning" list.
4. **Proactive:**
   - A "Next up" nudge on Today (Isabgol window, post-meal walk, evening gas check, waiting for a real urge in the morning, bedtime when that habit is active).
   - An AI morning card ("From your coach"): what went well, one fix, and today's one thing.
5. **Memory:** seven short notes (about you, gut protocol, fitness, foods, experiments, open questions, things you told Temple).
   - Seeded from the private Gemini chat (`private/memory`, never committed).
   - Editable in the app, with every version kept.
   - "Remember this" saves a fact in one tap.
6. **Time zone:** shown as "India Standard Time (GMT+5:30)", with a searchable picker and "use this phone's time zone".

## Decisions that changed from the first plan, and why

- **No nightly cron.** The morning card is written when you log bedtime, or on the first open of a new day (the rule card shows meanwhile). A cron would need a database key that bypasses row-level security, and Vercel Hobby crons run once a day at an imprecise time. This way, every write happens as you, under row-level security.
- **The AI never writes memory on its own.** Personal patterns come from code (tolerance engine), so they cannot drift or be invented. The AI may suggest a "remember" fact, but only one that repeats your own words, and only you can save it.
- **Groq first for questions, Cloudflare first for the morning card.** Measured on 2026-10-31 with sample data:

  | Provider | Coach answer | Morning card |
  |---|---|---|
  | Groq (gpt-oss-120b) | about 1 s | about 1 to 3 s |
  | Cloudflare (Gemma 4) | about 2 to 6 s, about 32 neurons | about 3 s, about 26 neurons |

  The 10,000 free neurons a day cover about 300 calls. Groq's free tier allows about 8,000 tokens a minute (about 2 questions), so Cloudflare takes over at once when Groq is busy, and the card goes to Cloudflare first to keep Groq free for questions.
- **Server-side checks on every AI answer**, because prompts alone were not enough in testing:
  - "See a doctor if..." warnings move to "watch", so the red doctor box appears only for real red flags.
  - Guessed "remember" facts are dropped.
  - Confidence stays at medium until a steady pattern (10 days on each side) exists.
- **Less data per question:** each question type sends only the memory notes it needs, plus a 7-day digest, the patterns and 4 to 6 evidence notes, about 3,000 tokens in all.

## Next

1. Weekly review (Sunday): trends, the next habit, targets, and a trainer brief.
2. Experiments with a clear before and after (for example, 7 days without chana).
3. Lab report reading (blood report upload), feeding the doctor notes.
4. Push reminders (M2) for the same "Next up" nudges, at most 4 a day, with quiet hours.
5. Class schedule prompts: the morning card gives class tips once class times are set in Settings.
