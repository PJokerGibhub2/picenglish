# T2 — แกนหลักสูตร + ระบบวัดระดับ (Curriculum core + Placement)

## บริบท
โปรเจกต์ **PicEnglish** (PWA ออฟไลน์ สอนอังกฤษผู้ใหญ่ไทย)
Root: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
อ่านก่อนลงมือ: `AGENTS.md` (golden rules) และ **`docs/curriculum-architecture.md`** (สัญญ�้อมูล C1–C10)

## งานที่ต้องทำ (5 ส่วน)

### 1) `data/curriculum.json`
สร้างหลักสูตร 5 level ตามเอกสาร (A0, A1.1, A1.2, A2.1, A2.2)
- แต่ละ level มี 3 units, แต่ละ unit มี 2–3 lessons (รวม ~30–35 บท)
- **ต้องอ้างคำศัพท์ทั้ง 96 คำใน `data/words.json` ครบทุกคำ และบทสนทนาทั้ง 8 ใน `data/dialogues.json` ครบทุกบท** โดยแต่ละรายการเป็น "เจ้าของ" ในบทเดียวเท่านั้น
- ถ้าอยากให้บทไหนทวนของเดิม ให้ใส่ใน `revisit` (ไม่นับเป็นเจ้าของ)
- `tasks[]` ใช้เฉพาะ mode ที่อนุญาต: `listen|flashcard|quiz|match|speak|roleplay|onemin|review`
- `title` ห้ามซ้ำภายใน level เดียวกัน, `estMinutes` 3–8, `canDo[]` อย่างน้อย 1 ข้อ
- เนื้อหา/ชื่อบทเป็นภาษาไทย เข้าใจง่าย ผูกกับชีวิตจริง (ร้านกาแฟ/ร้านอาหาร/เดินทาง/ที่พัก/ช้อปปิ้ง/สุขภาพ/งาน/อารมณ์)

### 2) `scripts/validate_curriculum.py`
สคริปต์ Python มาตรวจ C1–C10 + ตรวจ `data/placement.json` (ดูข้อ 3)
- พิมพ์ตารางสรุป: จำนวน level/unit/lesson, จำนวนคำที่ถูกอ้าง/ทั้งหมด, บทสนทนาที่ถูกอ้าง/ทั้งหมด, บทที่ tasks ว่าง
- ถ้าผิดกฎให้ `sys.exit(1)` พร้อมบอกบรรทัด/เหตุผล
- ต้องรันด้วย Python 3.12 ของเครื่องนี้ได้ (ไม่มี dependency ภายนอก)
- เพิ่ม `--strict` ให้ fail ถ้ามีคำ/บทสนทนาตกหล่น (ใช้ใน CI)

### 3) `data/placement.json`
คลังข้อสอบวัดระดับ **อย่างน้อย 60 ข้อ** = 5 level × 3 skill × 4 ข้อ
- `skill`: `vocab` | `listening` | `phrase`
- ข้อ `listening` ต้องมี `audioKey` ที่มีอยู่จริงใน `data/audio/manifest.json` (เช่น `"word:food-coffee"`)
- ข้อ `vocab` ใช้คำจาก `data/words.json` (ถามความหมายไทย 4 ตัวเลือก)
- ข้อ `phrase` ถาม "สถานการณ์นี้ควรพูดว่าอะไร" (4 ตัวเลือก เป็นประโยคอังกฤษ)
- `answer` เป็น index ของข้อถูก, `options` 3–4 ตัว, `id` ไม่ซ้ำ, ระดับต้องตรงตามความยากจริง

### 4) `js/placement.js` (engine)
- `export async function loadPlacement()` อ่าน `data/placement.json`
- `export function createSession()` คืน object ที่มี: `next()` (ข้อถัดไปหรือ null), `answer(i, correct)`, `progress()`, `result()`
  - เริ่มที่ level A1.1 · ตอบถูก 2 ข้อติด → เลื่อนขึ้น · ผิด 2 ข้อติด → เลื่อนลง (ไม่ต่ำกว่า A0 / ไม่สูงกว่า A2.2)
  - หยุดเมื่อครบ **18 ข้อ** หรือทุก level มีคำตอบ ≥ 3 ข้อ
  - สลับ skill ให้ครบทั้ง 3 (ห้ามถาม skill เดียวติดกันเกิน 2 ข้อ)
