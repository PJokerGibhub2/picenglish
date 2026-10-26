# T5 — เรียนต่อเนื่อง + จำตำแหน่งที่เรียน (Learning flow & resume)

## บริบท
โปรเจกต์ **PicEnglish** — root: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
อ่านก่อน: `AGENTS.md` · `js/views-listening.js` · `js/views-shadow.js` · `js/store.js`

## ปัญหาที่ต้องแก้ (คำสั่งเจ้าของโปรเจกต์)
> "กดเล่นไปได้ต่อเนื่อง เชื่อมต่อกันในโหมดนั้น ๆ จบ ep แรกแล้วพาไปบทถัดไปเมื่อผ่านเงื่อนไข จนจบโหมด
> และต้องจำว่าเรียนถึงไหนแล้วในแต่ละโหมด/แต่ละบท จะได้เรียนต่อได้เลย ไม่ต้องเริ่มใหม่ทุกครั้ง"

## ข้อมูลที่มีอยู่แล้ว
- `store.S.listening[lessonId] = { completed, bestPercent, lastPlayed }` (ผ่าน `store.bumpListening(id, percent)`)
- `store.shadow[lessonId] = { best: { lineIdx: pct }, passed: [lineIdx] }` (ผ่าน `store.shadowProgress(id)` / `store.saveShadowLine(...)`)
- บทฟัง/พูดตามใช้ชุดบทเดียวกัน: `data/listening.json` (45 บท เรียงตาม level A0→A2.2)

## งานที่ต้องทำ

### 1) `js/progress.js` — โมดูลกลาง (ใหม่)
```js
export function modeOrder(mode)        // 'listening' | 'shadow' | 'dialogue' → รายการ id ตามลำดับที่ควรเรียน
export function lessonState(mode, id)  // { status: 'new'|'doing'|'done'|'redo', lastLine, bestPercent, updatedAt }
export function savePosition(mode, id, lineIdx, pct)   // บันทึกตำแหน่งบรรทัดล่าสุด + best%
export function markComplete(mode, id, score)          // ตั้งสถานะ done/redo ตามเงื่อนไขผ่าน
export function nextLessonId(mode, id)                 // บทถัดไปในลำดับ (null ถ้าจบโหมด)
export function continuePoint(mode)                    // { id, line, state } ของบทที่ควรทำต่อ
export function modeSummary(mode)                      // { total, done, doing, percent } สำหรับแถบความคืบหน้า
```
- เก็บใน `localStorage` ผ่าน `store` (เพิ่ม `S.progress` ถ้าต้องใช้) **แต่ต้องอ่านข้อมูลเก่าจาก `S.listening`/`S.shadow` ได้** (migration แบบไม่ทำลายข้อมูล)
- **เงื่อนไขผ่าน (pass condition)**
  - `listening`: `bestPercent >= 60` (หรือตอบถูก ≥ 60%)
  - `shadow`: ผ่านบรรทัด ≥ 70% ของบท (`passed.length / transcript.length >= 0.7`)
  - `dialogue`: จบบทสนทนา (มี `store.S.dialogues[id].completed`)
- ถ้าไม่ผ่าน → `status = 'redo'` (ไม่บล็อก แต่ติดป้าย "ควรทบทวน")

### 2) หน้ารายการของโหมด (`#/listening` และ `#/shadow`)
- **การ์ด "เรียนต่อ" ด้านบนสุด** (ถ้ามีบทที่ยังไม่จบ):
  `▶ เรียนต่อ: <ชื่อบท> · บรรทัด x/y` → กดแล้วเข้า `?id=<id>&line=<n>`
- แถบความคืบหน้าโหมด: `ผ่านแล้ว 12/45 บท (27%)`
- แต่ละบทแสดงสถานะ: `ยังไม่เริ่ม` / `กำลังเรียน (บรรทัด x)` / `✓ ผ่าน` / `↻ ควรทบทวน`
- เรียงตามลำดับ `modeOrder` (level A0 → A2.2) และมีตัวกรองระดับเหมือนเดิม

