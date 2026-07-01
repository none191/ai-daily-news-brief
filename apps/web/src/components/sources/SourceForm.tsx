"use client";

// ============================================================
// apps/web/src/components/sources/SourceForm.tsx
// ฟอร์มเพิ่ม RSS source ใหม่
// ============================================================

import { useState } from "react";

type Category = { id: string; name: string };

export function SourceForm({
  categories,
  onCreated,
}: {
  categories: Category[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [rssUrl, setRssUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [reliabilityScore, setReliabilityScore] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rssUrl, categoryId: categoryId || null, reliabilityScore }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "เพิ่มแหล่งข่าวไม่สำเร็จ");
        return;
      }

      setName("");
      setRssUrl("");
      setCategoryId("");
      setReliabilityScore(1);
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <input
        required
        placeholder="ชื่อสำนักข่าว"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 lg:col-span-1"
      />
      <input
        required
        type="url"
        placeholder="RSS URL"
        value={rssUrl}
        onChange={(e) => setRssUrl(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 lg:col-span-2"
      />
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
      >
        <option value="">ไม่ระบุหมวด</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={reliabilityScore}
        onChange={(e) => setReliabilityScore(Number(e.target.value))}
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
      >
        <option value={1}>reliability 1 (ทั่วไป)</option>
        <option value={2}>reliability 2 (แหล่งหลัก)</option>
        <option value={3}>reliability 3 (แหล่งหลัก+)</option>
      </select>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-60 lg:col-span-5"
      >
        {submitting ? "กำลังเพิ่ม..." : "+ เพิ่มแหล่งข่าว"}
      </button>

      {error && <p className="text-xs text-red-400 lg:col-span-5">{error}</p>}
    </form>
  );
}
