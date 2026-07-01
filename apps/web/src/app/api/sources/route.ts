// ============================================================
// apps/web/src/app/api/sources/route.ts
// GET  /api/sources  -> รายชื่อ NewsSource ทั้งหมด พร้อม category
// POST /api/sources  -> เพิ่มแหล่งข่าวใหม่
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sources = await prisma.newsSource.findMany({
      orderBy: { name: "asc" },
      include: { defaultCategory: { select: { id: true, name: true } } },
    });

    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    });

    return NextResponse.json({
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        rssUrl: s.rssUrl,
        category: s.defaultCategory,
        reliabilityScore: s.reliabilityScore,
        isActive: s.isActive,
        lastFetchedAt: s.lastFetchedAt,
        lastFetchStatus: s.lastFetchStatus,
      })),
      categories,
    });
  } catch (err: any) {
    console.error("[api/sources] GET failed:", err);
    return NextResponse.json(
      { status: "error", message: err?.message ?? "โหลดรายชื่อแหล่งข่าวไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, rssUrl, categoryId, reliabilityScore } = body ?? {};

    if (!name || !rssUrl) {
      return NextResponse.json(
        { status: "error", message: "กรุณากรอกชื่อแหล่งข่าวและ RSS URL" },
        { status: 400 }
      );
    }

    const existing = await prisma.newsSource.findUnique({ where: { rssUrl } });
    if (existing) {
      return NextResponse.json(
        { status: "error", message: "RSS URL นี้มีอยู่ในระบบแล้ว" },
        { status: 409 }
      );
    }

    const source = await prisma.newsSource.create({
      data: {
        name,
        rssUrl,
        defaultCategoryId: categoryId || undefined,
        reliabilityScore: typeof reliabilityScore === "number" ? reliabilityScore : 1,
        isActive: true,
      },
    });

    return NextResponse.json({ status: "created", source }, { status: 201 });
  } catch (err: any) {
    console.error("[api/sources] POST failed:", err);
    return NextResponse.json(
      { status: "error", message: err?.message ?? "เพิ่มแหล่งข่าวไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
