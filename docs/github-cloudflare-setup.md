# ขึ้น GitHub + Cloudflare Pages — คู่มือทีละคลิก (ลิงก์ถาวร ฟรี)

> **สรุปความเห็น**: คู่นี้เหมาะกับโปรเจกต์นี้มาก เพราะคุณกำลังจะย้ายไป MacBook + ใช้ Codex
> ซึ่งต้องการ repo จริง (มีประวัติ, ย้อนเวอร์ชันได้, แตก branch ได้) และ Cloudflare จะ deploy ให้อัตโนมัติทุกครั้งที่ push
> **แลกเปลี่ยน**: ต้องมี 2 บัญชี และครั้งแรกใช้เวลารวม ~20–25 นาที
>
> ถ้าแค่อยากได้ลิงก์เร็ว ๆ วันนี้ → Netlify Drop 3 นาที (ดู `deploy-free.md`) ทำคู่กันได้ ไม่ขัดกัน

---

## สิ่งที่ต้องเตรียม

- อีเมล 1 อัน (ใช้สมัครทั้ง GitHub และ Cloudflare)
- โฟลเดอร์ `english-picture-app` (มีอยู่แล้ว — 11 MB, 221 ไฟล์, มี `index.html` ที่ระดับบนสุด ✓)
- **ไม่ต้องติดตั้ง Git** ถ้าใช้ GitHub Desktop

> 🔒 **อย่าส่งรหัสผ่านหรือรหัส 2FA ให้ใคร (รวมถึงผม)** — ผมทำแทนได้เฉพาะขั้นที่ใช้ token/คำสั่ง ไม่ใช่การล็อกอิน

---

## ขั้นที่ 1 — สมัคร GitHub (~5 นาที)

1. เปิด <https://github.com/signup>
2. กรอก **email → password → username**
   - **username สำคัญ**: จะกลายเป็น `github.com/<username>` และ **แก้ยาก** → ตั้งให้ดี (a–z, 0–9, `-`)
   - password ต้องยาว ≥ 8 และมีตัวเลข/ตัวอักษรผสม (ระบบอาจแนะนำ 15 ตัว)
3. **ยืนยันอีเมล** → เปิดกล่องจดหมาย (เช็ค Spam ด้วย) → กดลิงก์ยืนยัน
4. **ตั้ง 2FA** (GitHub บังคับสำหรับบัญชีใหม่)
   - เลือก **Authenticator app** (Microsoft / Google Authenticator) — ดีกว่า SMS
   - สแกน QR แล้วกรอกรหัส 6 หลัก
   - ⚠️ **ดาวน์โหลด recovery codes เก็บไว้** — ถ้าโทรศัพท์หายจะได้ไม่ต้องกู้บัญชีที่ยากมาก
5. จะได้หน้า `github.com/<username>` → เสร็จขั้นนี้

---

## ขั้นที่ 2 — เอาโค้ดขึ้น GitHub

### ทาง A (แนะนำ): GitHub Desktop — ไม่ต้องพิมพ์คำสั่ง

1. ดาวน์โหลด <https://desktop.github.com> → ติดตั้ง (ฟรี)
2. เปิด → **Sign in to GitHub.com** → Authorize
3. เมนู **File → Add local repository**
   - เลือกโฟลเดอร์: `C:\Users\ASUS\OneDrive\Documents\deepseek-harness\default-workspace\english-picture-app`
   - ถ้าขึ้นเตือนว่า “not a Git repository” → กด **create a repository** (โปรแกรมจะ init ให้เอง)
4. หน้าจอจะแสดงไฟล์ ~221 ไฟล์ → ช่อง **Summary** พิมพ์ `PicEnglish: initial commit`
   → กด **Commit to main**
5. มุมขวาบน → **Publish repository**
   - ตั้งชื่อ repo: `picenglish`
   - ถ้าอยากให้ใครเห็นก็เปิด public / ถ้าอยากปิดไว้ก็ติ๊ก private (Cloudflare ใช้ private ได้)
   - กด **Publish repository**
6. เสร็จ → เปิด `https://github.com/<username>/picenglish` ต้องเห็นไฟล์ `index.html` อยู่บนสุด

### ทาง B: อัปโหลดผ่านเว็บ (ไม่ติดตั้งอะไร แต่ช้ากว่า)

