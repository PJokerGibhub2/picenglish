# T16 — PangPood V2 animation polish

## สรุป
- เพิ่มแอนิเมชันเข้าโจทย์และผล feedback; ปิด transition/animation เมื่อเปิด `prefers-reduced-motion: reduce`.
- เพิ่ม idle 18 วินาทีให้พังหลับและแตะ/กดเพื่อปลุก, cheer เมื่อถูก 3 ข้อติด, และตัวเลขเปอร์เซ็นต์/XP นับขึ้นในหน้าสรุป.
- เมื่อเปิดเส้นทางหลังทำ Unit ครบ 5 บท จะฉลองด้วย confetti + toast หนึ่งครั้งต่อ Unit โดยจำ `pangpood-v2.unitCelebrated`; เพิ่ม stamp, node shake และเลื่อนไป node ปัจจุบัน.
- เพิ่ม feedback การกดให้ answer, chip, node และปุ่มทั่วไปที่ระบุ พร้อม transition แถบ 260ms.

## ไฟล์ที่แตะ
- `v2/js/views-session.js`
- `v2/js/views-path.js`
- `v2/css/style.css`
- `docs/codex/inbox/T16-done.md` (รายงานส่งงานตามที่ร้องขอ)

## วิธีตรวจ
- พยายามรัน `node --check` กับไฟล์ JS ที่แก้ แต่เครื่องนี้ไม่มีคำสั่ง `node` ใน PATH และไม่พบ Node ในตำแหน่งติดตั้งมาตรฐาน จึงยังยืนยันผล syntax check ตามเกณฑ์ไม่ได้.
- ตรวจ diff และตรวจ lifecycle ของ timeout, animation frame, event listener ใน cleanup ด้วยการอ่านโค้ด.

## ข้อจำกัด
- ไม่ได้รัน browser/E2E; ต้องตรวจ `node --check v2/js/views-session.js` และ `node --check v2/js/views-path.js` เมื่อมี Node.js.
- การฉลอง Unit เกิดตอนเข้าหน้าเส้นทาง และต้องมี 5 บทครบตาม `progress2.unitDone()`.
