ทำ T9a แล้ว: ลบ `js/images.js`, `js/art.js` และ `data/art/`; ถอดการเรียกภาพออกจากแอปและ service worker; เพิ่ม `wordHero` และเปลี่ยนเกมจับคู่เป็นคำอังกฤษ ↔ คำไทย โดยคง `VERSION` และไฟล์ข้อมูลที่ห้ามแก้ไว้

เพิ่ม E2E assertions สำหรับการ์ดข้อความ ควิซ เกมจับคู่ และการตั้งค่าแล้ว แต่ยังรันชุดทดสอบไม่ได้ เพราะเครื่องนี้ไม่มี Node.js ใน PATH ตรวจ relative import paths และ `git diff --check` แล้วผ่าน

สรุปและวิธีตรวจด้วยมืออยู่ที่ [T9a-done.md](/C:/Users/ASUS/OneDrive/Documents/deepseek-harness/default-workspace/english-picture-app/docs/codex/inbox/T9a-done.md).