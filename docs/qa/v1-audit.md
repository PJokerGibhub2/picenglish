# QA Audit — PicEnglish (V1)

- เวลา: 2026-10-27 04:51:27
- หน้าจอที่ตรวจ: **19** · ข้อผิดพลาด **0** · เตือน **19** · ข้อมูล **1**

| จอ | ปุ่ม | ช่องพิมพ์ | ใบ้ | ข้าม | ล้าง | ย้อนกลับ | ปัญหา |
|---|---|---|---|---|---|---|---|
| today | 17 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| learn | 26 | 0 | ✓ | — | — | ✓ | 🟡 TAP_TARGET |
| listen | 30 | 1 | ✓ | — | — | ✓ | 🟡 TAP_TARGET 🔵 NO_CLEAR |
| quiz | 21 | 0 | ✓ | — | — | ✓ | 🟡 TAP_TARGET |
| match | 21 | 0 | ✓ | — | — | ✓ | 🟡 TAP_TARGET |
| speak | 15 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| review | 8 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| mine | 10 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| chunks | 473 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| dictation | 176 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| builder | 176 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| listening | 60 | 0 | ✓ | — | — | ✓ | 🟡 TAP_TARGET |
| shadow | 60 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| roleplay | 7 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| onemin | 12 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| sentenceReview | 8 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| placement | 9 | 0 | — | ✓ | — | ✓ | 🟡 TAP_TARGET |
| games | 10 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |
| speaking | 12 | 0 | — | — | — | ✓ | 🟡 TAP_TARGET |

## รายละเอียดปัญหาที่พบ
- **today** · WARN `TAP_TARGET` — ตั้งค่า 40x40
- **learn** · WARN `TAP_TARGET` — ตั้งค่า 40x40
- **listen** · WARN `TAP_TARGET` — ตั้งค่า 40x40 · ✨ ทั้งหมด 86x31 · 🍜 อาหารและเครื่อง 154x31 · 🍽️ ร้านอาหารและสั 176x31
- **listen** · INFO `NO_CLEAR` — ไม่มีปุ่มล้างคำตอบ
- **quiz** · WARN `TAP_TARGET` — ย้อนกลับ 40x40 · ตั้งค่า 40x40 · ✨ ทั้งหมด 86x31 · 🍜 อาหารและเครื่อง 154x31
- **match** · WARN `TAP_TARGET` — ย้อนกลับ 40x40 · ตั้งค่า 40x40 · ✨ ทั้งหมด 86x31 · 🍜 อาหารและเครื่อง 154x31
- **speak** · WARN `TAP_TARGET` — ย้อนกลับ 40x40 · ตั้งค่า 40x40 · 📝 ฝึกทั้งประโยค 122x31 · 🔤 ฝึกคำเดียว 105x31
- **review** · WARN `TAP_TARGET` — ตั้งค่า 40x40
- **mine** · WARN `TAP_TARGET` — ตั้งค่า 40x40 · ⭐ คำโปรด (0) 111x31 · 😵 คำยาก (0) 105x31 · 📚 ทั้งหมด 86x31
- **chunks** · WARN `TAP_TARGET` — ตั้งค่า 40x40 · ทั้งหมด 66x31 · ☕ คาเฟ่ 74x31 · 🍽️ ร้านอาหาร 103x31
- **dictation** · WARN `TAP_TARGET` — ตั้งค่า 40x40 · ทุกสถานการณ์ 108x31 · ☕ คาเฟ่ 74x31 · 🍽️ ร้านอาหาร 103x31
- **builder** · WARN `TAP_TARGET` — ตั้งค่า 40x40 · ทุกสถานการณ์ 108x31 · ☕ คาเฟ่ 74x31 · 🍽️ ร้านอาหาร 103x31
- **listening** · WARN `TAP_TARGET` — ตั้งค่า 40x40 · ← กลับไปหน้าเรียน 142x42 · ทั้งหมด 66x31 · A0 41x31
- **shadow** · WARN `TAP_TARGET` — ตั้งค่า 40x40 · ← กลับไปหน้าเรียน 142x42 · ทั้งหมด 66x31 · A0 41x31
- **roleplay** · WARN `TAP_TARGET` — ย้อนกลับ 40x40 · ตั้งค่า 40x40
- **onemin** · WARN `TAP_TARGET` — ย้อนกลับ 40x40 · ตั้งค่า 40x40 · ← ออก 69x42 · dessertของหวาน 127x34
- **sentenceReview** · WARN `TAP_TARGET` — ย้อนกลับ 40x40 · ตั้งค่า 40x40
- **placement** · WARN `TAP_TARGET` — ตั้งค่า 40x40
- **games** · WARN `TAP_TARGET` — ตั้งค่า 40x40
- **speaking** · WARN `TAP_TARGET` — ตั้งค่า 40x40