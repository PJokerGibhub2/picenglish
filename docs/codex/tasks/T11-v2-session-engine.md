# T11 — PangPood (V2) เฟส 2: Session Engine (ระบบเล่นบทเรียนแบบเกม)

## บริบท
โปรเจกต์: `english-picture-app/v2/` (ชื่อแอป **PangPood / พังพูด**)
**ห้ามแตะโฟลเดอร์นอก `v2/`** — V1 คือ `english-picture-app/` (root) ต้องไม่ถูกแก้แม้แต่ไฟล์เดียว
อ่านก่อน: `v2/index.html`, `v2/css/style.css`, `v2/js/app.js`, `v2/js/views-path.js`, `v2/js/ui2.js`, `v2/js/mascot2.js`, `v2/js/progress2.js`, `v2/data/path.json`, `js/speech.js` (ต้นฉบับ), `js/listen-once.js`, `js/sfx.js`

## สถานะปัจจุบัน
- มีหน้าหลักเส้นทาง (`#/path`) + คลังคำ (`#/words`) + เควส (`#/quest`) + ฉัน (`#/me`) ทำงานได้
- `v2/data/path.json` มี 12 Unit / 60 บท แต่ละบทมี `words[]`, `chunks[]`, `listening[]`, `dialogue`, `kind`
- ข้อมูลจริง: `v2/data/words.json` (300), `chunks.json` (150), `listening.json` (45), `dialogues.json` (8), `audio/manifest.json` (1256 คีย์)
- เสียง: `sayText(text, { audioKey, gender })` จาก `v2/js/speech.js` (คีย์ `word:<id>`, `sent:<id>`, `chunk:<id>`, `lis:<id>:<line>`)

## งานที่ต้องทำ

### 1) `v2/js/session.js` — ตัวสร้างชุดแบบฝึก (logic ล้วน ไม่แตะ DOM)
```js
export function buildSession(lesson, { size = 10 } = {}) → [{ type, ...payload }]
```
ประเภทข้อ (**ต้องมีอย่างน้อย 6 แบบ**):
| type | โจทย์ | ตัวเลือก/คำตอบ |
|---|---|---|
| `word-en-th` | แสดงคำอังกฤษ + เสียง | เลือกความหมายไทย 4 ตัว |
| `word-th-en` | แสดงความหมายไทย | เลือกคำอังกฤษ 4 ตัว |
| `word-listen` | เล่นเสียงคำ | เลือกคำอังกฤษ 4 ตัว |
| `chunk-order` | ประโยคไทย | แตะชิปคำเรียงเป็นประโยคอังกฤษ |
| `chunk-type` | เล่นเสียงประโยค | พิมพ์ตาม (เทียบแบบ normalize) |
| `chunk-meaning` | ประโยคอังกฤษ + เสียง | เลือกความหมายไทย 4 ตัว |
| `line-listen` | บทฟัง 1 บรรทัด (ถ้ามี `listening`) | เลือกความหมายไทย 4 ตัว |
| `speak-word` | ให้พูดตามคำ (ถ้า `sttSupported()`) | ให้คะแนนคำ (ใช้ `js/listen-once.js` ที่คัดลอกมา) |

กติกา: ไม่ซ้ำกันในชุด, สลับลำดับ, ตัวลวงต้องไม่ซ้ำคำตอบ, จำนวนข้อ 8–12, ถ้าเนื้อหาบทน้อยให้ลดจำนวนลงได้

### 2) `v2/js/views-session.js` — จอเล่น (`#/lesson?id=<lessonId>`)
- **เต็มจอ**: ซ่อน tabbar (เพิ่มคลาส `body.in-session`), แถบบน: ✕ ปิด + แถบความคืบหน้า + `3/10`
- พื้นที่โจทย์กลางจอ ตัวใหญ่ อ่านง่าย + ปุ่ม 🔊 ฟังซ้ำไม่จำกัด (ทุกข้อที่เกี่ยวกับเสียง)
- ปุ่มตรวจ (btn3d) → แสดงผล:
  - ถูก: แถบเขียว + เสียง `sfxSuccess` + มาสคอส `cheer` + ปุ่ม "ต่อไป"
  - ผิด: แถบแดงนุ่ม + `sfxSoft` + มาสคอส `sad` + เฉลยคำตอบที่ถูก + ปุ่ม "ลองอีกครั้ง" (ได้ 1 ครั้ง) / "ต่อไป"
