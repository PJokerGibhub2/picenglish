# T12 — PangPood (V2) ปรับสีสันสดใส + จัดเลย์เอาต์ทั้งแอป (ต้องแก้ให้เข้าที่)

## บริบท
โฟลเดอร์งาน: `english-picture-app/v2/` — **ห้ามแตะไฟล์นอก `v2/`** (V1 อยู่ที่ root และต้องไม่ถูกแก้)
เจ้าของแอปติง 2 เรื่อง:
1. "สีสันสดใสกว่านี้"
2. "ขนาดหน้าจอ/ไอคอน/คำถาม/ตำแหน่งมาสคอส ยังจัดเรียงไม่เหมาะสม"

## ปัญหาที่ตรวจพบจริง (จาก Chrome 390×844)
- จอเล่นบทเรียน (`#/lesson?id=...`) **ไม่เต็มความกว้าง**: `.session-content` กว้างแค่ 260px และเริ่มที่ x=112 (ถูกดันไปทางขวา)
- มาสคอสในจอเล่นลอยอยู่กลางจอซ้าย (x=18, y=388) ทับพื้นที่โจทย์
- `.session-top` เยื้อง 18px ขณะที่หน้าเว็บใช้ 14px
- ไอคอนแท็บบางตัว (เควส/คลังคำ) อ่านไม่ชัดเมื่อขนาดเล็ก

## งานที่ต้องทำ

### 1) เปลี่ยนสีให้สดใส (แก้ที่ `v2/css/style.css` :root)
```css
--brand: #17C964;      /* เขียวสด (เดิม #2EC27E) */
--brand-dark: #0EA75A;
--brand-soft: #E3FBEE;
--sun: #FFC93C;        /* เหลืองสด */
--sun-soft: #FFF7E0;
--coral: #FF5A5F;
--coral-soft: #FFEDEE;
--violet: #8B5CF6;
--sky: #1CB0F6;
--ink: #123A31;        /* เข้มขึ้นเล็กน้อยให้contrastดี */
--ink-soft: #5B7C73;
--line: #DDEBE5;
--bg: #FFFFFF;
--bg-soft: #F3FBF6;
```
- เพิ่มความสดของ "node ปัจจุบัน" ด้วยเงาสี: `box-shadow: 0 5px 0 var(--brand-dark), 0 8px 18px rgba(23,201,100,.28)`
- ปุ่ม 3 มิติ: เงาล่างต้องชัดขึ้น `--shadow-3d: 0 5px 0 rgba(12,60,45,.18)`
- หน่วย/Unit สี: ให้ใช้สีที่สดขึ้นจาก `path.json` (แก้ `v2/scripts/build_path.py` เปลี่ยนชุดสี UNITS เป็น:
  `#17C964, #FFC93C, #FF5A5F, #8B5CF6, #1CB0F6, #06D6A0, #FF8A3D, #A855F7, #22C55E, #F43F5E, #3B82F6, #F59E0B`
  แล้วรัน `python v2/scripts/build_path.py` เพื่อสร้าง `v2/data/path.json` ใหม่ — ห้ามแก้ด้วยมือ)

### 2) จอเล่นบทเรียน — จัดใหม่ทั้งหน้า (สำคัญที่สุด)
โครงที่ต้องการ (ใน `v2/js/views-session.js` + CSS):
```
.session{position:fixed;inset:0;display:flex;flex-direction:column;background:var(--bg);z-index:50}
  .session-top      ความสูง 56px, padding 0 16px, จัด: [✕] [ชื่อบท กลาง] [2/10 ขวา]
  .session-track    แถบความคืบหน้า สูง 10px ห่างขอบ 16px
  .session-body     flex:1; display:flex; flex-direction:column; justify-content:center; gap:18px; padding:8px 16px;
  .session-prompt   ข้อความโจทย์ กลางจอ max-width:100%; font-size: clamp(1.35rem, 6.2vw, 1.9rem)
  .session-answers  ปุ่มตัวเลือก เต็มความกว้าง สูงขั้นต่ำ 56px ต่อปุ่ม
  .session-foot     padding:12px 16px calc(16px + env(safe-area-inset-bottom)); (ปุ่มตรวจ)
  .session-mascot   position:absolute; right:12px; bottom:calc(86px + env(safe-area-inset-bottom)); width:72px; height:80px; pointer-events:none;
```
- **มาสคอส**: ห้ามลอยทับโจทย์/ปุ่ม — ใช้มุมขวาล่าง ขนาด 72px, `opacity:.95`; ถ้าความสูงจอ < 700px ให้ซ่อน (`.session-mascot{display:none}` ใน media query)
- โจทย์กับตัวเลือกต้องอยู่ "คอลัมน์เดียว เต็มความกว้าง" (ห้ามมี margin ซ้าย/ขวาไม่เท่ากัน)
- ปุ่มตัวเลือก: เรียงแนวตั้ง gap 10px, ตัวอักษร 1rem, ขอบ 2px + เงาล่าง 3px, สถานะ `.selected` = ขอบ `--brand` + พื้น `--brand-soft`
- ผลถูก/ผิด: แถบสี (เขียว/แดงอ่อน) เต็มความกว้าง เหนือปุ่ม

