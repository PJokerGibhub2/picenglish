# T20 — PangPood (V2) รอบ 3: วัดระดับ · คำโปรด/คำยาก · พูดคนเดียว 1 นาที · สตรีคปฏิทิน+กล่องรางวัล + เก็บงาน QA ที่ค้าง

## บริบท
โฟลเดอร์: `english-picture-app/v2/` — **ห้ามแตะไฟล์นอก `v2/`**
ที่ต้องทำ 5 ส่วน (ทั้งหมดคือ "งานค้างที่ตรวจพบ" + ฟีเจอร์ V1 ที่ยังไม่ย้าย)

### API ที่มีให้ใช้
- `placement.js`: `await loadPlacement()` → จากนั้น `createSession({ short })` คืนออบเจ็กต์ที่มี `next()`, `answer(index, correct?)`, `finish()`/`result()` (อ่านไฟล์จริงก่อนใช้)
- `store.js`: `setPlacement(result)`, `placement()`, `isFavorite/toggleFavorite/favorites`, `isHard/toggleHard/hardWords`, `dueWords`, `srsOf`
- `recorder.js`: `startRecording({onLevel})`, `stopRecording`(อ่านชื่อจริง), `playBlob(blob)`, `saveRecording(rec)`, `listRecordings(kind)`, `recordingSupported()`, `lastMicError()`
- `progress2.js`: `stats()`, `last7()`, `bumpDaily({xp})`, `bumpActivity(kind)`
- `ui2.js`, `mascot2.js`, `sfx.js`

## งานที่ต้องทำ

### 1) วัดระดับ (`#/placement`) — `v2/js/views-placement.js`
- **จอ 1 แนะนำ**: อธิบาย "18 ข้อ ~3 นาที ระบบจะปรับระดับตามคำตอบ" + ปุ่มเริ่ม + ปุ่ม "ทำแบบสั้น (5 ข้อ)"
- **จอ 2 คำถาม**: แถบความคืบหน้า + ข้อ n/18 + คำถาม (จาก `questionBank`) + ตัวเลือก 4 ข้อ
  - ตอบแล้วไปข้อถัดไปทันที (ไม่เฉลยให้เห็นถูกผิด — เป็นการวัดระดับ)
  - ปุ่ม "ออก" มีได้ (ไม่บันทึก)
- **จอ 3 ผลลัพธ์**: ระดับที่แนะนำ (เช่น A1.2) + ทักษะที่อ่อน 2 อัน + **ปุ่ม "ไปเรียนบทนี้"** → หา lesson แรกของ level นั้นจาก `path.json` แล้ว `#/lesson?id=...`
  - `store.setPlacement(result)`
- เข้าถึงได้จาก: หน้า "ฝึก" (การ์ด "🧭 วัดระดับ") + การ์ดในหน้าเส้นทาง (ถ้ายังไม่มีผลวัดระดับ)

### 2) คำโปรด / คำยาก / คำของฉัน
- `views-words.js`: เพิ่มดาว ⭐ ต่อแถว (แตะแล้ว toggle + `sfxTap`) และในชีตคำ: ⭐ โปรด + ⚠ ยาก
- เพิ่ม chips ตัวกรอง: **ทั้งหมด / ⭐ โปรด / ⚠ ยาก** (ทำงานร่วมกับหมวด + ค้นหา)
- หน้า "ฉัน": แสดงจำนวนคำโปรด/คำยาก + ปุ่ม **"ทบทวนคำโปรด"** → `#/review?mode=fav` / **"ทบทวนคำยาก"** → `#/review?mode=hard`
- `views-review.js`: รับ `?mode=fav|hard` → ใช้ `store.favorites()` / `store.hardWords()` เป็นชุดคำ (ถ้าว่างให้แจ้งนุ่มนวล)

### 3) พูดคนเดียว 1 นาที (`#/onemin`) — `v2/js/views-onemin.js`
- หัวข้อสุ่มจาก 3 แหล่ง: คำที่ยังไม่แม่น (`store.dueWords`), หมวดที่ผู้ใช้เลือก, หรือประโยคสำเร็จรูป 1 ประโยค
- แสดงหัวข้อ + ตัวอย่างประโยคเริ่มต้น 2 ประโยค (แตะฟังได้)
- ปุ่มเริ่ม → **นับถอยหลัง 60 วิ** (วงกลม/SVG ring + ตัวเลข) + อัดเสียง (`startRecording`), ระดับเสียง (onLevel) แสดงเป็นแถบ
- หยุด (หรือครบ 60) → หน้าสรุป: ▶ ฟังเสียงตัวเอง · ให้ดาวตัวเอง 1–5 · ปุ่ม "อัดใหม่" · "บันทึก" (`saveRecording`)
- บันทึกประวัติ: แสดงรายการล่าสุด 3 รายการ (เล่นย้อนได้/ลบได้)
- ถ้าไมค์ไม่ได้ → ข้อความชัดเจน + ปุ่มย้อนกลับ (ไม่ให้จอค้าง)

