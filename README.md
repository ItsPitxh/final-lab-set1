# ENGSE207 Final Lab Set 1

## Microservices + HTTPS + Lightweight Logging

**รายวิชา:** ENGSE207 — หลักการวิศวกรรมซอฟต์แวร์
**รหัสนักศึกษา:** 67543210061-7
**ชื่อ-สกุล:** นายพิชฌ์ สินธรสวัสดิ์

---

## ภาพรวมโครงการ

โปรเจกต์นี้เป็นเว็บแอปพลิเคชันที่ใช้สถาปัตยกรรมแบบ Microservices ทำงานในคอนเทนเนอร์ Docker มีการรักษาความปลอดภัยด้วย HTTPS และมีระบบ Logging ภายในแบบเบาที่สร้างขึ้นเอง ผมพัฒนาทุกส่วนด้วยตัวเองตั้งแต่ต้น เป้าหมายหลักคือทำความเข้าใจว่าบริการต่าง ๆ สื่อสารกันอย่างไร จะป้องกันระบบด้วย TLS และ JWT ได้อย่างไร และจะติดตามสิ่งที่เกิดขึ้นภายในระบบได้อย่างไรโดยไม่ต้องพึ่งไลบรารี Logging ขนาดใหญ่

ทั้งหมด 6 เซอร์วิสทำงานในคอนเทนเนอร์ Docker และสื่อสารกันผ่าน Docker Network ส่วนตัว โดยมี Nginx Reverse Proxy ทำหน้าที่เป็นจุดรับ-ส่งข้อมูลที่ขอบระบบ จัดการ TLS, บังคับใช้ Rate Limit และส่งต่อ Request ไปยังเซอร์วิสที่เหมาะสม

---

## สถาปัตยกรรมระบบ

```
เบราว์เซอร์ (HTTPS :443)
       │
 ┌─────▼────────────────────────────────────────────┐
 │  Nginx  (TLS · Rate-Limit · Reverse Proxy)        │
 └───┬──────────────┬──────────────┬────────────────┘
     │              │              │
 auth-service   task-service   log-service
   :3001           :3002          :3003
     └──────────────┴──────────────┘
                    │
            PostgreSQL :5432
```

- **Nginx** เป็นเซอร์วิสเดียวที่เปิดรับการเชื่อมต่อจากภายนอก
- **auth-service**, **task-service** และ **log-service** อยู่บน `app-network` ภายในเท่านั้น
- Endpoint สำหรับเขียน Log ภายใน (`/api/logs/internal`) ถูกบล็อกที่ระดับ Nginx — เซอร์วิสภายใน Docker Network เท่านั้นที่เรียกใช้ได้
- ฐานข้อมูล PostgreSQL หนึ่งชุดถูกใช้ร่วมกันโดยทั้งสามเซอร์วิส Backend

---

## เซอร์วิสต่าง ๆ

### auth-service (พอร์ต 3001)

จัดการการล็อกอินและออก Token เมื่อล็อกอินสำเร็จจะตรวจสอบรหัสผ่านกับ bcrypt hash ที่เก็บในฐานข้อมูล แล้วส่งคืน JWT ที่เซ็นชื่อแล้ว เซอร์วิสอื่น ๆ เรียก `/api/auth/verify` เพื่อตรวจสอบ Token โดยไม่ต้องเข้าถึงฐานข้อมูลโดยตรง

| Endpoint | Method | คำอธิบาย |
|---|---|---|
| `/api/auth/login` | POST | ล็อกอิน รับ JWT กลับมา |
| `/api/auth/verify` | GET | ตรวจสอบความถูกต้องของ Token |
| `/api/auth/me` | GET | ดึงข้อมูลผู้ใช้งานปัจจุบัน |
| `/api/auth/health` | GET | ตรวจสอบสถานะเซอร์วิส |

### task-service (พอร์ต 3002)

REST API สำหรับจัดการ Task ที่ป้องกันด้วย JWT ผู้ใช้ที่มีบทบาท Admin สามารถสร้าง แก้ไข และลบ Task ได้ ส่วนผู้ใช้ทั่วไป (Member) ดูได้อย่างเดียว ทุกการกระทำที่เปลี่ยนแปลงข้อมูลจะส่ง Log Event ไปยัง log-service

| Endpoint | Method | คำอธิบาย |
|---|---|---|
| `/api/tasks` | GET | ดึงรายการ Task ทั้งหมด |
| `/api/tasks` | POST | สร้าง Task ใหม่ (Admin เท่านั้น) |
| `/api/tasks/:id` | PUT | แก้ไข Task (Admin เท่านั้น) |
| `/api/tasks/:id` | DELETE | ลบ Task (Admin เท่านั้น) |

### log-service (พอร์ต 3003)

ระบบ Logging ภายในแบบเบา auth-service และ task-service ส่ง Event แบบ Structured มาบันทึก Admin สามารถดู Log และสถิติผ่าน Log Dashboard ได้

| Endpoint | Method | คำอธิบาย |
|---|---|---|
| `/api/logs/internal` | POST | บันทึก Log (ภายในเท่านั้น) |
| `/api/logs` | GET | ดึงรายการ Log (Admin) |
| `/api/logs/stats` | GET | ดูสถิติสรุป (Admin) |
| `/api/logs/health` | GET | ตรวจสอบสถานะเซอร์วิส |

### Nginx

