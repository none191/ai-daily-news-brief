// ============================================================
// apps/web/src/app/api/sources/[id]/test-fetch/route.ts
// POST /api/sources/[id]/test-fetch
//
// ปุ่ม "Test Fetch" ของแต่ละแหล่งข่าว — enqueue job "fetch-source"
// เข้า queue daily-pipeline เดียวกับ pipeline หลัก พร้อม payload { sourceId }
// ไม่ดึง RSS ตรงในเว็บ container เด็ดขาด (news-worker เป็นคนทำงานจริง)
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPipelineQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const source = await prisma.newsSource.findUnique({ where: { id: params.id } });
    if (!source) {
      return NextResponse.json({ status: "error", message: "ไม่พบแหล่งข่าวนี้" }, { status: 404 });
    }

    const queue = getPipelineQueue();
    const job = await queue.add(
      "fetch-source",
      { sourceId: source.id, triggeredBy: "sources-page-test-fetch" },
      { removeOnComplete: 20, removeOnFail: 50 }
    );

    return NextResponse.json({
      status: "queued",
      jobId: job.id,
      message: `เริ่มทดสอบดึงข่าวจาก "${source.name}" แล้ว`,
    });
  } catch (err: any) {
    console.error("[api/sources/:id/test-fetch] POST failed:", err);
    return NextResponse.json(
      { status: "error", message: err?.message ?? "เริ่ม test fetch ไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
