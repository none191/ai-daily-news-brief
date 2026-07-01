// ============================================================
// apps/web/src/app/api/pipeline/run/route.ts
// API สำหรับปุ่ม "รันสรุปข่าวใหม่" บน Dashboard
//
// POST /api/pipeline/run   -> enqueue job "run-full-pipeline"
// GET  /api/pipeline/run   -> เช็คสถานะ job ล่าสุดที่ enqueue ไว้ (ไว้โชว์ spinner/disable ปุ่ม)
// ============================================================

import { NextResponse } from "next/server";
import { getPipelineQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

const JOB_NAME = "run-full-pipeline" as const;

export async function POST() {
  try {
    const queue = getPipelineQueue();

    // กันคนกดปุ่มรัวๆ — ถ้ามี job ของ pipeline เดียวกันที่ยัง waiting/active อยู่
    // ไม่ enqueue ซ้ำ ให้คืน job เดิมไปเลย
    const [waiting, active] = await Promise.all([
      queue.getJobs(["waiting", "delayed"]),
      queue.getJobs(["active"]),
    ]);
    const pending = [...waiting, ...active].find((j) => j.name === JOB_NAME);

    if (pending) {
      return NextResponse.json(
        {
          status: "already_running",
          jobId: pending.id,
          message: "Pipeline กำลังรันอยู่แล้ว รอให้รอบนี้เสร็จก่อนครับ",
        },
        { status: 409 }
      );
    }

    const job = await queue.add(
      JOB_NAME,
      { triggeredBy: "dashboard-manual", triggeredAt: new Date().toISOString() },
      { removeOnComplete: 20, removeOnFail: 50 }
    );

    return NextResponse.json({
      status: "queued",
      jobId: job.id,
      message: "เริ่มรันสรุปข่าวใหม่แล้ว ใช้เวลาประมาณ 1-2 นาที",
    });
  } catch (err: any) {
    console.error("[api/pipeline/run] POST failed:", err);
    return NextResponse.json(
      { status: "error", message: err?.message ?? "เกิดข้อผิดพลาดในการเริ่มรัน pipeline" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const queue = getPipelineQueue();

    const [active, waiting, completed, failed] = await Promise.all([
      queue.getJobs(["active"]),
      queue.getJobs(["waiting", "delayed"]),
      queue.getJobs(["completed"], 0, 0), // เอาแค่ตัวล่าสุด
      queue.getJobs(["failed"], 0, 0),
    ]);

    const runningJob = [...active, ...waiting].find((j) => j.name === JOB_NAME);

    if (runningJob) {
      return NextResponse.json({
        status: active.some((j) => j.id === runningJob.id) ? "running" : "queued",
        jobId: runningJob.id,
      });
    }

    const latestCompleted = completed.find((j) => j.name === JOB_NAME);
    const latestFailed = failed.find((j) => j.name === JOB_NAME);

    // เทียบเวลาว่าตัวไหนล่าสุด ระหว่าง completed กับ failed
    if (latestFailed && (!latestCompleted || latestFailed.timestamp > latestCompleted.timestamp)) {
      return NextResponse.json({
        status: "failed",
        jobId: latestFailed.id,
        failedReason: latestFailed.failedReason,
        finishedAt: latestFailed.finishedOn,
      });
    }

    if (latestCompleted) {
      return NextResponse.json({
        status: "completed",
        jobId: latestCompleted.id,
        result: latestCompleted.returnvalue,
        finishedAt: latestCompleted.finishedOn,
      });
    }

    return NextResponse.json({ status: "idle" });
  } catch (err: any) {
    console.error("[api/pipeline/run] GET failed:", err);
    return NextResponse.json(
      { status: "error", message: err?.message ?? "เช็คสถานะ pipeline ไม่ได้" },
      { status: 500 }
    );
  }
}
