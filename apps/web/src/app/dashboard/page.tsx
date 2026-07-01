"use client";

// ============================================================
// apps/web/src/app/dashboard/page.tsx
// หน้า Dashboard ข่าววันนี้
//
// ใช้ layout/nav เดิมของโปรเจกต์ (ไฟล์นี้เป็นแค่ page content)
// ดึงข้อมูลจริงจาก GET /api/dashboard/today เท่านั้น ไม่มี mock data
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { RunPipelineButton } from "@/components/dashboard/RunPipelineButton";
import { SendLineButton } from "@/components/dashboard/SendLineButton";
import { StatsCards } from "@/components/dashboard/StatsCards";
import {
  ArticleGrid,
  CategoryGroups,
  EmptyBriefState,
  PipelineLogTable,
  SectionHeader,
} from "@/components/dashboard/Sections";

type DashboardData = {
  hasBriefToday: boolean;
  message?: string;
  brief: { id: string; briefDate: string; status: string; generatedAt: string | null } | null;
  topOverall: any[];
  topByCategory: { categoryId: string; categoryName: string; articles: any[] }[];
  followUp: any[];
  stats: {
    totalFetchedToday: number;
    totalSelected: number;
    totalSummarized: number;
    summaryFailedCount: number;
  };
  recentLogs: any[];
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/today", { cache: "no-store" });
      if (!res.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${res.status})`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-8 p-6">
      {/* Header + ปุ่ม Run */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Dashboard ข่าววันนี้</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data?.brief
              ? `อัปเดตล่าสุด ${data.brief.generatedAt ? new Date(data.brief.generatedAt).toLocaleString("th-TH") : "-"}`
              : "AI Daily News Brief"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SendLineButton />
          <RunPipelineButton onSettled={loadData} />
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">กำลังโหลดข้อมูล...</p>}

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Stats cards */}
          <StatsCards stats={data.stats} />

          {/* Empty state ถ้ายังไม่มี brief วันนี้ */}
          {!data.hasBriefToday && <EmptyBriefState message={data.message ?? "ยังไม่มีสรุปข่าววันนี้"} />}

          {data.hasBriefToday && (
            <>
              {/* ข่าวเด่นรวม */}
              <section>
                <SectionHeader title="ข่าวเด่นรวม" count={data.topOverall.length} />
                <ArticleGrid articles={data.topOverall} />
              </section>

              {/* ข่าวเด่นแยกหมวด */}
              <section>
                <SectionHeader
                  title="ข่าวเด่นแยกหมวด"
                  count={data.topByCategory.reduce((sum, g) => sum + g.articles.length, 0)}
                />
                <CategoryGroups groups={data.topByCategory} />
              </section>

              {/* ข่าวที่ควรติดตามต่อ */}
              <section>
                <SectionHeader title="ข่าวที่ควรติดตามต่อ" count={data.followUp.length} />
                <ArticleGrid articles={data.followUp} />
              </section>
            </>
          )}

          {/* Pipeline logs */}
          <section>
            <SectionHeader title="Pipeline Logs ล่าสุด" count={data.recentLogs.length} />
            <PipelineLogTable logs={data.recentLogs} />
          </section>
        </>
      )}
    </div>
  );
}
