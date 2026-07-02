// ============================================================
// apps/worker/src/scheduler.ts
// Entry point ของ container "news-scheduler"
// Dockerfile/docker-compose รันไฟล์นี้ด้วย: node dist/scheduler.js
//
// หน้าที่: ตั้ง repeatable job บน BullMQ ให้ enqueue "run-full-pipeline"
// ทุกวันตามเวลาที่กำหนด (default 06:00 Asia/Bangkok ตามเอกสารต้นฉบับ)
// ตัว scheduler เองไม่ได้รัน pipeline ตรงๆ แค่ enqueue เข้า queue เดียวกับที่
// news-worker (worker.ts) ฟังอยู่ — แยก process กันเพื่อ restart/scale อิสระ
// ============================================================

import { Queue } from "bullmq";

const REDIS_URL = process.env.REDIS_URL ?? "redis://redis:6379";
const QUEUE_NAME = "daily-pipeline";
const JOB_NAME = "run-full-pipeline";
const LEGACY_JOB_NAME = "daily-pipeline-trigger";

// cron pattern: นาที ชั่วโมง วัน เดือน วัน-ในสัปดาห์
// "0 18 * * *" = ทุกวัน 18:00 (ใช้ TZ env ของ container กำหนด timezone จริง
// docker-compose ตั้ง TZ=Asia/Bangkok ให้ container นี้แล้ว)
const CRON_PATTERN = process.env.PIPELINE_CRON ?? "0 6 * * *";

async function main() {
  const queue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } as any });

  // ลบ repeatable job เดิมก่อนเสมอตอน start (กันกรณีแก้ CRON_PATTERN แล้ว
  // deploy ใหม่ แต่ของเก่ายังค้างอยู่ใน Redis กลายเป็นรัน 2 รอบ)
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === JOB_NAME || job.name === LEGACY_JOB_NAME) {
      await queue.removeRepeatableByKey(job.key);
      console.log(`[scheduler] removed old repeatable job: ${job.key}`);
    }
  }

  await queue.add(
    JOB_NAME,
    {},
    {
      repeat: { pattern: CRON_PATTERN },
      removeOnComplete: 20,
      removeOnFail: 50,
    }
  );

  console.log(`[scheduler] registered cron "${CRON_PATTERN}" -> job "${JOB_NAME}" on queue "${QUEUE_NAME}"`);
  console.log("[scheduler] idle, waiting for next trigger time...");

  // process นี้แค่ "ตั้งเวลา" — ไม่ต้อง loop เอง BullMQ จัดการ repeat ผ่าน Redis
  // ปล่อย process ทำงานต่อเฉยๆ เพื่อให้ container ไม่ exit
}

main().catch((err) => {
  console.error("[scheduler] FAILED to start:", err);
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("[scheduler] SIGTERM received, exiting...");
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("[scheduler] SIGINT received, exiting...");
  process.exit(0);
});
