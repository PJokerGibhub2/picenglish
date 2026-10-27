# T15 — PangPood (V2) แก้ 4 เรื่อง: เวอร์ชันในหน้าตั้งค่า · เสียงเอฟเฟกต์ · เสียง/ไมค์ไม่ทำงาน · จัดหน้าเรียนแนวตั้ง

## บริบท
โฟลเดอร์: `english-picture-app/v2/` — **ห้ามแตะไฟล์นอก `v2/`**
อ่านก่อน: `v2/js/views-me.js`, `v2/js/views-session.js`, `v2/js/speech.js`, `v2/js/sfx.js`, `v2/js/recorder.js`, `v2/js/listen-once.js`, `v2/js/app.js`, `v2/css/style.css`

### ปัญหาจากผู้ใช้ (ต้องแก้ให้ได้)
1. หน้าตั้งค่า **ไม่เห็นเลขเวอร์ชัน**
2. ยัง**ไม่มีเสียงตอบถูก/ตอบผิด**
3. **กดฟังเสียงไม่ดัง** และ **กดปุ่มไมค์ไม่ทำงาน** (ทั้งที่ V1 ใช้ได้) — สำคัญสุด
4. หน้าจอเรียน **ยังจัดวางไม่เป็นระเบียบ** — ต้องการแบบ **แนวตั้ง กึ่งกลางจอ**: มาสคอส → คำถาม → คำตอบ และ **ย่อขนาดทุกอย่างลง 10–15%**

## งานที่ต้องทำ

### 1) หน้าตั้งค่า (`views-me.js`) — เพิ่มแถว
- **เวอร์ชัน**: `PangPood vX.Y.Z · build 2026-10-27` (ใช้ `VERSION`, `BUILD_DATE` จาก `version.js`)
- **ปุ่ม "อัปเดตแอป"**: `caches.keys()` ลบเฉพาะ `pangpood-*` → `navigator.serviceWorker.getRegistration()` → `update()` + `unregister()` → `location.reload()`
- **ปุ่ม "ทดสอบเสียง"**: เล่น `word:feelings-kind` (female) แล้วรายงานผลเป็นข้อความ:
  - สำเร็จ → "✓ เล่นเสียงได้ (af_heart · ไฟล์ MP3)"
  - ล้มเหลว → แสดงสาเหตุจาก `speech.js` ใหม่ `audioDiagnostics()` (เช่น "ไม่มี manifest", "play() ถูกบล็อก", "ไฟล์ 404")
- **ปุ่ม "ทดสอบไมค์"**: ขอสิทธิ์ `getUserMedia({audio:true})` → อัด 2 วินาที → เล่นกลับ → แสดงผล/สาเหตุ error (`NotAllowedError`, `NotFoundError`, `SecurityError`, `in-app browser`)

### 2) เสียงเอฟเฟกต์ (`sfx.js` / `sfx2.js` ใหม่)
- เพิ่ม `sfxWrong()` = โน้ตลง 2 ตัว (Web Audio oscillator, ไม่ใช้ไฟล์ภายนอก) และ `sfxCorrect()` = โน้ตขึ้นสั้น 2 ตัว
- เรียกใน `views-session.js`:
  - ตอนตอบถูก → `sfxCorrect()` + มาสคอส `cheer`
  - ตอนผิด → `sfxWrong()` + มาสคอส `sad` (ห้ามดัง/หยาบ)
  - กดปุ่มทั่วไป → `sfxTap()`
  - จบบท → `sfxComplete()` (มีอยู่)
- ต้องดังแม้ผู้ใช้ปิด/เปิดในตั้งค่า (`store.settings().sfx !== false`)

### 3) เสียง + ไมค์ — แก้ที่ต้นเหตุ (`speech.js`, `listen-once.js`, `views-session.js`)
**เสียง:**
- ใน `playFile()`: ทำ `await audioCtx.resume()` ก่อนเล่น (ถ้ามี chain) และ **ถ้า Web Audio chain ล้มเหลว → เล่นแบบ `<audio>` ธรรมดา** (`a.volume = 1`)
- บันทึก error ล่าสุด (`lastAudioError`) + `export function audioDiagnostics()` → `{ manifestLoaded, manifestCount, lastUrl, lastError, ctxState }`
- ถ้าเล่นไม่สำเร็จ ให้ `toast('เสียงไม่เล่น — แตะอีกครั้ง')` และ **ลองใหม่แบบไม่มี chain** อัตโนมัติ 1 ครั้ง
- ตรวจ `audioUrl()` ว่าได้ URL เต็ม และไฟล์ 200 (ถ้า 404 → fallback Web Speech พร้อม log)

