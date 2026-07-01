// ============================================================
// apps/worker/src/seeds/rssSources.ts
// Seed: Category + NewsSource ตัวอย่างสำหรับทดสอบ pipeline
// Docker/runtime ใช้ JavaScript ที่ compile แล้วผ่าน script:
//   npm run build && npm run seed
// ============================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// หมวดข่าวตามที่ระบุไว้ในเอกสารต้นฉบับ
const CATEGORIES = [
  { name: "ข่าวเด่นประจำวัน", slug: "daily-highlight", sortOrder: 1 },
  { name: "เศรษฐกิจ / ธุรกิจ", slug: "economy-business", sortOrder: 2 },
  { name: "เทคโนโลยี / AI", slug: "technology-ai", sortOrder: 3 },
  { name: "E-commerce / Marketplace", slug: "ecommerce-marketplace", sortOrder: 4 },
  { name: "โรงงาน / อุตสาหกรรม", slug: "factory-industry", sortOrder: 5 },
  { name: "เฟอร์นิเจอร์ / อสังหา", slug: "furniture-realestate", sortOrder: 6 },
  { name: "การเมือง / นโยบายรัฐ", slug: "politics-policy", sortOrder: 7 },
  { name: "ต่างประเทศ", slug: "international", sortOrder: 8 },
] as const;

// แหล่งข่าวตัวอย่าง — แก้/เพิ่มได้ทีหลังจากหน้า "จัดการแหล่งข่าว" บน Dashboard
// reliabilityScore: 1 = ทั่วไป, 2-3 = แหล่งข่าวหลัก (เข้าเงื่อนไข sourceScore +2 ใน score.ts)
const SOURCES: { name: string; rssUrl: string; categorySlug: string; reliabilityScore: number }[] = [
  {
    name: "Bangkok Post - Business",
    rssUrl: "https://www.bangkokpost.com/rss/data/business.xml",
    categorySlug: "economy-business",
    reliabilityScore: 3,
  },
  {
    name: "Bangkok Post - Tech",
    rssUrl: "https://www.bangkokpost.com/rss/data/tech.xml",
    categorySlug: "technology-ai",
    reliabilityScore: 3,
  },
  {
    name: "ประชาชาติธุรกิจ",
    rssUrl: "https://www.prachachat.net/feed",
    categorySlug: "economy-business",
    reliabilityScore: 2,
  },
  {
    name: "Brand Inside",
    rssUrl: "https://brandinside.asia/feed/",
    categorySlug: "ecommerce-marketplace",
    reliabilityScore: 2,
  },
  {
    name: "TechCrunch",
    rssUrl: "https://techcrunch.com/feed/",
    categorySlug: "technology-ai",
    reliabilityScore: 3,
  },
  {
    name: "Reuters World News",
    rssUrl: "https://www.reuters.com/world/rss",
    categorySlug: "international",
    reliabilityScore: 3,
  },
];

// keyword ตัวอย่าง ใช้สำหรับ keywordScore (+3) ใน score.ts
const GLOBAL_KEYWORDS = [
  "ดอกเบี้ย", "เงินเฟ้อ", "ส่งออก", "นำเข้า", "GDP",
  "AI", "ปัญญาประดิษฐ์", "เฟอร์นิเจอร์", "โรงงาน",
  "อีคอมเมิร์ซ", "Shopee", "Lazada", "ภาษี", "ค่าเงินบาท",
];

async function main() {
  console.log("Seeding categories...");
  const categoryMap = new Map<string, string>(); // slug -> id

  for (const cat of CATEGORIES) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      create: { name: cat.name, slug: cat.slug, sortOrder: cat.sortOrder },
      update: { name: cat.name, sortOrder: cat.sortOrder },
    });
    categoryMap.set(cat.slug, created.id);
  }

  console.log("Seeding news sources...");
  for (const src of SOURCES) {
    const categoryId = categoryMap.get(src.categorySlug);
    await prisma.newsSource.upsert({
      where: { rssUrl: src.rssUrl },
      create: {
        name: src.name,
        rssUrl: src.rssUrl,
        defaultCategoryId: categoryId,
        reliabilityScore: src.reliabilityScore,
        isActive: true,
      },
      update: {
        name: src.name,
        defaultCategoryId: categoryId,
        reliabilityScore: src.reliabilityScore,
      },
    });
  }

  console.log("Seeding global keywords...");
  for (const term of GLOBAL_KEYWORDS) {
    const existing = await prisma.keyword.findFirst({ where: { term, categoryId: null } });
    if (!existing) {
      await prisma.keyword.create({ data: { term, weight: 3, categoryId: null } });
    }
  }

  console.log(`Done. ${CATEGORIES.length} categories, ${SOURCES.length} sources, ${GLOBAL_KEYWORDS.length} keywords.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
