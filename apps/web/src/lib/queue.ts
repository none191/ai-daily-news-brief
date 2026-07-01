// ============================================================
// apps/web/src/lib/queue.ts
// Queue client ฝั่ง web — ใช้ enqueue job เข้า queue เดียวกับที่
// apps/worker/src/worker.ts ฟังอยู่ ("daily-pipeline")
//
// web ไม่รัน pipeline เอง แค่ enqueue แล้วปล่อยให้ news-worker container
// เป็นคนทำงานจริง ตามสถาปัตยกรรมที่วางไว้ใน docker-compose
// ============================================================

import { Queue } from "bullmq";

const REDIS_URL = process.env.REDIS_URL ?? "redis://redis:6379";
const QUEUE_NAME = "daily-pipeline";

// เก็บ instance ไว้ใน global เพื่อกัน Next.js dev mode (hot reload) สร้าง
// connection ใหม่ซ้ำๆ ทุกครั้งที่ route ถูกเรียก
declare global {
  // eslint-disable-next-line no-var
  var __pipelineQueue: Queue | undefined;
}

export function getPipelineQueue(): Queue {
  if (!global.__pipelineQueue) {
    global.__pipelineQueue = new Queue(QUEUE_NAME, {
      connection: { url: REDIS_URL } as any,
    });
  }
  return global.__pipelineQueue;
}

export type PipelineJobName =
  | "run-full-pipeline"
  | "fetch-only"
  | "fetch-source"
  | "dedupe-only"
  | "cluster-only"
  | "score-only"
  | "select-only"
  | "summarize-only";
