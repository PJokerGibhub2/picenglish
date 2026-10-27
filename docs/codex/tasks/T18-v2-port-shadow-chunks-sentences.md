# T18 — PangPood (V2) ย้ายฟีเจอร์ V1 เข้า V2 (รอบ 2/3): พูดตามเงา + คลังประโยค + พิมพ์/เรียง + ทบทวนประโยค

## บริบท
โฟลเดอร์: `english-picture-app/v2/` — **ห้ามแตะไฟล์นอก `v2/`**
ต่อจาก T17 (มีแท็บ "ฝึก" + ฝึกออกเสียง + บทสนทนา + ฟังบทเต็ม แล้ว)
รอบนี้ทำ 4 หน้าที่ยังขาด เพื่อให้ V2 เทียบเท่า V1

### ของที่มีให้ใช้
- `data/listening.json` (45) · `data/chunks.json` (150) · `db.words` (300) · `db.dialogues` (8)
- `data.js`: `loadListening()`, `loadChunks()`, `listeningById(id)`
- `speech.js`: `sayText`, `renderSentence`, `alignWords`, `sentenceSimilarity`, `sttSupport`, `loadAudioManifest`
- `listen-once.js`, `recorder.js` (`startRecording`, `playBlob`)
- `store.js`: `shadowProgress`, `saveShadowLine`, `chunkState`, `markChunk`, `srsOfSentence`, `gradeSentence`, `dueWords`, `grade`
- `progress2.js`: `bumpActivity(kind)` (`shadow`/`chunks`/`dictation`/`words`/`listen`/`speak`)
- `ui2.js`, `mascot2.js`, `sfx.js` (`sfxCorrect`, `sfxWrong`, `sfxTap`, `sfxComplete`)

## งานที่ต้องทำ

### 1) พูดตามเงา (`#/shadow`) — `v2/js/views-shadow.js`
- **รายการ**: 45 บท (จาก listening) กรองระดับ · แสดง "ผ่านแล้ว x/y บรรทัด" จาก `shadowProgress(id)`
- **จอเล่น** (`?id=<lessonId>`):
  - บรรทัด i/N · ประโยค en (ใหญ่) + ไทย
  - ▶ ฟังต้นแบบ (`lis:<id>:<i>`) · 🐢 0.6× · 🔁 ฟังซ้ำ (ไม่จำกัด)
  - ปุ่มไมค์ใหญ่ → `listenOnce` → `alignWords(ต้นแบบ, ที่ได้ยิน)` → %
    - ≥ 70 → `saveShadowLine(id, i, pct)` + `sfxCorrect` + มาสคอส cheer + "บรรทัดถัดไป"
    - < 70 → `sfxWrong` + ชิปคำที่ยังไม่ชัด (แตะฟัง) + "ลองอีกใหม่"/"ฟังช้า ๆ"
  - ไม่มี STT → อัดเสียง → A/B → ดาวตัวเอง ≥3 = ผ่าน
  - ปุ่ม "ข้าม" เสมอ · จบ → สรุป (% เฉลี่ย, ผ่าน x/y, บรรทัดที่ยังไม่ผ่าน แตะทวนได้) + `bumpActivity('shadow')`

### 2) คลังประโยค 150 (`#/chunks`) — `v2/js/views-chunks.js`
- การ์ดประโยค: en (ใหญ่) · thai · ป้าย situation + level · สถานะ ✓ (จาก `chunkState(id).done`)
- กรอง: chips ตาม situation (8) + search ข้อความ
- ปุ่มบนการ์ด: **🔊 ฟัง** (`chunk:<id>`) · **⌨️ พิมพ์ตาม** → `#/chunks/type?id=` · **🧩 เรียงประโยค** → `#/chunks/order?id=` · **✓ ใช้ได้แล้ว**
- แถบ "ใช้ได้แล้ว n/150" ด้านบน + การ์ด "เรียนต่อ" (ประโยคแรกที่ยังไม่ ✓)

