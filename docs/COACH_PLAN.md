# Temple coach: from logger to doctor-like guide (next milestone)

Goal: Temple must advise proactively, answer questions, help with frequent problems and keep
learning from what the user eats and does. It is a careful coach, not just a logger. Not medical
advice: it always escalates red flags to a real doctor.

## 1. Ask Temple (questions, any time)
- Entry points: an "Ask" button on Today and a Coach tab.
- Quick-question chips for frequent problems:
  - Why am I gassy?
  - Did I eat right today?
  - I feel the urge. Should I go?
  - Feeling heavy, what now?
  - What should I eat for dinner?
  - Is this normal?
- Free text is also allowed.
- Every answer has this shape, kept short for a phone:
  1. Likely reason, citing the user's own data ("chana at lunch, poori yesterday").
  2. What to do now (one or two steps, with links to resets or sessions).
  3. What to watch.
  4. When to see a doctor (only if relevant).
- "Should I go?" is a triage flow that answers instantly from rules, with an optional AI explanation underneath. It weighs:
  - rounds today,
  - minutes since the last visit,
  - the type of urge (sharp at the exit, or dull heaviness),
  - the time of day.

  It then recommends one of: go now with the 5-minute limit; do the 2-minute reset first; or wait, because it is likely a false alarm.
- Red flags always win: more than streaks of blood, black stool, fever, severe pain, weight loss, or anemia on labs.

## 2. Proactive advice
- Instant rule feedback after each log (exists).
- Nightly AI job, run by a once-a-day Vercel Hobby cron at about 5 AM local:
  - writes the morning card: what went right, what went wrong, today's one thing;
  - updates memory.
- Smart nudges (push notifications, M2): Isabgol 90 minutes after dinner, post-meal walk, evening gas check, pre-class fueling, bedtime.
- Weekly review: trends, the next habit, targets.

## 3. Learning
- Memory files (versioned, editable in Settings):
  - profile
  - gut protocol
  - fitness
  - patterns
  - foods
  - experiments
  - open questions

  They are seeded from the private Gemini chat in `private/` (never committed). A "Remember this" action saves a fact directly.
- Food and habit tolerance, computed by code rather than AI:
  - For each dish and tag (chana, poori, peanuts, fried, maida, late Isabgol, late bedtime, and so on), compare outcomes when it happened against when it did not: evening gas, next-morning rounds, first-pass stool type, heavy episodes.
  - A pattern is shown only once each side has at least 5 days.
  - These feed a "What your gut tells us" screen and the coach.

## 4. Time zone
- Show a friendly name ("India Standard Time, GMT+5:30"), not the raw `Asia/Kolkata`.
- Detected from the phone, with a picker.

## 5. AI and privacy
- Coach and nightly jobs use Cloudflare Workers AI (Gemma 4, thinking off, 256K context), with Groq (Zero Data Retention) as fallback. Gemini is never used for health history.
- Context per call: the memory files, a compact 7-day digest, today's events, the tolerance table and the evidence cards. Never the full history.
- No names or emails are ever sent.

## Build order
1. Migration 0002: `memory_files` and `memory_versions`, plus a script that seeds them from `private/`.
2. `/api/coach`, with the context builder and evidence cards.
3. The Ask screen, with chips and the "Should I go?" triage.
4. The tolerance engine and the "What your gut tells us" screen.
5. The nightly cron for the AI morning card and memory update, then the weekly review.
6. The time zone display and picker.
