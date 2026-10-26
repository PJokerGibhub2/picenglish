# T6 — ประโยคสำเร็จรูป 150 ก้อน (Chunks) + หน้าเรียน

## บริบท
โปรเจกต์ **PicEnglish** — root: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
อ่านก่อน: `AGENTS.md` · `docs/curriculum-architecture.md` · `data/listening.json` (รูปแบบบทฟัง) · `js/views-listening.js`

## เป้าหมาย
สร้าง **ประโยคสำเร็จรูป (chunks) 150 ประโยค** ที่ผู้เรียนไทยใช้พูดจริงในชีวิตประจำวัน
พร้อมหน้าจอให้เลือกเรียนตามสถานการณ์ + ฟังเสียง + พูดตาม + ทำเครื่องหมายว่าใช้ได้แล้ว

## 1) `data/chunks.json`
```jsonc
{
  "version": 1,
  "chunks": [
    {
      "id": "ch-order-01",
      "en": "Could I get a medium latte, please?",
      "th": "ขอลาเต้แก้วกลางครับ",
      "situation": "cafe",          // cafe|restaurant|shopping|travel|hotel|health|work|smalltalk
      "level": "A1.1",
      "keyPhrase": "Could I get",   // วลีที่นำไปใช้ซ้ำได้
      "note": "เติม please ท้ายประโยคให้สุภาพขึ้น",   // ไทย ≤ 60 ตัวอักษร
      "tags": ["สั่งเครื่องดื่ม", "สุภาพ"]
    }
  ]
}
```
**กติกา**
- **150 ประโยคพอดี** · แบ่งตาม situation 8 กลุ่ม (กลุ่มละ 15–20)
- ระดับ: A0 20% · A1.1 30% · A1.2 25% · A2.1 15% · A2.2 10%
- ประโยคยาว 4–14 คำ · ภาษาอังกฤษธรรมชาติ · **ห้ามซ้ำกับ 45 บทฟัง และ 8 บทสนทนาเดิม** (创意ใหม่)
- `note` ต้องเป็นเรื่องการใช้/ความสุภาพ/บริบท **ห้ามอธิบายไวยากรณ์** (ตาม AGENTS.md ข้อ 5)
- `keyPhrase` ต้องเป็น substring ของ `en`
- `id` ไม่ซ้ำ · `level` ถูกต้อง · `situation` อยู่ใน 8 ค่า

## 2) `scripts/validate_chunks.py` (ใหม่)
ตรวจ: id ไม่ซ้ำ · จำนวน 150 · level/situation ถูกต้อง · keyPhrase เป็น substring · note ≤ 60 ตัวอักษร · ไม่มีประโยคซ้ำกันเอง (เทียบ `en` แบบ normalize) · ไม่ซ้ำกับ `data/listening.json` + `data/dialogues.json`
- `--strict` → exit 1 เมื่อผิด พร้อมบอก id/เหตุผล · พิมพ์ตารางสรุปตาม situation/level

## 3) เสียง Kokoro
- คีย์ `chunk:<id>` (เช่น `chunk:ch-order-01`)
- **ไม่ต้องรันสร้างเสียงเอง** — แค่แก้ `scripts/generate_kokoro.py` ให้อ่าน `data/chunks.json` แล้วเพิ่ม task `(f"chunk:{c['id']}", c['en'])` (ผู้ดูแลจะรันสร้างเสียงเอง)

## 4) `js/views-chunks.js` — `export function chunks(root, params = {})`
- Route `#/chunks`
- **ตัวกรอง**: chips ตาม `situation` (8) + ตาม level
- **การ์ดประโยค**: `en` ตัวใหญ่ · `th` · ป้าย level + situation · ปุ่ม 🔊 (ใช้ `sayText(en, { audioKey:'chunk:<id>', gender: S().voiceGender })`)
- ปุ่ม **"พูดตาม"** → ใช้ `listenOnce` (จาก `js/listen-once.js`) ให้คะแนนคำ แล้วแสดง % (ผ่านเกณฑ์ = เขียว) — ถ้าไม่มี STT ให้ใช้ `micPanel()` (A/B + ดาว)
- ปุ่ม **"ใช้ได้แล้ว"** (ทำเครื่องหมายว่าใช้คล่อง) → เก็บใน `store` (`chunks` map) + แสดงสถานะ ✓
- แถบความคืบหน้า: "ใช้ได้แล้ว n/150"
- **เรียนต่อเนื่อง**: ใช้ `js/progress.js` ที่มีอยู่ (เพิ่ม mode `'chunks'`) — มีการ์ด "▶ เรียนต่อ" และ auto-advance ไปประโยคถัดไปเมื่อทำเครื่องหมาย/ผ่าน
- เชื่อม: หน้า "เรียน" เพิ่มการ์ด "💬 ประโยคสำเร็จรูป" → `#/chunks`

## 5) store
- `store.chunks` = `{ [id]: { done: true, bestPct, updatedAt } }` + ฟังก์ชัน `markChunk(id, pct)`, `chunkState(id)`
- เพิ่ม mode `'chunks'` ใน `js/progress.js` (modeOrder อ่านจาก `data/chunks.json`) — **ห้ามทำ mode เดิมพัง**

## 6) ทดสอบ (`scripts/e2e_test.mjs`) — เพิ่มอย่างน้อย 5 ข้อ
- เปิด `#/chunks` เห็นรายการ (≥ 20 ประโยคใน DOM ที่แสดงผล)
- กรองตาม situation ได้ (จำนวนลดลง)
- กด 🔊 แล้วมีสถานะ/ไม่ error
- กด "ใช้ได้แล้ว" แล้วสถานะ ✓ ขึ้น + แถบความคืบหน้าเปลี่ยน
- มีการ์ด "เรียนต่อ" (เมื่อมีข้อมูล)

## ข้อกำหนดทางเทคนิค
- ES modules, ไม่เพิ่ม dependency, `h()/mount()`, ข้อความไทย, 2-space, single quotes
- **ห้ามแก้** `js/version.js`, `sw.js`, `data/audio/**`, `data/listening.json`, `data/words.json`, `data/dialogues.json`
- **ห้ามใส่ regex ที่มี `\/` และห้ามใช้ template literal ซ้อน (backtick) ใน `scripts/e2e_test.mjs`**
- ห้าม `git commit` / `git push`

## เกณฑ์ผ่าน
- [ ] `python scripts/validate_chunks.py --strict` ผ่าน (150 ประโยค)
- [ ] `node scripts/check_imports.mjs` + `node --check` ไฟล์ใหม่ผ่าน
- [ ] `node scripts/e2e_test.mjs` ผ่านทั้งหมด (ของเดิม + 5 ใหม่)
- [ ] ไม่มี JS error

## ส่งกลับ
`docs/codex/inbox/T6-done.md`: สรุป · ไฟล์ที่แตะ · ผล validator + E2E (คัดลอกบรรทัดสรุป) · วิธีตรวจด้วยมือ
