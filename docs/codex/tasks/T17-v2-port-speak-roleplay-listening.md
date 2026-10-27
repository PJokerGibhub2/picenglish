# T17 — PangPood (V2) ย้ายฟีเจอร์ V1 เข้า V2 (รอบ 1/3): แท็บ "ฝึก" + ฝึกออกเสียง + บทสนทนา + ฟังบทเต็ม

## บริบท
โฟลเดอร์: `english-picture-app/v2/` — **ห้ามแตะไฟล์นอก `v2/`** (V1 อยู่ที่ root)
เป้าหมาย: ย้ายฟีเจอร์จาก V1 มาในธีม V2 **โดยใช้ข้อมูล/เสียงชุดเดิม** (ไม่สร้างเนื้อหาใหม่)

### ของที่มีให้ใช้แล้วใน V2
- `db` (300 คำ / 12 หมวด / 8 บทสนทนา), `data/listening.json` (45 บท), `data/chunks.json` (150)
- `speech.js`: `sayText(text,{audioKey,gender})`, `renderSentence`, `clearHighlight`, `speakSentence`, `alignWords`, `sentenceSimilarity`, `sttSupport`
- `listen-once.js`: `listenOnce({onInterim})`, `stopListeningOnce()`
- `store.js`: `srsOf`, `grade`, `srsOfSentence`, `gradeSentence`, `dialogueProgress`, `saveDialogueProgress`, `completedDialogues`, `shadowProgress`, `saveShadowLine`, `chunkState`, `markChunk`, `streakDays`
- `ui2.js`: `h, mount, icon, btn3d, chip-btn, sheet, toast, confetti, bar`
- `mascot2.js`: `mascot(state,size)`, `mascotReact(el,state,ms)`
- ธีม: `--brand #17C964`, `--sun`, `--coral`, `--violet`, `--sky`, `.btn3d`, `.chip`, `.card`, `.bar`

## งานที่ต้องทำ

### 1) แท็บที่ 5 "ฝึก" (`#/practice`)
- `v2/js/views-practice.js`: หน้ารวมโหมดฝึก เป็นการ์ด 2 คอลัมน์ (มือถือ 1–2 คอลัมน์) แต่ละใบ: ไอคอน SVG + ชื่อ + คำอธิบายสั้น + ลูกศร
  1. 🎤 **ฝึกออกเสียง** → `#/speak`
  2. 🎭 **บทสนทนา** → `#/roleplay`
  3. 🗣️ **พูดตามเงา** → `#/shadow` (รอบถัดไป — ใส่ป้าย "กำลังมา")
  4. 🎧 **ฟังบทเต็ม** → `#/listening`
  5. 💬 **คลังประโยค** → `#/chunks` (รอบถัดไป)
  6. 🔁 **ทบทวนประโยค** → `#/sentences` (รอบถัดไป)
- `v2/js/app.js`: เพิ่มแท็บ `practice` (label "ฝึก", icon ใหม่ `mic`) — ตอนนี้แท็บบนล่างจะมี **5 อัน**: เส้นทาง · เควส · ฝึก · คลังคำ · ฉัน (ลำดับตามนี้)

### 2) ฝึกออกเสียง (`#/speak`) — `v2/js/views-speak.js`
- สลับโหมด: **คำ** / **ประโยค** (chip 2 อัน)
- เลือกหมวดได้ (chips 12 หมวด + ทั้งหมด)
- แสดงการ์ด: ภาษาอังกฤษตัวใหญ่ + IPA + ไทย (โหมดคำ) หรือประโยคตัวอย่าง (โหมดประโยค)
- ปุ่ม **🔊 ฟังต้นแบบ** (คีย์ `word:<id>` / `sent:<id>`) + **🐢 0.6×** + **🔊 เสียงของฉัน** (ถ้าเพิ่งอัด)
- ปุ่มไมค์ใหญ่ → `listenOnce()` → ให้คะแนน (`alignWords` สำหรับประโยค / เทียบคำสำหรับคำเดียว)
  - แสดง % + ชิปคำที่ยังไม่ชัด (แตะเพื่อฟังคำนั้น)
  - ≥ `passThreshold` (ใช้ 70) → เขียว + `sfxCorrect()` + มาสคอส cheer
  - < 70 → นุ่มนวล + `sfxWrong()` (ไม่ด่า) + ปุ่ม "ลองอีกครั้ง" และ "ฟังช้า ๆ"
- **ถ้าไม่มี STT** (`sttSupport().ok === false`): สลับเป็น "อัดเสียง → ฟังเทียบ A/B → ให้ดาวตัวเอง 1–5" (ใช้ `startRecording`/`playBlob` จาก `recorder.js`)
- ปุ่ม "คำถัดไป" (สุ่มไม่ซ้ำจนครบชุด) + แถบความคืบหน้าในชุด 10 ข้อ
- บันทึก: `store.grade(id, 3|1)` (คำ) หรือ `store.gradeSentence('ex:'+id, 3|1)` (ประโยค) + `progress2.bumpActivity('speak')`