- `result()` คืน `{ level, skills: { vocab, listening, phrase }, correct, total, recommendLessonId }`
- persist ผลผ่าน `store` (เพิ่ม `store.setPlacement(result)` / `store.placement()` ใน `js/store.js`)

### 5) UI + การเชื่อม
- `js/views-placement.js` → `export function placement(root)`
  - จอ 1: อธิบายสั้น ๆ "ทดสอบวัดระดับ 3 นาที" + ปุ่ม **"เริ่มทดสอบ"** และ **"ข้ามไปเริ่มจาก A0"**
  - จอ 2: ทีละข้อ แสดงความคืบหน้า `ข้อ n/18` · ข้อ listening มีปุ่ม 🔊 (เรียก `sayText(text, {audioKey, gender})` จาก `js/speech.js`) · ตอบแล้วเห็นผลถูก/ผิดทันที + ปุ่ม "ต่อไป"
  - จอ 3: สรุป `ระดับของคุณ: A1.2` + คะแนน 3 ทักษะ + ปุ่ม **"เริ่มเรียนบทแรก"** (ไป `#/learn`) และ **"ทำใหม่"**
- `index.html` + `js/app.js`: เพิ่ม route `#/placement`
- หน้า "วันนี้" (`js/views-today.js`): ถ้ายังไม่มีผลวัดระดับ ให้การ์ดเชิญชวน "วัดระดับ 3 นาที" (ไม่บังคับ) ใต้มาสคอต
- หน้า "เรียน" (`js/views.js`): เพิ่มการ์ด "ระดับของคุณ: X" ใต้ hero และถ้ามีผลแล้วให้แสดงป้ายระดับบนการ์ดหมวด (ไม่ต้องเปลี่ยนโครง grid เดิม)
- หน้าตั้งค่า: เพิ่มแถว **"ทดสอบวัดระดับใหม่"** → ไป `#/placement`
- **ห้ามพังของเดิม**: ถ้าไม่มี `data/curriculum.json` หรือโหลดไม่สำเร็จ หน้าเรียนต้องทำงานเหมือนเดิมทุกอย่าง

## ข้อกำหนดทางเทคนิค
- ES modules ล้วน, ไม่เพิ่ม dependency, ไม่มี build step
- ใช้ `h()/mount()` จาก `js/ui.js` (ห้าม innerHTML กับข้อมูลผู้ใช้)
- ข้อความ UI ภาษาไทยทั้งหมด, 2-space indent, single quotes, semicolons
- **ห้ามแก้ `js/version.js`, `sw.js`** (ผู้ดูแล bump เอง) และห้ามแตะ `data/audio/**`, `data/words.json`, `data/dialogues.json`, `scripts/models/**`
- ห้าม `git commit` / `git push`

## เกณฑ์ผ่าน
- [ ] `python scripts/validate_curriculum.py --strict` ผ่าน (คำ 96/96, บทสนทนา 8/8, ไม่มี duplicate)
- [ ] `node scripts/check_imports.mjs` ผ่าน และ `node --check` ไฟล์ใหม่ทุกไฟล์
- [ ] `node scripts/e2e_test.mjs` ผ่านทั้งหมด (เพิ่ม assertion ของ placement อย่างน้อย 4 ข้อ: มี route, เริ่มทดสอบได้, ตอบข้อแล้วเดินหน้า, เห็นผลระดับ)
- [ ] เปิด `#/placement` แล้วเล่นจบ 18 ข้อได้จริง (หรือใช้ `?short=1` ให้จบใน 5 ข้อเพื่อทดสอบ — ต้องทำงาน)
- [ ] ไม่มี JS error

## สิ่งที่ต้องส่งกลับ
เขียน `docs/codex/inbox/T2-done.md`:
1. สรุป 5–8 บรรทัด
2. รายชื่อไฟล์ที่สร้าง/แก้
3. ผลรัน validator + E2E (คัดลอกบรรทัดสรุป)
4. วิธีตรวจด้วยมือ
5. ข้อจำกัด/งานค้าง
