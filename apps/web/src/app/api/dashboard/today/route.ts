// ============================================================
// apps/web/src/app/api/dashboard/today/route.ts
// GET /api/dashboard/today
//
// ดึงข้อมูลจริงทั้งหมดที่หน้า Dashboard ต้องใช้ในการเรียกเดียว:
//   - DailyBrief ของวันนี้ (top overall / top per category / follow-up)
//   - PipelineLog ล่าสุด 10 รายการ (debug ว่าเช้านี้รันถึงไหน step ไหน fail)
//   - stats สรุปภาพรวมวันนี้
//
// ไม่มี mock data — ถ้ายังไม่มี DailyBrief ของวันนี้ (เช่น scheduler ยังไม่รัน
// หรือรันยังไม่เสร็จ) จะคืน empty state ที่อ่านง่าย ไม่ throw error
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BriefSection } from "@prisma/client";

export const dynamic = "force-dynamic";

// แปลง NewsArticle ที่ query มาให้เป็นรูปแบบที่ frontend ใช้ตรงๆ ได้เลย
function serializeArticle(article: any) {
  return {
    id: article.id,
    title: article.title,
    link: article.link,
    publishedAt: article.publishedAt,
    imageUrl: article.imageUrl ?? null,
    source: {
      id: article.source.id,
      name: article.source.name,
      reliabilityScore: article.source.reliabilityScore,
    },
    category: article.category
      ? { id: article.category.id, name: article.category.name, slug: article.category.slug }
      : null,
    score: article.score
      ? {
          total: article.score.totalScore,
          recency: article.score.recencyScore,
          keyword: article.score.keywordScore,
          source: article.score.sourceScore,
          crossSource: article.score.crossSourceScore,
          category: article.score.categoryScore,
        }
      : null,
    summary: article.summary
      ? {
          shortSummary: article.summary.shortSummary,
          detailedSummary: article.summary.detailedSummary,
          whyImportant: article.summary.whyImportant,
          impact: article.summary.impact,
          followUpNote: article.summary.followUpNote,
          shouldFollowUp: article.summary.shouldFollowUp,
          model: article.summary.model,
        }
      : null,
  };
}

function todayRangeUTC() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function GET() {
  try {
    const { start: todayStart, end: todayEnd } = todayRangeUTC();

    const brief = await prisma.dailyBrief.findUnique({
      where: { briefDate: todayStart },
      include: {
        items: {
          orderBy: { rank: "asc" },
          include: {
            article: {
              include: {
                source: true,
                category: true,
                score: true,
                summary: true,
              },
            },
            // categoryId บน DailyBriefItem ใช้สำหรับ group section TOP_CATEGORY
          },
        },
      },
    });

    // --- recent pipeline logs (ไม่ผูกกับว่ามี brief หรือไม่ ขอดูได้เสมอ) ---
    const recentLogs = await prisma.pipelineLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { source: { select: { name: true } } },
    });

    const serializedLogs = recentLogs.map((log) => ({
      id: log.id,
      step: log.step,
      status: log.status,
      sourceName: log.source?.name ?? null,
      itemsProcessed: log.itemsProcessed,
      errorMessage: log.errorMessage,
      startedAt: log.startedAt,
      finishedAt: log.finishedAt,
    }));

    // --- stats: จำนวนข่าวที่ดึงวันนี้ (ไม่ขึ้นกับว่ามี brief แล้วหรือยัง) ---
    const totalFetchedToday = await prisma.newsArticle.count({
      where: { fetchedAt: { gte: todayStart, lt: todayEnd } },
    });

    const totalSelectedStatusNow = await prisma.newsArticle.count({
      where: { status: "SELECTED" },
    });

    const totalWithSummaryToday = await prisma.aISummary.count({
      where: { article: { fetchedAt: { gte: todayStart, lt: todayEnd } } },
    });

    // ----- ถ้ายังไม่มี DailyBrief ของวันนี้ -> empty state อ่านง่าย -----
    if (!brief) {
      return NextResponse.json({
        hasBriefToday: false,
        message: "ยังไม่มีสรุปข่าววันนี้ — รอ scheduler รันตอน 06:00 หรือกดปุ่ม \"รันสรุปข่าวใหม่\"",
        brief: null,
        topOverall: [],
        topByCategory: [],
        followUp: [],
        stats: {
          totalFetchedToday,
          totalSelected: totalSelectedStatusNow,
          totalSummarized: totalWithSummaryToday,
          summaryFailedCount: 0,
        },
        recentLogs: serializedLogs,
      });
    }

    // ----- แยกข่าวตาม section -----
    const topOverallItems = brief.items.filter((i) => i.section === BriefSection.TOP_OVERALL);
    const followUpItems = brief.items.filter((i) => i.section === BriefSection.FOLLOW_UP);
    const categoryItems = brief.items.filter((i) => i.section === BriefSection.TOP_CATEGORY);

    // group ข่าวเด่นรายหมวด ตาม categoryId บน DailyBriefItem
    const byCategoryMap = new Map<
      string,
      { categoryId: string; categoryName: string; articles: ReturnType<typeof serializeArticle>[] }
    >();

    for (const item of categoryItems) {
      const catId = item.categoryId ?? item.article.categoryId ?? "uncategorized";
      const catName = item.article.category?.name ?? "ไม่ระบุหมวด";

      if (!byCategoryMap.has(catId)) {
        byCategoryMap.set(catId, { categoryId: catId, categoryName: catName, articles: [] });
      }
      byCategoryMap.get(catId)!.articles.push(serializeArticle(item.article));
    }

    const topOverall = topOverallItems.map((i) => serializeArticle(i.article));
    const followUp = followUpItems.map((i) => serializeArticle(i.article));
    const topByCategory = Array.from(byCategoryMap.values());

    // --- stats ที่ผูกกับ brief วันนี้โดยตรง ---
    const distinctSelectedArticleIds = new Set(brief.items.map((i) => i.articleId));
    const totalSelected = distinctSelectedArticleIds.size;

    const totalSummarized = brief.items.filter((i) => i.article.summary !== null).length;
    // นับแบบ distinct article ไม่ใช่ count item (ข่าวเดียวอาจอยู่ทั้ง top overall และ category)
    const distinctSummarizedIds = new Set(
      brief.items.filter((i) => i.article.summary !== null).map((i) => i.articleId)
    );

    const summaryFailedCount = Math.max(0, totalSelected - distinctSummarizedIds.size);

    return NextResponse.json({
      hasBriefToday: true,
      brief: {
        id: brief.id,
        briefDate: brief.briefDate,
        status: brief.status,
        generatedAt: brief.generatedAt,
      },
      topOverall,
      topByCategory,
      followUp,
      stats: {
        totalFetchedToday,
        totalSelected,
        totalSummarized: distinctSummarizedIds.size,
        summaryFailedCount,
      },
      recentLogs: serializedLogs,
    });
  } catch (err: any) {
    console.error("[api/dashboard/today] GET failed:", err);
    return NextResponse.json(
      { status: "error", message: err?.message ?? "ดึงข้อมูล Dashboard ไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
