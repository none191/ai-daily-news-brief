-- Migration: add_line_identity_table
-- ตาราง line_identities สำหรับเก็บ userId/groupId ที่ได้จาก LINE Webhook
-- ใช้ระหว่าง onboarding เพื่อหา LINE_TO_ID

CREATE TABLE IF NOT EXISTS "line_identities" (
  "id"         TEXT NOT NULL,
  "lineId"     TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "label"      TEXT,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "line_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "line_identities_lineId_key" ON "line_identities"("lineId");
