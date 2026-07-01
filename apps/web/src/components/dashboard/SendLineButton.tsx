"use client";

// ============================================================
// apps/web/src/components/dashboard/SendLineButton.tsx
// ปุ่ม "ส่ง LINE" บน Dashboard
// - กด -> POST /api/notify (enqueue "notify-only" job)
// - แสดงสถานะการส่งล่าสุดจาก GET /api/notify
// ============================================================

import { useEffect, useState } from "react";

type NotifyStatus = "idle" | "not_sent" | "pending" | "sent" | "failed" | "queued" | "error" | "no_brief";

export function SendLineButton() {
  const [notifyStatus, setNotifyStatus] = useState<NotifyStatus>("idle");
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // โหลดสถานะล่าสุดตอน mount
  useEffect(() => {
    fetch("/api/notify")
      .then((r) => r.json())
      .then((data) => {
        setNotifyStatus(data.status as NotifyStatus);
        setSentAt(data.sentAt ?? null);
        setErrorMessage(data.errorMessage ?? null);
      })
      .catch(() => {});
  }, []);

  async function handleSend() {
    setSending(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/notify", { method: "POST" });
      const data = await res.json();

      if (!res.ok && res.status !== 409) {
        setFeedback(data.message ?? "ส่ง LINE ไม่สำเร็จ");
        return;
      }

      setNotifyStatus("queued");
      setFeedback(data.message ?? "กำลังส่ง...");

      // poll จนกว่าจะ sent/failed
      const poll = setInterval(async () => {
        const r = await fetch("/api/notify");
        const d = await r.json();
        if (d.status === "sent") {
          setNotifyStatus("sent");
          setSentAt(d.sentAt);
          setFeedback("ส่ง LINE สำเร็จแล้ว ✓");
          clearInterval(poll);
        } else if (d.status === "failed") {
          setNotifyStatus("failed");
          setErrorMessage(d.errorMessage);
          setFeedback(null);
          clearInterval(poll);
        }
      }, 4000);
    } finally {
      setSending(false);
    }
  }

  const isBusy = sending || notifyStatus === "queued";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSend}
        disabled={isBusy || notifyStatus === "no_brief"}
        title={notifyStatus === "no_brief" ? "ยังไม่มีสรุปข่าววันนี้" : undefined}
        className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
        )}
        ส่ง LINE
      </button>

      {/* สถานะ */}
      {notifyStatus === "sent" && sentAt && (
        <p className="text-right text-xs text-emerald-400">
          ส่งแล้ว {new Date(sentAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      {notifyStatus === "failed" && (
        <p className="max-w-xs text-right text-xs text-red-400" title={errorMessage ?? ""}>
          ส่งไม่สำเร็จ — ดู Logs
        </p>
      )}
      {feedback && <p className="text-right text-xs text-slate-400">{feedback}</p>}
    </div>
  );
}
