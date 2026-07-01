// ============================================================
// apps/worker/src/lib/titleSimilarity.ts
// เปรียบเทียบหัวข้อข่าวด้วย token overlap (Jaccard similarity)
// ไม่เรียก AI — เร็วและรันได้กับข่าวหลักร้อย/พันชิ้นต่อวันสบายๆ
// ============================================================

const THAI_STOPWORDS = new Set([
  "และ", "หรือ", "ที่", "ใน", "กับ", "ของ", "เป็น", "ได้", "จะ", "ไม่",
  "ให้", "มี", "ว่า", "ก็", "นี้", "นั้น", "แต่", "ไป", "มา", "อยู่",
  "ต่อ", "จาก", "ถึง", "โดย", "ด้วย", "การ", "ความ", "เพื่อ",
]);

const EN_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "to", "for",
  "is", "are", "was", "were", "with", "at", "by", "as", "it",
]);

// คำฟุ่มเฟือยที่สำนักข่าวชอบแปะหน้า/ท้ายหัวข้อ ไม่ได้บอกเนื้อหาจริง
// ถ้าไม่ตัดออกจะทำให้ similarity ของข่าวคนละเรื่องสูงเกินจริง
// (เช่น "ด่วน! น้ำมันขึ้นราคา" vs "ด่วน! ดอกเบี้ยขึ้น" จะคล้ายกันเพราะคำว่า "ด่วน")
const NOISE_WORDS = new Set([
  // ไทย
  "ด่วน", "ล่าสุด", "อัปเดต", "อัพเดท", "อัพเดต", "ข่าวด่วน", "พิเศษ",
  "เอ็กซ์คลูซีฟ", "สรุป", "เปิด", "เผย", "ล่า", "วันนี้", "ขณะนี้",
  // อังกฤษ
  "breaking", "update", "updated", "exclusive", "latest", "today",
  "live", "watch", "report", "reports",
]);

/**
 * ตัดคำแบบหยาบๆ: แยกด้วยช่องว่าง/วรรคตอน แล้วเอา stopword ออก
 * พอสำหรับเทียบความคล้ายหัวข้อข่าว ไม่ต้องใช้ tokenizer ภาษาไทยเต็มรูปแบบ
 */
export function tokenize(title: string): Set<string> {
  const cleaned = title
    .toLowerCase()
    .replace(/["'“”‘’«»()\[\]{}.,!?:;|/\\\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawTokens = cleaned.split(" ").filter(Boolean);

  const tokens = rawTokens.filter(
    (t) =>
      t.length > 1 &&
      !THAI_STOPWORDS.has(t) &&
      !EN_STOPWORDS.has(t) &&
      !NOISE_WORDS.has(t)
  );

  return new Set(tokens);
}

/**
 * Jaccard similarity = |intersection| / |union|
 * คืนค่า 0..1 (1 = เหมือนกันทุกคำ, 0 = ไม่มีคำซ้ำเลย)
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

// ---- เกณฑ์ที่ใช้ทั่วทั้งระบบ (ปรับได้ที่เดียว) ----
export const SIMILARITY_THRESHOLDS = {
  // หัวข้อคล้ายกันมาก จาก "แหล่งข่าวเดียวกัน" -> ถือว่าเป็น "ข่าวซ้ำ"
  // (รวมกับเงื่อนไข source เดียวกันใน dedupe.ts เสมอ ไม่ใช้ตัวนี้เดี่ยวๆ ข้ามแหล่ง)
  DUPLICATE: 0.85,

  // หัวข้อคล้ายกัน >= 80% -> ถือว่าเป็น "เรื่องเดียวกัน"
  // ใช้ทั้งกรณี same-source (อาจเป็น duplicate ที่ title ไม่เป๊ะ 100%)
  // และ cross-source (รวม cluster ได้ +3 cross-source score)
  SAME_STORY_CLUSTER: 0.8,
} as const;
