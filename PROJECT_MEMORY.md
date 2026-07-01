# Project Memory

## Current State

- `apps/web` builds with `npm run build` using Next.js standalone output.
- `apps/worker` builds with `npm run build` and emits `dist/worker.js` and `dist/scheduler.js`.
- Prisma schemas in root, `apps/web/prisma`, and `apps/worker/prisma` are currently identical.
- Prisma migrations exist under both `apps/web/prisma/migrations` and `apps/worker/prisma/migrations` so the worker Docker image can run `prisma migrate deploy` without host mounts.
- LINE Messaging API runtime config is centralized through `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_TO_ID`, and `APP_URL`.

## Decisions

- API routes under `apps/web/src/app/api` are marked `dynamic = "force-dynamic"` because they depend on runtime request data, Prisma, or BullMQ and must not be static-evaluated during Next build.
- `apps/worker/Dockerfile` generates Prisma Client before pruning dev dependencies so the production image keeps runtime dependencies without relying on `npx` after the Prisma CLI has been removed.
- `apps/web/public/.gitkeep` keeps the `public` directory present because the web Dockerfile copies `/app/public` in the runner stage.
- `news-worker` is the service that executes notify jobs; `news-scheduler` only enqueues the full pipeline repeatable job.
- `news-scheduler` enqueues repeatable jobs named `run-full-pipeline`, matching both dashboard manual runs and the worker switch case.
- `news-web` also receives LINE env for webhook signature verification and dashboard-triggered notification enqueue flows.
- `POST /api/notify` performs a LINE runtime config preflight before enqueueing `notify-only`; the worker performs the same send-time config check before calling LINE.
- `apps/worker` is the operational Docker image for one-off `migrate` and `seed` compose services.
- Runtime seed uses compiled JavaScript (`node dist/seeds/rssSources.js`), not `ts-node`.
- Runtime manual pipeline uses compiled JavaScript via `npm run pipeline:run:prod`, not `ts-node` or `src/`.
- Baseline migration `20260629_init` creates the full current schema, including `BriefStatus.COMPLETED`; later additive migrations are idempotent for empty database deploys.
- LINE webhook signature verification rejects requests in production if `LINE_CHANNEL_SECRET` is missing.

## Verification

- `npm install` completed in `apps/web` and `apps/worker`.
- `npx prisma generate` completed in both apps.
- `DATABASE_URL=postgresql://user:pass@localhost:5432/db npx prisma validate` completed in both apps.
- `npm run build` completed in both apps.
- `npm audit --audit-level=moderate` reports 0 vulnerabilities for `apps/worker`.
- `npm audit --audit-level=moderate` reports 5 vulnerabilities for `apps/web`; npm's available fix requires `--force` and breaking upgrades to Next/eslint tooling, so it was left unchanged during build-only work.
- After the LINE runtime config update, `npm run build` completed in both apps again.
- After the Docker migration/seed update, `docker compose build` completed for `news-web`, `news-worker`, and `scheduler`.
- A temporary empty PostgreSQL container was used to verify `npm run prisma:migrate` from the built worker image; all 4 migrations applied successfully without mounting schema from host.
- The same temporary database was used to verify `npm run seed` from the built worker image; it seeded 8 categories, 6 sources, and 14 keywords.
- Review-fix verification ran `docker compose down -v`, `docker compose up -d postgres redis`, `docker compose --profile tools run --rm migrate`, `docker compose --profile tools run --rm seed`, `docker compose up -d`, and `docker compose ps` successfully.
- `news-web` healthcheck reported healthy after full stack startup.
- BullMQ repeatable jobs were queried from the scheduler image and returned `run-full-pipeline`.

## Next Step

- Run `docker compose run --rm migrate` and then `docker compose run --rm seed` in the target deployment environment when initializing a fresh database.