**ไมค์ (ข้อ speak-word):**
- ก่อนเรียก `listenOnce()` ให้ `await navigator.mediaDevices.getUserMedia({ audio: true })` แล้วปิด track (probe)
  - ถ้าล้มเหลว → แสดงข้อความไทยชัดเจน + **สลับเป็นโหมด "อัดเสียงแล้วฟังเทียบ"** อัตโนมัติ (ใช้ `recorder.js`: `startRecording` → `playBlob`) + ให้ดาวตัวเอง 1–5 → นับเป็นผ่านเมื่อ ≥3 ดาว
  - ถ้า `sttSupported()` เป็น false → ใช้โหมดอัดเสียงเทียบเลย (ไม่ต้องรอ error)
- ต้องมีปุ่ม "ข้ามข้อนี้" เสมอ (มีแล้ว) และไม่มีบทลงโทษ

### 4) จัดหน้าเรียนแนวตั้ง กึ่งกลาง (ตามภาพตัวอย่าง)
โครงใหม่ (เรียงจากบนลงล่าง, **ทั้งหมดอยู่กึ่งกลางแนวนอน**):
```
[top: ✕ .... แถบความคืบหน้า .... 2/10]
        (มาสคอส 84px — กึ่งกลาง)
   (แถวคำสั่ง: 🔊 + "ฟังแล้วเลือกความหมาย" — กึ่งกลาง)
        (ฟองคำพูด/ประโยคอังกฤษ — กึ่งกลาง กว้างสุด 92%)
        (ตัวเลือกคำตอบ — เต็มกว้าง สูง 52px)
        (ปุ่มใหญ่ล่างสุด)
```
- **ย่อขนาด 10–15%**: มาสคอส 96→84px · ฟองคำพูด padding 14→12px · ฟอนต์เป้าหมาย `clamp(1.3rem, 6.2vw, 1.75rem)` · ปุ่มตัวเลือกสูง 56→52px · ช่องไฟ gap 18→14px
- มาสคอส **อยู่เหนือคำถามเสมอ** (ไม่ใช่มุมขวาล่าง) และอยู่กึ่งกลาง
- ฟองคำพูดมีหางชี้ขึ้นหามาสคอสเล็ก ๆ (ทำได้ด้วย `::before`) — ถ้ายุ่งยากให้ใช้การ์ดมนเรียบ ๆ กึ่งกลางแทนได้
- ตัวเลือกคำตอบ: ตัวอักษรกึ่งกลาง, ข้อความตัดบรรทัดได้ (`overflow-wrap:anywhere`)
- ห้ามล้นจอที่ 320/360/390/430px

### 5) อัปเดตแอปอัตโนมัติ (`app.js`)
- เพิ่ม `navigator.serviceWorker.addEventListener('controllerchange', ...)` → `location.reload()` ครั้งเดียว (กันผู้ใช้ค้างเวอร์ชันเก่า)
- เก็บ flag ใน `sessionStorage` กัน reload ลูป

## ข้อกำหนด
- ES modules, ไม่เพิ่ม dependency, ข้อความไทย, 2-space, single quotes
- แก้ได้: `v2/js/views-me.js`, `v2/js/speech.js`, `v2/js/sfx.js`, `v2/js/views-session.js`, `v2/js/listen-once.js`, `v2/js/app.js`, `v2/css/style.css`, เพิ่ม `v2/js/sfx2.js` ได้
- **ห้ามแก้**: `v2/js/store.js`, `v2/sw.js`, `v2/js/version.js`, `v2/data/**`, ไฟล์ V1
- ห้าม `git commit` / `git push`
- `node --check` ผ่านทุกไฟล์ที่แก้

## เกณฑ์ผ่าน
- [ ] หน้าตั้งค่าเห็นเวอร์ชัน + ปุ่มอัปเดตแอป + ปุ่มทดสอบเสียง/ไมค์ ที่รายงานผลจริง
- [ ] ตอบถูกมีเสียง, ตอบผิดมีเสียง (คนละเสียง)
- [ ] `playFile` มี fallback และไม่เงียบเมื่อ Web Audio ล้มเหลว
- [ ] ข้อพูด: ถ้าไมค์ใช้ไม่ได้ → ขึ้นข้อความ + สลับเป็นอัดเสียงเทียบ + ข้ามได้
- [ ] จอเรียนแนวตั้ง มาสคอสอยู่บน กึ่งกลาง · ตัวเลือก/ปุ่มกึ่งกลาง · ไม่ล้นจอ 4 ขนาด
- [ ] ไม่มี console error

## ส่งกลับ
`docs/codex/inbox/T15-done.md`: สรุป · ไฟล์ที่แตะ · วิธีตรวจด้วยมือ · ข้อจำกัด