1. github.com → **New repository** → ชื่อ `picenglish` → Public → **Create repository**
2. ในหน้า repo → ลิงก์ **uploading an existing file**
3. ลาก **ไฟล์และโฟลเดอร์ทั้งหมด** จาก `english-picture-app` ลงในหน้าเว็บ
   - ⚠️ ต้องลากให้ `index.html`, `css/`, `js/`, `data/` อยู่ **ระดับบนสุด** (อย่าให้ซ้อนในโฟลเดอร์ชื่อ english-picture-app)
   - ถ้าเบราว์เซอร์ไม่ยอมรับการลากโฟลเดอร์ ให้ลากทีละโฟลเดอร์
4. **Commit changes**

---

## ขั้นที่ 3 — Cloudflare Pages (~10 นาที)

1. สมัคร <https://dash.cloudflare.com/sign-up> (ฟรี — **ไม่ต้องมีโดเมน ไม่ต้องใช้บัตร**)
   - ยืนยันอีเมลเช่นกัน
2. เมนูซ้าย → **Workers & Pages** → **Create application** → แท็บ **Pages** → **Connect to Git**
3. **Connect GitHub** → Authorize Cloudflare Pages
   - เลือก repo `picenglish` → **Begin setup**
4. ตั้งค่า **สำคัญมาก** (ช่องนี้พลาดบ่อยที่สุด)

   | ช่อง | ใส่อะไร |
   |---|---|
   | Project name | `picenglish` → URL จะเป็น `picenglish.pages.dev` |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | **(เว้นว่าง)** |
   | Build output directory | **`/`** |
   | Root directory | (เว้นว่าง) |

5. **Save and Deploy** → รอ ~30 วินาที → ได้ URL `https://picenglish.pages.dev`
6. เปิดบนมือถือ → เมนูเบราว์เซอร์ → **เพิ่มไปยังหน้าจอหลัก**

> ถ้าชื่อ `picenglish` ถูกใช้แล้ว ระบบจะให้เติมอะไรต่อท้าย — ใช้ชื่อนั้นได้เลย

---

## ขั้นที่ 4 — ตรวจว่าใช้งานได้จริง

| ตรวจ | ต้องเห็น |
|---|---|
| หน้าแรก | “เลือกหมวด” + การ์ดหมวดมีภาพการ์ตูน 8 หมวด |
| ภาพ | ภาพกราฟฟิกสีสัน (ไม่ใช่กล่องว่าง) |
| mockup | เปิด `/docs/mockups/index.html` ได้ |
| ไมค์ | ฝึกพูด → บทสนทนา → กดไมค์ → อนุญาต → ได้คะแนน |
| ออฟไลน์ | เปิดครั้งแรกให้โหลดครบ → ปิดเน็ต → เปิดใหม่ยังใช้ได้ |

---

## ขั้นที่ 5 — อัปเดตครั้งต่อไป (ง่ายมาก)

1. แก้ไฟล์ในเครื่อง (หรือให้ผมแก้)
2. ⚠️ **เพิ่มเลข `VERSION` ใน `sw.js`** (เช่น `v5` → `v6`) ทุกครั้งที่แก้ไฟล์ที่แอปโหลด
3. เปิด **GitHub Desktop** → จะเห็นรายการไฟล์ที่เปลี่ยน
   → ช่อง Summary พิมพ์สิ่งที่แก้ → **Commit to main** → **Push origin**
4. Cloudflare จะ deploy อัตโนมัติภายใน ~30 วินาที (ดูที่แท็บ Deployments)

---

## ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| Deploy ผ่านแต่เปิดแล้ว **404** | `index.html` ไม่ได้อยู่ที่ root ของ repo (มักลากโฟลเดอร์ซ้อนเข้าไป) |
| หน้าเปล่า / ไม่มีข้อมูล | โฟลเดอร์ `data/` ไม่ได้ถูก commit |
| ภาพกราฟฟิกไม่ขึ้น | `data/art/*.svg` ไม่ครบ (ต้องมี 96 ไฟล์) |
| เห็นเวอร์ชันเก่า | ยังไม่ได้ bump `VERSION` ใน `sw.js` / ปิดแท็บแล้วเปิดใหม่ |
| Cloudflare build ไม่ผ่าน | ช่อง **Build command** ต้องว่าง (ไม่ใช่ `npm run build`) |
| ไมค์ไม่ทำงานบน iPhone | เปิดด้วย Safari ไม่ใช่ LINE in-app browser |
| Push ไม่ได้ | ยังไม่ได้ authorize GitHub Desktop / 2FA ค้าง |

---

## ทางเลือกสำรอง

- **Netlify Drop** — 3 นาที ไม่ต้องมี GitHub (ดู `deploy-free.md`)
- **GitHub Pages** — ใช้ repo เดียวกัน: Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`
- **Vercel** — Import Git Repository → Framework: Other → Deploy
