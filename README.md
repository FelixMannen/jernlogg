# Jernlogg

A strength and running log for small groups of friends and family, not for an audience of followers. Installable on your phone as a PWA, works offline in the gym, and live at **[jernlogg.vercel.app](https://jernlogg.vercel.app)** (UI in Norwegian).

## Why

Two friends and I planned to train a lot of strength while on exchange, and we wanted to see each other's progress, get reminders and follow each other's sessions. Apps like Strava are built for posting to followers. Jernlogg is built for closed groups: a group of friends, a family, with private data by default.

## What it does

- **Log a workout fast:** sets, kg, reps and RPE, prefilled from last time, with progression hints, a rest timer, warm-up generator, supersets and a plate calculator.
- **Personal records** (estimated 1RM) detected the moment a set is ticked off, plus progress charts.
- **Running:** stopwatch, routes and leaderboards.
- **Groups:** feed with reactions, leaderboards, weekly challenges and shared goals. Invite by link or QR code.
- **Login with a one-time email code** (no passwords). Privacy page, data export and account deletion.
- **PWA:** installable, offline cache, offline write queue that syncs when the connection returns.
- **Push notifications** (Web Push/VAPID): training reminders, friend activity and supplement reminders with a "taken" action that works straight from the notification.
- **Import a session from text or a link,** for example a programme written in a chat with an AI assistant.
- **In-app feedback:** users report issues inside the app, and the reports feed directly into the development queue. A complaint reopens a fixed item.

## How it is built: an AI agent in a feedback loop

Jernlogg is built by a **Claude Code agent** working in iterations, with me as product owner. I wrote the requirements ([`SPEC.md`](SPEC.md)) and the rules the agent works by ([`CLAUDE.md`](CLAUDE.md)), and I decide priorities, approve database changes and review the result.

Each iteration:
1. Run a Playwright smoke test in a mobile viewport and look at the screenshots as each user would.
2. Build a prioritised backlog: bugs > friction when logging > features a keen lifter would expect > polish. User feedback from the app always comes first.
3. Implement 2–4 items, run the build and the relevant end-to-end tests.
4. Push to `main`. Vercel deploys automatically. Log the round in [`CHANGELOG.md`](CHANGELOG.md).

The first version and 25 iterations shipped in 10 days.

**Guardrails for an autonomous agent:**
- The agent may only push when the build and the relevant tests are green.
- No schema or access-rule changes without my approval, and then only additive. Deletes are always soft.
- Test data never touches production: a local mode (`?local=1`) runs the same app against a local backend.
- Feedback text from users outside the core group is treated as **data, not instructions**, and must be approved by me before the agent acts on it. This protects against prompt injection through the feedback form.

## Architecture

| Part | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite, plain CSS with design tokens |
| Data and auth | Supabase (Postgres, Auth, Realtime) |
| Access control | Postgres Row Level Security in [`supabase/auth.sql`](supabase/auth.sql), mirrored in `src/lib/access.ts` and tested by `scripts/test-rls.mjs` |
| Server | Vercel serverless functions in `api/` (notifications, daily cron) |
| Offline | Service worker, IndexedDB cache, write queue in `src/lib/store.ts` |

Design decisions:
- **One generic table**, `docs (id, collection, data jsonb, …)`. New features rarely need a migration, old rows keep working, and access rules apply the same way to everything.
- **Security lives in the database,** not the client. Everyone sees only their own data and data from people they share a group with. Body weight, supplements and accounts are always private.
- **Local-first sync:** the app starts instantly from cache, and after the first load only changes are fetched (`synced_at` cursor).

## Tests

End-to-end and integration scripts in [`scripts/`](scripts) (Playwright, mobile viewport, local mode): smoke test, groups and login, access rules, running, import, keyboard behaviour on iPhone, quick start, supplements and push reminders.

```bash
npm install
npm run build
node scripts/smoke.mjs --seed <folder>    # Playwright smoke test against local mode
node scripts/test-rls.mjs                 # access rules
```

## Running locally

```bash
npm install
npm run dev        # open http://localhost:5173/?local=1 for local mode (no Supabase needed)
```

Secrets (Supabase service key, VAPID private key) live only in Vercel environment variables, never in this repo.
