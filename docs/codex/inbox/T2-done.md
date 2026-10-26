# T2 — ส่งมอบแกนหลักสูตรและระบบวัดระดับ

## สรุป

- เพิ่มหลักสูตร 5 ระดับ 15 หน่วย 30 บท พร้อม can-do, เวลาเรียน, tasks และการอ้างอิงเนื้อหา
- ผูกคำศัพท์ครบ 96/96 คำ และบทสนทนา 8/8 บท โดยแต่ละรายการมีเจ้าของบทเดียว
- เพิ่มคลังข้อสอบวัดระดับ 60 ข้อ ครบ 5 ระดับ × 3 ทักษะ × 4 ข้อ และอ้าง audio manifest จริง
- เพิ่ม validator Python สำหรับ C1–C10, placement และโหมด `--strict`
- เพิ่ม engine แบบปรับระดับ บันทึกผลในเครื่อง และหน้าเริ่มทำข้อสอบ/ผลสรุป
- เชื่อมคำเชิญชวนจากหน้า “วันนี้”, ป้ายระดับในหน้า “เรียน” และทางลัดในหน้าตั้งค่า
- เพิ่ม E2E assertions สำหรับ route, เริ่มสอบ, feedback/เดินหน้า และหน้าผลระดับ

## ไฟล์สร้าง/แก้

- สร้าง: `data/curriculum.json`, `data/placement.json`, `scripts/validate_curriculum.py`, `js/placement.js`, `js/views-placement.js`, `docs/codex/inbox/T2-done.md`
- แก้: `js/app.js`, `js/store.js`, `js/views-today.js`, `js/views.js`, `scripts/e2e_test.mjs`

## ผลตรวจ

```text
สรุปหลักสูตร:
+----------------------+------------------+
| รายการ               | จำนวน            |
+----------------------+------------------+
| Level / Unit / Lesson | 5 / 15 / 30   |
| คำศัพท์อ้าง           | 96/96            |
| บทสนทนาอ้าง          | 8/8             |
| บทที่ tasks ว่าง      | 0               |
| ข้อสอบ placement      | 60              |
+----------------------+------------------+
ผ่าน: C1–C10 และ placement (strict)
git diff --check: ผ่าน (ไม่มี whitespace errors)
node scripts/check_imports.mjs: ไม่ได้รัน — session นี้ไม่มี node executable ใน PATH
node --check js/placement.js / js/views-placement.js: ไม่ได้รัน — session นี้ไม่มี node executable ใน PATH
node scripts/e2e_test.mjs: ไม่ได้รัน — session นี้ไม่มี node executable ใน PATH
```

## วิธีตรวจด้วยมือ

1. เปิดเซิร์ฟเวอร์ในโฟลเดอร์โปรเจกต์ แล้วเปิด `#/placement?short=1`
2. กด “เริ่มทดสอบ” เลือกคำตอบ 5 ข้อ และตรวจว่ามี feedback กับปุ่ม “ต่อไป” ทุกข้อ
3. ตรวจหน้าสรุประดับและคะแนนสามทักษะ จากนั้นกด “เริ่มเรียนบทแรก” หรือ “ทำใหม่”
4. ตรวจหน้า “วันนี้” ก่อนมีผลวัดระดับ, หน้า “เรียน” หลังมีผล และรายการ “ทดสอบวัดระดับใหม่” ในตั้งค่า
5. รัน `python scripts/validate_curriculum.py --strict`, `node scripts/check_imports.mjs` และ `node scripts/e2e_test.mjs` บนเครื่องที่มี Python 3.12 และ Node.js

## ข้อจำกัด/งานค้าง

- Validator strict ผ่านจริงแล้ว แต่ยังยืนยันผล E2E และ import/syntax checks ไม่ได้ เพราะ session นี้ไม่มี Node executable
- ป้ายระดับในหน้าเรียนแสดงระดับบนการ์ดหมวดตามที่ขอ ส่วนหลักสูตรยังไม่ได้แทนที่ flow เรียนคำศัพท์เดิม
- ไม่แก้ `js/version.js`, `sw.js`, `data/audio/**`, `data/words.json` หรือ `data/dialogues.json`
