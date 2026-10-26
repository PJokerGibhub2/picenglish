# T3a เสร็จงาน

## สรุป
- เพิ่มบทฟังใหม่ 45 บท แบ่ง A0, A1.1, A1.2, A2.1 และ A2.2 ระดับละ 9 บท พร้อม transcript อังกฤษ/ไทย คำเป้าหมาย และคำถามปรนัย
- เชื่อมบทฟังทั้ง 45 บทกับ `content.listening` ในหลักสูตร โดยอ้างบทละหนึ่งครั้งและจับคู่ตามระดับ
- เพิ่มตัวตรวจ L1–L8 และตารางสรุปบทฟัง/คำถามใน validator

## ไฟล์ที่แตะ
- `data/listening.json`
- `data/curriculum.json`
- `scripts/validate_curriculum.py`
- `docs/codex/inbox/T3a-done.md`

## ผลตรวจ
บรรทัดสรุปจากการตรวจโครงสร้างข้อมูล:

> PASS: 45 listening lessons; 9 per level; 45 referenced exactly once; 135 questions; IDs, titles, targets, transcript, question indexes, and seconds valid.

ตรวจ JSON และเงื่อนไข L1–L8 รวมถึงจำนวนระดับ/บท/คำถาม/การอ้างด้วย PowerShell แล้วผ่าน

## ข้อจำกัด
ไม่สามารถรัน `python scripts/validate_curriculum.py --strict` ในสภาพแวดล้อมนี้ได้ เพราะไม่มีคำสั่ง `python` หรือ Python executable ที่เรียกใช้ได้ จึงยังไม่มีผล strict จากตัว validator เอง