จุดเข้าถึงระบบเพียงจุดเดียว รองรับ:
- ใบรับรอง TLS แบบ Self-Signed (HTTPS บนพอร์ต 443)
- Redirect HTTP → HTTPS อัตโนมัติ
- Rate Limiting: `5 req/min` สำหรับ Login และ `30 req/min` สำหรับ API ทั่วไป
- บล็อก `/api/logs/internal` จากภายนอกอย่างถาวร

### Frontend

หน้าเว็บ HTML แบบ Static 2 หน้า ให้บริการโดยคอนเทนเนอร์ Nginx แยก:
- **index.html** — Task Board: ฟอร์มล็อกอิน, จัดการ Task, ดูข้อมูล JWT, ลิงก์ไป Log Dashboard
- **logs.html** — Log Dashboard: สำหรับ Admin เท่านั้น, รีเฟรชอัตโนมัติ, แถบกรองข้อมูล, สรุปสถิติ

### PostgreSQL

ฐานข้อมูลร่วมหนึ่งชุด (`engse207_db`) ประกอบด้วย 3 ตาราง:

```sql
users  -- id, username, password_hash, role (admin | member)
tasks  -- id, title, description, status, assigned_to, created_by, timestamps
logs   -- id, service, action, user_id, details, created_at
```

ข้อมูล Seed ถูก Insert ตอน Startup ผ่าน `db/init.sql` รหัสผ่านเก็บเป็น bcrypt hash (สร้างด้วย Python เนื่องจากสภาพแวดล้อมของแล็บจำกัดการใช้ npm install)

---

## วิธีรันโปรเจกต์

### สิ่งที่ต้องมีก่อน
- Docker Desktop (หรือ Docker Engine + Compose Plugin)
- OpenSSL (สำหรับสคริปต์สร้างใบรับรอง)
- Git

### ขั้นตอนที่ 1 — สร้างใบรับรอง TLS

```bash
bash scripts/gen-certs.sh
```

คำสั่งนี้จะสร้างใบรับรอง Self-Signed ไว้ใน `nginx/certs/`

### ขั้นตอนที่ 2 — ตั้งค่า Environment Variables

```bash
cp .env.example .env
# แก้ไขไฟล์ .env — ตั้ง POSTGRES_PASSWORD และ JWT_SECRET ให้มีความปลอดภัยเพียงพอ
```

### ขั้นตอนที่ 3 — เริ่มต้นทุกเซอร์วิส

```bash
docker compose up --build -d
```

เปิดเบราว์เซอร์ไปที่ **https://localhost** แล้วกด Accept เพื่อยอมรับคำเตือนใบรับรอง Self-Signed

### บัญชีทดสอบเริ่มต้น

| Username | Password  | บทบาท  |
|----------|-----------|--------|
| alice    | alice123  | member |
| bob      | bob456    | member |
| admin    | adminpass | admin  |

### หยุดการทำงานของเซอร์วิส

```bash
docker compose down
# หากต้องการลบ Database Volume ด้วย:
docker compose down -v
```

---

## โครงสร้างโปรเจกต์

```
engse207-final-lab/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── db/
│   └── init.sql               # Schema และ Seed Data
├── nginx/
│   ├── nginx.conf             # ตั้งค่า Proxy, TLS, Rate-Limit
│   └── Dockerfile
├── scripts/
│   └── gen-certs.sh           # สคริปต์สร้างใบรับรอง Self-Signed
├── auth-service/
│   ├── src/
│   │   ├── index.js
│   │   ├── db/db.js
│   │   ├── middleware/jwtUtils.js
│   │   └── routes/auth.js
│   ├── package.json
│   └── Dockerfile
├── task-service/              # โครงสร้างเหมือน auth-service
├── log-service/               # โครงสร้างเหมือน auth-service
└── frontend/
    ├── index.html             # Task Board UI
    ├── logs.html              # Log Dashboard UI
    └── Dockerfile
```

---

## Environment Variables

คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่าของตัวเอง:

```env
POSTGRES_DB=engse207_db
POSTGRES_USER=admin
POSTGRES_PASSWORD=<รหัสผ่านของคุณ>
JWT_SECRET=<คีย์ลับของคุณ>
JWT_EXPIRES=1h
```

---

## หมายเหตุด้านความปลอดภัย

- **TLS** — การรับส่งข้อมูลทั้งหมดเข้ารหัสด้วย TLS ใบรับรองที่ใช้เป็นแบบ Self-Signed เหมาะสำหรับสภาพแวดล้อม Lab แต่หากใช้งานจริงควรใช้ใบรับรองจาก CA ที่น่าเชื่อถือ
- **รหัสผ่าน** — เก็บเป็น bcrypt hash ไม่มีการเขียนรหัสผ่าน Plain-Text ลงในฐานข้อมูล
- **JWT** — Token เซ็นด้วย HS256 และมีอายุการใช้งานตามที่กำหนดใน `JWT_EXPIRES`
- **ป้องกัน Endpoint ภายใน** — `/api/logs/internal` ถูกบล็อกที่ระดับ Nginx เข้าถึงได้เฉพาะภายใน Docker Network เท่านั้น
- **Rate Limiting** — ป้องกันการโจมตีแบบ Brute-Force บน Endpoint ล็อกอิน (5 req/min)

---

## หมายเหตุ

ผมพัฒนาโปรเจกต์นี้คนเดียวทั้งหมด ทุกไฟล์ — เซอร์วิส, ไฟล์คอนฟิก, SQL, และ Frontend — เขียนขึ้นเองตั้งแต่ต้น บางส่วนเช่นการสร้าง bcrypt Hash ต้องใช้ Python แทน npm เนื่องจากสภาพแวดล้อมของแล็บจำกัดการติดตั้งแพ็กเกจผ่าน npm
