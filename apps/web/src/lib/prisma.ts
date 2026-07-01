// ============================================================
// apps/web/src/lib/prisma.ts
// Prisma client singleton — กัน Next.js dev mode สร้าง connection
// ใหม่ทุกครั้งที่ hot reload (pattern เดียวกับ lib/queue.ts)
// ============================================================

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
