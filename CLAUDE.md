# CLAUDE.md

Personal task & reminder web app for a small group of users. API-first: the web app is one client; a future AR-glasses client will use the same API. Full requirements live in `SPEC.md` — read it before starting any phase.

## Working rules

- Build in the phases listed in `SPEC.md`. After each phase: it runs, tests pass, commit, summarize how to test, then **stop and wait** for the user.
- Before using a library, check its current docs and use the current stable version/API. Don't rely on memory.
- Keep it simple. Nothing outside `SPEC.md` (see its "Out of scope" list). When something is unclear, ask.
- Never commit secrets. Every new env var goes into `.env.example` with an explanation.
- Every new/changed endpoint is documented in `API.md` in the same commit.

## Architecture

pnpm workspaces monorepo:

- `apps/api` — Fastify REST API under `/api`, Prisma, Better Auth, pg-boss, Socket.IO, web-push, Nodemailer. **All business logic lives here.**
- `apps/web` — React + Vite + Tailwind SPA. Thin client: calls the API, no business rules (dates/recurrence/parsing happen on the server).
- `packages/shared` — Zod schemas and inferred TypeScript types shared by api and web. Request/response shapes are defined here first.

Inside `apps/api/src`, code is organised by feature module (`auth/`, `tasks/`, `lists/`, `reminders/`, `parse/`, `users/`), each with `routes.ts` (HTTP only: validate, call service, shape response) and `service.ts` (business logic, Prisma access). Routes never talk to Prisma directly.

### Auth

- Better Auth mounted at `/api/auth/*`, email/password only, Argon2id via a custom `password.hash/verify` (`@node-rs/argon2`).
- One `authenticate` preHandler resolves the current user for every protected route and for the Socket.IO handshake. It is the single place to add device-token (Bearer) auth later — routes only ever see `request.user`.
- Every query on user-owned data filters by `userId` from the session. Never trust a userId from the request body/params. Accessing another user's resource returns 404, not 403.

### Time

- All timestamps are stored in UTC (`timestamptz`). Each user has an IANA `timezone`.
- Convert to the user's timezone only for display (web) and for "day" logic / parsing (api, using the user's stored timezone).

### Tasks and recurrence (see "Decisions" in SPEC.md)

- Due date required unless priority is Low. Deleting a list sets its tasks' list to null.
- Recurrence is computed in the user's timezone from the **due date** (or the reminder time when there is no due date), never from the completion date. Only one next occurrence, always in the future.
- Reminder is kept as an offset (`reminderOffsetMinutes`) from the due date; monthly recurrence keeps the original day (`recurrenceDay`) and clamps to month end without drifting.
- Snooze changes only `remindAt`, never `dueAt` or the offset.

### Reminders

- Scheduled server-side with pg-boss; a task's job is updated/cancelled whenever its `remindAt` changes or it is deleted/completed.
- Delivery fans out to the user's enabled channels: Socket.IO, Web Push, email. Failures are retried by pg-boss and logged.
- On startup, catch up on reminders that came due while the server was down.

## API conventions

- JSON only. Success: the resource (or `{ items: [...] }` for collections).
- Errors: `{ "error": { "code": "SNAKE_CASE_CODE", "message": "Human readable", "details"?: ... } }`.
- Status codes: 200 ok, 201 created, 204 no content, 400 validation, 401 unauthenticated, 404 not found / not yours, 409 conflict, 429 rate limited, 500 unexpected.
- Request bodies validated with the shared Zod schemas; validation failures → 400 `VALIDATION_ERROR` with Zod issues in `details`.
- Dates in JSON are ISO-8601 UTC strings.

## Commands

Run from the repo root (local Postgres must be up: `pnpm db:up`).

- `pnpm dev` — API on :3000 (`node --watch --import tsx`) + web on :5173 (Vite proxies `/api` to the API)
- `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm format`
- `pnpm --filter @todo/api db:migrate --name <change>` then `db:generate` after editing `apps/api/prisma/schema.prisma`
- `pnpm --filter <pkg> add <dep>` to add a dependency to one package

## Project notes

