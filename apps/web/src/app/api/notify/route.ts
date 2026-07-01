// ============================================================
// apps/web/src/app/api/notify/route.ts
// POST /api/notify  -> enqueue "notify-only" job (ส่ง LINE จาก Dashboard)
// GET  /api/notify  -> สถานะการส่งล่าสุดจาก NotificationLog
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPipelineQueue } from "@/lib/queue";

export async function POST() {
  try {
    // เช็คว่ามี DailyBrief วันนี้พร้อมส่งหรือยัง
    const now = new Date();
    const briefDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const brief = await prisma.dailyBrief.findUnique({
      where: { briefDate },
      select: { id: true, status: true },
    });

    if (!brief) {
      return NextResponse.json(
        { status: "error", message: "ยังไม่มีสรุปข่าววันนี้ — กรุณารัน pipeline ก่อน" },
        { status: 400 }
      );
    }

    const queue = getPipelineQueue();

    // กันส่งซ้ำถ้ามี job อยู่แล้ว
    const [waiting, active] = await Promise.all([
      queue.getJobs(["waiting", "delayed"]),
      queue.getJobs(["active"]),
    ]);
    const pending = [...waiting, ...active].find((j) => j.name === "notify-only");
    if (pending) {
      return NextResponse.json(
        { status: "already_queued", jobId: pending.id, message: "กำลังส่ง LINE อยู่แล้ว" },
        { status: 409 }
      );
    }

    const job = await queue.add(
      "notify-only",
      { triggeredBy: "dashboard-manual", triggeredAt: new Date().toISOString() },
      { removeOnComplete: 20, removeOnFail: 50 }
    );

    return NextResponse.json({
      status: "queued",
      jobId: job.id,
      message: "กำลังส่งแจ้งเตือน LINE...",
    });
  } catch (err: any) {
    console.error("[api/notify] POST failed:", err);
    return NextResponse.json(
      { status: "error", message: err?.message ?? "ส่ง LINE notification ไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const now = new Date();
    const briefDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    const brief = await prisma.dailyBrief.findUnique({
      where: { briefDate },
      select: { id: true },
    });

    if (!brief) {
      return NextResponse.json({ status: "no_brief" });
    }

    const latest = await prisma.notificationLog.findFirst({
      where: { briefId: brief.id, channel: "LINE" },
      orderBy: { createdAt: "desc" },
    });

    if (!latest) {
      return NextResponse.json({ status: "not_sent" });
    }

    return NextResponse.json({
      status: latest.status.toLowerCase(),   // "sent" | "pending" | "failed"
      sentAt: latest.sentAt,
      errorMessage: latest.errorMessage,
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", message: err?.message ?? "เช็คสถานะ notification ไม่ได้" },
      { status: 500 }
    );
  }
}
