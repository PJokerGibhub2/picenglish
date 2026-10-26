# T7 — Dictation (ฟังแล้วพิมพ์) + Sentence builder (เรียงประโยค)

## บริบท
โปรเจกต์ **PicEnglish** — root: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
อ่านก่อน: `AGENTS.md` · `js/views-chunks.js` (หน้าล่าสุด ใช้เป็นแนวทาง) · `js/progress.js` · `js/speech.js` · `js/listen-once.js`

**ของที่มีแล้ว (ไม่ต้องสร้างเนื้อหาใหม่)**
- `data/chunks.json` — **150 ประโยค** มี `id`, `en`, `th`, `level`, `situation`, `keyPhrase`, `note`
- เสียง Kokoro: คีย์ `chunk:<id>` (มีครบ 150 แล้ว ทั้ง 2 เสียง)
- `js/progress.js` — ระบบความคืบหน้า/เรียนต่อ/auto-advance (มี mode: listening, shadow, chunks)
- `store.gradeSentence(key, grade)`, `store.settings()`, `sayText(...)`, `sfx.js`

## งานที่ต้องทำ (2 โหมด)

### A) `js/views-dictation.js` — `#/dictation` (ฟังแล้วพิมพ์)
**จอ A — รายการ**
- การ์ด "ฟังแล้วพิมพ์" + คำอธิบายสั้น
- ตัวกรอง situation + level (เหมือน chunks)
- ตัวกรองสถานะ: ทั้งหมด / ยังไม่ทำ / ต้องทบทวน
- แถบความคืบหน้า "ผ่านแล้ว n/150"
- การ์ด **"▶ เรียนต่อ"** (ใช้ `progress.continuePoint('dictation')`)
- แต่ละแถว: ประโยคถูกซ่อน (แสดงเฉพาะความยาว/จำนวนคำ) + สถานะ

**จอ B — ทำข้อ (`#/dictation?id=<chunkId>`)**
1. ปุ่ม **▶ ฟัง** (เล่นซ้ำไม่จำกัด) + **🐢 0.6×** + แสดง `situation`/`level`
2. ช่องพิมพ์ (input/textarea) — รองรับคีย์บอร์ดมือถือ, `autocapitalize=off`, `spellcheck=false`
3. ปุ่ม **ตรวจคำตอบ**
   - เทียบแบบ normalize: ตัวพิมพ์เล็ก, ตัดเครื่องหมาย `.,!?'"`, ยุบช่องว่าง
   - แสดงผล **ทีละคำ**: ถูก = เขียว · ผิด/ขาด = แดง · เกิน = เทา (ขีดฆ่า)
   - คะแนน = จำนวนคำที่ถูก / จำนวนคำในประโยค (เป็น %)
   - ≥ `store.settings().passThreshold` → `sfxSuccess()` + "✓ ผ่าน X%" + ปุ่ม "ข้อถัดไป"
   - ไม่ผ่าน → `sfxSoft()` + ปุ่ม "ฟังช้า ๆ อีกครั้ง" / "ลองใหม่" / "ดูเฉลย"
4. **ดูเฉลย** → แสดงประโยคเต็ม + คำแปล + ปุ่ม 🔊 ฟังทีละคำ (แตะที่คำ)
5. บันทึก: `markComplete/ savePosition('dictation', chunkId, 0, pct)` + `store.gradeSentence('dict:' + chunkId, pct >= threshold ? 3 : 1)`
6. จบข้อ → **auto-advance** ไปข้อถัดไป (แบบเดียวกับ listening: นับถอยหลัง 2 วิ + ปุ่มยกเลิก) ห้ามเด้งเมื่อผู้ใช้ออกหน้าแล้ว

### B) `js/views-builder.js` — `#/builder` (เรียงประโยค)
**จอ A — รายการ** เหมือน dictation (ต่างแค่ชื่อ/คำอธิบาย/สถานะ)
**จอ B — ทำข้อ (`#/builder?id=<chunkId>`)**
1. แสดง **ความหมายไทย** (`th`) เป็นโจทย์ + ปุ่ม 🔊 ฟังต้นแบบ (ใช้เป็นตัวช่วย)
2. **ชิปคำ** ที่สลับลำดับแล้ว (แยกด้วยช่องว่าง; เครื่องหมายวรรคตอนติดกับคำ)
3. พื้นที่ประกอบประโยค (แตะชิปเพื่อย้ายเข้าประโยค / แตะในประโยคเพื่อย้ายกลับ)
4. ปุ่ม **ตรวจ**:
   - ถูกทั้งประโยค → เขียว + chime + ปุ่มไปต่อ
   - ผิด → ทำเครื่องหมาย **เฉพาะตำแหน่งแรกที่ผิด** (แดง) + บอก "คำที่ n ยังไม่ถูก" **ห้ามเฉลยทั้งประโยค**
   - ปุ่ม **💡 ใบ้** (เผยคำถัดไป 1 คำ) — ใช้ได้ไม่จำกัด แต่บันทึกว่าใช้ใบ้
