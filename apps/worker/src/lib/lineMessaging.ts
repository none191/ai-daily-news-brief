// ============================================================
// apps/worker/src/lib/lineMessaging.ts
// LINE Messaging API client
// ใช้ Push Message (ส่งหา userId / groupId ที่ตั้งไว้ใน env)
// ไม่ต้องใช้ package เพิ่ม ใช้ fetch ตรงๆ
// ============================================================

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

function getConfig() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_TO_ID; // userId หรือ groupId ที่จะส่งหา
  const appUrl = process.env.APP_URL;

  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN ไม่ได้ตั้งค่าไว้");
  if (!to) throw new Error("LINE_TO_ID ไม่ได้ตั้งค่าไว้ (userId หรือ groupId ที่จะรับข้อความ)");
  if (!appUrl) throw new Error("APP_URL ไม่ได้ตั้งค่าไว้");

  return { token, to, appUrl };
}

// ---- Flex Message builders ----

type ArticleForFlex = {
  title: string;
  link: string;
  sourceName: string;
  shortSummary: string | null;
  score: number | null;
};

/**
 * สร้าง Flex Message "Bubble" แสดงสรุปข่าว 1 ชิ้น
 */
function makeArticleBubble(article: ArticleForFlex, rank: number) {
  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: `#${rank} · ${article.sourceName}`,
          size: "xs",
          color: "#7dd3fc",
          weight: "bold",
        },
      ],
      paddingAll: "12px",
      paddingBottom: "4px",
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: article.title,
          size: "sm",
          weight: "bold",
          color: "#f1f5f9",
          wrap: true,
          maxLines: 3,
        },
        ...(article.shortSummary
          ? [
              {
                type: "text",
                text: article.shortSummary,
                size: "xs",
                color: "#94a3b8",
                wrap: true,
                maxLines: 4,
                margin: "sm",
              },
            ]
          : []),
        ...(article.score != null
          ? [
              {
                type: "text",
                text: `score ${article.score}`,
                size: "xxs",
                color: "#38bdf8",
                margin: "md",
              },
            ]
          : []),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      paddingTop: "4px",
      contents: [
        {
          type: "button",
          action: { type: "uri", label: "อ่านข่าว", uri: article.link },
          style: "secondary",
          height: "sm",
          color: "#1e293b",
        },
      ],
    },
    styles: {
      header: { backgroundColor: "#0f172a" },
      body: { backgroundColor: "#0f172a" },
      footer: { backgroundColor: "#0f172a" },
    },
  };
}

/**
 * สร้าง Flex Carousel สำหรับ top overall + follow-up
 */
function makeCarousel(articles: ArticleForFlex[], startRank = 1) {
  return {
    type: "carousel",
    contents: articles.map((a, i) => makeArticleBubble(a, startRank + i)),
  };
}

/**
 * ส่วนแรก: ข้อความสรุปภาพรวมประจำวัน (text)
 */
function makeDailySummaryText(date: Date, totalFetched: number, totalSummarized: number, appUrl: string): string {
  const dateStr = date.toLocaleDateString("th-TH", { dateStyle: "full" });
  return `📰 AI Daily News Brief\n${dateStr}\n\nดึงข่าวมา ${totalFetched} ชิ้น · สรุปแล้ว ${totalSummarized} ชิ้น\n\nDashboard: ${appUrl}`;
}

// ---- Public API ----

export interface DailyBriefPayload {
  briefDate: Date;
  totalFetched: number;
  totalSummarized: number;
  topOverall: ArticleForFlex[];
  followUp: ArticleForFlex[];
}

/**
 * ส่ง Daily Brief ไปยัง LINE:
 *   1. Text message — สรุปสถิติวันนี้
 *   2. Flex Carousel — ข่าวเด่นรวม (top overall)
 *   3. Flex Carousel — ข่าวที่ควรติดตามต่อ (ถ้ามี)
 *
 * ส่งแยก 3 request เพราะ LINE ไม่อนุญาตให้ผสม Flex + Text ใน multicast
 * ในแบบที่ preserves order ได้แน่นอน เลยแยก push แต่ละ message
 */
export async function sendDailyBriefToLine(payload: DailyBriefPayload): Promise<void> {
  const { token, to, appUrl } = getConfig();

  const messages = [
    // 1) text สรุปวัน
    {
      type: "text",
      text: makeDailySummaryText(payload.briefDate, payload.totalFetched, payload.totalSummarized, appUrl),
    },

    // 2) ข่าวเด่นรวม — carousel สูงสุด 10 bubble (LINE Flex Carousel limit)
    ...(payload.topOverall.length > 0
      ? [{ type: "flex", altText: "ข่าวเด่นรวมประจำวัน", contents: makeCarousel(payload.topOverall.slice(0, 10)) }]
      : []),

    // 3) ข่าวที่ควรติดตามต่อ (ถ้ามี)
    ...(payload.followUp.length > 0
      ? [{ type: "flex", altText: "ข่าวที่ควรติดตามต่อ", contents: makeCarousel(payload.followUp.slice(0, 10)) }]
      : []),
  ];

  // LINE push API รองรับสูงสุด 5 messages ต่อ request
  // ส่งทีเดียวได้เลย (เรามีแค่ 3)
  const res = await fetch(LINE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LINE API error ${res.status}: ${errText}`);
  }
}
