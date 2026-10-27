ทำ T21 ใน V1 แล้ว: ปรับขนาดเป้าหมายแตะใน CSS และเพิ่ม `aria-label` ภาษาไทย 2 จุด โดยไม่แตะ `v2/` หรือไฟล์ที่ห้ามแก้

ไฟล์ที่แก้: [style.css](</C:/Users/ASUS/OneDrive/Documents/deepseek-harness/default-workspace/english-picture-app/css/style.css>), [views.js](</C:/Users/ASUS/OneDrive/Documents/deepseek-harness/default-workspace/english-picture-app/js/views.js>), [views-speaking.js](</C:/Users/ASUS/OneDrive/Documents/deepseek-harness/default-workspace/english-picture-app/js/views-speaking.js>)

รายงานส่งมอบอยู่ที่ [T21-done.md](</C:/Users/ASUS/OneDrive/Documents/deepseek-harness/default-workspace/english-picture-app/docs/codex/inbox/T21-done.md>)

ตรวจ `git diff --check` ผ่าน แต่ยังรัน import/syntax checks และตรวจหน้าจอ 320px หรือ console ไม่ได้ เพราะ shell ไม่พบ `node` และ Chrome ใช้ผ่านเครื่องมือ UI ในเซสชันนี้ไม่ได้ รายละเอียดอยู่ในรายงานครับ