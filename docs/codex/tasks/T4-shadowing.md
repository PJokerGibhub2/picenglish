# T4 — โหมดพูดตามเงา (Shadowing)

## บริบท
โปรเจกต์ **PicEnglish** — root: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
อ่านก่อน: `AGENTS.md` · **`docs/spec-shadowing.md`** · `js/views-listening.js` (ตัวอย่างการเล่นเสียงรายบรรทัด) · `js/views-speaking.js` (ตรรกะให้คะแนนคำ)

**ของที่มีแล้ว (ไม่ต้องสร้างใหม่)**
- `data/listening.json` — 45 บท · `transcript[]` (en/th) · `targetWords[]` · `level`
- เสียง Kokoro รายบรรทัด คีย์ `lis:<lessonId>:<lineIndex>` (`audioUrl(key, gender)` ใน `js/speech.js`)
- `js/speech.js`: `sayText`, `createRecognizer`, `alignWords`, `sentenceSimilarity`
- `js/recorder.js`: `startRecording`, `playBlob`, `saveRecording`
- `js/views-speaking.js`: มี `listenOnce()` + `evaluate()` ที่ให้คะแนนคำแล้ว — **ให้ดึงตรรกะมาใช้ซ้ำ** (ถ้าจำเป็นให้แยกเป็น `js/scoring.js` แล้วให้ทั้งสองที่เรียกใช้ เพื่อไม่ให้โค้ดซ้ำ)
- `js/micfallback.js`: แผงอัดเสียง + A/B + ดาวตัวเอง (สำหรับเครื่องไม่มี STT)
- `js/sfx.js`: `sfxMicStart/sfxMicStop/sfxSuccess/sfxSoft/sfxTap`

## งานที่ต้องทำ

### 1) `js/views-shadow.js` — `export function shadow(root, params = {})`
**จอ A — รายการบท (`#/shadow`)**
- การ์ดอธิบายสั้น ๆ "พูดตามเจ้าของภาษา ทีละประโยค"
- ตัวกรองระดับ (chips: ทั้งหมด/A0/A1.1/A1.2/A2.1/A2.2)
- รายการบทจาก `data/listening.json`: emoji + ชื่อ + ระดับ + จำนวนบรรทัด + "ผ่านแล้ว x/y"
- ปุ่มย้อนกลับไป `#/learn`

**จอ B — เล่น (`#/shadow?id=<lessonId>`)**
- แถบความคืบหน้า `บรรทัด i/N`
- ประโยคต้นแบบ: `en` ตัวใหญ่ + `th` ใต้
- ปุ่ม **▶ ฟังต้นแบบ** + **🐢 0.6×** + **🔁 ฟังอีกครั้ง**
- **ปุ่มไมค์ใหญ่** (`.mic-btn`) → `listenOnce` → เทียบคำกับประโยค → `%`
  - ≥ `store.settings().passThreshold` → `sfxSuccess()` + "✓ ผ่าน X%" + ปุ่ม "บรรทัดถัดไป"
  - < threshold → `sfxSoft()` + แสดงคำที่ยังไม่ชัดเป็นชิป (แตะฟังได้) + ปุ่ม "ฟังช้า ๆ" / "ลองใหม่"
  - แสดงจำนวนครั้งที่ลอง (ไม่จำกัด) แต่ถ้าลอง ≥3 แสดงปุ่ม "ข้ามบรรทัดนี้" (gentle UX)
- **ถ้าไม่มี STT** (`sttSupport().ok === false`): ใช้ `micPanel()` แทน → อัด → A/B → ดาวตัวเอง → นับเป็น "ผ่าน" เมื่อ ≥3 ดาว
- ปุ่ม **"🔊 เสียงของฉัน"** เทียบกับต้นแบบ (ถ้ามีไฟล์เสียง)
- ปุ่มออก → กลับรายการ

