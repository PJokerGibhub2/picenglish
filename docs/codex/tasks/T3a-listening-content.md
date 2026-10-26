# T3a — เนื้อหาบทฟัง 45 บท + validator (ยังไม่ต้องทำ UI)

## บริบท
โปรเจกต์ **PicEnglish** — root: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
อ่านก่อน: `AGENTS.md` · `docs/curriculum-architecture.md` · **`docs/spec-listening.md`** (สเปกโหมดฟัง)
รอบนี้ทำ **เฉพาะข้อมูล + ตัวตรวจ** ยังไม่ต้องแตะ UI (จะมีงาน T3b แยก)

## งานที่ต้องทำ

### 1) `data/listening.json` — 45 บท (9 บทต่อระดับ)
ระดับ: `A0`, `A1.1`, `A1.2`, `A2.1`, `A2.2`

โครงแต่ละบท:
```jsonc
{
  "id": "lis-cafe-order-01",
  "level": "A1.1",
  "title": "สั่งกาแฟตอนเช้า",             // ไทย สั้น กระชับ
  "contextTh": "คุณยืนอยู่หน้าร้านกาแฟ",   // ไทย 1 บรรทัด
  "scene": "☕",
  "seconds": 26,
  "transcript": [
    { "en": "Good morning! What can I get you?", "th": "อรุณสวัสดิ์ครับ รับอะไรดีครับ" },
    { "en": "A medium latte, please.", "th": "ลาเต้แก้วกลางครับ" }
  ],
  "targetWords": ["food-coffee", "food-milk"],     // id จาก data/words.json (มีจริง)
  "questions": [
    { "type": "gist",   "q": "ผู้พูดอยู่ที่ไหน", "options": ["ร้านกาแฟ","โรงพยาบาล","สนามบิน","ธนาคาร"], "answer": 0, "line": 0 },
    { "type": "detail", "q": "ลูกค้าสั่งอะไร",   "options": ["ลาเต้","ชาเขียว","น้ำส้ม","โกโก้"],      "answer": 0, "line": 1 },
    { "type": "number", "q": "ขนาดใด",          "options": ["เล็ก","กลาง","ใหญ่","ไม่ระบุ"],          "answer": 1, "line": 1 }
  ]
}
```

**กติกาบังคับ**
- `transcript` 4–10 บรรทัด · ภาษาอังกฤษธรรมชาติ (บทสนทนาหรือบทพูดเดี่ยว) · คำแปลไทยตรงความ
- ความยาว/ความเร็วตามระดับ (A0 = ประโยคสั้น 3–6 คำ, A2.2 = ยาวขึ้น มีคำเชื่อม)
- `questions` 3–6 ข้อ · `type` ∈ `gist|detail|number|order|inference` · `options` 3–4 · `answer` index ถูก
- `line` = index ของบรรทัดใน `transcript` ที่มีคำตอบ (ใช้ปุ่ม "ฟังท่อนนี้ช้า ๆ")
- `targetWords` 2–4 คำ ต้องมี id จริงใน `data/words.json`
- `seconds` 8–90 (ประมาณจากความยาวบท)
- `id` ไม่ซ้ำ · แต่ละ level มี 9 บท · หัวข้อห้ามซ้ำกันภายใน level
- เนื้อหาต้อง **ไม่ซ้ำกับบทสนทนาเดิม 8 บท** ใน `data/dialogues.json` (เขียนใหม่ให้ต่างมุม)

### 2) อัปเดต `data/curriculum.json`
- เพิ่ม `content.listening` ให้แต่ละ lesson อ้างบทฟัง **ครบทั้ง 45 บท และอ้างครั้งเดียว** (บทละ 1–2 บทฟัง ตามระดับให้ตรงกัน)
- ห้ามทำให้กฎ C1–C10 เดิมพัง (คำ 96/96 · บทสนทนา 8/8 · ห้ามซ้ำ)

### 3) อัปเดต `scripts/validate_curriculum.py`
เพิ่มการตรวจบทฟัง (L1–L8) และ cross-check กับหลักสูตร
| # | กติกา |
|---|---|
| L1 | `id` ไม่ซ้ำ และขึ้นต้นด้วย `lis-` |
| L2 | `level` อยู่ใน 5 ระดับที่กำหนด |
| L3 | `transcript` 4–10 บรรทัด และทุกบรรทัดมี `en` + `th` ไม่ว่าง |
| L4 | `questions` 3–6 ข้อ · `type` ถูกต้อง · `options` 3–4 · `answer` ในช่วง |
| L5 | `line` เป็น index ที่มีอยู่จริงใน `transcript` |
| L6 | `targetWords` มีจริงใน `data/words.json` |
| L7 | `seconds` 8–90 |
| L8 | บทฟังทุกบทถูกอ้างใน `curriculum.json` **ครั้งเดียว** (นับจาก `content.listening`) |

- พิมพ์ตารางสรุปเพิ่ม: จำนวนบทฟังต่อ level, จำนวนบทที่ถูกอ้างแล้ว, จำนวนคำถามรวม
- `--strict` ต้องผ่าน (exit 0) และถ้าผิดต้อง exit 1 พร้อมบอก id/เหตุผล

## ข้อกำหนด
- ผลลัพธ์ภาษาไทยใน UI, เนื้อหาอังกฤษคุณภาพดี (ธรรมชาติ ไม่แปลไทยเป็นอังกฤษตรงตัว)
- **ห้ามแก้** `js/**`, `index.html`, `sw.js`, `data/audio/**`, `data/words.json`, `data/dialogues.json`, `scripts/models/**`
- ห้าม `git commit` / `git push`
- ห้ามใช้ dependency ภายนอกในสคริปต์ Python

## เกณฑ์ผ่าน
- [ ] `python scripts/validate_curriculum.py --strict` ผ่าน (เพิ่มตารางบทฟัง)
- [ ] `data/listening.json` มี 45 บท (9/level) ตามกติกา
- [ ] ทุกบทถูกอ้างใน curriculum ครั้งเดียว

## ส่งกลับ
`docs/codex/inbox/T3a-done.md`: สรุป · ไฟล์ที่แตะ · ผล validator (คัดลอกบรรทัดสรุป) · ข้อจำกัด
