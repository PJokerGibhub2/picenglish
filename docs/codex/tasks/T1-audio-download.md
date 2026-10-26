# T1 — ปุ่ม "ดาวน์โหลดเสียงทั้งหมด" (offline audio cache)

## บริบท
โปรเจกต์: **PicEnglish** — PWA สอนภาษาอังกฤษสำหรับผู้ใหญ่ไทย
โฟลเดอร์โปรเจกต์ (root ของงานนี้): `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
อ่าน `AGENTS.md` ในโฟลเดอร์นี้ก่อนลงมือ (golden rules + conventions)

## สถานะปัจจุบัน
- เสียงพูดของแอปเป็นไฟล์ **Kokoro TTS** อยู่ที่ `data/audio/f/*.mp3` (หญิง af_heart), `data/audio/m/*.mp3` (ชาย am_adam)
- `data/audio/manifest.json` = `{ "<key>": { "f": "f/x.mp3", "m": "m/x.mp3" }, ... }` (491 คีย์)
- `data/audio/meta.json` = `{ engine, voices, sampleRate, bitrate, format, count, generatedAt }`
- `js/speech.js` มี `loadAudioManifest()` และ `audioUrl(key, gender)` อยู่แล้ว
- Service worker (`sw.js`) เป็น **network-first** สำหรับ same-origin และแคชไฟล์ที่โหลดสำเร็จให้อัตโนมัติ
- แต่ถ้าผู้ใช้ยังไม่เคยกดฟังประโยคไหน ไฟล์นั้นจะยังไม่อยู่ในแคช → **ออฟไลน์แล้วไม่มีเสียง**

## งานที่ต้องทำ
เพิ่มความสามารถ "ดาวน์โหลดเสียงทั้งหมดไว้ใช้ตอนออฟไลน์" ในหน้า **ตั้งค่า** (`openSettings()` ใน `js/views.js`)

1. เพิ่มแถวใหม่ในหน้าตั้งค่า (กลุ่มเดียวกับ "ตรวจสอบไมโครโฟน" หรือกลุ่มเสียง)
   - ป้าย: **"ดาวน์โหลดเสียงทั้งหมด"**
   - คำอธิบาย: บอกจำนวนคลิปและขนาดประมาณ เช่น "491 คลิป · ประมาณ 6.6 MB — ใช้ฟังได้ตอนไม่มีเน็ต"
   - ปุ่ม: **"⬇ ดาวน์โหลด"**
2. เมื่อกด:
   - อ่าน `data/audio/manifest.json`
   - เลือกเฉพาะเสียงตาม `store.settings().voiceGender` (female → `f`, male → `m`) — ถ้าไม่มีให้ใช้ `f`
   - โหลดไฟล์ทีละไฟล์ด้วย `fetch(url, { cache: 'default' })` (ให้ service worker แคชให้)
   - แสดงความคืบหน้าเป็นข้อความ **"กำลังโหลด 123/491…"** บนแถวเดิม (ไม่ต้องมี modal)
   - เมื่อเสร็จ: เปลี่ยนปุ่มเป็น **"✅ ดาวน์โหลดครบแล้ว"** และ toast "บันทึกเสียงไว้ใช้ออฟไลน์แล้ว N คลิป"
   - ถ้ามี error บางไฟล์: นับจำนวนที่พลาดแล้ว toast "พลาด N ไฟล์ — ลองใหม่ได้" (ไม่ต้อง throw)
   - ต้องไม่บล็อก UI: ใช้ `await` ทีละไฟล์ + `requestAnimationFrame`/`await new Promise(r=>setTimeout(r,0))` ทุก ๆ 10 ไฟล์
   - ระหว่างโหลด ปุ่มต้อง `disabled` และกดซ้ำไม่ได้
3. ถ้าเบราว์เซอร์ไม่มี `caches` หรือ fetch ล้มเหลวทั้งหมด ให้แสดงข้อความสุภาพว่าโหลดไม่ได้ (ภาษาไทย)

## ข้อกำหนดทางเทคนิค (ต้องทำตาม)
- **ES modules, ไม่มี build step, ไม่เพิ่ม dependency ใหม่**
- ใช้ `h()` / `mount()` จาก `js/ui.js` เท่านั้น (ห้าม innerHTML กับข้อมูลผู้ใช้)
- ข้อความ UI เป็นภาษาไทย, 2-space indent, single quotes, semicolons
- **ห้ามแก้** `js/version.js` และ `sw.js` (ผู้ดูแลจะ bump เอง)
- ห้ามแตะ `data/audio/**`, `data/*.json`, `scripts/models/**`
- เก็บของเดิมให้ทำงานเหมือนเดิม (ห้ามลบฟีเจอร์/ข้อความเดิม)

## เกณฑ์ผ่าน (Definition of Done)
- [ ] `node --check js/views.js` ผ่าน
- [ ] `node scripts/check_imports.mjs` ผ่าน (ไม่พบ import เสีย)
- [ ] เปิดแอปแล้วเห็นแถวใหม่ในหน้าตั้งค่า และกดดาวน์โหลดแล้วตัวเลขความคืบหน้าเดินจริง
- [ ] กดซ้ำระหว่างโหลดไม่ได้
- [ ] ไม่มี JS error ใน console

## สิ่งที่ต้องส่งกลับ (เขียนไฟล์นี้ด้วย)
`docs/codex/inbox/T1-done.md` ประกอบด้วย:
1. สรุปสั้น ๆ ว่าทำอะไร (3–6 บรรทัด)
2. รายชื่อไฟล์ที่แก้ + เหตุผล
3. วิธีตรวจด้วยมือ (ขั้นตอนสั้น ๆ)
4. ข้อจำกัด/สิ่งที่ยังไม่ได้ทำ (ถ้ามี)

ห้ามรัน `git commit` หรือ `git push` — ผู้ดูแลจะตรวจและ commit เอง
