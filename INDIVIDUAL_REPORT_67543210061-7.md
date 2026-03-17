# รายงานบุคคล — ENGSE207 Final Lab Set 1

**รายวิชา:** ENGSE207 — หลักการวิศวกรรมซอฟต์แวร์
**รหัสนักศึกษา:** 67543210061-7
**ชื่อ-สกุล:** นายพิชฌ์ สินธรสวัสดิ์
**ลักษณะงาน:** ทำคนเดียว (Solo)

---

## 1. สรุปสิ่งที่ทำในโปรเจกต์นี้

โปรเจกต์นี้ผมพัฒนาทุกส่วนคนเดียวตั้งแต่ต้นจนจบ ตั้งแต่การออกแบบ Schema ฐานข้อมูล การสร้างเซอร์วิสแต่ละตัว การตั้งค่า Nginx ไปจนถึงหน้าเว็บ Frontend ทั้งหมดนี้ทำภายในสภาพแวดล้อม Docker Compose ที่ทุกเซอร์วิสสื่อสารกันผ่าน Docker Network ส่วนตัว

---

## 2. งานที่ทำในแต่ละส่วน

### 2.1 โครงสร้างพื้นฐาน (Infrastructure)

- ตั้งค่า `docker-compose.yml` ให้ครอบคลุมทุกเซอร์วิส (postgres, auth, task, log, frontend, nginx) พร้อม health check และ depends_on
- ออกแบบ Docker Network ภายใน (`app-network`) เพื่อให้เซอร์วิสคุยกันโดยไม่ต้องเปิด Port ออกข้างนอก
- สร้างไฟล์ `.env.example` และ `.gitignore` เพื่อไม่ให้ข้อมูลสำคัญหลุดขึ้น Git

### 2.2 Nginx (HTTPS + Reverse Proxy)

- ตั้งค่า `nginx.conf` ให้รับ HTTPS บนพอร์ต 443 และ Redirect HTTP → HTTPS อัตโนมัติ
- เพิ่ม Rate Limiting แยกกัน 2 ชุด คือ `login_limit` (5 req/min) สำหรับ Endpoint ล็อกอิน และ `api_limit` (30 req/min) สำหรับ API ทั่วไป
- บล็อก `/api/logs/internal` ไม่ให้เรียกจากภายนอกได้ ทำให้ Endpoint นี้เข้าถึงได้เฉพาะจากภายใน Docker Network
- เขียน `scripts/gen-certs.sh` สำหรับสร้างใบรับรอง Self-Signed ด้วย OpenSSL

### 2.3 auth-service

- เขียน Express.js API สำหรับจัดการการยืนยันตัวตน
- ใช้ `bcryptjs` ตรวจสอบรหัสผ่านกับ Hash ที่เก็บในฐานข้อมูล โดยมีการใส่ Dummy Hash เพื่อป้องกัน Timing Attack กรณีที่ Username ไม่มีในระบบ
- ออก JWT ด้วย `jsonwebtoken` และสร้าง Middleware `verifyToken` ที่ใช้ร่วมกับเซอร์วิสอื่น
- ทุก Endpoint ที่สำคัญจะส่ง Log Event ไปยัง log-service โดยอัตโนมัติ

### 2.4 task-service

- เขียน CRUD API ครบถ้วนสำหรับจัดการ Task (สร้าง / อ่าน / แก้ไข / ลบ)
- นำ JWT Middleware มาใช้ตรวจสอบสิทธิ์ก่อนเข้าถึงทุก Endpoint
- ออกแบบ Role-Based Access Control ให้ Admin เห็น Task ทั้งหมด ส่วน Member เห็นเฉพาะ Task ที่ตัวเองรับผิดชอบ
- ทุกการกระทำที่เปลี่ยนแปลงข้อมูล (สร้าง / แก้ไข / ลบ) จะส่ง Log Event ไปบันทึกที่ log-service

### 2.5 log-service

- สร้าง Endpoint ภายใน `POST /api/logs/internal` สำหรับรับ Log จากเซอร์วิสอื่น
- สร้าง `GET /api/logs` สำหรับ Admin ดึงรายการ Log พร้อม Filter ตาม Service และ Action
- สร้าง `GET /api/logs/stats` แสดงสถิติสรุปเช่น จำนวน Log ต่อ Service และ Action ที่เกิดขึ้นบ่อยที่สุด

### 2.6 ฐานข้อมูล (PostgreSQL)

- ออกแบบ Schema 3 ตาราง คือ `users`, `tasks`, `logs` ให้รองรับการทำงานร่วมกันของทุกเซอร์วิส
- เขียน `db/init.sql` สำหรับสร้างตารางและ Insert ข้อมูล Seed
- สร้าง bcrypt Hash สำหรับรหัสผ่านของ alice, bob และ admin โดยใช้ Python แทน npm เนื่องจากสภาพแวดล้อมของแล็บจำกัดการติดตั้งแพ็กเกจ
- เพิ่ม Index บนตาราง `logs` เพื่อเพิ่มประสิทธิภาพการ Query

