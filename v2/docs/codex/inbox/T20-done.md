# T20 — PangPood V2 รอบ 3

## สรุป

- เพิ่มหน้าวัดระดับแบบเต็ม 18 ข้อและแบบสั้น 5 ข้อ พร้อมบันทึกผล แสดงทักษะที่ควรฝึก และเชื่อมบทแรกของช่วงระดับจาก `path.json`.
- เพิ่มดาวคำโปรด, ตัวกรองหมวด/โปรด/ยาก, ปุ่มทำเครื่องหมายคำยาก และการทบทวนผ่าน `#/review?mode=fav|hard`.
- เพิ่มการพูดคนเดียว 1 นาที: หัวข้อจาก SRS/หมวด/หัวข้อทั่วไป, เสียงตัวอย่าง, มิเตอร์เสียง, อัด/เล่น/ให้ดาว/บันทึก/ลบ และประวัติ 3 คลิปล่าสุด.
- เพิ่มปฏิทิน XP 28 วัน, สตรีคในหน้าฉันและ hero ของเส้นทาง, กล่องรางวัล +50 XP สัปดาห์ละครั้งหลังมี XP อย่างน้อย 3 วันใน ISO week.
- ขยายเป้าหมายวัดระดับให้จบครบจำนวนข้อ และแก้ขนาดปุ่มข้ามกับลิงก์จอเรียงประโยคตามเกณฑ์ 44px.
- เพิ่ม `scripts/sync-data.mjs` สำหรับคัดลอก JSON และเพิ่มไฟล์เสียงที่ยังไม่มี โดยไม่ลบไฟล์.

## ไฟล์ที่แตะ

- `v2/js/app.js`, `v2/js/placement.js`, `v2/js/progress2.js`
- `v2/js/views-me.js`, `v2/js/views-path.js`, `v2/js/views-practice.js`, `v2/js/views-review.js`, `v2/js/views-session.js`, `v2/js/views-words.js`
- เพิ่ม `v2/js/views-placement.js`, `v2/js/views-onemin.js`, `v2/scripts/sync-data.mjs`
- `v2/css/style.css`

## วิธีตรวจ

- `git diff --check -- v2` ผ่าน ไม่มี whitespace error.
- พยายามรัน `node --check` กับไฟล์ JS ใน `v2/js/` และ `v2/scripts/sync-data.mjs` แต่ environment นี้ไม่มีคำสั่ง `node` และไม่พบ executable ในตำแหน่งติดตั้งมาตรฐาน.
- ไม่สามารถรัน `node v2/scripts/sync-data.mjs` หรือ browser E2E ได้ด้วยเหตุเดียวกัน.
- ไม่ได้แก้ไฟล์นอก `v2/`; รายงานนี้จึงอยู่ที่ `v2/docs/codex/inbox/T20-done.md` ตามขอบเขตที่กำหนด.

## ข้อจำกัด

- ต้องรัน syntax check, sync script และทดสอบไมค์/IndexedDB ในเครื่องที่มี Node และเบราว์เซอร์พร้อมไมโครโฟน.
- การทำเครื่องหมายคำโปรด/คำยากและผล placement อาศัย localStorage; คลิปเสียงอาศัย IndexedDB ของเบราว์เซอร์.
