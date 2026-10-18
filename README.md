# Tasks

Personal task & reminder web app. See [SPEC.md](SPEC.md) for requirements and [API.md](API.md) for the API.

## Stack

pnpm monorepo · TypeScript · Fastify + Prisma (PostgreSQL) API · React + Vite + Tailwind web app · Zod schemas shared in `packages/shared` · Vitest.

```
apps/api          REST API under /api (all business logic)
apps/web          React web client
packages/shared   Zod schemas and types shared by api and web
```

## Prerequisites

- Node.js 22.18+ (`node -v`)
- pnpm 12 (`corepack enable` or `npm i -g pnpm`)
- Docker Desktop (for local PostgreSQL)

## First-time setup

```bash
pnpm install
cp .env.example .env                      # then set BETTER_AUTH_SECRET (command is in the file)
pnpm db:up                                # start Postgres in Docker (creates todo and todo_test DBs)
pnpm --filter @todo/api db:generate      # generate the Prisma client
pnpm --filter @todo/api db:migrate       # apply migrations to the dev database
```

## Run locally

```bash
pnpm dev
```

- Web app: http://localhost:5173 (proxies `/api` to the API)
- API: http://localhost:3000 — try http://localhost:5173/api/health

The footer of the web app shows whether it can reach the API.

**Reminders in development:** reminders are scheduled with pg-boss in the same Postgres
database (schema `pgboss`), so they survive API restarts. In-app reminders pop up in any open
tab. For browser push, generate VAPID keys (`pnpm --filter @todo/api vapid:generate`), put them
in `.env`, restart the API and turn on _Browser push notifications_ in Settings (Chrome works on
`http://localhost`).

**Emails in development:** if `SMTP_USER`/`SMTP_PASS` are empty, emails (e.g. password reset links)
are not sent; they are printed in the API's log so you can copy the link.

## Common commands

| Command                              | What it does                                           |
| ------------------------------------ | ------------------------------------------------------ |
| `pnpm dev`                           | Run API (auto-restart) and web app (hot reload)        |
| `pnpm test`                          | Run all tests (API tests use the `todo_test` database) |
| `pnpm typecheck`                     | Type-check every package                               |
| `pnpm lint` / `pnpm format`          | ESLint / Prettier                                      |
| `pnpm db:up` / `pnpm db:down`        | Start / stop local Postgres                            |
| `pnpm --filter @todo/api db:migrate` | Create/apply a migration after editing `schema.prisma` |
| `pnpm --filter @todo/api db:studio`  | Browse the database                                    |

## Production

Production runs with Docker Compose: `Dockerfile` (targets `api`, `web`, `migrate`),
`docker-compose.prod.yml`, `Caddyfile` (HTTPS + security headers) and `scripts/backup.sh`.
See [DEPLOY.md](DEPLOY.md) for the full server setup.

To check the production API bundle locally: `pnpm --filter @todo/api build && pnpm --filter @todo/api start`.

## Changing the database schema

1. Edit `apps/api/prisma/schema.prisma`.
2. `pnpm --filter @todo/api db:migrate --name describe_change`
3. `pnpm --filter @todo/api db:generate`
