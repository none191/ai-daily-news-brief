# Project Memory

## Current State

- `apps/web` builds with `npm run build` using Next.js standalone output.
- `apps/worker` builds with `npm run build` and emits `dist/worker.js` and `dist/scheduler.js`.
- Prisma schemas in root, `apps/web/prisma`, and `apps/worker/prisma` are currently identical.
- Prisma migrations currently exist under `apps/web/prisma/migrations`.
- LINE Messaging API runtime config is centralized through `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_TO_ID`, and `APP_URL`.

## Decisions

- API routes under `apps/web/src/app/api` are marked `dynamic = "force-dynamic"` because they depend on runtime request data, Prisma, or BullMQ and must not be static-evaluated during Next build.
- `apps/worker/Dockerfile` generates Prisma Client before pruning dev dependencies so the production image keeps runtime dependencies without relying on `npx` after the Prisma CLI has been removed.
- `apps/web/public/.gitkeep` keeps the `public` directory present because the web Dockerfile copies `/app/public` in the runner stage.
- `news-worker` is the service that executes notify jobs; `news-scheduler` only enqueues the full pipeline repeatable job.
- `news-web` also receives LINE env for webhook signature verification and dashboard-triggered notification enqueue flows.
- `POST /api/notify` performs a LINE runtime config preflight before enqueueing `notify-only`; the worker performs the same send-time config check before calling LINE.

## Verification

- `npm install` completed in `apps/web` and `apps/worker`.
- `npx prisma generate` completed in both apps.
- `DATABASE_URL=postgresql://user:pass@localhost:5432/db npx prisma validate` completed in both apps.
- `npm run build` completed in both apps.
- `docker compose build` could not be run in the current environment because `docker` is not installed or not available on `PATH`.
- `npm audit --audit-level=moderate` reports 0 vulnerabilities for `apps/worker`.
- `npm audit --audit-level=moderate` reports 5 vulnerabilities for `apps/web`; npm's available fix requires `--force` and breaking upgrades to Next/eslint tooling, so it was left unchanged during build-only work.
- After the LINE runtime config update, `npm run build` completed in both apps again.

## Next Step

- Run `docker compose build` on a machine/session with Docker available.
