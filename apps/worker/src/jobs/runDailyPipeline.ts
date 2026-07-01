// ============================================================
// apps/worker/src/jobs/runDailyPipeline.ts
// รวม step ทั้งหมดของ pipeline เป็นลำดับเดียว ตาม schedule ในเอกสารต้นฉบับ:
//   06:00 fetch -> 06:10 dedupe -> 06:20 classify -> 06:30 score
//   -> 06:40 select -> 06:50 summarize -> 07:00 generate brief -> 07:05 notify
//
// ใช้ทั้งจาก scheduler.ts (รันอัตโนมัติทุกวัน) และจาก command รัน manual
// แต่ละ step ทำงานแยกอิสระ ถ้า step ไหน throw -> หยุดทั้ง pipeline ทันที
// (ต่างจาก fetchRss ที่ระดับ "รายแหล่งข่าว" จะไม่ทำให้ step ทั้งก้อนล้ม)
// ============================================================

import { PrismaClient, ArticleStatus } from "@prisma/client";
import { runFetchRssJob } from "./fetchRss";
import { runDedupeJob } from "./dedupe";
import { runClusterJob } from "./cluster";
import { runScoreJob } from "./score";
import { runSelectJob } from "./select";
import { runSummarizeJob } from "./summarize";
import { runNotifyJob } from "./notify";

const prisma = new PrismaClient();

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * step "classify" แบบง่าย: category ถูกผูกไว้แล้วตั้งแต่ fetchRss
 * (อ้างอิงจาก source.defaultCategoryId) ดังนั้น step นี้แค่เปลี่ยนสถานะ
 * NEW -> CLASSIFIED ให้ข่าวที่ไม่ซ้ำและผ่าน cluster มาแล้ว เพื่อให้ score job
 * (ซึ่ง query status = CLASSIFIED) หยิบไปทำงานต่อได้
 *
 * ถ้าในอนาคตอยากแยก classify เป็น AI-based (ไม่อิงแค่ source) ค่อยแทนที่
 * ฟังก์ชันนี้ด้วย job จริงได้โดยไม่กระทบ step อื่น
 */
async function markClassified() {
  const result = await prisma.newsArticle.updateMany({
    where: { isDuplicate: false, status: ArticleStatus.NEW },
    data: { status: ArticleStatus.CLASSIFIED },
  });
  return result.count;
}

export async function runDailyPipeline() {
  const results: Record<string, unknown> = {};

  console.log("[pipeline] 1/7 fetchRss...");
  results.fetch = await runFetchRssJob();

  console.log("[pipeline] 2/7 dedupe...");
  results.dedupe = await runDedupeJob();

  console.log("[pipeline] 3/7 cluster...");
  results.cluster = await runClusterJob();

  console.log("[pipeline] 4/7 classify (mark NEW -> CLASSIFIED)...");
  results.classify = { markedClassified: await markClassified() };

  console.log("[pipeline] 5/7 score...");
  results.score = await runScoreJob();

  console.log("[pipeline] 6/7 select...");
  results.select = await runSelectJob(todayDateOnly());

  console.log("[pipeline] 7/8 summarize...");
  results.summarize = await runSummarizeJob();

  // mark brief เป็น COMPLETED เพื่อเป็นสัญญาณให้ notify job รู้ว่าพร้อมส่งแล้ว
  const briefDate = todayDateOnly();
  await prisma.dailyBrief.updateMany({
    where: { briefDate, status: "GENERATING" },
    data: { status: "COMPLETED", generatedAt: new Date() },
  });

  console.log("[pipeline] 8/8 notify (LINE)...");
  results.notify = await runNotifyJob();

  console.log("[pipeline] done.", JSON.stringify(results, null, 2));
  return results;
}

// รันตรงได้ผ่าน: npx ts-node src/jobs/runDailyPipeline.ts
// หรือ script "pipeline:run" ใน package.json (ดู README)
if (require.main === module) {
  runDailyPipeline()
    .catch((err) => {
      console.error("[pipeline] FAILED:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
