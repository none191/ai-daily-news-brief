# ============================================================
# apps/worker/Dockerfile — Worker + Scheduler (news-worker / news-scheduler)
# Multi-stage build, Node 20 alpine, production optimized
# Same image used by both "news-worker" and "news-scheduler" services
# (docker-compose overrides CMD via "command:" for scheduler)
# ============================================================

# ---------- Stage 1: deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ---------- Stage 2: builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build
# คาดหวังว่า "npm run build" จะ compile TypeScript -> dist/
# โดยมี dist/worker.js และ dist/scheduler.js เป็น entry points

# ---------- Stage 3: prune dev deps ----------
FROM node:20-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

# ---------- Stage 4: runner ----------
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 worker

ENV NODE_ENV=production

COPY --from=prod-deps --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/prisma ./prisma
COPY --from=builder --chown=worker:nodejs /app/package.json ./package.json

USER worker

# default command = worker consumer
# news-scheduler service จะ override ด้วย: command: ["node", "dist/scheduler.js"]
CMD ["node", "dist/worker.js"]
