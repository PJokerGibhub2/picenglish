# T10-fix — รายงานส่งมอบ

## จำนวนคำต่อหมวด

| หมวด | จำนวน |
|---|---:|
| food | 25 |
| restaurant | 25 |
| travel | 25 |
| home | 25 |
| shopping | 25 |
| health | 25 |
| work | 25 |
| feelings | 25 |
| bank | 25 |
| emergency | 25 |
| phone | 25 |
| transport | 25 |
| **รวม** | **300** |

เพิ่มคำใหม่ 13 คำในแต่ละหมวดเดิมทั้ง 8 หมวด รวม 104 คำ โดยคง 12 object เดิมไว้ และใช้รายการ 25 คำเดิมใน 4 หมวดใหม่ รวมเป็น 300 คำ

## หลักสูตร

เพิ่ม **6 unit และ 24 lesson** (4 lesson ต่อ unit) เพื่ออ้างอิง 204 คำที่ยังไม่อยู่ในหลักสูตรเดิม คง lesson และคำเดิมไว้ ผลรวมมี 54 lessons และ `content.words` อ้างคำครบ 300 คำ โดยแต่ละคำปรากฏครั้งเดียว

## วิธีตรวจและผล

ตรวจด้วย PowerShell `ConvertFrom-Json` และตรวจข้อมูลที่อ่านได้ในหน่วยความจำ ไม่เรียก `scripts/build_data.py` หรือ validator ตามคำสั่ง

- JSON ของ raw ทั้ง 12 ไฟล์และ curriculum อ่านได้
- raw มี 300 object; ทุกหมวดมี 25 object
- id และคำไม่ซ้ำกัน; id แต่ละรายการขึ้นต้นด้วยชื่อหมวด
- มีฟิลด์บังคับครบ; `example` มี headword และ `keyVocab[].en` อยู่ใน `example`
- curriculum มี 300 references ที่ไม่ซ้ำ และตรงกับ raw ครบทุก id
- ตรวจ id lesson, title ในแต่ละ level, mode ที่อนุญาต และ `estMinutes` 3–8 ผ่าน

## ข้อจำกัด

ยังไม่ได้รัน data build/validator หรือ E2E ตามที่ระบุให้ผู้ดูแลรันเอง เครื่องนี้ไม่มี Node/Python ที่เรียกใช้ได้ ผลตรวจจึงเป็นการตรวจ JSON และกฎรายการข้างต้นด้วย PowerShell เท่านั้น