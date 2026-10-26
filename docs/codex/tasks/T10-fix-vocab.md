# T10-fix — เติมคำให้ครบ 300 (ห้ามเขียนทับไฟล์เดิม) + ผูกหลักสูตร

## สถานะปัจจุบัน (ผมคืนไฟล์ให้แล้ว)
- 8 หมวดเดิม = **12 คำ/หมวด (96 คำ)** — JSON array ของ **object** (ถูกต้อง)
- 4 หมวดใหม่ที่คุณสร้าง = `bank`, `emergency`, `phone`, `transport` = **25 คำ/หมวด (100 คำ)** — ถูกต้อง
- รวมตอนนี้ **196 คำ** · `data/curriculum.json` ถูกคืนกลับ (อ้างถึง 96 คำเดิมเท่านั้น)
- **ห้ามรัน** `scripts/build_data.py` / validator (เครื่องคุณไม่มี python) — ผู้ดูแลจะรันเอง

## 🚨 ข้อผิดพลาดครั้งก่อน (ห้ามทำซ้ำ)
คุณเขียนทับ `data/raw/{food,restaurant,travel,home,shopping,health,work,feelings}.json`
ด้วย **array ของ string** (`["breakfast","lunch",...]`) ทำให้ข้อมูล IPA/ไทย/ประโยคหายทั้งหมด และ `build_data.py` crash
**⇒ ไฟล์ raw ต้องเป็น array ของ object เท่านั้น และต้องไม่ลบของเดิม**

## งานที่ต้องทำ

### 1) เติม 13 คำใหม่ ต่อหมวด (8 หมวดเดิม) = +104 คำ
- อ่านไฟล์เดิม → **ต่อท้าย** array ด้วย 13 object ใหม่ (คง 12 เดิมไว้ครบ)
- ผลลัพธ์: แต่ละไฟล์ **25 object** → 8 × 25 = 200 คำ
- ฟิลด์บังคับ (ตาม `data/raw/food.json`): `id`, `word`, `pos`, `ipa`, `thai`, `emoji`, `example`, `exampleThai`, `keyVocab[{en,thai}]`, `tip`
- **ห้ามใส่** `imageQuery` / `commonsCategory` (แอปไม่มีภาพแล้ว)
- `id` = `<category>-<slug>` ไม่ซ้ำกับที่มีอยู่ · ห้ามซ้ำคำกับ 196 คำปัจจุบัน
- `keyVocab[].en` ต้องเป็น substring ของ `example` · `example` มี headword · `tip` = การใช้/บริบท (ห้ามไวยากรณ์)

### 2) ผูกเข้า `data/curriculum.json` ให้ครบ 300 คำ (validator C2)
- เพิ่ม unit/lesson ใหม่ (แนะนำ 6 unit × 4 lesson = 24 lesson) ให้ `content.words` อ้างคำ **ครบทั้ง 300 คำ ครั้งเดียวต่อคำ**
- คงกฎเดิม: C1 ids ไม่ซ้ำ · C6 title ไม่ซ้ำใน level · C7 mode ที่อนุญาต (`listen|flashcard|quiz|match|speak|roleplay|onemin|review|chunks|dictation|builder|shadow`) · C8 estMinutes 3–8 · C10 order เรียง
- ระดับคำ: คำใหม่ในหมวดเดิมส่วนใหญ่ A1–A2 · คำใน `transport/phone/bank/emergency` ระดับ A1.1–A2.2
- **ห้ามลบ** lesson เดิม หรือคำเดิมออกจาก curriculum

### 3) ตรวจสอบที่ทำได้ (ไม่ต้องใช้ python)
- ใช้ PowerShell/Python ถ้ามี: ตรวจว่าไฟล์ raw ทั้ง 12 เป็น array ของ object, นับได้ 300 คำพอดี, id ไม่ซ้ำ
- ถ้าทำไม่ได้ ให้ตรวจโดยอ่านไฟล์และนับเอง แล้วสรุปตัวเลขในรายงาน

## ข้อกำหนด
- แก้เฉพาะ `data/raw/*.json` (8 ไฟล์เดิม + 4 ไฟล์ใหม่) และ `data/curriculum.json`
- **ห้ามแตะ** `js/**`, `sw.js`, `data/words.json`, `data/categories.json`, `data/audio/**`, `data/chunks.json`, `data/listening.json`, `scripts/build_data.py` (ผมตั้ง CATEGORIES ให้แล้ว)
- ห้าม `git commit` / `git push`

## ส่งกลับ
`docs/codex/inbox/T10-fix-done.md`: จำนวนคำต่อหมวด (ตาราง) · จำนวน lesson ที่เพิ่ม · วิธีที่ตรวจ + ผล · ข้อจำกัด
