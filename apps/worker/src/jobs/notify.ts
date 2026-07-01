// ============================================================
// apps/worker/src/jobs/notify.ts
// Step 8 ของ pipeline: ส่ง LINE Messaging API notification
//
// ดึง DailyBrief วันนี้จาก DB และส่งเฉพาะเมื่อ status = COMPLETED
// build payload แล้วส่งผ่าน lineMessaging.ts
// เขียน NotificationLog ทั้ง success และ failed
// ============================================================

import { PrismaClient, BriefSection, NotificationChannel, NotificationStatus } from "@prisma/client";
import { sendDailyBriefToLine, type DailyBriefPayload } from "../lib/lineMessaging";

const prisma = new PrismaClient();

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function todayRangeUTC() {
  const start = todayDateOnly();
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export async function runNotifyJob() {
  const startedAt = new Date();
  const log = await prisma.pipelineLog.create({
    data: { step: "NOTIFY", status: "RUNNING", startedAt },
  });

  try {
    const { start, end } = todayRangeUTC();

    // ดึง DailyBrief วันนี้พร้อมข้อมูลที่ต้องใช้สร้าง Flex Message
    const brief = await prisma.dailyBrief.findUnique({
      where: { briefDate: start },
      include: {
        items: {
          orderBy: { rank: "asc" },
          include: {
            article: {
              include: {
                source: true,
                summary: true,
                score: true,
              },
            },
          },
        },
      },
    });

    if (!brief) {
      await prisma.pipelineLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          errorMessage: "ไม่พบ DailyBrief ของวันนี้ — ต้องรัน pipeline ก่อน",
          finishedAt: new Date(),
        },
      });
      return { skipped: true, reason: "no brief today" };
    }

    if (brief.status !== "COMPLETED") {
      await prisma.pipelineLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          errorMessage: `DailyBrief status เป็น "${brief.status}" — ต้องรอให้ pipeline รันจนถึง status COMPLETED ก่อน`,
          finishedAt: new Date(),
        },
      });
      return { skipped: true, reason: `brief status: ${brief.status}` };
    }

    // ดึงสถิติข่าวที่ดึงมาวันนี้
    const totalFetched = await prisma.newsArticle.count({
      where: { fetchedAt: { gte: start, lt: end } },
    });
    const totalSummarized = await prisma.aISummary.count({
      where: { article: { fetchedAt: { gte: start, lt: end } } },
    });

    // แยก items ตาม section
    const topOverallItems = brief.items.filter((i) => i.section === BriefSection.TOP_OVERALL);
    const followUpItems = brief.items.filter((i) => i.section === BriefSection.FOLLOW_UP);

    const toArticleFlex = (item: (typeof brief.items)[0]) => ({
      title: item.article.title,
      link: item.article.link,
      sourceName: item.article.source.name,
      shortSummary: item.article.summary?.shortSummary ?? null,
      score: item.article.score?.totalScore ?? null,
    });

    const payload: DailyBriefPayload = {
      briefDate: brief.briefDate,
      totalFetched,
      totalSummarized,
      topOverall: topOverallItems.map(toArticleFlex),
      followUp: followUpItems.map(toArticleFlex),
    };

    // สร้าง NotificationLog ไว้ก่อนส่ง (เพื่อ track status)
    const notifLog = await prisma.notificationLog.create({
      data: {
        briefId: brief.id,
        channel: NotificationChannel.LINE,
        status: NotificationStatus.PENDING,
      },
    });

    try {
      await sendDailyBriefToLine(payload);

      await prisma.notificationLog.update({
        where: { id: notifLog.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });

      // อัปเดต brief status เป็น SENT
      await prisma.dailyBrief.update({
        where: { id: brief.id },
        data: { status: "SENT" },
      });

      await prisma.pipelineLog.update({
        where: { id: log.id },
        data: { status: "SUCCESS", itemsProcessed: 1, finishedAt: new Date() },
      });

      return { sent: true, channel: "LINE" };
    } catch (lineErr: any) {
      const errorMessage = lineErr?.message ?? String(lineErr);

      await prisma.notificationLog.update({
        where: { id: notifLog.id },
        data: { status: NotificationStatus.FAILED, errorMessage },
      });

      await prisma.pipelineLog.update({
        where: { id: log.id },
        data: { status: "FAILED", errorMessage, finishedAt: new Date() },
      });

      throw lineErr;
    }
  } catch (err: any) {
    // กันกรณี error ก่อนถึง LINE API call (เช่น DB ล้ม)
    const isAlreadyUpdated = !(err?.message?.includes("LINE API"));
    if (!isAlreadyUpdated) {
      await prisma.pipelineLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          errorMessage: err?.message ?? String(err),
          finishedAt: new Date(),
        },
      }).catch(() => {}); // ไม่ throw ซ้อน
    }
    throw err;
  }
}
