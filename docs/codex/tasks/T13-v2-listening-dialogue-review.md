# T13 — PangPood (V2) เฟส 3: บทฟัง + บทสนทนา + ทบทวน SRS เข้า engine

## บริบท
โฟลเดอร์: `english-picture-app/v2/` — **ห้ามแตะไฟล์นอก `v2/`** (V1 อยู่ที่ root)
อ่านก่อน: `v2/js/session.js`, `v2/js/views-session.js`, `v2/js/views-path.js`, `v2/js/views-quest.js`, `v2/js/progress2.js`, `v2/data/path.json`, `v2/data/listening.json`, `v2/data/dialogues.json`, `v2/js/store.js`

### สถานะล่าสุด (v2.3.0)
- เส้นทาง 12 Unit / 60 บท · จอเล่นบทเรียนมี "มาสคอส + ฟองคำพูด" · 10 ข้อ/บท · XP/ดาว/บันทึกความคืบหน้าแล้ว
- **เสียง Kokoro 2 เสียง**: `af_heart` (หญิง = `gender:'female'`) และ `am_adam` (ชาย = `'male'`) — คีย์: `word:<id>`, `sent:<id>`, `chunk:<id>`, `lis:<lessonId>:<lineIdx>`, `<dlgId>:<lineIdx>`
- **บทเรียนยังไม่ใช้**: บทฟัง (`lesson.listening[]`), บทสนทนา (`lesson.dialogue`), และยังไม่มีโหมดทบทวน

## งานที่ต้องทำ

### 1) เพิ่มแบบฝึกจากบทฟัง (ใน `v2/js/session.js`)
- ถ้า `lesson.listening[]` มีค่า → เพิ่มข้อ **2 แบบ**:
  1. `line-listen` (มีอยู่แล้ว): เล่นบรรทัด (`lis:<id>:<i>`) → เลือกความหมายไทย 4 ตัว (ใช้ `transcript[i].th` เป็นคำตอบ, ตัวลวงจากบรรทัดอื่น)
  2. `listen-question`: ใช้ `data/listening.json` → `questions[]` ที่มี `line` ตรงกัน → เล่นบรรทัดนั้น แล้วถามคำถาม (`q`) พร้อม `options` 4 ตัว (คำตอบ = `answer` index)
- จำกัด 2–3 ข้อต่อบท เพื่อไม่ให้ชุดยาวเกิน 12 ข้อ

### 2) เพิ่มแบบฝึกจากบทสนทนา
- ถ้า `lesson.dialogue` มีค่า → เพิ่มข้อ `dialog-line` **2 ข้อ**:
  - เล่นเสียงบรรทัด (`<dlgId>:<i>`) → เลือกความหมายไทย 4 ตัว (ใช้ `line.thai`; ถ้าไม่มีให้ใช้ `line.th` — ตรวจโครงสร้างจริงก่อน)
  - ข้อที่สอง: เล่นบรรทัดของ "เรา" (`who === 'me'`) → เลือกประโยคอังกฤษที่ตรง (ตัวเลือกจาก `alt[]` + บรรทัดอื่น)
- เพิ่มปุ่ม 🔊 ฟังซ้ำทุกข้อที่เกี่ยวกับเสียง (มีแล้ว)

### 3) โหมดทบทวน SRS — `#/review`
- สร้าง `v2/js/views-review.js`:
  - หาคำที่ถึงเวลาทบทวนจาก `store.js` (`srsOf(id)` / `simulate` — อ่าน API จริงก่อนใช้) ถ้าไม่มีเลยให้ใช้คำที่ "เคยตอบผิด" (เก็บใน `v2/js/session.js` ที่ `rememberReview`)
  - ใช้ engine เดิม (10 ข้อ) แล้วจบด้วยสรุป + XP
  - ถ้าไม่มีอะไรให้ทบทวน → แสดงมาสคอส `sleep` + "วันนี้ทบทวนครบแล้ว"
- เพิ่มการ์ด "ทบทวน" ในหน้า "เควส" (`v2/js/views-quest.js`) → ลิงก์ `#/review`
- เพิ่มในเมนู: หน้า "ฉัน" มีปุ่ม "ทบทวนคำที่พลาด"

### 4) ปรับ `v2/js/views-path.js`
- ถ้าบทเป็น `kind: 'review'` → node ใช้สี `--sun` และไอคอนมงกุฎ (`crown`) แทน play

### 5) ทดสอบ/ตรวจ
- `node --check` ทุกไฟล์ที่แก้
- เปิดจริง: `#/lesson?id=u2-l4` (มี dialogue) และดูว่ามีข้อ `dialog-line`; `#/lesson?id=u1-l2` (มี listening) มีข้อบทฟัง
- `#/review` เปิดได้และเล่นจนจบ
- **ห้ามมี console error**

## ข้อกำหนด
- ES modules, ไม่เพิ่ม dependency, ห้าม build step
- แก้ได้: `v2/js/session.js`, `v2/js/views-session.js`, `v2/js/views-review.js` (ใหม่), `v2/js/views-quest.js`, `v2/js/views-path.js`, `v2/js/views-me.js`, `v2/js/app.js`, `v2/css/style.css`
- **ห้ามแก้**: `v2/js/store.js` (คีย์ข้อมูล), `v2/sw.js`, `v2/js/version.js`, `v2/data/**`, ไฟล์ V1 ทั้งหมด
- ห้าม `git commit` / `git push`

## ส่งกลับ
`docs/codex/inbox/T13-done.md`: สรุป · ไฟล์ที่แตะ · วิธีตรวจด้วยมือ · ข้อจำกัด
