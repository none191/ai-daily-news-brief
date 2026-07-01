-- Migration: add_completed_to_brief_status
-- เพิ่มค่า COMPLETED ใน BriefStatus enum เฉพาะกรณี deploy ต่อจาก schema เก่า
-- บน DB ว่าง baseline migration จะสร้าง enum พร้อม COMPLETED อยู่แล้ว

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BriefStatus')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'BriefStatus'
         AND e.enumlabel = 'COMPLETED'
     )
  THEN
    ALTER TYPE "BriefStatus" ADD VALUE 'COMPLETED' BEFORE 'SENT';
  END IF;
END $$;
