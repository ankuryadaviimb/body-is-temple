# Temple

A private, self-hosted gut and fitness coach for iPhone, built as a Home Screen web app.
It is designed around one rule: logging must take seconds, or people stop doing it.

- **One-tap logging:** meals by photo, toilet visits with a breathing guide and a 5-minute timer, water, tea, Isabgol, gas, walks and workouts.
- **Instant feedback:** quick feedback comes from rules on the phone. AI analysis runs in the background, so no screen ever waits on a model.
- **Four rings (Gut, Fuel, Move, Rest)** fill only for actions you control. A forgiving streak means one missed day never breaks it.
- **A weekly habit ladder** adds one new gut habit and one movement or food habit at a time.
- **Works offline:** every log saves on the phone first and syncs when there is signal.

> Temple is a personal tracking tool, not medical advice. It does not diagnose or treat anything. See a doctor for bleeding, black stools, weight loss, fever or severe pain.

## Privacy model

- **You run your own copy.** Each person deploys their own copy on their own free accounts. Nobody else's database is ever involved.
- **This repository contains code only.** Personal data (logs, photos, reports, memory notes) lives in your own Supabase project and on your phone. These stay out of git: `private/`, `.env*` (except `.env.example`), PDFs and exports.
- **The browser never talks to the database.** Every query runs on the server as the signed-in user, under row-level security. The session is an HttpOnly cookie, and only the emails in `ALLOWED_EMAILS` can sign in.
- **Photos stay private.** They are shrunk and re-encoded on the phone before upload, which removes location and device details. They live in a private storage bucket and are served only to their owner.
- **AI providers do not train on your data:**
  - Cloudflare Workers AI (main) states it does not train on, or keep, inputs and outputs.
  - Groq (fallback) states it does not train on your data. Turn on Zero Data Retention in its Data Controls.
  - Gemini is off by default. Its free tier may use inputs to improve Google products, so the app would only ever send it a photo and a generic question, and only if you opt in.
- **No names or emails** are ever sent to an AI provider.
- **A strict security policy** applies to every page (CSP with a per-request nonce), along with origin and CSRF checks on every write.

## Cost

Everything runs on free plans: Vercel Hobby, Supabase Free, Cloudflare Workers AI Free and Groq Free. Do not add a card anywhere. The app also caps its own daily AI usage, so it stays inside the free allowances.

## Deploy your own (about 15 minutes)

1. **Supabase** (free): create a project, in the region nearest you.
   - Open the SQL editor and run `supabase/migrations/0001_init.sql`.
   - Under Authentication, then Email Templates, edit the Magic Link template so it shows the code: `Your code is {{ .Token }}`. The app signs in with a 6-digit code typed inside the app, because on iOS a magic link would open in Safari, which keeps separate cookies.
   - Copy the project URL and anon key from Project Settings, then API.
   - After your first sign-in, turn off "Allow new users to sign up".
2. **Cloudflare** (free): create an API token with the Workers AI permission, and note your account id.
3. **Groq** (free): create an API key, and turn on Zero Data Retention under Settings, then Data Controls.
4. **Vercel** (Hobby, free): import this repository, or run `npx vercel` from a clone.
   - Add the environment variables listed in `.env.example`.
   - Set `APP_ORIGIN` to your deployment URL.
5. **iPhone:** open your deployment in Safari, tap Share, then Add to Home Screen. Open the app from the Home Screen and sign in with the emailed code.

## Development

```bash
npm install
cp .env.example .env.local   # fill in your own values
npm run dev                  # http://localhost:3000
npm test                     # unit tests (domain logic, parsing, validation)
npm run typecheck
```

To check the AI providers with your own keys and a photo of a meal:

```bash
RUN_AI_SMOKE=1 MEAL_PHOTO=/path/to/meal.jpg npx vitest run tests/smoke
```

## Project layout

- `app/` holds the screens (Today, Toilet, Practice, Resets, History, Settings, Login) and the API routes.
- `lib/domain/` holds the pure logic shared by phone and server: event schemas, the wake-to-wake day, rings, streak, the habit ladder and the feedback rules.
- `lib/client/` holds the on-device store (IndexedDB), the background sync and photo preparation.
- `lib/server/` and `lib/ai/` hold the database access, media handling and AI providers.
- `supabase/migrations/` holds the schema, with row-level security on every table.
- `tests/` holds the unit tests, plus an opt-in live AI check.

## Roadmap

- M2: Apple Watch and Health data through iOS Shortcuts, Back Tap, Lock Screen and Siri logging, push reminders.
- M3: the coach with long-term memory, nightly and weekly cards, lab report reading.
- M4: personal patterns, experiments, charts, and a doctor's bowel diary export.
