// ============================================================
// apps/worker/src/lib/aiProvider.ts
// เลือก AI provider จาก env AI_PROVIDER ("gemini" | "openai")
// ส่งกลับ JSON โครงสร้างเดียวกันไม่ว่าจะใช้ provider ไหน
// ============================================================

export interface SummaryResult {
  shortSummary: string;
  detailedSummary: string;
  whyImportant: string;
  impact: string;
  followUpNote: string | null;
  shouldFollowUp: boolean;
}

const SYSTEM_PROMPT = `คุณเป็นนักวิเคราะห์ข่าวภาษาไทยมือมืออาชีพ
หน้าที่ของคุณคือสรุปข่าวให้กระชับ ตรงประเด็น เป็นกลาง ไม่ใส่อารมณ์
ตอบกลับเป็น JSON เท่านั้น ห้ามมีคำอธิบายอื่น ห้ามมี markdown code fence
ต้องมี field ครบทุกตัวตาม schema ที่กำหนด`;

function buildUserPrompt(title: string, content: string, category: string | null): string {
  return `หมวดข่าว: ${category ?? "ไม่ระบุ"}
หัวข้อข่าว: ${title}

เนื้อหาข่าว:
${content.slice(0, 6000)}

กรุณาตอบกลับเป็น JSON ตาม schema นี้เท่านั้น (ไม่ต้องมี text อื่นนอกจาก JSON):
{
  "shortSummary": "สรุปสั้น 2-3 บรรทัด",
  "detailedSummary": "สรุปละเอียดประมาณ 1-2 พารากราฟ",
  "whyImportant": "อธิบายว่าทำไมข่าวนี้สำคัญ",
  "impact": "ผลกระทบต่อธุรกิจหรือคนทั่วไป",
  "followUpNote": "สิ่งที่ควรติดตามต่อ ถ้าไม่มีให้ใส่ null",
  "shouldFollowUp": true หรือ false (true ถ้าเป็นเรื่องที่ยังไม่จบ ต้องติดตามต่อ)
}`;
}

function parseJsonResponse(raw: string): SummaryResult {
  // กันกรณี AI ใส่ ```json ... ``` มาทั้งที่สั่งห้ามแล้ว
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    shortSummary: parsed.shortSummary ?? "",
    detailedSummary: parsed.detailedSummary ?? "",
    whyImportant: parsed.whyImportant ?? "",
    impact: parsed.impact ?? "",
    followUpNote: parsed.followUpNote ?? null,
    shouldFollowUp: Boolean(parsed.shouldFollowUp),
  };
}

async function callGemini(
  title: string,
  content: string,
  category: string | null
): Promise<{ result: SummaryResult; model: string; tokensUsed: number | null }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ไม่ได้ตั้งค่าไว้");

  const model = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildUserPrompt(title, content, category)}` }],
        },
      ],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const tokensUsed = data?.usageMetadata?.totalTokenCount ?? null;

  return { result: parseJsonResponse(text), model, tokensUsed };
}

async function callOpenAI(
  title: string,
  content: string,
  category: string | null
): Promise<{ result: SummaryResult; model: string; tokensUsed: number | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ไม่ได้ตั้งค่าไว้");

  const model = "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(title, content, category) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const tokensUsed = data?.usage?.total_tokens ?? null;

  return { result: parseJsonResponse(text), model, tokensUsed };
}

/**
 * เรียก AI ตาม provider ที่ตั้งไว้ใน env (AI_PROVIDER)
 * มี retry 1 ครั้งถ้า parse JSON ล้มเหลว (AI ตอบมาไม่ตรง schema)
 */
export async function summarizeWithAI(
  title: string,
  content: string,
  category: string | null
): Promise<{ result: SummaryResult; model: string; tokensUsed: number | null }> {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  const call = provider === "openai" ? callOpenAI : callGemini;

  try {
    return await call(title, content, category);
  } catch (err) {
    // retry รอบเดียว เผื่อ network/transient error หรือ JSON parse พลาดรอบแรก
    return await call(title, content, category);
  }
}