### 2.7 Frontend

- **index.html (Task Board):** ฟอร์มล็อกอิน, ตารางแสดง Task, ปุ่มสร้าง / แก้ไข / ลบ Task, แสดงข้อมูล JWT แบบ Decoded, ลิงก์ไปยัง Log Dashboard
- **logs.html (Log Dashboard):** แสดงรายการ Log แบบ Real-Time พร้อมปุ่มรีเฟรชอัตโนมัติ, ช่องกรอง Filter, Card แสดงสรุปสถิติ — เข้าถึงได้เฉพาะผู้ใช้ที่มีบทบาท Admin

---

## 3. ความท้าทายและการแก้ปัญหา

### ปัญหาที่ 1: npm install ถูกบล็อก

ในสภาพแวดล้อมของแล็บไม่สามารถรัน `npm install bcrypt` ได้เนื่องจาก Security Policy ของระบบ แก้ไขโดยใช้ Python Library `bcrypt` สร้าง Hash ล่วงหน้าแล้วนำไปใส่ใน `init.sql` โดยตรง ทำให้ไม่จำเป็นต้อง Install แพ็กเกจเพิ่มเติมในตอน Build

### ปัญหาที่ 2: Nginx บล็อก Endpoint ภายใน

ต้องการให้ `/api/logs/internal` เรียกได้เฉพาะภายใน Docker Network เท่านั้น แก้ไขโดยใช้ `deny all` ใน `nginx.conf` สำหรับ Location นี้ ทำให้ Request จากภายนอกทั้งหมดได้รับ 403 ทันที แต่เซอร์วิสภายในยังคุยกันได้โดยตรงผ่าน Docker Network

### ปัญหาที่ 3: JWT ที่ใช้ร่วมกันระหว่างเซอร์วิส

Task Service และ Log Service ต้องตรวจสอบ Token ที่ Auth Service ออกให้ แก้ไขโดยใช้ `JWT_SECRET` ตัวเดียวกันจาก Environment Variable ทำให้ทุกเซอร์วิสสามารถ Verify Token ได้โดยไม่ต้องเรียก Auth Service ทุกครั้ง ลด Latency และจุดล้มเหลว

---

## 4. สิ่งที่ได้เรียนรู้

- **Microservices Communication:** เข้าใจว่าเซอร์วิสหลาย ๆ ตัวสื่อสารกันอย่างไรผ่าน REST API ภายใน Docker Network และข้อดีของการแยกเซอร์วิสออกจากกันในแง่ของการ Scale และการดูแลรักษา

- **TLS และ HTTPS:** เข้าใจกระบวนการสร้างใบรับรอง Self-Signed ด้วย OpenSSL และวิธีที่ Nginx ทำ TLS Termination ก่อนส่ง Request ไปยัง Backend

- **JWT Authentication Flow:** เข้าใจ Flow ตั้งแต่การออก Token จนถึงการ Verify และการใช้งานร่วมกันระหว่างหลายเซอร์วิสผ่าน Shared Secret

- **Rate Limiting ด้วย Nginx:** เรียนรู้การตั้งค่า `limit_req_zone` และ `limit_req` เพื่อป้องกัน Brute-Force และการโจมตีแบบ DDoS เบื้องต้น

- **Docker Compose Multi-Service:** เข้าใจการจัดการ Health Check, Dependency Order (`depends_on`), Volume, และ Network ใน Docker Compose สำหรับโปรเจกต์ที่มีหลายเซอร์วิส

- **Role-Based Access Control:** เข้าใจการออกแบบ RBAC เบื้องต้น โดยฝังบทบาทของผู้ใช้ไว้ใน JWT Payload แล้วตรวจสอบที่ Middleware ของแต่ละเซอร์วิส

---

## 5. การแบ่งงาน

เนื่องจากเป็นโปรเจกต์เดี่ยว ผมรับผิดชอบทุกส่วนด้วยตัวเองทั้งหมด:

| ส่วนงาน | ผู้รับผิดชอบ | สัดส่วน |
|---|---|---|
| Infrastructure & Docker Compose | นายพิชฌ์ สินธรสวัสดิ์ | 100% |
| Nginx (HTTPS, Rate Limit, Proxy) | นายพิชฌ์ สินธรสวัสดิ์ | 100% |
| auth-service | นายพิชฌ์ สินธรสวัสดิ์ | 100% |
| task-service | นายพิชฌ์ สินธรสวัสดิ์ | 100% |
| log-service | นายพิชฌ์ สินธรสวัสดิ์ | 100% |
| Database Schema & Seed Data | นายพิชฌ์ สินธรสวัสดิ์ | 100% |
| Frontend (Task Board + Log Dashboard) | นายพิชฌ์ สินธรสวัสดิ์ | 100% |

---

*รายงานนี้เป็นส่วนหนึ่งของ ENGSE207 Final Lab Set 1*
*รหัสนักศึกษา 67543210061-7 — นายพิชฌ์ สินธรสวัสดิ์*
