// ============================================================
// apps/worker/src/jobs/dedupe.ts
// Step 2 ของ pipeline: ลบ/มาร์คข่าวซ้ำ
//
// กติกา: duplicate ต้องมาจาก "แหล่งข่าวเดียวกัน" เท่านั้น
//   1. contentHash ตรงกันเป๊ะ -> ซ้ำแน่นอน (เร็วที่สุด, เช็คก่อน)
//   2. source เดียวกัน + title similarity (Jaccard) >= 0.85
//      เทียบเฉพาะข่าวที่ publishedAt ห่างกันไม่เกิน 48 ชม.
//
// ข่าวคนละแหล่งที่หัวข้อคล้ายกัน ไม่ถือเป็น duplicate ที่นี่
// แต่จะถูกจัดการต่อใน cluster.ts (same-story cross-source)
// ============================================================

import { PrismaClient, ArticleStatus } from "@prisma/client";
import { jaccardSimilarity, SIMILARITY_THRESHOLDS } from "../lib/titleSimilarity";

const prisma = new PrismaClient();

const LOOKBACK_HOURS = 48;

export async function runDedupeJob() {
  const startedAt = new Date();
  const log = await prisma.pipelineLog.create({
    data: { step: "DEDUPE", status: "RUNNING", startedAt },
  });

  let processed = 0;
  let markedDuplicate = 0;

  try {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

    // ดึงข่าวที่ยังไม่ผ่านการตรวจซ้ำ (status = NEW) เรียงเก่า->ใหม่
    const newArticles = await prisma.newsArticle.findMany({
      where: { status: ArticleStatus.NEW, publishedAt: { gte: since } },
      orderBy: { publishedAt: "asc" },
    });

    for (const article of newArticles) {
      processed++;

      // เทียบกับ "ข่าวที่ผ่านการตรวจซ้ำไปแล้ว" เท่านั้น (ไม่ใช่ตัวเองกับตัวเอง)
      // จำกัดเฉพาะ "แหล่งข่าวเดียวกัน" เท่านั้น — ข่าวต่างแหล่งที่หัวข้อคล้ายกัน
      // ไม่ใช่ duplicate แต่เป็น "เรื่องเดียวกันจากหลายสำนัก" ซึ่งจัดการโดย cluster.ts
      const candidates = await prisma.newsArticle.findMany({
        where: {
          id: { not: article.id },
          sourceId: article.sourceId,
          isDuplicate: false,
          publishedAt: {
            gte: new Date(article.publishedAt.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000),
            lte: new Date(article.publishedAt.getTime() + LOOKBACK_HOURS * 60 * 60 * 1000),
          },
        },
        select: { id: true, title: true, contentHash: true },
      });

      // 1) exact contentHash match (เช่น url ต่างกันแต่เนื้อหา/หัวข้อเดียวกันเป๊ะ)
      let duplicateOf = candidates.find((c) => c.contentHash === article.contentHash);

      // 2) title similarity ถ้ายังไม่เจอ exact match (กรณีสำนักข่าวแก้หัวข้อนิดหน่อยแล้วโพสต์ซ้ำ)
      if (!duplicateOf) {
        for (const c of candidates) {
          const sim = jaccardSimilarity(article.title, c.title);
          if (sim >= SIMILARITY_THRESHOLDS.DUPLICATE) {
            duplicateOf = c;
            break;
          }
        }
      }

      if (duplicateOf) {
        await prisma.newsArticle.update({
          where: { id: article.id },
          data: {
            isDuplicate: true,
            duplicateOfId: duplicateOf.id,
            status: ArticleStatus.DUPLICATE,
          },
        });
        markedDuplicate++;
      } else {
        // ไม่ซ้ำ -> ผ่านสู่ step ถัดไป (classify)
        await prisma.newsArticle.update({
          where: { id: article.id },
          data: { status: ArticleStatus.NEW }, // คงสถานะไว้ ให้ classify job หยิบไปต่อ
        });
      }
    }

    await prisma.pipelineLog.update({
      where: { id: log.id },
      data: {
        status: "SUCCESS",
        itemsProcessed: processed,
        finishedAt: new Date(),
      },
    });

    return { processed, markedDuplicate };
  } catch (err: any) {
    await prisma.pipelineLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        itemsProcessed: processed,
        errorMessage: err?.message ?? String(err),
        finishedAt: new Date(),
      },
    });
    throw err;
  }
}
