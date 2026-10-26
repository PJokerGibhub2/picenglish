# T3b — หน้าจอโหมดฟัง (Listening) + ไฮไลท์คาราโอเกะ

## บริบท
โปรเจกต์ **PicEnglish** — root: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\english-picture-app`
อ่านก่อน: `AGENTS.md` · `docs/spec-listening.md` (สเปก) · `data/listening.json` (45 บท พร้อมแล้ว) · `docs/curriculum-architecture.md`

**ข้อมูลที่มีแล้ว**: `data/listening.json` (45 บท · แต่ละบทมี `transcript[]`, `targetWords[]`, `questions[]` พร้อม `line`)
**เสียง**: ไฟล์ Kokoro แยก **ทีละบรรทัด** คีย์ `lis:<lessonId>:<lineIndex>` ใน `data/audio/manifest.json`
→ ใช้ `audioUrl('lis:xxx:0', gender)` จาก `js/speech.js` เพื่อได้ URL ของ mp3

> หมายเหตุ: ไฟล์เสียงอาจยังสร้างไม่เสร็จระหว่างที่คุณทำ UI — ให้โค้ด **fallback ไป `sayText(...)`** ถ้าไม่มีไฟล์

## งานที่ต้องทำ

### 1) `js/views-listening.js` — `export function listening(root)` (มีค่า param `?id=<lessonId>` ได้)
**จอ A — รายการบทฟัง**
- การ์ดระดับ (`store.placement()?.level` ถ้ามี) + ตัวกรองระดับ (chips: ทั้งหมด / A0 / A1.1 / A1.2 / A2.1 / A2.2)
- รายการบท: emoji + ชื่อไทย + context + เวลา + จำนวนคำถาม + สถานะ (จบแล้ว/ยังไม่ทำ)
- แตะแล้วเข้าจอ B (`#/listening?id=<id>`)
- ปุ่มย้อนกลับไป `#/learn`

**จอ B — เล่นบทฟัง (หัวใจของงานนี้)**
ลำดับ 6 ขั้นตามสเปก พร้อมแถบความคืบหน้า:
1. **ก่อนฟัง** — context + คำถามนำ 1 ข้อ (ถ้ามี) + `targetWords` เป็นชิป (แตะฟังคำนั้นได้)
2. **ฟังรอบ 1** — ปุ่ม ▶ ใหญ่ · ความเร็ว 0.6/0.75/0.85/1.0 (default ตาม level) · เล่น **ต่อเนื่องทีละบรรทัด** (คีย์ `lis:<id>:<line>`) เว้นจังหวะ ~250 ms ระหว่างบรรทัด · ปุ่มหยุด
3. **ตอบคำถาม** — ทีละข้อ: คำถาม + ตัวเลือก 3–4 · ตอบแล้วเห็นผลทันที
   - ถูก → chime (`sfxSuccess`) + "✓ เข้าใจแล้ว"
   - ผิด → `sfxSoft()` + แสดงคำตอบถูก + ปุ่ม **"🔊 ฟังท่อนนี้ช้า ๆ"** (เล่นบรรทัด `question.line` ที่ 0.6x)
4. **ฟังรอบ 2 + ถอดความ** — แสดง transcript ทุกบรรทัด (en + th) **ไฮไลท์บรรทัดที่กำลังเล่น** (คาราโอเกะ) · แตะบรรทัดใดก็เล่นเฉพาะบรรทัดนั้น (0.85x)
5. **เก็บคำ** — คำที่ตอบผิด/คำเป้าหมาย → ปุ่มเพิ่มเข้า SRS (`store.gradeSentence` หรือ `store.gradeWord` ที่มีอยู่) + toast
6. **สรุป** — % ความเข้าใจ (ถ่วงน้ำหนัก gist 1.0 · detail 1.0 · number 1.0 · inference 1.5) · จำนวนข้อถูก/ทั้งหมด · คำที่ควรทวน · ปุ่ม **"ฟังอีกครั้ง"** / **"บทถัดไป"** / **"กลับรายการ"**
- **ห้ามใช้คำว่า "ตก"** — ใช้ "ฟังได้ X%" และให้กำลังใจ

