# Temple

A private, self-hosted gut and fitness coach for iPhone, built as a Home Screen web app.
It is designed around one rule: logging must take seconds, or people stop doing it.

- **One-tap logging:** meals by photo, toilet visits with a breathing guide and a 5-minute timer, water, tea, Isabgol, gas, walks and workouts.
- **Instant feedback:** quick feedback comes from rules on the phone. AI analysis runs in the background, so no screen ever waits on a model.
- **Four rings (Gut, Fuel, Move, Rest)** fill only for actions you control. A forgiving streak means one missed day never breaks it.
- **A weekly habit ladder** adds one new gut habit and one movement or food habit at a time.
- **A coach, not just a logger:**
  - **Ask Temple** answers the frequent questions in one tap ("Should I go?", "Why am I gassy?", "Why a rough morning?", "Feeling heavy", "Did I eat right?", "What for dinner?") or anything you type. An instant answer from rules appears at once; the AI answer, built from your own logs and notes, follows in about a second.
  - **"Should I go?"** is a two-tap triage (go now, reset first, or wait) that never waits on AI.
  - **It learns from your logs:** for every food, meal type and habit, code compares your gas and next-morning rounds on days with it against days without it. A pattern shows only after 5 days on each side.
  - **It advises before you ask:** a "Next up" nudge on Today (Isabgol window, post-meal walk, evening gas check), and an AI morning card written when you log bedtime or open the app on a new day.
  - **Memory you control:** short notes the coach reads before every answer, editable in the app, with every version kept.
  - **Red flags always point to a doctor**, decided by rules, not by the AI.
- **Works offline:** every log saves on the phone first and syncs when there is signal.

> Temple is a personal tracking tool, not medical advice. It does not diagnose or treat anything. See a doctor for bleeding, black stools, weight loss, fever or severe pain.

## Privacy model

- **You run your own copy.** Each person deploys their own copy on their own free accounts. Nobody else's database is ever involved.
- **This repository contains code only.** Personal data (logs, photos, reports, memory notes) lives in your own Supabase project and on your phone. These stay out of git: `private/`, `.env*` (except `.env.example`), PDFs and exports.
- **The browser never talks to the database.** Every query runs on the server as the signed-in user, under row-level security. The session is an HttpOnly cookie, and only the emails in `ALLOWED_EMAILS` can create an account or sign in (email and password, 12 characters minimum, email confirmed once).
- **Photos stay private.** They are shrunk and re-encoded on the phone before upload, which removes location and device details. They live in a private storage bucket and are served only to their owner.
- **AI providers do not train on your data:**
  - Cloudflare Workers AI (main) states it does not train on, or keep, inputs and outputs.
  - Groq (fallback) states it does not train on your data. Turn on Zero Data Retention in its Data Controls.
  - Gemini is off by default. Its free tier may use inputs to improve Google products, so the app would only ever send it a photo and a generic question, and only if you opt in.
- **No names or emails** are ever sent to an AI provider.
- **The coach sends only what a question needs:** the relevant memory notes, a 7-day summary, the computed patterns and short evidence notes. Never the full history, never photos. Gemini never receives health history.
- **No background job holds a master key.** The morning card is written during your own requests (bedtime or first open), as you, under row-level security.
- **A strict security policy** applies to every page (CSP with a per-request nonce), along with origin and CSRF checks on every write.

## Cost

Everything runs on free plans: Vercel Hobby, Supabase Free, Cloudflare Workers AI Free and Groq Free. Do not add a card anywhere. The app also caps its own daily AI usage, so it stays inside the free allowances.

## Deploy your own (about 15 minutes)

1. **Supabase** (free): create a project, in the region nearest you.
   - Open the SQL editor and run `supabase/migrations/0001_init.sql`, then `0002_coach.sql`.
   - Under Authentication, then URL Configuration, set the Site URL to `https://<your-app>/login`.
   - Copy the project URL and anon key from Project Settings, then API.
   - After your first sign-in, turn off "Allow new users to sign up".
2. **Cloudflare** (free): create an API token with the Workers AI permission, and note your account id.
3. **Groq** (free): create an API key, and turn on Zero Data Retention under Settings, then Data Controls.
4. **Vercel** (Hobby, free): import this repository, or run `npx vercel` from a clone.
   - Add the environment variables listed in `.env.example`.
   - Set `APP_ORIGIN` to your deployment URL.
5. **iPhone:** open your deployment in Safari, tap Share, then Add to Home Screen. Open the app from the Home Screen, tap "Create your account", confirm the email link once (any browser), then sign in. iPhone saves the password to Keychain.
6. **Coach memory (optional):** write short notes about yourself in `private/memory/<note>.md` (notes: `profile`, `gut`, `fitness`, `foods`, `experiments`, `questions`; one fact per line). Then run `SUPABASE_ACCESS_TOKEN=<personal access token> node scripts/seed-memory.mjs` once after your first sign-in. It never overwrites notes you edited in the app. `private/` is git-ignored.

## Development

```bash
npm install
cp .env.example .env.local   # fill in your own values
npm run dev                  # http://localhost:3000
npm test                     # unit tests (domain logic, parsing, validation)
npm run typecheck
```

To check the AI providers with your own keys and a photo of a meal, and the coach prompts with made-up sample data:

```bash
RUN_AI_SMOKE=1 MEAL_PHOTO=/path/to/meal.jpg npx vitest run tests/smoke
RUN_AI_SMOKE=1 npx vitest run tests/smoke/coach-providers.test.ts
```

Design review without signing in: `npm run dev`, then open `/dev/preview?screen=today` (also `coach`, `insights`, `memory`, `toilet`, `practice`, `reset`, `history`, `settings`). It uses made-up sample data and returns 404 in production.

## Project layout

- `app/` holds the screens (Today, Coach, Patterns, Memory, Toilet, Practice, Resets, History, Settings, Login) and the API routes.
- `lib/domain/` holds the pure logic shared by phone and server: event schemas, the wake-to-wake day, rings, streak, the habit ladder, the feedback rules, the food and habit tolerance engine, and the coach rules (`lib/domain/coach/`: triage, gas causes, morning review, eating review, red flags).
- `lib/coach/` holds the evidence notes and the prompt context builder; `lib/ai/coach-prompts.ts` holds the coach prompts.
- `lib/client/` holds the on-device store (IndexedDB), the background sync and photo preparation.
- `lib/server/` and `lib/ai/` hold the database access, media handling and AI providers.
- `supabase/migrations/` holds the schema, with row-level security on every table.
- `tests/` holds the unit tests, plus an opt-in live AI check.

## Roadmap

- M2: Apple Watch and Health data through iOS Shortcuts, Back Tap, Lock Screen and Siri logging, push reminders.
- M3 (in progress): the coach is live (Ask, triage, patterns, memory, morning card). Next: weekly review, lab report reading, experiments.
- M4: charts and a doctor's bowel diary export.
