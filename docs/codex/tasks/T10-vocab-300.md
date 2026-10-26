# T10 — ขยายคำศัพท์ 96 → 300 คำ (+4 หมวดใหม่) และผูกเข้าหลักสูตร

## บริบท
โปรเจกต์ **PicEnglish** — root: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
อ่านก่อน: `AGENTS.md` §5 (data rules) · `data/raw/food.json` (ตัวอย่างฟอร์แมต) · `scripts/build_data.py` · `docs/curriculum-architecture.md`

**สำคัญ: แอปไม่มีภาพแล้ว** (เพิ่งลบทั้งหมด) — จึง **ไม่ต้องใส่** `imageQuery` / `commonsCategory` / `photo` แต่คง `emoji` ไว้

## งานที่ต้องทำ

### 1) เพิ่ม 4 หมวดใหม่ ใน `scripts/build_data.py` (ตัวแปร `CATEGORIES`)
id / ชื่อไทย / ชื่ออังกฤษ / emoji / สี (hex ที่ต่างจากเดิม):
| id | ไทย | อังกฤษ | emoji | ตัวอย่างสี |
|---|---|---|---|---|
| `transport` | การเดินทางในเมือง | Getting Around | 🚌 | `#0ea5e9` |
| `phone` | โทรศัพท์และอินเทอร์เน็ต | Phone & Internet | 📱 | `#8b5cf6` |
| `bank` | ธนาคารและเงิน | Bank & Money | 🏦 | `#22c55e` |
| `emergency` | เหตุฉุกเฉินและขอความช่วยเหลือ | Help & Emergencies | 🆘 | `#ef4444` |

> ต้องได้ **12 หมวด** และ `data/categories.json` ต้องมี 12 รายการหลังรัน build

### 2) เขียนคำศัพท์ใหม่ **204 คำ** (รวมเป็น 300)
- 8 หมวดเดิม: เพิ่มหมวดละ **13 คำ** → 12 + 13 = 25 คำ/หมวด (8 × 25 = 200)
- 4 หมวดใหม่: หมวดละ **25 คำ** (100 คำ)
- รวม 300 คำพอดี · **ห้ามซ้ำคำเดิมหรือซ้ำกันเอง** (build_data.py จะ fail)
- ฟอร์แมตเดียวกับ `data/raw/food.json`:
```json
{
  "id": "transport-bus-stop",
  "word": "bus stop",
  "pos": "n.",
  "ipa": "/ˈbʌs stɒp/",
  "thai": "ป้ายรถเมล์",
  "emoji": "🚏",
  "example": "The bus stop is across the street.",
  "exampleThai": "ป้ายรถเมล์อยู่อีกฝั่งถนน",
  "keyVocab": [
    { "en": "across the street", "thai": "อีกฝั่งถนน" }
  ],
  "tip": "bus stop = จุดที่รถจอดรับผู้โดยสาร ส่วน bus station = สถานีรถโดยสารขนาดใหญ่"
}
```
**กติกา (build_data.py บังคับ)**
- `keyVocab[].en` ต้องเป็น substring ของ `example` เป๊ะ ๆ
- `example` ต้องมีคำ headword (รูปผันได้)
- `id` = `<category>-<slug>` และไม่ซ้ำ
- `thai` กระชับ ≤ 30 ตัวอักษร · `tip` เป็นเรื่องการใช้/ความสุภาพ/บริบท **ห้ามอธิบายไวยากรณ์**
- `pos` ใช้ชุดเดิม: `n.` `v.` `adj.` `adv.` `phrase`
- ห้ามมีอักษร CJK/ซีริลลิก
- ประโยคยาว 5–14 คำ · ภาษาอังกฤษธรรมชาติ

### 3) ผูกเข้า `data/curriculum.json` (สำคัญ — validator C2 บังคับ)
- ต้องมี **300/300 คำ** ถูกอ้างใน `content.words` **ครั้งเดียวต่อคำ**
- เพิ่ม unit/lesson ใหม่ให้พอ (แนะนำ: 6 unit ใหม่ × 4 lesson = 24 lesson, 8–10 คำ/lesson) โดยคงกฎ C1–C10 + `estMinutes` 3–8 + ชื่อ lesson ห้ามซ้ำใน level
- level ของคำใหม่ให้สมเหตุสมผล (คำง่าย = A0/A1.1, คำยากขึ้น = A2)

### 4) รันและตรวจ
- `python scripts/build_data.py` → ต้องผ่าน (300 คำ, 12 หมวด)
- `python scripts/validate_curriculum.py --strict` → ต้องผ่าน (300/300)
- `python scripts/validate_chunks.py --strict` → ต้องยังผ่าน

## ข้อกำหนดทางเทคนิค
- แก้เฉพาะ `data/raw/*.json` (ไฟล์ใหม่ 4 ไฟล์ + ไฟล์เดิม 8), `scripts/build_data.py` (CATEGORIES), `data/curriculum.json`
- **ห้ามแก้** `js/**`, `sw.js`, `js/version.js`, `data/words.json` (ให้ build สร้าง), `data/audio/**`, `data/chunks.json`, `data/listening.json`
- ห้าม `git commit` / `git push`

## เกณฑ์ผ่าน
- [ ] `build_data.py` ผ่าน: 300 คำ / 12 หมวด
- [ ] `validate_curriculum.py --strict` ผ่าน: คำ 300/300
- [ ] `validate_chunks.py --strict` ยังผ่าน
- [ ] ไม่มีคำซ้ำ · keyVocab ทุกตัวเป็น substring ของ example

## ส่งกลับ
`docs/codex/inbox/T10-done.md`: สรุป · จำนวนคำต่อหมวด · ไฟล์ที่แตะ · ผลของ 3 สคริปต์ (คัดลอกบรรทัดสรุป)