**ข้อกำหนดการเล่นเสียง**
- ใช้ `audioUrl(key, S().voiceGender)` → `new Audio(url)`; ถ้าไม่มีไฟล์ ให้ `sayText(transcript[line].en, { rate, gender, audioKey: key })`
- เล่น **ทีละบรรทัดแบบเรียงลำดับ** (ไม่ใช่ไฟล์เดียวทั้งบท) เพื่อให้ไฮไลท์ตรง
- ต้องหยุดเสียงทันทีเมื่อออกจากหน้า (`cleanup`) และเมื่อกดหยุด
- ความเร็วใช้ `audio.playbackRate` (0.6–1.0) และ `preservesPitch = true`

### 2) เชื่อมเข้าแอป
- `js/app.js`: เพิ่ม route `listening` + title "ฝึกฟัง" และให้แท็บ "พูด" ไฮไลท์? **ไม่ต้อง** — ให้เพิ่มลิงก์จากหน้า "เรียน" แทน
- `js/views.js` (หน้าเรียน): เพิ่มการ์ด **"🎧 ฝึกฟัง"** ใต้ hero → `#/listening` (พร้อมจำนวนบท 45)
- หน้า "วันนี้": เพิ่มภารกิจที่ 4 **"ฟัง 1 บท"** (อ่านจำนวนจาก `store.today().listening` ที่คุณจะเพิ่ม) — ถ้ายุ่งยากให้ข้ามได้ แต่ต้องมี `store.bumpListening()` ใน `js/store.js`

### 3) ทดสอบ
เพิ่ม assertion ใน `scripts/e2e_test.mjs` (อย่างน้อย 6 ข้อ):
- เปิด `#/listening` เห็นรายการบท (≥ 10 บท)
- เปิดบทแรกได้ เห็นคำถามนำ/ปุ่มเล่น
- กดเล่นแล้วมีสถานะ "กำลังเล่น" (หรือปุ่มหยุดปรากฏ)
- ตอบข้อแรกแล้วเห็นผลถูก/ผิดทันที
- เห็น transcript หลังขั้นฟังรอบ 2
- จบแล้วเห็นสรุปเป็น % (ใช้ `?id=<lessonId>&fast=1` ให้ข้ามการเล่นเสียงได้ เพื่อทดสอบเร็ว — ต้องรองรับ)

## ข้อกำหนดทางเทคนิค
- ES modules, ไม่เพิ่ม dependency, ไม่มี build step, ใช้ `h()/mount()` จาก `js/ui.js`
- ข้อความ UI ภาษาไทย, 2-space indent, single quotes
- **ห้ามแก้** `js/version.js`, `sw.js`, `data/audio/**`, `data/listening.json`, `data/words.json`, `data/dialogues.json`, `data/curriculum.json`
- ห้าม `git commit` / `git push`
- **ห้ามใส่ regex ที่มี `\/` ลงใน `scripts/e2e_test.mjs`** (ไฟล์นั้นอยู่ใน template literal — จะพัง) ให้ใช้ `indexOf(...)` แทน

## เกณฑ์ผ่าน
- [ ] `node scripts/check_imports.mjs` ผ่าน · `node --check` ไฟล์ใหม่ผ่าน
- [ ] `node scripts/e2e_test.mjs` ผ่านทั้งหมด (ของเดิม + 6 ข้อใหม่)
- [ ] เล่นจริงได้: ฟังทีละบรรทัด · ไฮไลท์ตรง · ตอบคำถาม · สรุป %
- [ ] ไม่มี JS error

## ส่งกลับ
`docs/codex/inbox/T3b-done.md`: สรุป · ไฟล์ที่แตะ · ผล E2E (คัดลอกบรรทัดสรุป) · วิธีตรวจด้วยมือ · ข้อจำกัด
