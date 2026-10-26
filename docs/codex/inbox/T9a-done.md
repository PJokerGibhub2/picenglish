# T9a — ปิดระบบภาพและปรับการ์ดคำศัพท์

## สรุป

ปรับหน้าคำศัพท์เป็น text-first ด้วย `wordHero`: มีแถบสีหมวด monogram คำศัพท์ IPA คำแปลไทย และ POS ใช้ในแฟลชการ์ด หน้าฟัง หน้าควิซ รายการคำของฉัน และหน้าฝึกออกเสียง/ทบทวน เปลี่ยนเกมจับคู่เป็นคำอังกฤษ ↔ คำไทย และลบการเรียกภาพกับตัวเลือกภาพออฟไลน์ออกจากแอปและ service worker

## ไฟล์ที่ลบ

- `js/images.js`, `js/art.js`
- `data/art/` (ไฟล์ SVG และ manifest)

## ไฟล์ที่แก้

- `js/ui.js`, `js/views.js`, `js/views-speaking.js`, `js/app.js`, `js/store.js`
- `css/style.css`, `sw.js`, `scripts/e2e_test.mjs`

ไม่แก้ `js/version.js`, ค่า `VERSION` ใน `sw.js`, ไฟล์ข้อมูลคำศัพท์/เสียงที่ระบุห้ามแก้ หรือ commit/push

## ผลตรวจ

- ตรวจ relative import path ด้วย PowerShell: `relative-import-paths: clean`
- `git diff --check`: ผ่าน
- E2E: **ยังรันไม่ได้** — เครื่องมือนี้ไม่มี `node`/`node.exe` ใน PATH จึงยังไม่มีบรรทัดสรุปผล E2E ให้คัดลอก

## ตรวจด้วยมือเมื่อมี Node และ Chrome

1. เปิดเซิร์ฟเวอร์ในโฟลเดอร์โปรเจกต์: `python -m http.server 5173`
2. เปิดแอปที่ `http://localhost:5173/` ตรวจแฟลชการ์ดว่ามี monogram/คำ/IPA/ไทย และไม่มี `<img>` ใน `#view`
3. เปิดฟังประโยค ควิซ จับคู่ ฝึกออกเสียง ทบทวน และคำของฉัน ตรวจว่าไม่มีภาพและไม่มีช่องว่างเดิม
4. เปิดตั้งค่า ตรวจว่าไม่มีแถวภาพหรือเครดิต จากนั้นเปิดแอปซ้ำขณะออฟไลน์
5. รัน `node scripts/check_imports.mjs` และ `node scripts/e2e_test.mjs` เพื่อรับผลสรุปจริง