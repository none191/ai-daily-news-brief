// ============================================================
// apps/web/src/components/dashboard/ArticleCard.tsx
// การ์ดข่าว 1 ชิ้น — โชว์ title, source, score, รูป (ถ้ามี), และ AI summary
//
// หมายเหตุ: field `imageUrl` ยังไม่มีใน schema ปัจจุบัน (NewsArticle ยังไม่มี
// column นี้) — โค้ดนี้รองรับ imageUrl แบบ optional ไว้ล่วงหน้า ถ้าพี่เพิ่ม
// column แล้วให้ api/dashboard/today ส่ง field นี้กลับมา รูปจะโชว์เองอัตโนมัติ
// ============================================================

type ArticleSummary = {
  shortSummary: string;
  detailedSummary: string;
  whyImportant: string;
  impact: string;
  followUpNote: string | null;
  shouldFollowUp: boolean;
  model: string;
} | null;

type Article = {
  id: string;
  title: string;
  link: string;
  publishedAt: string;
  imageUrl?: string | null;
  source: { name: string; reliabilityScore: number };
  category: { name: string } | null;
  score: { total: number } | null;
  summary: ArticleSummary;
};

export function ArticleCard({ article, rank }: { article: Article; rank?: number }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-start gap-3">
        {rank != null && (
          <span className="mt-0.5 shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-400">
            #{rank}
          </span>
        )}

        {article.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt=""
            className="hidden h-16 w-24 shrink-0 rounded object-cover sm:block"
          />
        )}

        <div className="min-w-0 flex-1">
          <a
            href={article.link}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-2 text-sm font-medium text-slate-100 hover:text-cyan-300"
          >
            {article.title}
          </a>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{article.source.name}</span>
            {article.category && (
              <>
                <span>·</span>
                <span>{article.category.name}</span>
              </>
            )}
            {article.score && (
              <>
                <span>·</span>
                <span className="font-mono text-cyan-400">score {article.score.total}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {article.summary ? (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3 text-xs text-slate-300">
          <p>{article.summary.shortSummary}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            <SummaryField label="ทำไมข่าวนี้สำคัญ" value={article.summary.whyImportant} />
            <SummaryField label="ผลกระทบต่อธุรกิจ" value={article.summary.impact} />
          </div>

          {article.summary.shouldFollowUp && article.summary.followUpNote && (
            <SummaryField label="สิ่งที่ควรติดตามต่อ" value={article.summary.followUpNote} accent />
          )}
        </div>
      ) : (
        <p className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-600">
          ยังไม่มีสรุปจาก AI สำหรับข่าวนี้
        </p>
      )}
    </article>
  );
}

function SummaryField({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className={`text-[11px] font-medium uppercase tracking-wide ${accent ? "text-amber-400" : "text-slate-500"}`}>
        {label}
      </p>
      <p className="mt-0.5 text-slate-300">{value}</p>
    </div>
  );
}
