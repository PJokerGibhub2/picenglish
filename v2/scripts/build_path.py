"""build_path.py — สร้างเส้นทางการเรียนของ PangPood (V2) จากคลังข้อมูลเดิม

ทำไมต้องมี: V1 ใช้หลักสูตรแบบ Level → Unit → Lesson
V2 ใช้รูปแบบเกมเส้นทาง (Section → Unit → Lesson node) จึงต้องเรียบเรียงใหม่
โดย **ไม่สร้างเนื้อหาใหม่** — แค่หยิบคำ/ประโยค/บทฟัง/บทสนทนาที่มีอยู่มาจัดกลุ่ม

ผลลัพธ์: v2/data/path.json
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# ── แผน: 12 Unit × 5 บท ────────────────────────────────────────────────
# (id, ชื่อไทย, ชื่ออังกฤษ, emoji, สี, หมวดคำ, สถานการณ์ประโยค, บทสนทนา)
UNITS = [
    ("u1", "ทักทาย & แนะนำตัว", "Say hello", "👋", "#17C964", "feelings", ["smalltalk"], None),
    ("u2", "สั่งกาแฟ & เครื่องดื่ม", "Order drinks", "☕", "#FFC93C", "food", ["cafe"], "dlg-cafe"),
    ("u3", "สั่งอาหารที่ร้าน", "Order a meal", "🍽️", "#FF5A5F", "restaurant", ["restaurant"], "dlg-restaurant"),
    ("u4", "ซื้อของ & ถามราคา", "Shop & bargain", "🛍️", "#8B5CF6", "shopping", ["shopping"], "dlg-shopping"),
    ("u5", "เดินทาง & ถามทาง", "Get around", "🧭", "#1CB0F6", "travel", ["travel"], "dlg-directions"),
    ("u6", "ขึ้นรถ & ต่อรถ", "Take a ride", "🚌", "#06D6A0", "transport", ["travel"], "dlg-reservation"),
    ("u7", "ที่พัก & โรงแรม", "Hotel & home", "🏨", "#FF8A3D", "home", ["hotel"], "dlg-hotel"),
    ("u8", "โทรศัพท์ & อินเทอร์เน็ต", "Phone & online", "📱", "#A855F7", "phone", ["hotel"], None),
    ("u9", "ธนาคาร & เงิน", "Money matters", "🏦", "#22C55E", "bank", ["shopping"], None),
    ("u10", "สุขภาพ & ขอความช่วยเหลือ", "Health & help", "🩺", "#F43F5E", "health", ["health"], "dlg-pharmacy"),
    ("u11", "งาน & นัดหมาย", "Work & plans", "💼", "#3B82F6", "work", ["work"], "dlg-office"),
    ("u12", "ด่านสุดท้าย: พูดได้ครบ", "Final boss", "👑", "#F59E0B", "emergency", ["smalltalk"], None),
]

LESSON_TITLES = {
    "u1": ["ทักทายครั้งแรก", "บอกชื่อและที่มา", "ถามชื่อเขา", "พูดถึงความรู้สึก", "ทบทวน Unit 1"],
    "u2": ["กาแฟหนึ่งแก้ว", "สั่งแบบมืออาชีพ", "ถามราคาและขนาด", "นั่งในหรือกลับบ้าน", "ทบทวน Unit 2"],
    "u3": ["เมนูมื้อกลางวัน", "สั่งอาหารจานเดียว", "ขอร้องเรื่องอาหาร", "คิดเงินแยก", "ทบทวน Unit 3"],
    "u4": ["ถามราคาสินค้า", "ลองแล้วตัดสินใจ", "ต่อรองอย่างสุภาพ", "คืนและเปลี่ยนของ", "ทบทวน Unit 4"],
    "u5": ["ถามทางไปสถานที่", "ขึ้นรถเมล์/แท็กซี่", "บอกระยะทาง", "ถึงที่หมาย", "ทบทวน Unit 5"],
    "u6": ["ซื้อตั๋ว", "ถามป้าย/สายรถ", "ต่อรถ", "ตกหล่น/ของหาย", "ทบทวน Unit 6"],
    "u7": ["เช็กอินโรงแรม", "ขอสิ่งอำนวยความสะดวก", "ปัญหาห้องพัก", "เช็กเอาต์", "ทบทวน Unit 7"],
    "u8": ["ขอ Wi-Fi รหัส", "โทรหาคน", "ส่งข้อความ", "เติมเงิน/แพ็กเกจ", "ทบทวน Unit 8"],
    "u9": ["เปิดบัญชี/แลกเงิน", "ถอนเงินที่ตู้", "ถามค่าธรรมเนียม", "จ่ายด้วยบัตร", "ทบทวน Unit 9"],
    "u10": ["บอกอาการ", "ซื้อยาที่ร้านขายยา", "ขอความช่วยเหลือด่วน", "โทรหาหมอ", "ทบทวน Unit 10"],
    "u11": ["แนะนำตัวในที่ทำงาน", "นัดประชุม", "ขอให้ช่วยงาน", "เลื่อนนัด", "ทบทวน Unit 11"],
    "u12": ["เหตุฉุกเฉินจริง", "ขอโทษ/แก้สถานการณ์", "พูดให้เขาฟังรู้เรื่อง", "ยืนยันข้อมูล", "ด่านเทพ: พูดได้ครบ"],
}

SECTIONS = [
    ("s1", "เอาตัวรอด", "A0 → A1.1", "#2EC27E", ["u1", "u2", "u3", "u4"]),
    ("s2", "ใช้ชีวิตจริง", "A1.2 → A2.1", "#0EA5E9", ["u5", "u6", "u7", "u8"]),
    ("s3", "พูดได้จริง", "A2.1 → A2.2", "#7C5CFF", ["u9", "u10", "u11", "u12"]),
]


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def chunk_into(items: list, parts: int) -> list[list]:
    """แบ่งรายการเป็น parts ส่วนเท่า ๆ กัน (ส่วนหลังอาจน้อยกว่า)"""
    out, i = [], 0
    size = max(1, len(items) // parts)
    for p in range(parts):
        take = size if p < parts - 1 else len(items) - i
        out.append(items[i:i + take])
        i += take
    return out


def main() -> int:
    words = load("words.json")
    words = words["words"] if isinstance(words, dict) else words
    chunks = load("chunks.json")
    chunks = chunks["chunks"] if isinstance(chunks, dict) else chunks
    listening = load("listening.json")
    listening = listening if isinstance(listening, list) else listening.get("lessons", [])

    by_cat: dict[str, list[str]] = {}
    for w in words:
        by_cat.setdefault(w["category"], []).append(w["id"])

    by_sit: dict[str, list[str]] = {}
    for c in chunks:
        by_sit.setdefault(c["situation"], []).append(c["id"])

    # บทฟัง: เรียงตามระดับแล้วแจกแบบ round-robin ให้ครบทั้ง 45 บท
    lis_all: list[str] = []
    for lv in ["A0", "A1.1", "A1.2", "A2.1", "A2.2"]:
        lis_all.extend(x["id"] for x in listening if x["level"] == lv)
    per_unit: list[list[str]] = [[] for _ in UNITS]
    for i, lid in enumerate(lis_all):
        per_unit[i % len(UNITS)].append(lid)

    units = []
    for idx, (uid, title, en, emoji, color, cat, sits, dlg) in enumerate(UNITS):
        word_ids = by_cat.get(cat, [])[:25]
        chunk_ids = []
        for s in sits:
            chunk_ids.extend(by_sit.get(s, []))
        chunk_ids = list(dict.fromkeys(chunk_ids))
        lis_ids = per_unit[idx]

        word_parts = chunk_into(word_ids, 5)
        chunk_parts = chunk_into(chunk_ids[:15], 5)
        lis_parts = chunk_into(lis_ids, max(1, len(lis_ids)))

        lessons = []
        for i in range(5):
            last = i == 4
            kinds = ["words"] if i < 2 else (["words", "chunks"] if i == 2 else (["chunks", "dictation"] if i == 3 else ["review"]))
            lessons.append({
                "id": f"{uid}-l{i + 1}",
                "title": LESSON_TITLES[uid][i],
                "kind": "review" if last else ("dialog" if (dlg and i == 3) else "mix"),
                "exercises": kinds,
                "words": word_parts[i] if i < len(word_parts) else [],
                "chunks": chunk_parts[i] if i < len(chunk_parts) else [],
                "listening": [lis_parts[i]] if (i < len(lis_parts) and i != 4) else [],
                "dialogue": dlg if (dlg and i == 3) else None,
            })

        units.append({
            "id": uid, "title": title, "en": en, "emoji": emoji, "color": color,
            "section": f"s{idx // 4 + 1}", "lessons": lessons,
        })

    by_id = {u["id"]: u for u in units}
    sections = [
        {"id": sid, "title": title, "subtitle": sub, "color": color,
         "units": [by_id[u] for u in ids]}
        for sid, title, sub, color, ids in SECTIONS
    ]

    out = {"version": 1, "app": "PangPood", "sections": sections}
    (DATA / "path.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    total_lessons = sum(len(u["lessons"]) for u in units)
    total_words = sum(len(l["words"]) for u in units for l in u["lessons"])
    total_chunks = sum(len(l["chunks"]) for u in units for l in u["lessons"])
    total_lis = sum(len(l["listening"]) for u in units for l in u["lessons"])
    print(f"Unit {len(units)} · Lesson {total_lessons}")
    print(f"อ้างคำ {total_words} · ประโยค {total_chunks} · บทฟัง {total_lis}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
