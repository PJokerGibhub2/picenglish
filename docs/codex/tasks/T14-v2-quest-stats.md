# T14 — PangPood (V2) เฟส 4: เควสจริง · สถิติ · หน้าฉัน · ตั้งค่า

## บริบท
โฟลเดอร์: `english-picture-app/v2/` — **ห้ามแตะไฟล์นอก `v2/`**
อ่านก่อน: `v2/js/views-quest.js`, `v2/js/views-me.js`, `v2/js/progress2.js`, `v2/js/views-session.js`, `v2/js/session.js`, `v2/js/views-path.js`, `v2/js/store.js`

### สถานะล่าสุด (v2.4.0)
- เส้นทาง 12 Unit / 60 บท · session engine 10 ประเภทข้อ (คำ/ประโยค/บทฟัง/บทสนทนา/พูด) · XP + ดาว + บันทึกความคืบหน้า
- `progress2.js`: `complete(lessonId, score)`, `stats()`, `last7()`, `bumpDaily({xp})`, `unitDone`, `sectionDone`
- `views-session.js` เก็บ "ข้อที่ต้องทบทวน" ผ่าน `rememberReview()` ในไฟล์ session
- `views-quest.js` ปัจจุบันใช้ `localStorage pangpood-v2.wordsToday` (ยังไม่มีคนเขียนค่านี้) → เควสไม่ขยับ

## งานที่ต้องทำ

### 1) ให้เควสผูกกับกิจกรรมจริง (แก้ที่ต้นเหตุ)
- เพิ่มใน `v2/js/progress2.js`:
```js
export function bumpActivity(kind, n = 1)   // kind: 'lesson' | 'review' | 'words' | 'speak' | 'listen'
export function todayActivity()             // { lesson, review, words, speak, listen }
```
  เก็บใน key `pangpood-v2.activity` = `{ "YYYY-MM-DD": { lesson: 0, review: 0, ... } }`
- เรียก:
  - `views-session.js` เมื่อจบบท → `bumpActivity('lesson')`; ทุกข้อที่ตอบถูก → `bumpActivity('words')` (หรือ `'listen'` ถ้าเป็นข้อฟัง, `'speak'` ถ้าเป็นข้อพูด)
  - `views-review.js` จบ 1 ข้อ → `bumpActivity('review')`
- `views-quest.js`: สร้างเควส 3 ข้อ/วัน (คงที่ทั้งวัน) จากชุดนี้ แล้วอ่านค่าจาก `todayActivity()`:
  | key | ข้อความ | เป้า |
  |---|---|---|
  | `lesson` | จบบทเรียน 1 บท | 1 |
  | `review` | ทบทวน 10 ข้อ | 10 |
  | `words` | ตอบถูก 15 ข้อ | 15 |
  | `listen` | ฝึกฟัง 5 ข้อ | 5 |
  | `speak` | พูด 3 ข้อ | 3 |
  - เลือกแบบ deterministic จากวันที่ (seed) แต่ **ต้องมี 1 ข้อเป็น lesson หรือ review** และ **1 ข้อเป็น listen หรือ speak**
  - แสดง `now/goal` + แถบ + เมื่อครบทั้ง 3 → มาสคอส cheer + "ครบภารกิจวันนี้" + ปุ่ม "รับ XP" (ให้ +20 XP ผ่าน `bumpDaily({xp:20})` ครั้งเดียว/วัน เก็บ flag `pangpood-v2.questClaimed`)

### 2) หน้าฉัน (`views-me.js`) ให้เต็ม
- การ์ดสรุป: XP รวม · สตรีค · บทที่จบ (x/60) · คำที่ตอบถูกวันนี้
- กราฟ 7 วัน (มีอยู่) + **แยกสีแท่ง**: ถ้า xp > 0 ใช้ `--brand`, วันนี้ใช้ `--sun`
- **ความคืบหน้าตาม Section**: 3 แถว (เอาตัวรอด / ใช้ชีวิตจริง / พูดได้จริง) พร้อม % และตัวเลขบท
- **ปุ่มทบทวน**: "ทบทวนคำที่พลาด" → `#/review`
- **ตั้งค่า**:
  - ระดับเสียง (สไลเดอร์ 1.0–2.5, บันทึก `store.setSetting('volume')`, ใช้ `setPlaybackVolume`)
  - ปุ่มทดสอบเสียง 2 ปุ่ม: "หญิง (af_heart)" / "ชาย (am_adam)" — ใช้ `sayText(..., {gender:'female'|'male'})` เท่านั้น
  - **รีเซ็ตความคืบหน้า** (ปุ่มแดง, ต้องยืนยันด้วยการพิมพ์คำว่า `รีเซ็ต` หรือกดยืนยัน 2 ชั้น) → ล้างเฉพาะ key ที่ขึ้นต้น `pangpood-v2.` (ห้ามแตะคีย์อื่น)
  - ข้อมูลเวอร์ชัน + "ทำงานออฟไลน์"
- ห้ามมีตัวเลือกเสียงจากเบราว์เซอร์

### 3) หน้าเส้นทาง — ให้เห็นความสำเร็จ
- Unit ที่จบครบ 5 บท → แสดงตราประทับ "✓ จบ Unit" ในหัว Unit (`unit-head`) + เปลี่ยนสีขอบเป็น `--brand`
- Section ที่จบครบ → แสดงแบนเนอร์เล็กท้าย Section "จบ Section แล้ว 🎉"
- ปุ่ม "คู่มือ Unit" ต้องเปิด sheet ได้ (มีอยู่) และแสดงคำศัพท์ 5 คำแรกของ Unit พร้อมปุ่มฟัง

## ข้อกำหนด
- ES modules, ไม่เพิ่ม dependency, ข้อความไทย, 2-space, single quotes
- แก้ได้: `v2/js/progress2.js`, `v2/js/views-quest.js`, `v2/js/views-me.js`, `v2/js/views-path.js`, `v2/js/views-session.js`, `v2/js/views-review.js`, `v2/css/style.css`
- **ห้ามแก้**: `v2/js/store.js` (คีย์ข้อมูล), `v2/sw.js`, `v2/js/version.js`, `v2/data/**`, ไฟล์ V1
- ห้าม `git commit` / `git push`
- `node --check` ผ่านทุกไฟล์ที่แก้

## เกณฑ์ผ่าน
- [ ] เล่นจบบท 1 ครั้ง → หน้าเควสเห็น "จบบทเรียน 1 บท" ขึ้น 1/1
- [ ] ทบทวน 1 ข้อ → เควส review ขยับ
- [ ] หน้าฉันเห็น XP/สตรีค/บทที่จบ/กราฟ 7 วัน/Section progress ครบ
- [ ] ปุ่มทดสอบเสียงทั้ง 2 เสียงเล่นได้ (af_heart / am_adam)
- [ ] รีเซ็ตแล้วค่ากลับเป็น 0 (เฉพาะ key pangpood-v2.*)
- [ ] ไม่มี console error

## ส่งกลับ
`docs/codex/inbox/T14-done.md`: สรุป · ไฟล์ที่แตะ · วิธีตรวจ · ข้อจำกัด
