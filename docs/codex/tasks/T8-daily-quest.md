# T8 — ภารกิจรายวัน 5 นาที + บทสนทนาเรียนต่อเนื่อง

## บริบท
โปรเจกต์ **PicEnglish** — root: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
อ่านก่อน: `AGENTS.md` · `js/views-today.js` · `js/progress.js` · `js/store.js` · `js/views-speaking.js` (บทสนทนา)

## เป้าหมาย (2 ส่วน)

### ส่วน A — ระบบภารกิจรายวัน (Daily quest)
ตอนนี้หน้า "วันนี้" มีภารกิจตายตัว 3 ข้อ (ทวน 5 ข้อ / สนทนา 1 / พูด 60 วิ) ซึ่งไม่ครอบโหมดใหม่
→ ทำ **ระบบสร้างภารกิจอัตโนมัติ 3 ข้อ/วัน** จากสิ่งที่ผู้ใช้ควรทำจริง โดยอิงระดับ + สิ่งที่ค้าง

#### 1) `js/quest.js` (ใหม่)
```js
export function todayPlan()      // คืน [task, task, task] ของวันนี้ (คงที่ทั้งวัน)
export function taskProgress(t)  // { now, goal, done }
export function questSummary()   // { tasks:[{...t, now, goal, done}], done, total, minutes }
```
- **คงที่ทั้งวัน** (seed จากวันที่ `YYYY-MM-DD` + level) — เปลี่ยนวันจึงเปลี่ยนชุด
- คลังภารกิจ (เลือกจาก 6 แบบ):
  | key | ชื่อไทย | เป้า | ตรวจจาก |
  |---|---|---|---|
  | `review` | ทวนคำ/ประโยค | 5 ข้อ | `store.today().reviewed` |
  | `listening` | ฟัง 1 บท | 1 | `store.today().listening` |
  | `shadow` | พูดตามเงา 1 บท | 1 | `store.today().shadow` (เพิ่ม) |
  | `chunks` | ใช้ประโยคใหม่ | 3 | `store.today().chunks` (เพิ่ม) |
  | `dictation` | ฟังแล้วพิมพ์ | 1 | `store.today().dictation` (เพิ่ม) |
  | `dialogue` | สนทนา 1 สถานการณ์ | 1 | `store.today().dialogues` |
- **กฎเลือก**: ต้องมี `review` หรือ `chunks` 1 ข้อ (ทบทวน/ใช้ซ้ำ) + ต้องมี 1 ข้อที่เป็น "ฟังหรือพูด" + 1 ข้อที่ค้างมากที่สุด (จาก progress)
- รวมเวลาประมาณ ≤ 5 นาที (ใช้ `estMinutes` ต่อภารกิจ: review 1 · listening 2 · shadow 3 · chunks 2 · dictation 2 · dialogue 3)

#### 2) `js/store.js`
- `bumpDaily` รองรับ key ใหม่: `shadow`, `chunks`, `dictation` (เริ่มที่ 0, ทนข้อมูลเก่า)
- เพิ่มตัวบันทึก: `bumpShadow()`, `bumpChunks()`, `bumpDictation()` (เรียกจากโหมดนั้น ๆ เมื่อทำจบ 1 หน่วย)
  - **ต้องไปเรียกใน** `js/views-shadow.js` (จบบรรทัดที่ผ่าน/จบบท), `js/views-chunks.js` (กด "ใช้ได้แล้ว"), `js/views-dictation.js` (ผ่าน 1 ข้อ)

#### 3) `js/views-today.js`
- แทนบล็อกภารกิจเดิมด้วย `questSummary()`: แสดง 3 ข้อ พร้อมแถบความคืบหน้า + ปุ่มพาไปโหมดนั้น (ใช้ `progress.continuePoint(mode)` ถ้ามี)
- เมื่อครบทั้ง 3 → แสดงสถานะ "✓ ครบภารกิจวันนี้" + มาสคอตฉลอง + toast (ไม่ต้องมี popup ใหม่)
- คงปุ่มหลัก "เริ่มเลย" ให้ชี้ภารกิจแรกที่ยังไม่เสร็จ

### ส่วน B — บทสนทนาเรียนต่อเนื่อง
`js/views-speaking.js` (โหมด roleplay)
- จำบทสนทนาที่กำลังทำ (`store.dialogues[id]` มีอยู่) + **การ์ด "▶ เรียนต่อ: <สถานการณ์>"** บนสุดของรายการบทสนทนา
- เมื่อจบบทสนทนา (สรุป) → **auto-advance ไปบทสนทนาถัดไป** หลัง 2 วินาที (มีปุ่มยกเลิก) เว้นแต่จบครบ 8 บท → "จบโหมดแล้ว 🎉"
- ต้องยกเลิก timer เมื่อออกหน้า (cleanup)

## ข้อกำหนดทางเทคนิค
- ES modules, ไม่เพิ่ม dependency, `h()/mount()`, ข้อความไทย, 2-space, single quotes
- ใช้ `progress.js` ที่มีอยู่ (อย่าเขียนระบบความคืบหน้าซ้ำ)
- **ห้ามแก้** `js/version.js`, `sw.js`, `data/**`
- **ห้าม regex ที่มี `\/` และห้าม backtick ซ้อนใน `scripts/e2e_test.mjs`**
- ห้าม `git commit` / `git push`

## เกณฑ์ผ่าน
- [ ] `node scripts/check_imports.mjs` + `node --check` ไฟล์ใหม่ผ่าน
- [ ] `node scripts/e2e_test.mjs` ผ่านทั้งหมด (ของเดิม + 6 ใหม่)
- [ ] หน้า "วันนี้" แสดง 3 ภารกิจที่มาจาก `quest.js` (ไม่ hardcode) และกดแล้วไปโหมดถูก
- [ ] ทำภารกิจให้ครบแล้วเห็น "ครบภารกิจวันนี้"
- [ ] บทสนทนามีการ์ดเรียนต่อ + auto-advance ทำงาน
- [ ] ไม่มี JS error

## ส่งกลับ
`docs/codex/inbox/T8-done.md`: สรุป · ไฟล์ที่แตะ · ผล E2E (คัดลอกบรรทัดสรุป) · วิธีตรวจด้วยมือ · ข้อจำกัด
