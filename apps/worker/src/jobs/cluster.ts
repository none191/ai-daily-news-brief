// ============================================================
// apps/worker/src/jobs/cluster.ts
// จัดกลุ่มข่าว "เรื่องเดียวกัน จากหลายสำนักข่าว" (ArticleCluster)
// ใช้สำหรับ crossSourceScore ตอน scoring (+3 ถ้ามีหลายแหล่งพูดถึง)
//
// ต่างจาก dedupe: นี่คือข่าวคนละชิ้นจริง (คนละ source, คนละสำนวน)
// แค่รายงานเหตุการณ์เดียวกัน — ไม่ mark เป็น duplicate
//
// รันหลัง dedupe เสมอ (เทียบเฉพาะข่าวที่ isDuplicate = false)
// ============================================================

import { PrismaClient, ArticleStatus } from "@prisma/client";
import { jaccardSimilarity, SIMILARITY_THRESHOLDS } from "../lib/titleSimilarity";

const prisma = new PrismaClient();

const LOOKBACK_HOURS = 48;

export async function runClusterJob() {
  const startedAt = new Date();
  const log = await prisma.pipelineLog.create({
    data: { step: "CLASSIFY", status: "RUNNING", startedAt }, // ใช้ step CLASSIFY ร่วม เพราะอยู่ในช่วงเดียวกันของ pipeline
  });

  let processed = 0;
  let clustered = 0;

  try {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

    // เอาเฉพาะข่าวที่ไม่ซ้ำ และยังไม่ได้อยู่ใน cluster ไหน
    const articles = await prisma.newsArticle.findMany({
      where: {
        isDuplicate: false,
        clusterId: null,
        publishedAt: { gte: since },
        status: { in: [ArticleStatus.NEW, ArticleStatus.CLASSIFIED] },
      },
      orderBy: { publishedAt: "asc" },
    });

    for (const article of articles) {
      processed++;

      // หา cluster ที่มีอยู่แล้วซึ่งหัวข้อใกล้เคียงกับข่าวนี้ (จากสำนักข่าวอื่น)
      const existingClusters = await prisma.articleCluster.findMany({
        where: {
          articles: {
            some: {
              publishedAt: {
                gte: new Date(article.publishedAt.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000),
              },
            },
          },
        },
        include: { articles: { select: { id: true, title: true, sourceId: true } } },
      });

      let matchedClusterId: string | null = null;

      for (const cluster of existingClusters) {
        // ต้องมาจากสำนักข่าวอื่น (ไม่งั้นไม่นับว่าเป็น cross-source)
        const hasOtherSource = cluster.articles.some((a) => a.sourceId !== article.sourceId);
        if (!hasOtherSource) continue;

        const avgSim =
          cluster.articles.reduce((sum, a) => sum + jaccardSimilarity(article.title, a.title), 0) /
          cluster.articles.length;

        if (avgSim >= SIMILARITY_THRESHOLDS.SAME_STORY_CLUSTER) {
          matchedClusterId = cluster.id;
          break;
        }
      }

      if (matchedClusterId) {
        await prisma.newsArticle.update({
          where: { id: article.id },
          data: { clusterId: matchedClusterId },
        });
        clustered++;
        continue;
      }

      // ไม่เจอ cluster เดิม -> ลองหา "ข่าวเดี่ยว" อื่นที่ยังไม่มี cluster มาจับคู่สร้าง cluster ใหม่
      const lonelyCandidates = await prisma.newsArticle.findMany({
        where: {
          id: { not: article.id },
          isDuplicate: false,
          clusterId: null,
          sourceId: { not: article.sourceId }, // ต้องคนละแหล่งข่าว
          publishedAt: {
            gte: new Date(article.publishedAt.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000),
            lte: new Date(article.publishedAt.getTime() + LOOKBACK_HOURS * 60 * 60 * 1000),
          },
        },
        select: { id: true, title: true },
      });

      const partner = lonelyCandidates.find(
        (c) => jaccardSimilarity(article.title, c.title) >= SIMILARITY_THRESHOLDS.SAME_STORY_CLUSTER
      );

      if (partner) {
        const newCluster = await prisma.articleCluster.create({
          data: { topic: article.title }, // ใช้ title ข่าวแรกเป็นชื่อ cluster ชั่วคราว (AI summarizer ปรับทีหลังได้)
        });
        await prisma.newsArticle.updateMany({
          where: { id: { in: [article.id, partner.id] } },
          data: { clusterId: newCluster.id },
        });
        clustered += 2;
      }
      // ถ้าไม่เจอใครเลย -> ปล่อยเป็นข่าวเดี่ยว ไม่ได้ crossSourceScore ก็ไม่เป็นไร
    }

    await prisma.pipelineLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", itemsProcessed: processed, finishedAt: new Date() },
    });

    return { processed, clustered };
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
