# Schedly

A student schedule companion. Scan a timetable image, get a working schedule, and
keep the rest of term organised around it.

Mobile-first and installable as a PWA. Everything works offline once loaded.

Open Schedly once with a connection and it saves itself to the device: your
schedules, notes and study tools all open with no signal after that. See
[Offline and low-data mode](#offline-and-low-data-mode).

## What it does

- **Scan a schedule** — upload a timetable photo and it is read into a real
  schedule you can edit. OCR runs first; AI vision is only a fallback.
- **Today and the week** — what is next, what is free, where the gaps are.
- **Focus timer** — pomodoro sessions that grow a tree as you go.
- **Notes, flashcards, planner, syllabus tracking** — study tools on the same
  account.
- **GWA calculator** — Philippine 1.00 to 5.00 and other grading scales.
- **Share a schedule** — six-digit codes that expire after 24 hours and work once.
- **Public profile** — a shareable page for a username.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, React 19, Turbopack) |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via Prisma |
| Auth | Better Auth (email, Google, GitHub, plus guest accounts) |
| AI | Gemini → Groq → OpenRouter fallback chain, behind one gateway |
| OCR | Tesseract.js, with OpenCV WASM for deskewing |
| Storage | Backblaze B2 for image bytes, database for metadata only |
| Jobs | BullMQ on Redis, QStash for exact-time delivery |
| Push | Firebase Cloud Messaging + web push |
| Email | Resend |
| Tests | Vitest |

## Getting started

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

`.env.example` lists every variable with a placeholder value. The ones without
a working default:

| Variable | Why |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | 32+ characters, random |
| `BETTER_AUTH_URL` | Public origin |
| `REDIS_URL` | BullMQ and QStash |
| `B2_APPLICATION_KEY_ID` / `B2_APPLICATION_KEY` | Image uploads |
| `B2_BUCKET` | Upload bucket, keep it private |

Every AI provider key is optional. With none configured, OCR alone still reads a
schedule.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate` then production build |
| `npm run test:run` | Vitest, once |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:studio` | Browse the database |

## Architecture

```
src/
  app/            Routes. (dashboard) is the signed-in shell.
  components/     Shared UI, including the bottom sheet used app-wide.
  features/       Feature modules: guest, schedule, upload, insights.
  server/         Server-only code. Actions, AI gateway, stores.
  lib/            Framework-free helpers, shared by both sides.
```

A few conventions worth knowing before changing anything:

- **Server actions live next to the page that uses them**, under `actions.ts`.
  Prisma and AI calls do not belong in a client component.
- **All AI work goes through `src/server/ai/`.** Never call a provider directly.
  The gateway owns the fallback chain, per-key circuit breakers and retries.
- **Client components are the default.** Add `"use client"` only when a file
  needs state, effects or a browser API.
- **Shared components are `md:` responsive by construction.** A bottom sheet
  becomes a centred dialog from `md` up and keeps the same hard shadow, so the
  same component works on both without a separate desktop version.

## Upload security

Uploaded images are validated by magic bytes, not by the `Content-Type` header,
since that header is attacker-controlled. Allowed formats are JPEG, PNG, GIF,
WebP and BMP, up to 20 MB. Rate limits are applied per user.

## Offline and low-data mode

### What works offline, and what does not

A browser cannot download a site it has never seen, so **the first visit always
needs a connection**. After that visit, the app shell and every screen listed in
`OFFLINE_ROUTES` open with no signal, along with anything you have opened while
connected.

Server-dependent and honestly labelled as such: scanning a timetable (OCR and
AI both run server-side), sharing a schedule by code, and push notifications
arriving.

Works offline: viewing, creating, editing, deleting and searching your
schedules; notes, todos, the focus timer, the GWA calculator and everything else
that reads from the local cache.

### How local data is stored

IndexedDB (`schedly-offline`), schema v3:

| Store | Key | Holds |
|---|---|---|
| `data` | `a:<account>:<name>` | Cached schedules, notes, profile |
| `queue` | entry id | Writes waiting to reach the server |
| — | `meta:*` | Readiness markers, the last-used account |

**Every key is namespaced by account.** Signing out does not erase anything — it
makes the previous account's rows unreachable, so unsynced work survives while
being invisible to whoever signs in next. Settings → *Offline & data* → *Erase
offline data* is the only thing that deletes, for a genuinely shared device.

Queued writes carry an `accountId`, an `attempts` count, a `nextAttemptAt`
backoff and an `idempotencyKey`. That last one is stored on the schedule row, so
a retry whose response was lost resolves to the original schedule instead of
creating a second copy.

### When things sync

Triggers: app start, `online`, window focus, tab visible, a 60s heartbeat, and
Background Sync where the browser has it. Before replaying, the queue probes
`/api/ping` — because `navigator.onLine` reports "online" on a phone whose every
request is failing, and trusting it fires doomed requests on metered data.

Retries use exponential backoff with jitter (15s → 15min). A write the server
refuses is dropped; one that never got an answer is kept. An expired session
keeps its work and waits.

### Low Data Mode

Settings → *Offline & data*. Stops background polling and optional prefetching,
and makes search submit-based instead of per-keystroke. It hides nothing and
breaks nothing — it changes how much is fetched, never whether the app works.
It also turns itself on when the browser reports `saveData` or a 2G/3G
connection.

Schedly does **not** provide free mobile data or bypass carrier billing.
Zero-rating is a carrier agreement, not a feature of this app.

### Testing it

Settings → *Offline & data* → *Prepare for offline use*, then use DevTools →
Network → *Offline* and reopen each screen. The readiness card reports the real
number of screens that failed to save rather than a green tick.

The service worker is registered in production only. In dev it does no caching
at all, because dev chunk URLs are rebuilt on every restart.

## Deployment

Deployed on Vercel. A few things to know:

- Two cron routes run on a schedule: `/api/cron/reminders` for class reminders
  and `/api/cron/guest-cleanup` for expired guests and share codes. Both need
  `CRON_SECRET`.
- Run `npx prisma migrate deploy` before the first deploy against a new
  database.
- Service workers and `navigator.storage.persist()` both require a secure
  context. Serve production over HTTPS; `http://localhost` counts as secure, so
  testing offline behaviour works locally without a certificate.

## License

All rights reserved. No license has been granted, so the default copyright rules
apply: the code is publicly readable but not licensed for reuse. Add a `LICENSE`
file here if you want to open it up.