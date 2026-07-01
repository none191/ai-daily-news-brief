// ============================================================
// apps/web/src/app/api/line/webhook/route.ts
// LINE Webhook endpoint
//
// วัตถุประสงค์หลัก: รับ event จาก LINE แล้วดึง userId / groupId
// มาเก็บไว้ในตาราง LineIdentity เพื่อเอาไปตั้งเป็น LINE_TO_ID
//
// วิธีใช้:
//   1. ตั้ง Webhook URL บน LINE Developers Console ให้ชี้มาที่ route นี้
//      เช่น https://your-domain.com/api/line/webhook
//   2. ส่งข้อความหา LINE Bot
//   3. เข้า GET /api/line/webhook เพื่อดู userId/groupId ที่บันทึกไว้
//   4. เอา ID ที่ได้ไปใส่ใน .env เป็น LINE_TO_ID
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ตรวจลายเซ็น LINE signature เพื่อกัน request ปลอม
// LINE ส่ง X-Line-Signature header มาเป็น HMAC-SHA256 ของ body
function verifyLineSignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    console.warn("[webhook] LINE_CHANNEL_SECRET ไม่ได้ตั้งค่า — ข้าม signature verification");
    return true; // ถ้าไม่ตั้ง secret ให้ผ่านไปก่อน (dev mode)
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ---- POST: รับ Webhook event จาก LINE ----
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!verifyLineSignature(body, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const events: any[] = payload?.events ?? [];

  for (const event of events) {
    const source = event?.source;
    if (!source) continue;

    const userId = source.userId ?? null;
    const groupId = source.groupId ?? null;
    const roomId = source.roomId ?? null;

    // เก็บ userId เสมอถ้ามี (คนที่ส่งข้อความ)
    if (userId) {
      await prisma.lineIdentity.upsert({
        where: { lineId: userId },
        create: { lineId: userId, type: "user", lastSeenAt: new Date() },
        update: { lastSeenAt: new Date() },
      });
    }

    // เก็บ groupId ถ้า event มาจาก Group Chat
    if (groupId) {
      await prisma.lineIdentity.upsert({
        where: { lineId: groupId },
        create: { lineId: groupId, type: "group", lastSeenAt: new Date() },
        update: { lastSeenAt: new Date() },
      });
    }

    // เก็บ roomId ถ้า event มาจาก Multi-person chat
    if (roomId) {
      await prisma.lineIdentity.upsert({
        where: { lineId: roomId },
        create: { lineId: roomId, type: "room", lastSeenAt: new Date() },
        update: { lastSeenAt: new Date() },
      });
    }
  }

  // LINE ต้องการ HTTP 200 ภายใน 1 วิ ไม่งั้นจะ retry
  return NextResponse.json({ ok: true });
}

// ---- GET: ดู ID ที่บันทึกไว้ทั้งหมด (สำหรับ onboarding LINE_TO_ID) ----
export async function GET() {
  try {
    const identities = await prisma.lineIdentity.findMany({
      orderBy: { lastSeenAt: "desc" },
    });

    return NextResponse.json({
      count: identities.length,
      identities: identities.map((i) => ({
        lineId: i.lineId,
        type: i.type,
        label: i.label,
        lastSeenAt: i.lastSeenAt,
        isActive: i.isActive,
      })),
      hint: identities.length === 0
        ? "ยังไม่มี ID — ส่งข้อความหา LINE Bot แล้วเรียก endpoint นี้อีกครั้ง"
        : `พบ ${identities.length} ID — เอา lineId ที่ต้องการไปใส่ใน .env เป็น LINE_TO_ID`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "โหลด LINE identities ไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
