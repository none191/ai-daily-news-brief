"use client";

// ============================================================
// apps/web/src/components/dashboard/RunPipelineButton.tsx
// ปุ่ม "Run Daily Pipeline"
// - กด -> POST /api/pipeline/run (enqueue เท่านั้น ไม่รันตรงในเว็บ)
// - หลังกด -> poll GET /api/pipeline/run ทุก 4 วิ
// - เสร็จ/ล้มเหลว -> เรียก onSettled() ให้หน้าหลัก refetch /api/dashboard/today
// ============================================================

import { useEffect, useRef, useState } from "react";

type PipelineStatus = "idle" | "queued" | "running" | "completed" | "failed" | "already_running" | "error";

const POLL_INTERVAL_MS = 4000;

export function RunPipelineButton({ onSettled }: { onSettled: () => void }) {
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/pipeline/run");
        const data = await res.json();

        if (data.status === "completed") {
          setStatus("completed");
          setMessage("รันสรุปข่าวเสร็จแล้ว กำลังโหลดข้อมูลใหม่...");
          stopPolling();
          onSettled();
          setTimeout(() => setStatus("idle"), 4000);
        } else if (data.status === "failed") {
          setStatus("failed");
          setMessage(data.failedReason ?? "pipeline ล้มเหลว ดู log ด้านล่างเพื่อหาสาเหตุ");
          stopPolling();
          onSettled();
        } else if (data.status === "running" || data.status === "queued") {
          setStatus(data.status);
        }
      } catch {
        // เน็ตเหวี่ยงชั่วคราว ปล่อยให้ poll รอบถัดไปลองใหม่ ไม่ต้อง stop
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleClick() {
    setStatus("queued");
    setMessage(null);

    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      const data = await res.json();

      if (res.status === 409) {
        setStatus("already_running");
        setMessage(data.message);
        startPolling();
        return;
      }

      if (!res.ok) {
        setStatus("error");
        setMessage(data.message ?? "เริ่ม pipeline ไม่สำเร็จ");
        return;
      }

      setMessage(data.message);
      startPolling();
    } catch (err: any) {
      setStatus("error");
      setMessage(err?.message ?? "เรียก API ไม่สำเร็จ");
    }
  }

  useEffect(() => () => stopPolling(), []);

  const isBusy = status === "queued" || status === "running" || status === "already_running";

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleClick}
        disabled={isBusy}
        className="flex items-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
        )}
        {isBusy ? statusLabel(status) : "Run Daily Pipeline"}
      </button>
      {message && (
        <p className={`max-w-xs text-right text-xs ${status === "failed" || status === "error" ? "text-red-400" : "text-slate-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

function statusLabel(status: PipelineStatus): string {
  switch (status) {
    case "queued":
      return "Queued...";
    case "running":
      return "Running...";
    case "already_running":
      return "Already running...";
    default:
      return "Run Daily Pipeline";
  }
}