**จอ C — สรุปท้ายบท (ในจอ B เมื่อจบบรรทัดสุดท้าย)**
- % เฉลี่ย, จำนวนบรรทัดที่ผ่าน/ทั้งหมด
- รายการบรรทัดที่ยังไม่ผ่าน (แตะเพื่อทวนเฉพาะบรรทัดนั้น)
- ปุ่ม "บทถัดไป" (บทถัดไปในระดับเดียวกัน) / "กลับรายการ"
- คำที่พลาดทุกบรรทัด → `store.gradeSentence('shadow:' + lessonId + ':' + lineIdx, 1)` หรือวิธีที่เหมาะกับ store ปัจจุบัน (อ่าน API ก่อนใช้)

### 2) การเก็บความคืบหน้า (`js/store.js`)
เพิ่ม (ไม่ทำลายของเดิม):
```js
export function shadowProgress(lessonId)      // { passed: number[], best: {}, } 
export function saveShadowLine(lessonId, lineIdx, pct)  // เก็บ best (max) + passed เมื่อ ≥ threshold
```
- เก็บใน `S.shadow = { [lessonId]: { best: {lineIdx: pct}, passed: [..] } }`
- ต้องทนข้อมูลเก่า/พัง (ถ้าไม่มีให้คืนค่าว่าง)

### 3) เชื่อมเข้าแอป
- `js/app.js`: route `shadow` + title "พูดตามเงา"
- `js/views.js` (หน้าเรียน): เพิ่มการ์ด **"🗣️ พูดตามเงา"** ใต้การ์ด "🎧 ฝึกฟัง" → `#/shadow`
- หน้า "วันนี้": เพิ่มทางลัด "พูดตามเงา" ในส่วน "ฝึกต่อ" (ไม่ต้องเพิ่มภารกิจใหม่)
- `data/curriculum.json`: เพิ่ม `tasks[]` mode `shadow` ให้บทที่มี `content.listening` (mode ใหม่ต้องถูก validator ยอมรับ — ถ้า validator มี whitelist ให้เพิ่ม `shadow`)

### 4) ทดสอบ (`scripts/e2e_test.mjs`) — เพิ่มอย่างน้อย 6 ข้อ
- เปิด `#/shadow` เห็นรายการ (≥ 10 บท)
- เข้าบทแรกได้ → เห็นประโยคบรรทัดแรก + ปุ่มฟัง
- กดฟังแล้วมีสถานะกำลังเล่น (หรือปุ่มหยุด)
- กดไมค์ (fake speech ตั้งค่าไว้แล้วในเทสต์) → เห็น % และปุ่มไปต่อ/ลองใหม่
- เดินจนจบ → เห็นสรุป (มี % และปุ่มกลับรายการ)
- ความคืบหน้าถูกบันทึก (เปิดบทใหม่แล้วเห็น "ผ่านแล้ว")

## ข้อกำหนดทางเทคนิค
- ES modules, ไม่เพิ่ม dependency, ไม่มี build step, ใช้ `h()/mount()` จาก `js/ui.js`
- ภาษาไทยใน UI, 2-space indent, single quotes; ทุก view คืน cleanup function และ **หยุดเสียง/ไมค์** เมื่อออก
- **ห้ามแก้** `js/version.js`, `sw.js`, `data/audio/**`, `data/listening.json`, `data/words.json`, `data/dialogues.json`
- **ห้ามใส่ regex ที่มี `\/` ใน `scripts/e2e_test.mjs`** (อยู่ใน template literal — จะพัง) ใช้ `indexOf` แทน
- ห้าม `git commit` / `git push`

## เกณฑ์ผ่าน
- [ ] `node scripts/check_imports.mjs` ผ่าน · `node --check` ไฟล์ใหม่ผ่าน
- [ ] `python scripts/validate_curriculum.py --strict` ยังผ่าน (ถ้าแก้ curriculum)
- [ ] `node scripts/e2e_test.mjs` ผ่านทั้งหมด (ของเดิม + 6 ข้อใหม่)
- [ ] ไม่มี JS error · ทำงานตอนออฟไลน์

## ส่งกลับ
`docs/codex/inbox/T4-done.md`: สรุป · ไฟล์ที่แตะ · ผล E2E (คัดลอกบรรทัดสรุป) · วิธีตรวจด้วยมือ · ข้อจำกัด
