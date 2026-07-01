# AI Daily News Brief — Deploy Guide
## UGREEN DXP2800 · Docker Compose · Cloudflare Tunnel

---

## 1. สิ่งที่ต้องมีก่อนเริ่ม

| สิ่ง | ที่ไหน | หมายเหตุ |
|------|--------|----------|
| UGREEN DXP2800 เปิดอยู่ ต่อ LAN | — | — |
| Docker + Docker Compose ติดตั้งแล้วบน NAS | UGREEN App Store หรือ SSH | ต้องเป็น Compose v2 (`docker compose` ไม่ใช่ `docker-compose`) |
| domain ที่ชี้ไป Cloudflare nameserver | Cloudflare Dashboard | ใช้ subdomain เช่น `news.yourdomain.com` |
| LINE Bot สร้างแล้ว | developers.line.biz | ได้ Channel Secret + Channel Access Token |
| Gemini API key หรือ OpenAI API key | aistudio.google.com / platform.openai.com | — |

---

## 2. โครงสร้าง folder บน NAS

```
/volume1/docker/news-brief/        ← root ของโปรเจกต์
├─ docker-compose.yml
├─ .env                            ← copy จาก .env.example แล้วกรอกค่าจริง
└─ apps/
   ├─ web/                         ← Next.js source
   └─ worker/                      ← Worker + Scheduler source
```

```bash
# SSH เข้า NAS แล้วสร้าง folder
mkdir -p /volume1/docker/news-brief
cd /volume1/docker/news-brief
git clone <your-repo-url> .        # หรือ scp/rsync ไฟล์ขึ้นมาตรงๆ
```

---

## 3. ตั้งค่า .env

```bash
cp .env.example .env
nano .env
```

กรอกค่าทุกบรรทัดที่ว่างอยู่:

```env
POSTGRES_PASSWORD=<strong-random-password>
GEMINI_API_KEY=<key>            # หรือ OPENAI_API_KEY ถ้าเลือก OpenAI
AI_PROVIDER=gemini              # หรือ openai
LINE_CHANNEL_ACCESS_TOKEN=<token>
LINE_CHANNEL_SECRET=<secret>
LINE_TO_ID=                     # ยังว่างไว้ก่อน — จะได้จากขั้นตอน 7
APP_URL=https://news.yourdomain.com
CLOUDFLARE_TUNNEL_TOKEN=        # ยังว่างไว้ก่อน — จะได้จากขั้นตอน 5
```

> `APP_URL` ใช้เป็นลิงก์ Dashboard ที่ส่งเข้า LINE ด้วย ต้องเปลี่ยนเป็น public HTTPS domain ตอน production

---

## 4. Build + รัน stack (ไม่รวม Cloudflare ก่อน)

```bash
# build image ทั้งหมด (ครั้งแรกใช้เวลา 5-10 นาที)
docker compose build

# รัน migration สร้างตาราง
docker compose --profile tools run --rm migrate

# seed ข้อมูลตั้งต้น (categories + RSS sources + keywords)
docker compose --profile tools run --rm seed

# start ทุก service (ไม่รวม cloudflared เพราะอยู่ profile "tunnel")
docker compose up -d

# ตรวจว่าทุก service ขึ้นปกติ
docker compose ps
```

ถ้า `docker compose ps` แสดง status `healthy` หรือ `running` ทุกตัว แสดงว่า stack ทำงานได้แล้ว

---

## 5. ตั้ง Cloudflare Tunnel

### 5.1 สร้าง Tunnel บน Cloudflare Dashboard

