# Codex ↔ ผู้ช่วย (DSH) — ช่องทางส่งงานกัน

โปรเจกต์นี้ให้ **Codex CLI** (ในเครื่องนี้) ทำงานหนักแทนผู้ช่วย แล้วผู้ช่วยตรวจ/ทดสอบ/ปล่อยเวอร์ชันเอง

## ตำแหน่งของกันและกัน

| | ที่อยู่ |
|---|---|
| **โปรเจกต์ (root เดียวกันทั้งคู่)** | `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app` |
| **brief ที่ผู้ช่วยเขียนให้ Codex** | `docs/codex/tasks/<id>.md` |
| **ผลลัพธ์จาก Codex (ข้อความสุดท้าย)** | `docs/codex/results/<id>.md` |
| **log การรันทั้งหมด** | `docs/codex/results/<id>.log` |
| **รายงานส่งมอบที่ Codex เขียนเอง** | `docs/codex/inbox/<id>-done.md` |

Codex ทำงานในโฟลเดอร์โปรเจกต์เดียวกันโดยตรง (ไม่ใช้ worktree) — เพราะ git ทำให้ตรวจ diff ได้เสมอ

## คำสั่งส่งงาน

```bat
scripts\codex.cmd docs\codex\tasks\T1-audio-download.md
```

### 🔒 นโยบายโมเดล (ห้ามเปลี่ยน)
เจ้าของโปรเจกต์อนุญาตให้ใช้ **`gpt-6-luna` + `model_reasoning_effort=high` ("Luna High") เท่านั้น**
`scripts\codex.cmd` ล็อกไว้แล้ว: ถ้าส่งชื่อโมเดลอื่นมาจะถูกปฏิเสธและใช้ `gpt-6-luna` แทน
ห้ามแก้บรรทัด `-m` / `model_reasoning_effort` ในสคริปต์นี้โดยไม่ได้รับอนุญาตจากเจ้าของโปรเจกต์

- `codex.cmd` จะรัน `codex exec -C <root> --approve-for-me --skip-git-repo-check -m <model> -o <out> -`
- **เล่นเสียงแจ้งเตือนเมื่อจบ** (สำเร็จ = chime, ล้มเหลว = stop sound)
- ไม่ commit/push ให้ — ผู้ช่วยเป็นคนตรวจและปล่อยเวอร์ชัน

## กติกาการเขียน brief (สำคัญ)

ทุก brief ต้องมี: บริบท · สถานะปัจจุบัน · งานที่ต้องทำ (ข้อ ๆ) · ข้อกำหนดทางเทคนิค · เกณฑ์ผ่าน · สิ่งที่ต้องส่งกลับ
และห้ามลืมระบุ **"ห้ามแก้ js/version.js และ sw.js"** (ผู้ช่วย bump เอง) กับ **"ห้าม commit/push"**

## ลำดับงานหลัง Codex ส่ง

1. อ่าน `docs/codex/inbox/<id>-done.md`
2. `git diff` ตรวจโค้ด (golden rules ใน `AGENTS.md`)
3. `node scripts/check_imports.mjs` + `node --check` ไฟล์ที่แตะ
4. `node scripts/e2e_test.mjs` ต้องผ่านทั้งหมด
5. bump `js/version.js` + `sw.js` ให้ตรงกัน (มี guard ใน `check_imports.mjs`)
6. commit + push (GitHub Pages deploy อัตโนมัติ) แล้วยืนยันเวอร์ชันบนเว็บ

## ข้อจำกัดที่เจอ

- CLI เป็น `codex-cli 0.164.0-alpha.11.1` อยู่ที่ `~\.codex\plugins\.plugin-appserver\codex.exe`
  (แอป Codex ก็มี `%LOCALAPPDATA%\OpenAI\Codex\bin\...\codex.exe` เวอร์ชันเดียวกัน)
- ล็อกอินผ่าน **ChatGPT account** → โมเดล `gpt-5*` / `codex-mini` ใช้ไม่ได้ (model_not_found)
  ใช้ slug จาก `~\.codex\models_cache.json` เช่น **`gpt-6.1-sol`**, `gpt-6-sol`, `gpt-5.6-sol`, `gpt-6-luna`
- `-s workspace-write` ใช้ร่วมกับ `--approve-for-me` ไม่ได้ (argument conflict)
- **โมเดลที่ใช้: gpt-6-luna + effort high เท่านั้น (คำสั่งเจ้าของโปรเจกต์)**
- โฟลเดอร์โปรเจกต์ถูกเพิ่มใน `~\.codex\config.toml` เป็น `trust_level = "trusted"` แล้ว (สำรองไว้ที่ `config.toml.bak-brandcodex`)
