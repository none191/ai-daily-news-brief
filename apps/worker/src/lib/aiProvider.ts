// ============================================================
// apps/worker/src/lib/aiProvider.ts
// เลือก AI provider จาก env AI_PROVIDER ("gemini" | "openai")
// ส่งกลับ JSON โครงสร้างเดียวกันไม่ว่าจะใช้ provider ไหน
//
// Rate limit handling:
//   Gemini free tier = 5 req/min → retry with backoff เมื่อเจอ 429
//   parse JSON ล้มเหลว → retry 1 ครั้งทันที
// ============================================================

export interface SummaryResult {
  shortSummary: string;
  detailedSummary: string;
  whyImportant: string;
  impact: string;
  followUpNote: string | null;
  shouldFollowUp: boolean;
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: { totalTokenCount?: number };
};

type OpenAIChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { total_tokens?: number };
};

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ดึง retryDelay จาก Gemini 429 error body (มีค่า retryDelay: "5s" มาใน error)
 * ถ้า parse ไม่ได้ให้ใช้ defaultMs
 */
function parseRetryDelay(errorBody: string, defaultMs: number): number {
  try {
    const json = JSON.parse(errorBody);
    const delays: string[] = [];
    // Gemini error format: error.details[].metadata.retryDelay = "5s"
    for (const detail of json?.error?.details ?? []) {
      const d = detail?.metadata?.retryDelay ?? detail?.retryDelay;
      if (typeof d === "string") delays.push(d);
    }
    if (delays.length > 0) {
      const seconds = parseInt(delays[0].replace("s", ""), 10);
      if (!isNaN(seconds)) return seconds * 1000 + 500; // บวก 500ms buffer
    }
  } catch {
    // ถ้า parse ไม่ได้ใช้ default
  }
  return defaultMs;
}

// Gemini free tier: 5 req/min → retry สูงสุด 3 ครั้ง ด้วย delay จาก error หรือ backoff
const GEMINI_MAX_RETRIES = 3;
const GEMINI_BASE_RETRY_DELAY_MS = 13000; // 13 วิ > 12 วิ (60/5) เผื่อ buffer

async function callGemini(
  title: string,
  content: string,
  category: string | null
): Promise<{ result: SummaryResult; model: string; tokensUsed: number | null }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ไม่ได้ตั้งค่าไว้");

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildUserPrompt(title, content, category)}` }],
      },
    ],
    generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (res.status === 429) {
      const errText = await res.text();
      const waitMs = parseRetryDelay(errText, GEMINI_BASE_RETRY_DELAY_MS * (attempt + 1));
      console.warn(
        `[aiProvider] Gemini 429 rate limit (attempt ${attempt + 1}/${GEMINI_MAX_RETRIES}) — รอ ${waitMs / 1000}s`
      );
      lastError = new Error(`Gemini 429: ${errText}`);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as GeminiGenerateContentResponse;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const tokensUsed = data?.usageMetadata?.totalTokenCount ?? null;

    return { result: parseJsonResponse(text), model, tokensUsed };
  }

  throw lastError ?? new Error("Gemini: เกินจำนวน retry สูงสุด");
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

  const data = (await res.json()) as OpenAIChatCompletionResponse;
  const text = data?.choices?.[0]?.message?.content ?? "";
  const tokensUsed = data?.usage?.total_tokens ?? null;

  return { result: parseJsonResponse(text), model, tokensUsed };
}

/**
 * เรียก AI ตาม provider ที่ตั้งไว้ใน env (AI_PROVIDER)
 * 429 rate limit: retry อัตโนมัติด้วย delay จาก error response
 * JSON parse fail: retry 1 ครั้งทันที
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
    // retry รอบเดียวสำหรับ JSON parse error หรือ transient network error
    // (429 ถูกจัดการใน callGemini loop แล้ว ไม่ต้อง retry ซ้ำที่นี่)
    if (err instanceof Error && err.message.includes("429")) throw err;
    return await call(title, content, category);
  }
}
