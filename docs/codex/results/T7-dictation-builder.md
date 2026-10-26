เพิ่มโหมด **ฟังแล้วพิมพ์** และ **เรียงประโยค** พร้อมหน้ารายการ ตัวกรอง ความคืบหน้า SRS, เฉลยและเสียงรายคำ, ใบ้ และ auto-advance ที่ยกเลิกได้ เชื่อมทางเข้าไว้ในหน้าเรียนและหน้าวันนี้แล้ว

- โค้ดหน้าฝึกอยู่ใน [views-chunk-practice.js](C:/Users/ASUS/OneDrive/Documents/deepseek-harness/default-workspace/english-picture-app/js/views-chunk-practice.js) และมีโมดูล route สำหรับแต่ละโหมด
- เพิ่ม 14 assertions ใน E2E และรองรับ `dictation`/`builder` ใน progress กับ curriculum validator
- ไม่พบ `content.chunks` ใน curriculum จึงไม่มีรายการให้เพิ่ม และไม่ได้แก้ไฟล์ที่ห้ามแตะ
- `git diff --check` ผ่าน

รายงานส่งมอบอยู่ที่ [T7-done.md](C:/Users/ASUS/OneDrive/Documents/deepseek-harness/default-workspace/english-picture-app/docs/codex/inbox/T7-done.md) แต่ยังยืนยัน import check, syntax check, validators และ E2E ไม่ได้ เพราะสภาพแวดล้อมนี้ไม่มี `node` หรือ `python` ให้เรียกใช้ครับ