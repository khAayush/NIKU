# syntax=docker/dockerfile:1
# Multi-stage build. Targets:
#   api      - the Node.js API (production dependencies + bundled dist/server.js)
#   web      - Caddy serving the built web app and proxying /api and /socket.io to the API
#   migrate  - runs `prisma migrate deploy` (docker compose run --rm migrate)

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
# Prisma's CLI (migrations) needs OpenSSL on Alpine.
RUN apk add --no-cache openssl
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---- Dependencies (cached until a manifest or the lockfile changes) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- Build everything ----
FROM deps AS build
COPY . .
# `prisma generate` reads the config, which needs a URL; it does not connect.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# The app's name is built into the web app (empty = "Tasks"). Passed by docker-compose.prod.yml.
ARG APP_NAME=""
RUN pnpm --filter @todo/api db:generate \
 && pnpm --filter @todo/api build \
 && pnpm --filter @todo/web build
# A self-contained copy of the API with production dependencies only.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @todo/api deploy --prod --legacy /out/api \
 && cp -r apps/api/dist /out/api/dist

# ---- Database migrations ----
FROM build AS migrate
WORKDIR /app/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---- API runtime ----
FROM node:${NODE_VERSION}-alpine AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--enable-source-maps", "dist/server.js"]

# ---- Web (Caddy: static files + reverse proxy + automatic HTTPS) ----
FROM caddy:2-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