### 4) สตรีคปฏิทิน + กล่องรางวัลรายสัปดาห์ (`views-me.js` + `progress2.js`)
- เพิ่มใน `progress2.js`:
```js
export function calendar(days = 28)   // [{ key, label, xp, active }] 28 วันล่าสุด
export function weekKey()             // ISO week เช่น 2026-W44
export function chestState()          // { canClaim, claimed, activeDays }
export function claimChest()          // +50 XP, สัปดาห์ละครั้ง, ต้องมี ≥3 วันที่ active
```
  เก็บใน `pangpood-v2.chest = { [weekKey]: true }`
- หน้า "ฉัน": **ปฏิทิน 28 วัน** (7 คอลัมน์) สีเข้ม = มี XP · วันนี้ขอบ `--sun` · สตรีคปัจจุบัน
- **การ์ดกล่องรางวัล**: ถ้าเข้าเงื่อนไข → ปุ่ม "เปิดกล่อง (+50 XP)" + `confetti()` + `sfxComplete()` · ถ้าเปิดแล้ว → "เปิดแล้วสัปดาห์นี้"
- หน้าเส้นทาง: แสดงสตรีคใน hero (ถ้ามี)

### 5) เก็บงาน QA ที่ค้าง (2 จุด)
- ปุ่ม "ข้ามข้อนี้" (จอพูด) ต้องสูง **≥44px** — ตรวจว่าคลาสจริงคืออะไร (`.session-skip`/อื่น) แล้วแก้ให้ตรง
- ลิงก์เล็กในจอเรียงประโยค (`a` 37×44) → `min-width:44px; display:inline-flex; align-items:center`

### 6) สคริปต์ sync ข้อมูล
- `v2/scripts/sync-data.mjs` (Node, รันเองบนเครื่อง):
  - คัดลอก `../data/{words,categories,dialogues,listening,chunks,placement}.json` → `v2/data/`
  - คัดลอก `../data/audio/**` เฉพาะไฟล์ที่ยังไม่มี (ข้ามของเดิม) + คัดลอก `manifest.json`, `meta.json`
  - พิมพ์สรุป: กี่ไฟล์ใหม่/กี่ไฟล์เปลี่ยน (เทียบขนาด+เวลา)
  - **ห้ามลบไฟล์ใน v2**

## ข้อกำหนด
- ธีม V2 (ui2/mascot2/โทเคน) · ข้อความไทย · 2-space · single quotes
- ทุก view คืน cleanup (หยุดเสียง/ไมค์, clearInterval)
- ไม่มีหัวใจ/จำกัดการเล่น · ปุ่มข้าม/ออกมีเสมอ
- `node --check` ผ่านทุกไฟล์ (รวม `v2/scripts/sync-data.mjs`)
- **ห้ามแก้**: `v2/js/store.js`, `v2/sw.js`, `v2/js/version.js`, `v2/data/**`, ไฟล์ V1
- ห้าม `git commit` / `git push`

## เกณฑ์ผ่าน
- [ ] `#/placement` เล่นจบ 18 ข้อ → ได้ระดับ + ปุ่มไปบทเรียนที่ตรง level
- [ ] คลังคำมีดาว ⭐ + ตัวกรองโปรด/ยาก ทำงาน · ทบทวนจาก `?mode=fav|hard` ได้
- [ ] `#/onemin` อัดได้ 60 วิ + ฟังย้อน + ให้ดาว + บันทึก
- [ ] หน้าฉันมีปฏิทิน 28 วัน + กล่องรางวัล (เปิดได้สัปดาห์ละครั้ง)
- [ ] ปุ่ม/ลิงก์ ≥44px ทั้งหมด (เหลือ 0 warn ใน QA audit)
- [ ] `node v2/scripts/sync-data.mjs` รันแล้วสรุปผลได้ (ไม่ลบไฟล์)

## ส่งกลับ
`docs/codex/inbox/T20-done.md`: สรุป · ไฟล์ที่แตะ · วิธีตรวจ · ข้อจำกัด