1. เข้า [dash.cloudflare.com](https://dash.cloudflare.com) → เลือก account
2. ไปที่ **Zero Trust** → **Networks** → **Tunnels**
3. กด **Create a tunnel** → เลือก **Cloudflared**
4. ตั้งชื่อ tunnel เช่น `news-brief-nas`
5. เลือก **Docker** เป็น connector type
6. คัดลอก token ที่แสดง (ยาวมาก ขึ้นต้นด้วย `eyJ...`)

### 5.2 ตั้ง Public Hostname

ใน tunnel settings → **Public Hostname** → **Add a public hostname**:

| Field | ค่า |
|-------|-----|
| Subdomain | `news` (หรือชื่อที่ต้องการ) |
| Domain | `yourdomain.com` |
| Type | `HTTP` |
| URL | `news-web:3000` |

> `news-web:3000` คือ service name ใน docker network ไม่ต้องใส่ IP จริงของ NAS

### 5.3 เพิ่ม Token เข้า .env และ Start Tunnel

```bash
# เพิ่ม token ใน .env
CLOUDFLARE_TUNNEL_TOKEN=eyJ...

# start cloudflared container
docker compose --profile tunnel up -d cloudflared

# ตรวจว่า tunnel online
docker compose logs cloudflared
# ควรเห็น: "Registered tunnel connection" และ "Connection ... registered"
```

ทดสอบเปิด `https://news.yourdomain.com` ในเบราว์เซอร์ — ควรเห็นหน้า Next.js

---

## 6. ผูก LINE Webhook

ต้องการ domain จาก Cloudflare Tunnel ก่อน ถึงจะทำขั้นตอนนี้ได้

1. เข้า [developers.line.biz](https://developers.line.biz) → เลือก Channel
2. ไปที่ **Messaging API** tab
3. กรอก **Webhook URL**:
   ```
   https://news.yourdomain.com/api/line/webhook
   ```
4. กด **Verify** — ควรได้ "Success"
5. เปิด **Use webhook** เป็น ON
6. ปิด **Auto-reply messages** และ **Greeting messages**

---

## 7. หา LINE_TO_ID

1. เพิ่ม LINE Bot เป็นเพื่อน (scan QR จาก LINE Developers Console)
2. ส่งข้อความอะไรก็ได้หา Bot เช่น "hello"
3. เรียก:
   ```
   GET https://news.yourdomain.com/api/line/webhook
   ```
4. ดู `lineId` ที่ `type: "user"` — นั่นคือ userId ของพี่
5. ใส่ใน `.env`:
   ```
   LINE_TO_ID=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. Restart worker เพื่อให้รับค่าใหม่:
   ```bash
   docker compose restart news-worker scheduler
   ```

---

## 8. ทดสอบ pipeline ครั้งแรก

```bash
# รัน pipeline แบบ manual ดูว่าทุก step ทำงานได้
docker compose run --rm news-worker npm run pipeline:run:prod

# ดู output — ควรเห็น step ครบ 8 ขั้นจาก fetch ถึง notify
# [pipeline] 1/8 fetchRss...
# [pipeline] 2/8 dedupe...
# ...
# [pipeline] 8/8 notify (LINE)...
# [pipeline] done.
```

ถ้า notify สำเร็จ พี่จะได้รับข้อความใน LINE

---

## 9. ตรวจสอบ Scheduler

Scheduler ตั้งเวลารันอัตโนมัติทุกวัน 06:00 (Asia/Bangkok) ตาม cron `0 6 * * *`

```bash
# ดูว่า scheduler container รันอยู่
docker compose ps scheduler

# ดู log ของ scheduler
docker compose logs scheduler
# ควรเห็น: "registered cron "0 6 * * *" -> job "run-full-pipeline" on queue "daily-pipeline""
```

---

## 10. Deploy Checklist (กาทีละข้อก่อน go-live)

### Infrastructure
- [ ] Docker Compose build สำเร็จ (`docker compose build`)
- [ ] Migration รันแล้ว (`docker compose --profile tools run --rm migrate`)
- [ ] Seed รันแล้ว (`docker compose --profile tools run --rm seed`)
- [ ] ทุก container status = running/healthy (`docker compose ps`)
- [ ] Cloudflare Tunnel online (เห็น "Registered tunnel connection")
- [ ] เข้า `https://news.yourdomain.com` ได้จากเน็ตนอกบ้าน

### LINE
- [ ] Webhook URL ตั้งแล้วและ Verify = Success
- [ ] `LINE_TO_ID` ใส่ใน .env แล้ว
- [ ] ทดสอบ push message ถึง LINE ได้จริง

### Pipeline
- [ ] `docker compose run --rm news-worker npm run pipeline:run:prod` ผ่านครบ 8 step
- [ ] Dashboard โชว์ข้อมูลจริงที่ `/dashboard`
- [ ] ปุ่ม "Run Daily Pipeline" ทำงานได้
- [ ] ปุ่ม "ส่ง LINE" ทำงานได้
- [ ] Scheduler รัน cron ถูกเวลา

### หน้า Admin
- [ ] `/dashboard` — ข้อมูล brief วันนี้
- [ ] `/sources` — เพิ่ม/แก้ RSS source ได้
- [ ] `/logs` — ดู pipeline log ได้

---

## 11. คำสั่งที่ใช้บ่อย

```bash
# ดู log realtime
docker compose logs -f news-worker
docker compose logs -f news-web

# restart service เดียว
docker compose restart news-worker

# rebuild หลังแก้โค้ด
docker compose build news-web && docker compose up -d news-web
docker compose build news-worker scheduler && docker compose up -d news-worker scheduler

# seed ข้อมูลตั้งต้นซ้ำแบบ idempotent
docker compose --profile tools run --rm seed

# stop ทั้ง stack (ข้อมูลใน volume ยังอยู่)
docker compose down

# stop + ลบ volume (ระวัง: ลบข้อมูลใน DB ด้วย)
docker compose down -v
```
