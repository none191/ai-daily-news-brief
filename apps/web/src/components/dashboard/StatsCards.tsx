// ============================================================
// apps/web/src/components/dashboard/StatsCards.tsx
// ============================================================

type Stats = {
  totalFetchedToday: number;
  totalSelected: number;
  totalSummarized: number;
  summaryFailedCount: number;
};

export function StatsCards({ stats }: { stats: Stats }) {
  const cards = [
    { label: "ข่าวที่ดึงวันนี้", value: stats.totalFetchedToday, accent: "text-slate-200" },
    { label: "ข่าวที่ถูกเลือกเป็นข่าวเด่น", value: stats.totalSelected, accent: "text-cyan-300" },
    { label: "สรุปด้วย AI แล้ว", value: stats.totalSummarized, accent: "text-emerald-300" },
    {
      label: "สรุปไม่สำเร็จ",
      value: stats.summaryFailedCount,
      accent: stats.summaryFailedCount > 0 ? "text-red-400" : "text-slate-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className={`text-2xl font-semibold tabular-nums ${c.accent}`}>{c.value}</p>
          <p className="mt-1 text-xs text-slate-400">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
