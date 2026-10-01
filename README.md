# Schedly

A student schedule companion. Scan a timetable image, get a working schedule, and
keep the rest of term organised around it.

Mobile-first and installable as a PWA. Everything works offline once loaded.

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

## Deployment

Deployed on Vercel. A few things to know:

- Two cron routes run on a schedule: `/api/cron/reminders` for class reminders
  and `/api/cron/guest-cleanup` for expired guests and share codes. Both need
  `CRON_SECRET`.
- Run `npx prisma migrate deploy` before the first deploy against a new
  database.

## License

All rights reserved. No license has been granted, so the default copyright rules
apply: the code is publicly readable but not licensed for reuse. Add a `LICENSE`
file here if you want to open it up.