### 3) พิมพ์ตาม (`#/chunks/type?id=`) + เรียงประโยค (`#/chunks/order?id=`) — `v2/js/views-chunk-drill.js`
- ใช้ข้อมูลประโยคเดียวกับข้อ 2 (โหลด `loadChunks()`)
- **พิมพ์ตาม**: ▶ ฟัง (+0.6×) → ช่องพิมพ์ → ตรวจ → **ผลรายคำ** (ถูกเขียว/ผิดแดง/ขาดเทา) + % → ผ่าน ≥70: `markChunk(id, pct)` + `bumpActivity('dictation')` + "ประโยคถัดไป" (auto 2 วิ ยกเลิกได้) · ไม่ผ่าน: ดูเฉลย/ลองใหม่
- **เรียงประโยค**: โจทย์ไทย + ชิปคำสลับ → แตะเรียง → ตรวจ → **ชี้เฉพาะตำแหน่งแรกที่ผิด** (ไม่เฉลยทั้งประโยค) · 💡 ใบ้ทีละคำ · ข้ามได้
- ทั้งสองจอ: ปุ่มออกย้อนกลับไป `#/chunks`

### 4) ทบทวนประโยค (`#/sentences`) — `v2/js/views-sentences.js`
- ใช้ `srsOfSentence(key)` / `gradeSentence(key, g)` ของ `store.js` — **อ่าน API จริงก่อนเขียน**
- ดึงประโยคที่ถึงกำหนด: จาก `db.words` (ประโยคตัวอย่าง `example` คีย์ `ex:<wordId>`) + `chunks` (คีย์ `chunk:<id>`)
- แสดงเป็นชุด 10 ข้อ แบบ **ฟังประโยค → เลือกความหมายไทย / เรียงชิป / พิมพ์ตาม** (สลับ 3 แบบ)
- จบ → `gradeSentence(key, 3|1)` + สรุป % + XP (`pg.bumpDaily({xp:...})`)
- ถ้าไม่มีอะไรถึงกำหนด → มาสคอส `sleep` + "วันนี้ทบทวนครบแล้ว"

### 5) เปิดการ์ดในหน้า "ฝึก"
- `views-practice.js`: เปิด 3 ใบที่เหลือ (พูดตามเงา / คลังประโยค / ทบทวนประโยค) ชี้ไป route จริง (เอา badge "กำลังมา" ออก)

### 6) Router (`app.js`)
- เพิ่ม route: `shadow`, `chunks`, `chunks/type`, `chunks/order`, `sentences`
- route `chunks/type` และ `chunks/order` ต้องอ่าน `?id=` ได้ (ใช้ `parseHash()` ที่มี)
- route ที่ไม่ใช่แท็บให้ซ่อน tabbar เหมือน `lesson`/`review` (เพิ่มในเงื่อนไข `inSession`)

## ข้อกำหนด
- ธีม V2 เท่านั้น (ui2/mascot2/โทเคน) — ห้ามลากคลาส V1
- ทุก view คืน cleanup: `stopSpeaking()`, `stopListeningOnce()`, clearTimeout
- ไม่มีหัวใจ/จำกัดการเล่น · ข้ามได้เสมอ · ข้อความไทย
- `node --check` ผ่านทุกไฟล์ · ห้าม `git commit`/`git push`
- **ห้ามแก้**: `v2/js/store.js`, `v2/sw.js`, `v2/js/version.js`, `v2/data/**`, ไฟล์ V1

## เกณฑ์ผ่าน
- [ ] `#/shadow` เล่นได้ถึงจบ + บันทึก `shadowProgress`
- [ ] `#/chunks` แสดง 150 ประโยค + ฟัง + ทำ ✓ ได้
- [ ] `#/chunks/type` ตรวจรายคำได้ · `#/chunks/order` ชี้ตำแหน่งผิดได้
- [ ] `#/sentences` เปิดได้และเล่นได้ (หรือขึ้น "ทบทวนครบแล้ว")
- [ ] หน้า "ฝึก" เปิดครบ 6 ใบ
- [ ] ไม่มี console error · ไม่มี scroll แนวนอน 390px

## ส่งกลับ
`docs/codex/inbox/T18-done.md`: สรุป · ไฟล์ที่แตะ · วิธีตรวจ · ข้อจำกัด
