/** @type {import('next').NextConfig} */
const nextConfig = {
  // จำเป็นมาก — Dockerfile ของ web ใช้ .next/standalone ในขั้น runner
  // ถ้าไม่มีบรรทัดนี้ docker build จะ fail ตอน COPY .next/standalone
  output: "standalone",

  // อนุญาตให้โหลดรูปจาก domain ภายนอก (RSS feed image)
  // เพิ่ม domain อื่นทีหลังถ้าพบ source ที่รูปมาจาก domain ใหม่
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }, // เปิดกว้างไว้ก่อน เหมาะกับ internal tool
    ],
  },

  // path alias @/ -> src/ (ตรงกับ tsconfig paths ด้านล่าง)
  // Next.js อ่าน tsconfig.json อยู่แล้ว ไม่ต้อง config ซ้ำที่นี่

  // ปิด telemetry (รันบน NAS ไม่ต้องส่ง usage data)
  // ตั้งใน Dockerfile ด้วย ENV NEXT_TELEMETRY_DISABLED=1 แล้ว แต่ใส่ไว้ตรงนี้กันลืม
};

module.exports = nextConfig;
