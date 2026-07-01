"use client";

// ============================================================
// apps/web/src/app/sources/page.tsx
// หน้า "จัดการแหล่งข่าว"
// ใช้ layout/nav เดิมของโปรเจกต์ — ไฟล์นี้เป็นแค่ page content
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { SourceForm } from "@/components/sources/SourceForm";
import { SourceRow } from "@/components/sources/SourceRow";

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

type Category = { id: string; name: string };

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sources", { cache: "no-store" });
      if (!res.ok) throw new Error(`โหลดรายชื่อแหล่งข่าวไม่สำเร็จ (${res.status})`);
      const data = await res.json();
      setSources(data.sources);
      setCategories(data.categories);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">จัดการแหล่งข่าว</h1>
        <p className="mt-1 text-sm text-slate-500">
          เปิด/ปิดแหล่งข่าว ดู error ล่าสุด และทดสอบดึง RSS รายแหล่งได้จากหน้านี้
        </p>
      </div>

      <SourceForm categories={categories} onCreated={load} />

      {loading && <p className="text-sm text-slate-500">กำลังโหลด...</p>}
      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">{error}</div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">แหล่งข่าว</th>
                <th className="px-3 py-2 font-medium">หมวด</th>
                <th className="px-3 py-2 font-medium text-center">Reliability</th>
                <th className="px-3 py-2 font-medium">ดึงล่าสุด</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium">เปิด/ปิด</th>
                <th className="px-3 py-2 font-medium">ทดสอบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-600">
                    ยังไม่มีแหล่งข่าวในระบบ เพิ่มจากฟอร์มด้านบนได้เลย
                  </td>
                </tr>
              ) : (
                sources.map((s) => <SourceRow key={s.id} source={s} onChanged={load} />)
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
