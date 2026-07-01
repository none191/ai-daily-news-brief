// ============================================================
// apps/worker/src/worker.ts
// Entry point ของ container "news-worker"
// Dockerfile รันไฟล์นี้ด้วย: node dist/worker.js
//
// หน้าที่: ฟัง queue "daily-pipeline" บน Redis แล้วรัน step ตาม job name
// เวลามีคนกด "ปุ่มรันสรุปข่าวใหม่" จาก Dashboard จะ enqueue job เข้ามาที่นี่
// (Dashboard ไม่รัน pipeline ตรงๆ เอง แค่ enqueue แล้ว worker นี้เป็นคนทำงานจริง)
// ============================================================

import { Worker, Job } from "bullmq";
import { runFetchRssJob } from "./jobs/fetchRss";
import { runDedupeJob } from "./jobs/dedupe";
import { runClusterJob } from "./jobs/cluster";
import { runScoreJob } from "./jobs/score";
import { runSelectJob } from "./jobs/select";
import { runSummarizeJob } from "./jobs/summarize";
import { runDailyPipeline } from "./jobs/runDailyPipeline";
import { runNotifyJob } from "./jobs/notify";

const REDIS_URL = process.env.REDIS_URL ?? "redis://redis:6379";
const QUEUE_NAME = "daily-pipeline";

// ชนิด job ที่ worker นี้รู้จัก — ใช้ตอน enqueue จากฝั่ง Dashboard (API route)
// หรือจาก scheduler.ts (repeatable job ชื่อ "run-full-pipeline")
type JobName =
  | "run-full-pipeline" // รันทุก step ตามลำดับ (ใช้โดย scheduler ทุกเช้า)
  | "fetch-only"
  | "fetch-source" // test fetch เฉพาะแหล่งข่าวเดียว — payload: { sourceId: string }
  | "dedupe-only"
  | "cluster-only"
  | "score-only"
  | "select-only"
  | "summarize-only"
  | "notify-only";

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

async function handleJob(job: Job<unknown, unknown, JobName>) {
  console.log(`[worker] received job "${job.name}" (id=${job.id})`);

  switch (job.name) {
    case "run-full-pipeline":
      return runDailyPipeline();
    case "fetch-only":
      return runFetchRssJob();
    case "fetch-source": {
      const sourceId = (job.data as { sourceId?: string } | undefined)?.sourceId;
      if (!sourceId) throw new Error('[worker] "fetch-source" job ต้องมี payload { sourceId }');
      return runFetchRssJob({ sourceId });
    }
    case "dedupe-only":
      return runDedupeJob();
    case "cluster-only":
      return runClusterJob();
    case "score-only":
      return runScoreJob();
    case "select-only":
      return runSelectJob(todayDateOnly());
    case "summarize-only":
      return runSummarizeJob();
    case "notify-only":
      return runNotifyJob();
    default:
      throw new Error(`[worker] unknown job name: ${job.name}`);
  }
}

const worker = new Worker<unknown, unknown, JobName>(QUEUE_NAME, handleJob, {
  connection: { url: REDIS_URL } as any,
  concurrency: 1, // รันทีละ job พอ — pipeline ผูกกับ DB เดียวกัน ไม่ต้อง parallel
});

worker.on("completed", (job) => {
  console.log(`[worker] job "${job.name}" (id=${job.id}) completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job "${job?.name}" (id=${job?.id}) failed:`, err?.message ?? err);
});

console.log(`[worker] listening on queue "${QUEUE_NAME}" via ${REDIS_URL}`);

// graceful shutdown — สำคัญบน NAS เวลา docker compose down/restart
process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received, closing...");
  await worker.close();
  process.exit(0);
});
process.on("SIGINT", async () => {
  console.log("[worker] SIGINT received, closing...");
  await worker.close();
  process.exit(0);
});