### 3) ในบทเรียน — เรียนต่อเนื่อง
- **รับ `?line=<n>`**: เปิดบทแล้วกระโดดไปบรรทัดนั้นทันที (ทั้ง listening และ shadow)
- ทุกครั้งที่เปลี่ยนบรรทัด/ตอบคำถาม → `savePosition(mode, id, lineIdx, pct)`
- **จบบท**:
  - ถ้า **ผ่านเงื่อนไข** → แสดงสรุป + **นับถอยหลัง 2 วินาที แล้วพาไปบทถัดไปอัตโนมัติ** (มีปุ่ม "ยกเลิก/อยู่หน้านี้" และข้อความ "กำลังไปบทถัดไป… 2") — ถ้าจบโหมดให้แสดง "จบโหมดแล้ว 🎉" + ปุ่มกลับรายการ
  - ถ้า **ไม่ผ่าน** → สรุป + ปุ่ม "ลองอีกครั้ง" / "ไปบทถัดไปอยู่ดี" (ไม่บังคับ)
- ต้องไม่ทำให้เทสต์เดิมพัง: ถ้าไม่ส่ง `?line` ให้เริ่มที่บรรทัด 0 เหมือนเดิม

### 4) หน้า "วันนี้" (`js/views-today.js`)
- ถ้ามีบทที่กำลังเรียนอยู่ → การ์ด **"▶ เรียนต่อ: <ชื่อบท>"** ใต้มาสคอต (แทน/เหนือภารกิจ) → ลิงก์ตรงไปยังบท+บรรทัดนั้น

### 5) ทดสอบ (`scripts/e2e_test.mjs`) — เพิ่มอย่างน้อย 6 ข้อ
- หน้ารายการ listening มีการ์ด "เรียนต่อ" เมื่อยังไม่จบบท
- เข้าบทด้วย `?line=1` แล้วเริ่มที่บรรทัดที่ 2 (ตรวจข้อความ "บรรทัด 2/")
- ทำ listening จนจบ (ใช้ `&fast=1`) → เห็นสรุป + **มีข้อความ "บทถัดไป" หรือ auto-advance** และเมื่อรอ ~2.5 วิ ระบบพาไปบทถัดไป (URL มี `id=` เปลี่ยน)
- กลับไปหน้ารายการ → บทนั้นขึ้นสถานะ "ผ่าน" และมี "% ผ่านแล้ว" ของโหมด
- shadow: เข้าบท → ทำจนจบ → มีสรุปและสถานะถูกบันทึก
- หน้า "วันนี้" มีการ์ดเรียนต่อ (เมื่อมีข้อมูล)

## ข้อกำหนดทางเทคนิค
- ES modules, ไม่เพิ่ม dependency, ใช้ `h()/mount()` จาก `js/ui.js`, ข้อความไทย
- ทุก view คืน cleanup และ **ยกเลิก timer ของ auto-advance** เมื่อออกจากหน้า (สำคัญมาก กันการเด้งผิดหน้า)
- **ห้ามแก้** `js/version.js`, `sw.js`, `data/**`
- ห้าม `git commit` / `git push`
- ห้ามใส่ regex ที่มี `\/` ใน `scripts/e2e_test.mjs`

## เกณฑ์ผ่าน
- [ ] `node scripts/check_imports.mjs` ผ่าน · `node --check` ไฟล์ใหม่ผ่าน
- [ ] `python scripts/validate_curriculum.py --strict` ผ่าน
- [ ] `node scripts/e2e_test.mjs` ผ่านทั้งหมด (ของเดิม 169 + 6 ใหม่)
- [ ] ไม่มี JS error · ใช้งานออฟไลน์ได้

## ส่งกลับ
`docs/codex/inbox/T5-done.md`: สรุป · ไฟล์ที่แตะ · ผล E2E (คัดลอกบรรทัดสรุป) · วิธีตรวจด้วยมือ · ข้อจำกัด
