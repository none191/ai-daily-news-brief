-- Migration: add_completed_to_brief_status
-- เพิ่มค่า COMPLETED ใน BriefStatus enum
-- PostgreSQL ต้องใช้ ALTER TYPE ... ADD VALUE (ไม่สามารถ rollback enum value ได้)

ALTER TYPE "BriefStatus" ADD VALUE IF NOT EXISTS 'COMPLETED' BEFORE 'SENT';
