# T7 — Dictation + Sentence builder

## สรุป

- เพิ่ม `#/dictation` สำหรับฟังและพิมพ์ มีตัวกรองรายการ, เรียนต่อ, diff รายคำ, เฉลยพร้อมเสียงรายคำ, เกณฑ์ผ่าน และ auto-advance 2 วินาทีพร้อมยกเลิก
- เพิ่ม `#/builder` สำหรับเรียงชิปคำจากโจทย์ภาษาไทย ตรวจตำแหน่งแรก ใบ้คำถัดไป และข้ามได้
- บันทึกความคืบหน้าผ่าน `progress` และ `gradeSentence`; builder เก็บสถานะการใช้ใบ้
- เพิ่มทางเข้าในหน้าเรียนและวันนี้ และเพิ่ม assertions E2E 14 ข้อสำหรับสองโหมด
- ไม่มีบทที่มี `content.chunks` ใน `data/curriculum.json` จึงไม่มีรายการ curriculum ที่ต้องเพิ่ม; เพิ่ม whitelist `dictation`/`builder` ใน validator

## ไฟล์ที่แตะ

- `js/views-chunk-practice.js` (หน้าร่วม)
- `js/views-dictation.js`, `js/views-builder.js`
- `js/progress.js`, `js/app.js`, `js/views.js`, `js/views-today.js`
- `scripts/validate_curriculum.py`, `scripts/e2e_test.mjs`
- `docs/codex/inbox/T7-done.md`

## ผลตรวจ

- `git diff --check`: ผ่าน (ไม่พบ whitespace error)
- `node scripts/check_imports.mjs`, `node --check` และ `node scripts/e2e_test.mjs`: **ยังรันไม่ได้** — ไม่มี `node` ใน PATH หรือในตำแหน่งติดตั้งมาตรฐานที่ตรวจ
- `python scripts/validate_chunks.py --strict` และ `python scripts/validate_curriculum.py --strict`: **ยังรันไม่ได้** — ไม่มี `python`/`py` ใน PATH หรือในตำแหน่งติดตั้งมาตรฐานที่ตรวจ
- สรุป E2E: `NOT RUN — node executable unavailable`
- สรุป validators: `NOT RUN — Python executable unavailable`

## ตรวจด้วยมือ

1. เปิด PicEnglish ออนไลน์หนึ่งครั้งให้ service worker โหลดแอป แล้วไปที่ `#/dictation`; ตรวจตัวกรอง, แถบผ่านแล้ว และ `▶ เรียนต่อ`
2. เปิดประโยคแรก กด `▶ ฟัง`, พิมพ์คำตอบผิด ตรวจสีรายคำ/เปอร์เซ็นต์ แล้วกด `ดูเฉลย` และแตะคำเพื่อฟัง
3. พิมพ์ประโยคตรงตามเสียง ตรวจว่าผ่าน และทดสอบปุ่ม `ข้อถัดไป` กับ `ยกเลิก` ระหว่างนับถอยหลัง
4. เปิด `#/builder`; แตะชิปเข้า/ออกพื้นที่ประกอบ ตรวจคำตอบที่ยังไม่ครบและใบ้ แล้วเรียงประโยคให้ถูกหรือกด `ข้าม`
5. กลับหน้ารายการและตรวจสถานะ จากนั้นลองเปิดโหมดที่เคยโหลดแล้วขณะออฟไลน์

## ข้อจำกัด

- ผล validator และ E2E ยังไม่ยืนยันในสภาพแวดล้อมนี้ เพราะไม่มีตัวรัน Node.js และ Python
- ไฟล์ service worker และ VERSION ไม่ได้แก้ตามข้อกำหนดของ T7; โมดูลใหม่ถูกโหลดผ่าน import ปกติและถูกแคชโดยกลยุทธ์ network-first ของ service worker หลังโหลดออนไลน์