### 3) บทสนทนาเต็ม (`#/roleplay`) — `v2/js/views-roleplay.js`
- **รายการ**: 8 บท (title, titleEn, level, emoji, สถานะจบแล้ว) + การ์ด "เรียนต่อ" (บทที่ยังไม่จบ)
- **จอเล่น** (`?dlg=<id>`):
  - หัวจอ: ชื่อสถานการณ์ + `1/9` + ปุ่มออก (ยืนยัน)
  - บับเบิลคู่สนทนา/ผู้ใช้ สลับสี (คู่สนทนา = พื้นอ่อน, ผู้ใช้ = พื้น brand-soft) พร้อมปุ่ม 🔊 ต่อบรรทัด (คีย์ `<dlgId>:<i>`)
  - ถ้าเป็นบรรทัดของผู้ใช้ (`who !== 'me'` เมื่อ role = me): แสดง **ประโยคเป้าหมาย + ตัวเลือกประโยคทางเลือก (`line.alt`)** ให้แตะเลือก แล้วพูดตาม
  - กดไมค์ → `listenOnce` → เทียบกับประโยคเป้าหมาย → % + คำที่ขาด
  - ปุ่ม "ฟังประโยคนี้ก่อนพูด" + "🐢" (มีในข้อความ)
  - "ต่อไป" เลื่อนบรรทัด, "สลับบท" สลับ role, จบแล้ว → สรุป (% เฉลี่ย, จำนวนผ่าน, วลีเด่น `usefulPhrases` ที่แตะฟังได้) + `saveDialogueProgress({completed:true})`
- **ไม่มี STT** → ใช้โหมดอัดเสียงเทียบ + ดาวตัวเองเหมือนข้อ 2

### 4) ฟังบทเต็ม + คาราโอเกะ (`#/listening`) — `v2/js/views-listening.js`
- **รายการ**: 45 บท กรองตามระดับ (chips A0–A2.2) + แสดงวินาที/จำนวนคำถาม/สถานะ
- **จอเล่น** (`?id=<lessonId>`):
  - เล่นทีละบรรทัด: `sayText(line.en, { audioKey: 'lis:<id>:<i>' })` + **ไฮไลท์คำแบบคาราโอเกะ** ด้วย `renderSentence(el, line.en)` + `speakSentence(el, line.en, { audioKey })`
  - รายการบรรทัด: en (ไฮไลท์) + th ใต้, แตะ = ฟังบรรทัดนั้น, บรรทัดที่เล่นอยู่เด่น
  - ปุ่ม ▶ เล่นทั้งหมด / ⏸ หยุด / 🐢 0.7× / 🔁 ฟังบรรทัดซ้ำ
  - หลังฟังครบ: ปุ่ม "ไปตอบคำถาม" → ใช้ `questions[]` (3 ข้อ) แบบตัวเลือก + เฉลยทันที (`sfxCorrect`/`sfxWrong`)
  - จบ → สรุป % + "บทถัดไป" (auto-advance 3 วิ ยกเลิกได้) + `store.bumpListening(id, pct)` + `progress2.bumpActivity('listen')`

### 5) ข้อมูล
- เพิ่มใน `v2/js/data.js`:
```js
export async function loadListening()  // cache → db.listening (array)
export async function loadChunks()     // cache → db.chunks (array)
export function listeningById(id)      // Map
```
(ห้ามแก้ `store.js`)

## ข้อกำหนด
- ธีม V2 เท่านั้น: ใช้ `ui2.js`/`mascot2.js`/โทเคนใน `style.css` — **ห้ามลากคลาส/สไตล์ของ V1 มา**
- ภาษาไทยใน UI, อังกฤษเฉพาะเนื้อหา
- ทุก view คืน cleanup: หยุดเสียง (`stopSpeaking`), ยกเลิก timer, `stopListeningOnce()`
- ปุ่มข้าม/ออกต้องมีเสมอ · ไม่มีหัวใจ/จำกัดการเล่น
- `node --check` ผ่านทุกไฟล์ · ห้าม `git commit`/`git push`
- **ห้ามแก้**: `v2/js/store.js`, `v2/sw.js`, `v2/js/version.js`, `v2/data/**`, ไฟล์ V1

## เกณฑ์ผ่าน
- [ ] แท็บล่างมี 5 อัน และ "ฝึก" เปิดได้
- [ ] `#/speak` ให้คะแนนได้จริง (หรือ A/B เมื่อไม่มี STT) + บันทึกผล
- [ ] `#/roleplay` เล่นได้ครบ 1 บท (9 บรรทัด) + สลับบท + จบบันทึกสถานะ
- [ ] `#/listening` เล่นทีละบรรทัดมีไฮไลท์ + ตอบคำถาม 3 ข้อ + สรุปและบันทึก
- [ ] ไม่มี console error · ไม่มี scroll แนวนอนที่ 390px

## ส่งกลับ
`docs/codex/inbox/T17-done.md`: สรุป · ไฟล์ที่แตะ · วิธีตรวจ · ข้อจำกัด
