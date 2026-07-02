// ============================================================
// apps/worker/src/jobs/summarize.ts
// Step: AI Summarizer
//
// สรุปเฉพาะข่าวที่ status = SELECTED โดยเรียง priority:
//   1. TOP_OVERALL (ข่าวเด่นรวม — สำคัญที่สุด สรุปก่อน)
//   2. FOLLOW_UP   (ข่าวติดตามต่อ)
//   3. TOP_CATEGORY (ข่าวรายหมวด)
//
// Gemini free tier = 20 req/day, 5 req/min
//   SUMMARY_MAX_ITEMS  ควรตั้งไม่เกิน 10-15 (default 8)
//   SUMMARIZE_DELAY_MS ควรตั้ง >= 13000   (default 13000)
// ============================================================

import { PrismaClient, ArticleStatus, BriefSection } from "@prisma/client";
import { summarizeWithAI } from "../lib/aiProvider";

const prisma = new PrismaClient();

const DELAY_MS = parseInt(process.env.SUMMARIZE_DELAY_MS ?? "13000", 10);
const MAX_ITEMS = parseInt(process.env.SUMMARY_MAX_ITEMS ?? "8", 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSummarizeJob() {
  const startedAt = new Date();
  const log = await prisma.pipelineLog.create({
    data: { step: "SUMMARIZE", status: "RUNNING", startedAt },
  });

  let processed = 0;
  let failed = 0;

  try {
    // ดึงทุก SELECTED article พร้อม section ที่อยู่ใน DailyBriefItem
    const allSelected = await prisma.newsArticle.findMany({
      where: { status: ArticleStatus.SELECTED },
      include: {
        category: true,
        summary: true,
        briefItems: { select: { section: true } },
      },
    });

    // เรียง priority: TOP_OVERALL → FOLLOW_UP → TOP_CATEGORY
    const sectionOrder: Record<string, number> = {
      [BriefSection.TOP_OVERALL]: 0,
      [BriefSection.FOLLOW_UP]: 1,
      [BriefSection.TOP_CATEGORY]: 2,
    };

    const sorted = [...allSelected].sort((a, b) => {
      const aOrder = Math.min(...a.briefItems.map((i) => sectionOrder[i.section] ?? 9));
      const bOrder = Math.min(...b.briefItems.map((i) => sectionOrder[i.section] ?? 9));
      return aOrder - bOrder;
    });

    // จำกัดจำนวนตาม SUMMARY_MAX_ITEMS (นับเฉพาะที่ยังไม่มี summary)
    const toSummarize = sorted
      .filter((a) => !a.summary)
      .slice(0, MAX_ITEMS);

    const alreadyDone = sorted.filter((a) => a.summary);

    console.log(
      `[summarize] SELECTED ${allSelected.length} ข่าว | มี summary แล้ว ${alreadyDone.length} | จะสรุป ${toSummarize.length}/${MAX_ITEMS} (delay ${DELAY_MS}ms/ข่าว)`
    );

    // mark ข่าวที่มี summary อยู่แล้วเป็น SUMMARIZED ก่อนเลย
    for (const article of alreadyDone) {
      await prisma.newsArticle.update({
        where: { id: article.id },
        data: { status: ArticleStatus.SUMMARIZED },
      });
    }

    // สรุปข่าวที่เลือกมา
    for (const article of toSummarize) {
      try {
        const { result, model, tokensUsed } = await summarizeWithAI(
          article.title,
          article.rawContent ?? article.title,
          article.category?.name ?? null
        );

        await prisma.aISummary.create({
          data: {
            articleId: article.id,
            shortSummary: result.shortSummary,
            detailedSummary: result.detailedSummary,
            whyImportant: result.whyImportant,
            impact: result.impact,
            followUpNote: result.followUpNote,
            shouldFollowUp: result.shouldFollowUp,
            model,
            tokensUsed: tokensUsed ?? undefined,
          },
        });

        await prisma.newsArticle.update({
          where: { id: article.id },
          data: { status: ArticleStatus.SUMMARIZED },
        });

        processed++;
        console.log(
          `[summarize] ✓ ${processed}/${toSummarize.length} — "${article.title.slice(0, 50)}"`
        );
      } catch (err: any) {
        failed++;
        console.error(`[summarize] ✗ article ${article.id}: ${err?.message ?? err}`);
      }

      await sleep(DELAY_MS);
    }

    await prisma.pipelineLog.update({
      where: { id: log.id },
      data: {
        status: failed > 0 && processed === 0 ? "FAILED" : "SUCCESS",
        itemsProcessed: processed,
        errorMessage: failed > 0 ? `${failed} article(s) failed to summarize` : null,
        finishedAt: new Date(),
      },
    });

    return { processed, failed, skipped: allSelected.length - toSummarize.length - alreadyDone.length };
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
