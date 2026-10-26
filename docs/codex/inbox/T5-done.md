# T5 — เรียนต่อเนื่อง + จำตำแหน่งที่เรียน

## สรุป

- เพิ่ม `js/progress.js` เป็นโมดูลรวมสถานะและลำดับบทของ listening, shadow และ dialogue โดยอ่านความคืบหน้า legacy จาก `S.listening`, `S.shadow` และ `S.dialogues` พร้อมบันทึกตำแหน่งใหม่ใน `S.progress` โดยไม่ลบข้อมูลเดิม
- หน้า listening และ shadow แสดงความคืบหน้าโหมด การ์ดเรียนต่อ สถานะรายบท และเปิดบทจาก `?line=` ได้
- listening ผ่านที่ 60% และ shadow ผ่านเมื่อผ่านอย่างน้อย 70% ของบรรทัด บทที่ยังไม่ผ่านมีปุ่มลองใหม่และข้ามไปบทถัดไป
- เมื่อผ่านบท จะมีช่วงรอ 2 วินาทีก่อนเปิดบทถัดไป พร้อมปุ่มยกเลิก และ timer ถูกยกเลิกเมื่อออกจาก view
- หน้า “วันนี้” แสดงการ์ดเรียนต่อเมื่อพบตำแหน่ง listening หรือ shadow ที่กำลังเรียน/ควรทบทวน
- เพิ่ม E2E assertions สำหรับการ์ดเรียนต่อ, `?line=1`, สรุปและ auto-advance, สถานะผ่าน, หน้า “วันนี้” และสถานะ shadow

## ไฟล์ที่แตะ

- `js/progress.js` (ใหม่)
- `js/store.js`
- `js/views-listening.js`
- `js/views-shadow.js`
- `js/views-today.js`
- `scripts/e2e_test.mjs`
- `docs/codex/inbox/T5-done.md` (รายงานนี้)

ไม่ได้แก้ `js/version.js`, `sw.js` หรือ `data/**` และไม่ได้ commit/push

## ผลตรวจ

- `git diff --check`: ผ่าน
- `node --check`, `node scripts/check_imports.mjs`, `python scripts/validate_curriculum.py --strict` และ `node scripts/e2e_test.mjs`: ยังรันไม่ได้ใน environment นี้ เพราะไม่พบ `node`, `python`/`py` หรือ Chrome ใน `PATH` (ตรวจ `Get-Command` แล้ว)
- ดังนั้นยังไม่มีบรรทัดสรุป E2E ที่คัดลอกได้ และยังยืนยันจำนวน assertion/ผล browser runtime ไม่ได้

## วิธีตรวจด้วยมือ

1. เปิด `#/listening` หรือ `#/shadow` แล้วตรวจแถบความคืบหน้า การ์ด “เรียนต่อ” และสถานะบท
2. เปิด `#/listening?id=<id>&line=1` แล้วตรวจว่าขึ้นบรรทัด 2 และเลื่อนไปยังบรรทัดนั้น
3. ทำคำถาม listening ให้ได้อย่างน้อย 60%; ตรวจสรุปและการเปลี่ยน `id` หลัง 2 วินาที ลองกดยกเลิกและออกจากหน้าก่อน timer หมดเพื่อยืนยันว่าไม่เด้ง
4. ฝึก shadow จนครบอย่างน้อย 70% ของบรรทัด; ตรวจสรุป สถานะในรายการ และการ์ดเรียนต่อในหน้า “วันนี้”

## ข้อจำกัด

- ต้องรันชุดตรวจบนเครื่องที่มี Node.js, Python และ Chrome เพื่อยืนยัน syntax, curriculum validator และ E2E ก่อนถือว่าเกณฑ์ผ่านครบ
- dialogue มีสถานะและตำแหน่ง legacy ให้โมดูลกลางอ่านได้ แต่หน้ารายการ/การ auto-advance ที่แก้ในงานนี้มีเฉพาะ listening และ shadow ตามขอบเขตหน้าที่ระบุ
