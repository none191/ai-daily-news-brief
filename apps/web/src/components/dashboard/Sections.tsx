// ============================================================
// apps/web/src/components/dashboard/Sections.tsx
// รวม component เล็กๆ ที่เหลือ: section header, category group,
// pipeline logs table, empty state
// ============================================================

import { ArticleCard } from "./ArticleCard";

export function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h2>
      <span className="font-mono text-xs text-slate-500">{count} เรื่อง</span>
    </div>
  );
}

export function ArticleGrid({ articles }: { articles: any[] }) {
  if (articles.length === 0) {
    return <p className="text-xs text-slate-600">ไม่มีข่าวในส่วนนี้</p>;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {articles.map((a, i) => (
        <ArticleCard key={a.id} article={a} rank={i + 1} />
      ))}
    </div>
  );
}

export function CategoryGroups({
  groups,
}: {
  groups: { categoryId: string; categoryName: string; articles: any[] }[];
}) {
  if (groups.length === 0) {
    return <p className="text-xs text-slate-600">ยังไม่มีข่าวเด่นแยกหมวด</p>;
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.categoryId}>
          <h3 className="mb-2 text-xs font-medium text-cyan-400">{g.categoryName}</h3>
          <ArticleGrid articles={g.articles} />
        </div>
      ))}
    </div>
  );
}

export function PipelineLogTable({ logs }: { logs: any[] }) {
  if (logs.length === 0) {
    return <p className="text-xs text-slate-600">ยังไม่มี log การรัน pipeline</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-900 text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Step</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Items</th>
            <th className="px-3 py-2 font-medium">เวลา</th>
            <th className="px-3 py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {logs.map((log) => (
            <tr key={log.id} className="text-slate-300">
              <td className="px-3 py-2 font-mono">{log.step}</td>
              <td className="px-3 py-2">
                <StatusBadge status={log.status} />
              </td>
              <td className="px-3 py-2 text-slate-500">{log.sourceName ?? "-"}</td>
              <td className="px-3 py-2 font-mono">{log.itemsProcessed ?? "-"}</td>
              <td className="px-3 py-2 text-slate-500">
                {new Date(log.startedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="max-w-[240px] truncate px-3 py-2 text-red-400" title={log.errorMessage ?? ""}>
                {log.errorMessage ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SUCCESS: "bg-emerald-500/10 text-emerald-400",
    RUNNING: "bg-cyan-500/10 text-cyan-400",
    FAILED: "bg-red-500/10 text-red-400",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${styles[status] ?? "bg-slate-800 text-slate-400"}`}>
      {status}
    </span>
  );
}

export function EmptyBriefState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center">
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}
