# AI Daily News Brief — Docker คู่มือ build/run

## โครงสร้างไฟล์ที่ต้องมี

```
news-brief/
├─ docker-compose.yml
├─ .env                          (copy จาก .env.example)
├─ apps/
│  ├─ web/
│  │  ├─ Dockerfile
│  │  ├─ .dockerignore
│  │  ├─ next.config.js          ← ต้องมี output: "standalone"
│  │  ├─ package.json            ← ต้องมี script "build" (next build)
│  │  └─ prisma/schema.prisma
│  └─ worker/
│     ├─ Dockerfile
│     ├─ .dockerignore
│     ├─ tsconfig.json           ← ต้องตั้ง "outDir": "dist"
│     ├─ package.json            ← ต้องมี script "build" (tsc)
│     └─ prisma/schema.prisma
```

## ⚠️ ก่อน build ต้องเช็ค 2 จุดนี้ใน source code

**1. `apps/web/next.config.js`** ต้องเพิ่ม:
```js
module.exports = {
  output: "standalone",
};
```
ไม่งั้น Dockerfile ของ web จะหา `.next/standalone` ไม่เจอ ตอน build จะ error

**2. `apps/worker/tsconfig.json`** ต้องมี:
```json
{
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```
และต้องมีไฟล์ entry point `src/worker.ts` กับ `src/scheduler.ts` จริง เพราะ Dockerfile รัน `node dist/worker.js` / `node dist/scheduler.js`

## package.json scripts ที่ต้องมี (ดูไฟล์ reference ที่แนบมา)

`apps/web/package.json`:
- `build` → `next build`
- `start` → `next start` (ไม่ได้ใช้ใน container จริง เพราะ runner stage รัน `node server.js` ตรงจาก standalone output)

`apps/worker/package.json`:
- `build` → `tsc -p tsconfig.json`
- `worker` → `node dist/worker.js`
- `scheduler` → `node dist/scheduler.js`

## คำสั่ง build + run

```bash
# 1. เตรียม env
cp .env.example .env
nano .env   # กรอก POSTGRES_PASSWORD, GEMINI_API_KEY ฯลฯ

# 2. build image ทั้งหมด (web + worker ใช้ Dockerfile คนละตัว)
docker compose build

# 3. รัน migration ครั้งแรก (สร้างตารางตาม schema.prisma)
docker compose run --rm news-web npx prisma migrate deploy

# 4. start ทุก service (ไม่รวม cloudflared เพราะอยู่ profile "tunnel")
docker compose up -d

# 5. ถ้าพร้อมเปิด remote access ผ่าน Cloudflare Tunnel แล้ว
docker compose --profile tunnel up -d

# ดู log แต่ละตัว
docker compose logs -f news-web
docker compose logs -f news-worker
docker compose logs -f scheduler

# rebuild เฉพาะ web ตอนแก้โค้ด dashboard
docker compose build news-web && docker compose up -d news-web

# rebuild เฉพาะ worker ตอนแก้ scoring/scheduler logic
docker compose build news-worker scheduler && docker compose up -d news-worker scheduler
```

## หมายเหตุสำหรับ UGREEN DXP2800

- ใช้ `node:20-alpine` ทั้งสอง image เพื่อให้ image เล็ก ประหยัด storage/RAM บน NAS
- `news-web` ใช้ Next.js standalone output → image runner ไม่มี `node_modules` เต็มชุด มีแค่ dependencies ที่ standalone bundle ต้องใช้จริง
- `news-worker` แยก stage `prod-deps` เพื่อ `npm ci --omit=dev` เอา devDependencies ออกจาก image จริงที่รันบน NAS
- ทั้งสอง image รัน prisma client แบบ generate ไว้ใน build stage แล้ว ไม่ต้อง generate ใหม่ตอน runtime
- container รันด้วย non-root user (`nextjs` / `worker`) ตาม security best practice