- Pinned majors: Prisma **7.x** (8 is only an RC and Better Auth supports ≤7), TypeScript **6.0.x** (typescript-eslint doesn't support 7 yet).
- Prisma 7: config in `apps/api/prisma.config.ts`, client generated to `apps/api/src/generated/prisma` (gitignored) and created with `@prisma/adapter-pg`. `migrate dev` does not auto-generate — run `db:generate`.
- Better Auth tables (`User`, `Session`, `Account`, `Verification`) were generated with `pnpm dlx auth@<version> generate`; keep their field names. App fields on `User` must also be declared as Better Auth `additionalFields`. The password hash lives in `Account.password`.
- All `DateTime` columns are `@db.Timestamptz(3)`.
- Env vars are validated in `apps/api/src/lib/env.ts` (Zod). Local dev loads the repo-root `.env`; existing process env always wins.
- `packages/shared` is consumed as TypeScript source (no build step); imports inside it use `.js` extensions.
- New pnpm dependencies with install scripts must be allowed under `allowBuilds` in `pnpm-workspace.yaml`.
- API tests: `buildApp()` + `app.inject()`, against `todo_test` (migrated in `apps/api/test/global-setup.ts`). Use `test/helpers.ts` (`resetState`, `signUp`, `request` adds the Origin header Better Auth requires).
- Auth wiring: `src/auth/auth.ts` (Better Auth config), `src/auth/routes.ts` (mounts `/api/auth/*`, validates bodies with shared schemas, rewrites errors to our format), `src/auth/rate-limit.ts` (in-memory per-IP + per-email limits for sign-in/up/reset), `src/auth/authenticate.ts` (`authenticate` preHandler + `currentUser(request)`).
- Protected routes are registered inside the `protectedApi` scope in `src/app.ts`.
- Better Auth `/update-user` is disabled; profile changes go through `PATCH /api/me`.
- Email: `src/lib/mailer.ts`. Without SMTP config, mail goes to an in-memory `outbox` (tests read it) and is logged in development.
- Tasks: `src/tasks/service.ts` (CRUD, Today/Overdue queries, complete/reopen), `src/tasks/recurrence.ts` (pure `nextOccurrence`, luxon, fully unit-tested). Every query filters by `userId`; other users' resources are 404.
- `reminderOffsetMinutes` is recomputed only when the user edits `dueAt`/`dueAllDay`/`remindAt` (snoozes must not change it). `recurrenceDay` is set by the server for MONTHLY.
- All-day tasks: `dueAllDay=true`, `dueAt` = start of that local day (normalized server-side).
- Shared time helpers (`packages/shared/src/time.ts`, luxon) convert local date/time ⇄ UTC in the user's timezone; the web editor uses them with `me.timezone` (not the browser's zone).
- Calendar: `GET /api/tasks/calendar` (per-day counts by local date) + `GET /api/tasks/day`. Weeks start on Monday. URL state `/calendar?month=yyyy-MM&day=yyyy-MM-dd`.
- Snooze (`src/tasks/snooze.ts`) only sets `remindAt`. Phase 6 must also reschedule the pg-boss job there.
- Quick add: `src/parse/parser.ts` is a pure function (`parseTaskText(text, { now, timezone, lists })`) using chrono-node (custom parser for "the 15th") + keyword rules; every rule change needs a case in `parser.test.ts`. chrono gets the user's current UTC offset as its reference, and the local date/time fields it returns are rebuilt in the IANA zone with luxon (DST-safe). `POST /api/tasks/parse` never saves.
- Web quick add: `components/QuickAdd.tsx` (bar + confirmation card reusing `TaskForm`), `hooks/useSpeechRecognition.ts` (Web Speech API; mic hidden with a note when unsupported).
- Reminders (`src/reminders/`): `schedule.ts` (`scheduleReminder` after any change to `remindAt`/status — cancels the old pg-boss job via `Task.reminderJobId`; `reminderChanged` resets `reminderSentAt`), `deliver.ts` (`handleReminder` claims a reminder once via `reminderSentAt`, emits in-app, enqueues `reminder-push`/`reminder-email` jobs; stale jobs are ignored by comparing `remindAt`), `workers.ts` (workers + startup catch-up), `socket.ts` (Socket.IO, session-cookie auth, room `user:<id>`), `queue.ts` (pg-boss singleton, queues, retries; long retention for far-future reminders). `buildApp` stops pg-boss on close; `server.ts` attaches Socket.IO, starts workers and runs catch-up.
- Web: `ReminderToasts` (socket client, Done/Snooze), `public/sw.js` (push only, no caching), `lib/push.ts`, `NotificationSettings`.
- Empty states: `apps/web/src/components/EmptyState.tsx` (original inline SVGs; "free day" variation picked by a date seed).
- Web: TanStack Query; task/list mutations invalidate `['tasks']` and `['lists']`. `useTaskEditor()` opens the create/edit modal.
- Web: TanStack Query; `useMe()` is the auth state (null = signed out). Any 401 sets it to null, which sends the user to /login.

## Production

- `Dockerfile` targets: `api` (esbuild bundle `apps/api/dist/server.js` + prod deps via `pnpm deploy --legacy`, runs as `node`), `web` (Caddy + built SPA), `migrate` (`prisma migrate deploy`). Build script: `apps/api/scripts/build.mjs` (npm deps external, `@todo/*` bundled).
- `docker-compose.prod.yml`: `db` only on the internal `backend` network (no ports), `api` on backend+frontend, `caddy` publishes 80/443. Compose sets NODE_ENV/HOST/PORT/DATABASE_URL/WEB_ORIGIN (they override `.env`). New env vars: add to `.env.example`, `env.ts`, and DEPLOY.md.
- Caddy sets CSP/HSTS/etc. — new third-party resources (scripts, fonts, APIs) need a CSP change in `Caddyfile`.
- API trusts exactly one proxy hop in production (`trustProxy`), so `request.ip` is the real client. Non-GET requests with a foreign `Origin` get 403.
- Shutdown order matters: Socket.IO engine first, then `app.close()` (else Docker SIGKILLs).
- `scripts/backup.sh`: pg_dump custom format, keeps 14; restore steps in DEPLOY.md.

## Testing

- Vitest in every package. Unit-test business logic (services, recurrence, parser, time helpers); integration-test API routes against a test database.
- The quick-add parser must have thorough example-sentence tests.
