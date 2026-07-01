// ============================================================
// apps/worker/src/jobs/summarize.ts
// Step: AI Summarizer
// สรุปเฉพาะข่าวที่ status = SELECTED (ผ่าน top-news selector มาแล้ว)
// ไม่สรุปข่าวทั้งหมดที่ดึงมา เพื่อประหยัด token/ค่าใช้จ่าย AI API
// ============================================================

import { PrismaClient, ArticleStatus } from "@prisma/client";
import { summarizeWithAI } from "../lib/aiProvider";

const prisma = new PrismaClient();

// หน่วงเวลาระหว่างเรียก AI แต่ละครั้ง กัน rate limit (โดยเฉพาะ Gemini free tier)
const DELAY_BETWEEN_CALLS_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSummarizeJob() {
  const startedAt = new Date();
  const log = await prisma.pipelineLog.create({
    data: { step: "SUMMARIZE", status: "RUNNING", startedAt },
  });

  let processed = 0;
  let failed = 0;

  try {
    const articles = await prisma.newsArticle.findMany({
      where: { status: ArticleStatus.SELECTED },
      include: { category: true, summary: true },
    });

    for (const article of articles) {
      // ข้ามถ้ามี summary อยู่แล้ว (กันรันซ้ำเปลือง token เวลา job ล้มแล้วรันใหม่)
      if (article.summary) {
        await prisma.newsArticle.update({
          where: { id: article.id },
          data: { status: ArticleStatus.SUMMARIZED },
        });
        continue;
      }

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
      } catch (err: any) {
        // ข่าวชิ้นนี้สรุปไม่สำเร็จ -> log แล้วไปต่อข่าวถัดไป ไม่ให้ job ทั้งก้อนล้ม
        failed++;
        console.error(`[summarize] article ${article.id} failed: ${err?.message ?? err}`);
      }

      await sleep(DELAY_BETWEEN_CALLS_MS);
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

    return { processed, failed };
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