5. ปุ่ม "ข้าม" ได้เสมอ · จบข้อ → auto-advance เหมือนกัน
6. บันทึกความคืบหน้าแบบเดียวกับ dictation (mode `builder`)

## 3) `js/progress.js`
- เพิ่ม mode `'dictation'` และ `'builder'` (modeOrder = ลำดับใน `data/chunks.json`)
- เงื่อนไขผ่าน: dictation/builder = `bestPercent >= passThreshold`
- ต้องไม่กระทบ mode เดิม

## 4) เชื่อมเข้าแอป
- `js/app.js`: routes `dictation`, `builder` + titles ("ฟังแล้วพิมพ์", "เรียงประโยค")
- หน้า "เรียน" (`js/views.js`): เพิ่มการ์ด 2 ใบ (💬 ประโยคสำเร็จรูป แล้วต่อด้วย ⌨️ ฟังแล้วพิมพ์, 🧩 เรียงประโยค) — จัดเป็นกลุ่ม "ฝึกใช้จริง"
- หน้า "วันนี้": เพิ่มทางลัด 1 ใบ (ไป `#/dictation`)
- `data/curriculum.json`: เพิ่ม task mode `dictation`/`builder` ในบทที่มี `content.chunks` **ถ้ามี** (ถ้าไม่มี chunks ในบท ให้ข้ามได้) — และอัปเดต `scripts/validate_curriculum.py` whitelist ถ้าจำเป็น

## 5) ทดสอบ (`scripts/e2e_test.mjs`) — เพิ่มอย่างน้อย 8 ข้อ
- เปิด `#/dictation` เห็นรายการ + มีการ์ดเรียนต่อ
- เข้าข้อแรก → เห็นช่องพิมพ์ + ปุ่มฟัง
- พิมพ์คำตอบผิด → เห็นผลเป็นรายคำ + คะแนน % + ปุ่มดูเฉลย
- ดูเฉลย → เห็นประโยคเต็ม
- ไปข้อถัดไปได้ (auto หรือปุ่ม)
- เปิด `#/builder` → เห็นความหมายไทย + ชิปคำ
- แตะชิปแล้วคำย้ายเข้าประโยค + ตรวจแล้วเห็นผล
- สถานะถูกบันทึก (กลับไปหน้ารายการเห็น "ผ่าน/ทำแล้ว")

## ข้อกำหนดทางเทคนิค
- ES modules, ไม่เพิ่ม dependency, `h()/mount()`, ข้อความไทย, 2-space, single quotes
- ใช้ `sayText(en, { audioKey: 'chunk:' + id, gender: S().voiceGender })`
- ทุก view คืน cleanup (ยกเลิก timer auto-advance, หยุดเสียง)
- **ห้ามแก้** `js/version.js`, `sw.js`, `data/audio/**`, `data/chunks.json`, `data/listening.json`, `data/words.json`
- **ห้าม regex ที่มี `\/` และห้าม backtick ซ้อนใน `scripts/e2e_test.mjs`**
- ห้าม `git commit` / `git push`

## เกณฑ์ผ่าน
- [ ] `node scripts/check_imports.mjs` + `node --check` ไฟล์ใหม่ผ่าน
- [ ] `python scripts/validate_chunks.py --strict` และ `scripts/validate_curriculum.py --strict` ผ่าน
- [ ] `node scripts/e2e_test.mjs` ผ่านทั้งหมด (ของเดิม + 8 ใหม่)
- [ ] ไม่มี JS error · ใช้ได้ตอนออฟไลน์

## ส่งกลับ
`docs/codex/inbox/T7-done.md`: สรุป · ไฟล์ที่แตะ · ผล validator/E2E (คัดลอกบรรทัดสรุป) · วิธีตรวจด้วยมือ · ข้อจำกัด
