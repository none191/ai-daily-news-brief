// ============================================================
// apps/worker/src/lib/rss.ts
// ดึงและ parse RSS feed ให้เป็นรูปแบบเดียวกัน ไม่ว่า feed ต้นทาง
// จะมี field ชื่อต่างกันแค่ไหน (title, url/link, content/summary, image)
// ใช้ไลบรารี "rss-parser" (npm i rss-parser)
// ============================================================

import Parser from "rss-parser";
import crypto from "crypto";

export interface RssItemNormalized {
  title: string;
  link: string;
  publishedAt: Date;
  content: string;
  imageUrl: string | null;
  contentHash: string;
}

type CustomFeedItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  "content:encoded"?: string;
  summary?: string;
  enclosure?: { url?: string };
  "media:content"?: { $: { url?: string } } | { $: { url?: string } }[];
};

const parser = new Parser<{}, CustomFeedItem>({
  timeout: 15000,
  headers: { "User-Agent": "AIDailyNewsBrief/1.0 (+https://internal)" },
  customFields: {
    item: ["content:encoded", "media:content", "summary"],
  },
});

function extractImageUrl(item: CustomFeedItem): string | null {
  if (item.enclosure?.url) return item.enclosure.url;

  const media = item["media:content"];
  if (media) {
    const m = Array.isArray(media) ? media[0] : media;
    if (m?.$?.url) return m.$.url;
  }

  // ลองหา <img> ตัวแรกใน content เป็นทางเลือกสุดท้าย
  const html = item["content:encoded"] ?? item.content ?? "";
  const match = html.match(/<img[^>]+src=["']([^"'>]+)["']/i);
  return match ? match[1] : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeContentHash(title: string, content: string): string {
  const normalized = `${title.trim().toLowerCase()}|${content.trim().toLowerCase().slice(0, 500)}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * ดึง RSS feed จาก url แล้ว normalize เป็นโครงสร้างเดียวกัน
 * โยน error ออกไปตรงๆ ถ้าดึงไม่สำเร็จ — ให้ผู้เรียก (fetchRss.ts) เป็นคนจับ
 * ต่อ source เพื่อไม่ให้ source เดียวที่ error ทำให้ source อื่นไม่ทำงานด้วย
 */
export async function fetchAndParseFeed(url: string): Promise<RssItemNormalized[]> {
  const feed = await parser.parseURL(url);

  return (feed.items ?? []).map((item) => {
    const title = (item.title ?? "").trim();
    const link = (item.link ?? "").trim();

    const rawContent =
      item["content:encoded"] ?? item.content ?? item.summary ?? item.contentSnippet ?? "";
    const content = stripHtml(rawContent);

    const publishedAt = item.isoDate
      ? new Date(item.isoDate)
      : item.pubDate
      ? new Date(item.pubDate)
      : new Date();

    return {
      title,
      link,
      publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      content,
      imageUrl: extractImageUrl(item),
      contentHash: makeContentHash(title, content),
    };
  });
}
