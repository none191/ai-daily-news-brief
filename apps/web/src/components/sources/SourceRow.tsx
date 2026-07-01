"use client";

// ============================================================
// apps/web/src/components/sources/SourceRow.tsx
// แถวเดียวของตารางแหล่งข่าว — toggle isActive + ปุ่ม Test Fetch
// ============================================================

import { useState } from "react";

type Source = {
  id: string;
  name: string;
  rssUrl: string;
  category: { id: string; name: string } | null;
  reliabilityScore: number;
  isActive: boolean;
  lastFetchedAt: string | null;
  lastFetchStatus: string | null;
};

export function SourceRow({ source, onChanged }: { source: Source; onChanged: () => void }) {
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const isError = source.lastFetchStatus?.startsWith("error");
  const errorMessage = isError ? source.lastFetchStatus?.replace(/^error:\s*/, "") : null;

  async function toggleActive() {
    setToggling(true);
    try {
      await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !source.isActive }),
      });
      onChanged();
    } finally {
      setToggling(false);
    }
  }

  async function testFetch() {
    setTesting(true);
    setTestMessage(null);
    try {
      const res = await fetch(`/api/sources/${source.id}/test-fetch`, { method: "POST" });
      const data = await res.json();
      setTestMessage(data.message ?? (res.ok ? "เริ่มทดสอบแล้ว" : "ทดสอบไม่สำเร็จ"));
    } catch (err: any) {
      setTestMessage(err?.message ?? "เรียก API ไม่สำเร็จ");
    } finally {
      setTesting(false);
      // เตือนสั้นๆ ว่า fetch รันที่ news-worker ไม่ใช่ผล real-time ในหน้านี้
      setTimeout(() => setTestMessage(null), 6000);
    }
  }

  return (
    <tr className="text-slate-300">
      <td className="px-3 py-3">
        <p className="font-medium text-slate-100">{source.name}</p>
        <a
          href={source.rssUrl}
          target="_blank"
          rel="noreferrer"
          className="block max-w-[280px] truncate text-xs text-slate-500 hover:text-cyan-400"
        >
          {source.rssUrl}
        </a>
      </td>
      <td className="px-3 py-3 text-xs text-slate-400">{source.category?.name ?? "ไม่ระบุ"}</td>
      <td className="px-3 py-3 text-center font-mono text-xs">{source.reliabilityScore}</td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {source.lastFetchedAt
          ? new Date(source.lastFetchedAt).toLocaleString("th-TH", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "ยังไม่เคยดึง"}
      </td>
      <td className="px-3 py-3">
        {isError ? (
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-400" title={errorMessage ?? ""}>
            error
          </span>
        ) : source.lastFetchStatus === "success" ? (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-400">success</span>
        ) : (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-500">-</span>
        )}
        {isError && errorMessage && (
          <p className="mt-1 max-w-[220px] truncate text-[11px] text-red-500" title={errorMessage}>
            {errorMessage}
          </p>
        )}
      </td>
      <td className="px-3 py-3">
        <button
          onClick={toggleActive}
          disabled={toggling}
          className={`rounded-full px-3 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
            source.isActive
              ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              : "bg-slate-800 text-slate-500 hover:bg-slate-700"
          }`}
        >
          {source.isActive ? "เปิดใช้งาน" : "ปิดอยู่"}
        </button>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={testFetch}
            disabled={testing}
            className="rounded-md border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
          >
            {testing ? "กำลังส่ง..." : "Test Fetch"}
          </button>
          {testMessage && <p className="text-[11px] text-slate-500">{testMessage}</p>}
        </div>
      </td>
    </tr>
  );
}
