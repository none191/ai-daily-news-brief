// ============================================================
// apps/worker/src/jobs/score.ts
// Step: ให้คะแนนความสำคัญ (ตามกฎในเอกสารต้นฉบับ ใช้ตรงตามนี้)
//
//   ข่าวใหม่ภายใน 24 ชม.            +2   (recencyScore)
//   มี keyword สำคัญ                 +3   (keywordScore)
//   มาจากแหล่งข่าวหลัก               +2   (sourceScore)
//   มีหลายแหล่งพูดถึงเรื่องเดียวกัน    +3   (crossSourceScore)
//   เกี่ยวกับหมวดที่สนใจ              +2   (categoryScore)
//
// รันหลัง dedupe + cluster + classify เสมอ
// ============================================================

import { PrismaClient, ArticleStatus } from "@prisma/client";

const prisma = new PrismaClient();

// ข่าวจากแหล่งที่ reliabilityScore >= ค่านี้ ถือว่าเป็น "แหล่งข่าวหลัก"
const MAIN_SOURCE_RELIABILITY_THRESHOLD = 2;

export async function runScoreJob() {
  const startedAt = new Date();
  const log = await prisma.pipelineLog.create({
    data: { step: "SCORE", status: "RUNNING", startedAt },
  });

  let processed = 0;

  try {
    // เอาข่าวที่ไม่ซ้ำ และจัดหมวดแล้ว (status = CLASSIFIED) มาให้คะแนน
    const articles = await prisma.newsArticle.findMany({
      where: { isDuplicate: false, status: ArticleStatus.CLASSIFIED },
      include: {
        source: true,
        category: { include: { keywords: { where: { isActive: true } } } },
        cluster: { include: { articles: { select: { id: true, sourceId: true } } } },
      },
    });

    // keyword ทั้งหมดที่ active (ไม่ผูกหมวด = ใช้ได้กับทุกข่าว)
    const globalKeywords = await prisma.keyword.findMany({
      where: { isActive: true, categoryId: null },
    });

    const now = Date.now();

    for (const article of articles) {
      processed++;

      // --- 1) recencyScore: ข่าวใหม่ภายใน 24 ชม. +2 ---
      const ageHours = (now - article.publishedAt.getTime()) / (1000 * 60 * 60);
      const recencyScore = ageHours <= 24 ? 2 : 0;

      // --- 2) keywordScore: มี keyword สำคัญ +3 ---
      const relevantKeywords = [...globalKeywords, ...(article.category?.keywords ?? [])];
      const haystack = `${article.title} ${article.rawContent ?? ""}`.toLowerCase();
      const hasKeyword = relevantKeywords.some((k) => haystack.includes(k.term.toLowerCase()));
      const keywordScore = hasKeyword ? 3 : 0;

      // --- 3) sourceScore: มาจากแหล่งข่าวหลัก +2 ---
      const sourceScore =
        article.source.reliabilityScore >= MAIN_SOURCE_RELIABILITY_THRESHOLD ? 2 : 0;

      // --- 4) crossSourceScore: หลายแหล่งพูดถึงเรื่องเดียวกัน +3 ---
      let crossSourceScore = 0;
      if (article.cluster) {
        const distinctSources = new Set(article.cluster.articles.map((a) => a.sourceId));
        if (distinctSources.size >= 2) crossSourceScore = 3;
      }

      // --- 5) categoryScore: เกี่ยวกับหมวดที่สนใจ +2 ---
      // หมวดที่ isActive = true ถือว่าเป็น "หมวดที่เราสนใจ" ตามที่ตั้งค่าไว้ใน
      // หน้า "จัดการแหล่งข่าว" (เปิด/ปิดหมวด) — ปรับ logic ตรงนี้ได้ถ้าพี่อยากแยก
      // "หมวดที่ติดตาม" ออกจาก "หมวดที่เปิดใช้งาน" ในอนาคต
      const categoryScore = article.category?.isActive ? 2 : 0;

      const totalScore =
        recencyScore + keywordScore + sourceScore + crossSourceScore + categoryScore;

      await prisma.articleScore.upsert({
        where: { articleId: article.id },
        create: {
          articleId: article.id,
          recencyScore,
          keywordScore,
          sourceScore,
          crossSourceScore,
          categoryScore,
          totalScore,
        },
        update: {
          recencyScore,
          keywordScore,
          sourceScore,
          crossSourceScore,
          categoryScore,
          totalScore,
          scoredAt: new Date(),
        },
      });

      await prisma.newsArticle.update({
        where: { id: article.id },
        data: { status: ArticleStatus.SCORED },
      });
    }

    await prisma.pipelineLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", itemsProcessed: processed, finishedAt: new Date() },
    });

    return { processed };
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