- **ห้ามมีหัวใจ/จำกัดจำนวนครั้ง** (เจ้าของสั่งไว้) — ผิดได้ไม่จำกัด แต่บันทึกเข้าคลัง "ต้องทบทวน"
- จบชุด: จอสรุป — % · จำนวนข้อถูก · XP ที่ได้ (+10 จบ, +2 ต่อข้อถูกครั้งแรก) · คอนเฟตตี (`confetti()` จาก ui2) + มาสคอส `cheer`
  - บันทึก `complete(lessonId, pct)` จาก `v2/js/progress2.js`
  - ปุ่ม "บทถัดไป" → `#/lesson?id=<บทถัดไป>` (บทถัดไปใน Unit เดียวกันหรือ Unit ถัดไป) + auto-advance 3 วินาที (ยกเลิกได้)
- ปุ่ม ✕ ระหว่างเล่น → ถามยืนยัน "ออกจากบทเรียน? ความคืบหน้าบทนี้จะไม่ถูกบันทึก" (sheet) — ออกแล้วไป `#/path`

### 3) เชื่อมกับหน้าเส้นทาง
- `v2/js/views-path.js`: `onNode()` ให้ไป `#/lesson?id=<id>` แทน sheet เดิม (เก็บ sheet "ดูรายละเอียด" ไว้เป็นปุ่มเล็กในใบนั้นถ้าต้องการ)
- ถ้าบทถูกจบแล้ว กดซ้ำได้ (เล่นทบทวน) — `progress2.complete()` เก็บ best score

### 4) เสียง/เอฟเฟกต์
- ใช้ `v2/js/sfx.js` ที่มี (`sfxTap`, `sfxSuccess`, `sfxSoft`) — ถ้าต้องการเสียง "ป๊อป" เพิ่ม ให้สร้างใน `v2/js/sfx2.js` ด้วย Web Audio (oscillator) **ห้ามใช้ไฟล์เสียงภายนอก**

### 5) สไตล์ (ต้องเข้ากับ V2)
- ใช้คลาส/โทเคนที่มีใน `v2/css/style.css` (--brand, --sun, --coral, btn3d, chip-btn, card)
- เพิ่มคลาสใหม่ได้ในไฟล์เดียวกัน (ต่อท้าย) เช่น `.session`, `.session-top`, `.prompt`, `.answers`, `.answer`, `.answer.correct`, `.answer.wrong`, `.feedback`
- แอนิเมชันนุ่ม ๆ 120–220ms, ห้ามกระพริบแรง, ต้องมี `prefers-reduced-motion` fallback

## ข้อกำหนดทางเทคนิค
- ES modules ล้วน ไม่มี build step ไม่มี dependency ใหม่
- สร้าง DOM ด้วย `h()`/`icon()` จาก `v2/js/ui2.js` (SVG ใช้ `icon()` เท่านั้น ห้าม `document.createElement('svg')`)
- ข้อความ UI เป็นไทย, คำอังกฤษเป็นภาษาอังกฤษ
- ทุก view คืน cleanup function และหยุดเสียง/ไมค์เมื่อออก
- `node --check` ผ่านทุกไฟล์ที่แก้ (ถ้ามี node) · ห้าม `git commit` / `git push`
- **ห้ามแก้** `v2/js/store.js` (คีย์ข้อมูล), `v2/data/**`, `v2/sw.js` (ผม bump เอง), ไฟล์ V1 ทั้งหมด

## เกณฑ์ผ่าน
- [ ] เปิด `#/lesson?id=u1-l1` แล้วเล่นได้จริงจนจบ เห็น % และ XP
- [ ] มีอย่างน้อย 6 ประเภทข้อ
- [ ] ถูก/ผิดมี feedback + มาสคอสตอบสนอง + เฉลยเมื่อผิด
- [ ] จบบทแล้วกลับเส้นทาง เห็น node เป็น "ผ่าน" (มีเครื่องหมายถูก)
- [ ] ไม่มี console error
- [ ] แอปยังใช้งานออฟไลน์ได้ (ไม่มีการเรียกเน็ตใหม่)

## ส่งกลับ
`docs/codex/inbox/T11-done.md`: สรุป · ไฟล์ที่แตะ · วิธีตรวจด้วยมือ · ข้อจำกัด