### 3) หน้าอื่น ๆ ให้เข้าที่
- `.topbar` และ `#view` ใช้ padding ซ้าย-ขวา 16px เท่ากันทุกหน้า (ตอนนี้ 14px)
- `#view{max-width:520px}` คงไว้ แต่ `width:100%`, `margin:0 auto`
- หน้าเส้นทาง: node 70px + ระยะห่างแนวตั้ง 6px, ป้ายชื่อ node อยู่ใต้ node เสมอ (ห้ามซ้อน), ชื่อ Unit ป้าย `unit-name` ห้ามตัดคำผิด (use `overflow-wrap:anywhere`)
- แท็บล่าง: ไอคอน 24px, ป้าย 0.66rem, `justify-content:center`, ระยะห่างเท่ากัน, safe-area bottom
- คลังคำ: แถวคำสูงขั้นต่ำ 56px, ตัวอักษรอังกฤษ 1rem หนา, ไอคอนหมวดชิดขวา
- ตรวจ 4 ความกว้าง: **320, 360, 390, 430px** — ต้องไม่มี horizontal scroll และไม่มีองค์ประกอบล้นขอบ

### 4) เสียง — ต้องใช้ 2 เสียงเดิมเท่านั้น
- เสียงที่ระบบเรามี (**ห้ามเพิ่ม/เปลี่ยน**): `af_heart` (หญิง = ค่าเริ่มต้น) และ `am_adam` (ชาย)
- ทุกการเรียกเสียงต้องส่ง `audioKey` เพื่อใช้ไฟล์ Kokoro (`word:<id>`, `sent:<id>`, `chunk:<id>`, `lis:<id>:<line>`)
- **ห้าม**ทำ UI ให้เลือกเสียงจากเบราว์เซอร์ — ในหน้า "ฉัน" ให้เหลือปุ่มตัวอย่าง 2 เสียง (หญิง/ชาย) เท่านั้น

## ข้อกำหนด
- ES modules, ไม่เพิ่ม dependency, ห้าม build step
- แก้ได้: `v2/css/style.css`, `v2/js/views-session.js`, `v2/js/views-path.js`, `v2/js/views-words.js`, `v2/js/views-me.js`, `v2/js/app.js`, `v2/scripts/build_path.py`, `v2/data/path.json` (ผ่านสคริปต์เท่านั้น)
- **ห้ามแก้**: `v2/js/store.js` (คีย์ข้อมูล), `v2/sw.js`, `v2/js/version.js`, `v2/data/words.json|chunks.json|listening.json|dialogues.json|audio/**`, ไฟล์ V1 ทั้งหมด
- ห้าม `git commit` / `git push`

## เกณฑ์ผ่าน
- [ ] จอเล่นบทเรียนเต็มความกว้าง (`.session-body` กว้าง = viewport − 32px) และไม่อยู่กึ่งกลางแบบแคบ
- [ ] มาสคอสไม่ทับโจทย์/ปุ่ม (มุมขวาล่าง สูง 72px) และซ่อนเมื่อจอเตี้ย
- [ ] ไม่มี horizontal scroll ที่ 320/360/390/430px
- [ ] สีสดขึ้นตามโทเคนข้างบน (เห็นได้ชัดเมื่อเทียบกับ v2.1.0)
- [ ] `node --check` ผ่านทุกไฟล์ที่แก้ (ถ้ามี node) และไม่มี console error

## ส่งกลับ
`docs/codex/inbox/T12-done.md`: สรุป · ไฟล์ที่แตะ · ค่าที่ตรวจได้ (เช่น ความกว้าง .session-body ที่ 390px) · ข้อจำกัด
