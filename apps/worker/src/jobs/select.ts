// ============================================================
// apps/worker/src/jobs/select.ts
// Step: เลือกข่าวเด่น (ตามเอกสารต้นฉบับ)
//   - ข่าวเด่นรวม 5 เรื่อง
//   - ข่าวเด่นแต่ละหมวด 3 เรื่อง
//   - ข่าวที่ควรติดตามต่อ 3 เรื่อง (totalScore สูงสุดถัดจาก top overall)
//
// รันหลัง score job เสมอ ใช้ totalScore จาก ArticleScore เป็นตัวจัดอันดับ
// ============================================================

import { PrismaClient, ArticleStatus, BriefSection } from "@prisma/client";

const prisma = new PrismaClient();

const TOP_OVERALL_COUNT = 5;
const TOP_PER_CATEGORY_COUNT = 3;
const FOLLOW_UP_COUNT = 3;

export async function runSelectJob(briefDate: Date) {
  const startedAt = new Date();
  const log = await prisma.pipelineLog.create({
    data: { step: "SELECT", status: "RUNNING", startedAt },
  });

  try {
    // ข่าวที่ผ่านการให้คะแนนแล้ว เรียงคะแนนมาก -> น้อย
    const scoredArticles = await prisma.newsArticle.findMany({
      where: { isDuplicate: false, status: ArticleStatus.SCORED },
      include: { score: true, category: true },
      orderBy: { score: { totalScore: "desc" } },
    });

    // สร้าง/หา DailyBrief ของวันนี้
    const brief = await prisma.dailyBrief.upsert({
      where: { briefDate },
      create: { briefDate, status: "GENERATING" },
      update: { status: "GENERATING" },
    });

    // เคลียร์ item เดิมของ brief นี้ก่อน (กันรันซ้ำแล้วได้ duplicate item)
    await prisma.dailyBriefItem.deleteMany({ where: { briefId: brief.id } });

    const usedArticleIds = new Set<string>();

    // --- 1) ข่าวเด่นรวม 5 เรื่อง (คะแนนสูงสุดทั้งหมด) ---
    const topOverall = scoredArticles.slice(0, TOP_OVERALL_COUNT);
    for (const [index, article] of topOverall.entries()) {
      await prisma.dailyBriefItem.create({
        data: {
          briefId: brief.id,
          articleId: article.id,
          section: BriefSection.TOP_OVERALL,
          rank: index + 1,
        },
      });
      usedArticleIds.add(article.id);
    }

    // --- 2) ข่าวเด่นแยกหมวด 3 เรื่อง/หมวด ---
    // อนุญาตให้ข่าวที่ติด top overall แล้วติดซ้ำในหมวดได้ด้วย เพราะเป็นคนละ section
    // ของ brief (ผู้อ่านดู section หมวดแยกต่างหากจาก section ภาพรวม)
    const byCategory = new Map<string, typeof scoredArticles>();
    for (const article of scoredArticles) {
      if (!article.categoryId) continue;
      const list = byCategory.get(article.categoryId) ?? [];
      list.push(article);
      byCategory.set(article.categoryId, list);
    }

    for (const [categoryId, articles] of byCategory) {
      const top = articles.slice(0, TOP_PER_CATEGORY_COUNT);
      for (const [index, article] of top.entries()) {
        await prisma.dailyBriefItem.create({
          data: {
            briefId: brief.id,
            articleId: article.id,
            section: BriefSection.TOP_CATEGORY,
            categoryId,
            rank: index + 1,
          },
        });
      }
    }

    // --- 3) ข่าวที่ควรติดตามต่อ 3 เรื่อง ---
    // เอาข่าวคะแนนสูงสุดถัดจาก top overall (ที่ยังไม่ถูกใช้ใน section TOP_OVERALL)
    const followUpPool = scoredArticles.filter((a) => !usedArticleIds.has(a.id));
    const followUp = followUpPool.slice(0, FOLLOW_UP_COUNT);
    for (const [index, article] of followUp.entries()) {
      await prisma.dailyBriefItem.create({
        data: {
          briefId: brief.id,
          articleId: article.id,
          section: BriefSection.FOLLOW_UP,
          rank: index + 1,
        },
      });
    }

    // mark ข่าวที่ถูกเลือกเป็น SELECTED (ส่งต่อให้ AI summarizer step ถัดไป)
    const selectedIds = [
      ...topOverall.map((a) => a.id),
      ...[...byCategory.values()].flatMap((list) => list.slice(0, TOP_PER_CATEGORY_COUNT).map((a) => a.id)),
      ...followUp.map((a) => a.id),
    ];
    await prisma.newsArticle.updateMany({
      where: { id: { in: [...new Set(selectedIds)] } },
      data: { status: ArticleStatus.SELECTED },
    });

    await prisma.pipelineLog.update({
      where: { id: log.id },
      data: {
        status: "SUCCESS",
        itemsProcessed: selectedIds.length,
        finishedAt: new Date(),
      },
    });

    return { briefId: brief.id, selectedCount: new Set(selectedIds).size };
  } catch (err: any) {
    await prisma.pipelineLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorMessage: err?.message ?? String(err), finishedAt: new Date() },
    });
    throw err;
  }
}
