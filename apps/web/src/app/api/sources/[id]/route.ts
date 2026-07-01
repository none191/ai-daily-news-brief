// ============================================================
// apps/web/src/app/api/sources/[id]/route.ts
// PATCH /api/sources/[id]
// ใช้สำหรับ toggle isActive และแก้ field อื่นๆ ของแหล่งข่าว
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { name, rssUrl, categoryId, reliabilityScore, isActive } = body ?? {};

    const data: Record<string, unknown> = {};
    if (typeof name === "string") data.name = name;
    if (typeof rssUrl === "string") data.rssUrl = rssUrl;
    if (typeof categoryId === "string" || categoryId === null) data.defaultCategoryId = categoryId;
    if (typeof reliabilityScore === "number") data.reliabilityScore = reliabilityScore;
    if (typeof isActive === "boolean") data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ status: "error", message: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });
    }

    const source = await prisma.newsSource.update({
      where: { id: params.id },
      data,
      include: { defaultCategory: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ status: "updated", source });
  } catch (err: any) {
    console.error("[api/sources/:id] PATCH failed:", err);
    return NextResponse.json(
      { status: "error", message: err?.message ?? "แก้ไขแหล่งข่าวไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
