// ============================================================
// apps/worker/src/jobs/fetchRss.ts
// Step 1 ของ pipeline: ดึงข่าวจาก active NewsSource ทุกตัว
//
// - source ไหน fetch พลาด -> log แล้วข้าม ไม่ทำ pipeline ทั้งก้อนล้ม
// - skip ข่าวที่ link ซ้ำกับที่มีอยู่แล้วในระบบ (unique constraint บน NewsArticle.link
//   เป็นตัวกันชั้นสุดท้ายอยู่แล้ว แต่เช็คก่อน insert เพื่อไม่ต้องชน error จาก prisma)
// - ผูก category จาก source.defaultCategoryId ทันที (ไม่มี classify step แยก
//   เพราะ category ของข่าวอ้างอิงจากแหล่งข่าวเป็นหลักตามที่ออกแบบไว้)
// - imageUrl จาก RSS (enclosure/media:content) ถูก persist ลง NewsArticle.imageUrl
//   ด้วยแล้ว (เพิ่ม column นี้ผ่าน migration add_image_url_to_news_article)
// ============================================================

import { PrismaClient, ArticleStatus } from "@prisma/client";
import { fetchAndParseFeed } from "../lib/rss";

const prisma = new PrismaClient();

export async function runFetchRssJob(options?: { sourceId?: string }) {
  const startedAt = new Date();
  const log = await prisma.pipelineLog.create({
    data: { step: "FETCH", status: "RUNNING", startedAt },
  });

  let totalFetched = 0;
  let totalSaved = 0;
  let totalSkipped = 0;
  let sourcesFailed = 0;

  const sources = await prisma.newsSource.findMany({
    where: options?.sourceId
      ? { id: options.sourceId } // test-fetch เฉพาะ source เดียว ไม่เช็ค isActive
      : { isActive: true },
  });

  for (const source of sources) {
    const sourceLog = await prisma.pipelineLog.create({
      data: { step: "FETCH", status: "RUNNING", sourceId: source.id, startedAt: new Date() },
    });

    try {
      const items = await fetchAndParseFeed(source.rssUrl);
      totalFetched += items.length;

      let savedForSource = 0;

      for (const item of items) {
        if (!item.title || !item.link) continue;

        // skip ถ้า link นี้มีอยู่แล้วในระบบ (ไม่ว่าจะ source ไหนก็ตาม เพราะ link unique global)
        const existing = await prisma.newsArticle.findUnique({
          where: { link: item.link },
          select: { id: true },
        });

        if (existing) {
          totalSkipped++;
          continue;
        }

        await prisma.newsArticle.create({
          data: {
            sourceId: source.id,
            title: item.title,
            link: item.link,
            imageUrl: item.imageUrl ?? undefined,
            rawContent: item.content,
            contentHash: item.contentHash,
            publishedAt: item.publishedAt,
            categoryId: source.defaultCategoryId ?? undefined,
            status: ArticleStatus.NEW,
          },
        });

        savedForSource++;
        totalSaved++;
      }

      await prisma.newsSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: new Date(), lastFetchStatus: "success" },
      });

      await prisma.pipelineLog.update({
        where: { id: sourceLog.id },
        data: { status: "SUCCESS", itemsProcessed: savedForSource, finishedAt: new Date() },
      });
    } catch (err: any) {
      sourcesFailed++;
      const message = err?.message ?? String(err);

      await prisma.newsSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: new Date(), lastFetchStatus: `error: ${message}`.slice(0, 500) },
      });

      await prisma.pipelineLog.update({
        where: { id: sourceLog.id },
        data: { status: "FAILED", errorMessage: message, finishedAt: new Date() },
      });

      console.error(`[fetchRss] source "${source.name}" (${source.rssUrl}) failed: ${message}`);
      // ไม่ throw — ไปดึง source ถัดไปต่อ
    }
  }

  await prisma.pipelineLog.update({
    where: { id: log.id },
    data: {
      status: sourcesFailed === sources.length && sources.length > 0 ? "FAILED" : "SUCCESS",
      itemsProcessed: totalSaved,
      errorMessage: sourcesFailed > 0 ? `${sourcesFailed}/${sources.length} source(s) failed` : null,
      finishedAt: new Date(),
    },
  });

  return { totalFetched, totalSaved, totalSkipped, sourcesFailed, sourcesTried: sources.length };
}
