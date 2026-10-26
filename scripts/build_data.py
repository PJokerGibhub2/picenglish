#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_data.py — รวมไฟล์คำศัพท์จาก data/raw/*.json เป็น data/words.json + data/categories.json
พร้อมตรวจสอบสคีมาและความสอดคล้องของเนื้อหา

รัน:  python scripts/build_data.py
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT_WORDS = ROOT / "data" / "words.json"
OUT_CATS = ROOT / "data" / "categories.json"

CATEGORIES = [
    {"id": "food",       "th": "อาหารและเครื่องดื่ม",   "en": "Food & Drinks",         "emoji": "🍜", "color": "#f97316"},
    {"id": "restaurant", "th": "ร้านอาหารและสั่งอาหาร", "en": "Restaurant & Ordering", "emoji": "🍽️", "color": "#ef4444"},
    {"id": "travel",     "th": "เดินทางและทิศทาง",      "en": "Travel & Directions",   "emoji": "🧭", "color": "#0ea5e9"},
    {"id": "home",       "th": "ที่พักและที่อยู่อาศัย",  "en": "Accommodation & Home",  "emoji": "🏠", "color": "#22c55e"},
    {"id": "shopping",   "th": "ช้อปปิ้งและเงิน",       "en": "Shopping & Money",      "emoji": "🛍️", "color": "#a855f7"},
    {"id": "health",     "th": "สุขภาพและร่างกาย",      "en": "Health & Body",         "emoji": "🩺", "color": "#14b8a6"},
    {"id": "work",       "th": "งานและออฟฟิศ",         "en": "Work & Office",         "emoji": "💼", "color": "#6366f1"},
    {"id": "feelings",   "th": "อารมณ์และบุคลิก",       "en": "Feelings & Personality","emoji": "😊", "color": "#ec4899"},
    {"id": "transport", "th": "การเดินทางในเมือง", "en": "Getting Around", "emoji": "🚌", "color": "#06b6d4"},
    {"id": "phone", "th": "โทรศัพท์และอินเทอร์เน็ต", "en": "Phone & Internet", "emoji": "📱", "color": "#8b5cf6"},
    {"id": "bank", "th": "ธนาคารและเงิน", "en": "Bank & Money", "emoji": "🏦", "color": "#10b981"},
    {"id": "emergency", "th": "เหตุฉุกเฉินและขอความช่วยเหลือ", "en": "Help & Emergencies", "emoji": "🆘", "color": "#ef4444"},
]

REQUIRED = ["id", "word", "pos", "ipa", "thai", "emoji",
            "example", "exampleThai", "keyVocab", "tip"]
POS_OK = {"n.", "v.", "adj.", "adv.", "phr.", "prep.", "pron."}

errors: list[str] = []
warnings: list[str] = []

# คอนโซล Windows อาจเป็น cp874 ซึ่งพิมพ์อีโมจิ/ภาษาไทยไม่ได้ — บังคับเป็น UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass


def norm(s: str) -> str:
    """เทียบแบบไม่สนใจเครื่องหมายวรรคตอน/ตัวพิมพ์/ช่องว่างซ้ำ (สำหรับตรวจ substring)"""
    s = unicodedata.normalize("NFKC", str(s)).lower()
    s = s.replace("’", "'").replace("–", "-").replace("—", "-")
    s = re.sub(r"\s+", " ", s)
    return s


def main() -> int:
    if not RAW.is_dir():
        print(f"ไม่พบโฟลเดอร์ {RAW}")
        return 1

    # ไฟล์ที่ไม่ใช่ชุดคำศัพท์ (คำแนะนำภาพ) ไม่ต้องนำมาวนเป็นหมวด
    SKIP_FILES = {"image-hints"}
    files = sorted(p for p in RAW.glob("*.json") if p.stem not in SKIP_FILES)
    if not files:
        print(f"ไม่พบไฟล์ JSON ใน {RAW}")
        return 1

    valid_ids = {c["id"] for c in CATEGORIES}
    words: list[dict] = []
    seen_ids: set[str] = set()
    seen_words: dict[str, str] = {}

    for path in files:
        cat = path.stem
        if cat not in valid_ids:
            errors.append(f"{path.name}: ไม่มีหมวด '{cat}' ในรายการ CATEGORIES")
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{path.name}: อ่าน JSON ไม่ได้ — {exc}")
            continue
        if not isinstance(data, list):
            errors.append(f"{path.name}: ต้องเป็น JSON array")
            continue
        if len(data) != 12:
            warnings.append(f"{path.name}: มี {len(data)} คำ (ปกติ 12)")

        for i, item in enumerate(data):
            tag = f"{path.name}[{i}] {item.get('word', '?')}"
            if not isinstance(item, dict):
                errors.append(f"{tag}: ไม่ใช่ออบเจ็กต์")
                continue

            missing = [k for k in REQUIRED if k not in item]
            extra = [k for k in item if k not in REQUIRED and k != "imageQuery"]
            if missing:
                errors.append(f"{tag}: ขาดคีย์ {missing}")
            if extra:
                warnings.append(f"{tag}: มีคีย์เกิน {extra}")

            wid = str(item.get("id", ""))
            if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", wid):
                errors.append(f"{tag}: id ผิดรูปแบบ '{wid}'")
            if not wid.startswith(cat + "-"):
                errors.append(f"{tag}: id ควรขึ้นต้นด้วย '{cat}-' (พบ '{wid}')")
            if wid in seen_ids:
                errors.append(f"{tag}: id ซ้ำ '{wid}'")
            seen_ids.add(wid)

            word = str(item.get("word", "")).strip()
            if not word:
                errors.append(f"{tag}: ไม่มีคำศัพท์")
            if word.lower() in seen_words:
                errors.append(f"{tag}: คำซ้ำกับ {seen_words[word.lower()]}")
            seen_words[word.lower()] = f"{path.name}/{wid}"

            if item.get("pos") not in POS_OK:
                warnings.append(f"{tag}: pos แปลก '{item.get('pos')}'")

            ipa = str(item.get("ipa", ""))
            if not (ipa.startswith("/") and ipa.endswith("/") and len(ipa) > 2):
                warnings.append(f"{tag}: ipa ไม่ได้ครอบด้วย /.../ — '{ipa}'")

            ex = str(item.get("example", ""))
            n_words = len(re.findall(r"[A-Za-z0-9']+", ex))
            if not (5 <= n_words <= 16):
                warnings.append(f"{tag}: ประโยคตัวอย่างยาว {n_words} คำ")
            stems = {word.lower(), word.lower().rstrip("e"), word.lower()[:max(3, len(word) - 2)]}
            if not any(s and s in norm(ex) for s in stems):
                warnings.append(f"{tag}: ไม่พบคำเป้าหมายในประโยคตัวอย่าง")

            kv = item.get("keyVocab")
            if not isinstance(kv, list) or not (1 <= len(kv) <= 5):
                errors.append(f"{tag}: keyVocab ต้องเป็นลิสต์ 1–5 รายการ")
            else:
                for entry in kv:
                    if not isinstance(entry, dict) or "en" not in entry or "thai" not in entry:
                        errors.append(f"{tag}: keyVocab รูปแบบผิด {entry!r}")
                        continue
                    if norm(entry["en"]) not in norm(ex):
                        errors.append(f"{tag}: keyVocab '{entry['en']}' ไม่ปรากฏในประโยคตัวอย่าง")

            thai = str(item.get("thai", "")).strip()
            if not thai:
                errors.append(f"{tag}: ไม่มีคำแปลไทย")
            if not str(item.get("exampleThai", "")).strip():
                errors.append(f"{tag}: ไม่มีคำแปลประโยค")

            tip = str(item.get("tip", ""))
            if len(tip) > 160:
                warnings.append(f"{tag}: tip ยาว {len(tip)} ตัวอักษร")

            item["category"] = cat
            words.append(item)

    # เรียงตามลำดับหมวดที่กำหนด แล้วคงลำดับภายในหมวด
    order = {c["id"]: i for i, c in enumerate(CATEGORIES)}
    words.sort(key=lambda w: order.get(w.get("category", ""), 99))

    # ผสานคำแนะนำภาพ (หมวดหมู่ Commons / ใช้ภาพถ่ายหรืออีโมจิ)
    hints_path = RAW / "image-hints.json"
    if hints_path.exists():
        try:
            hints = json.loads(hints_path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"image-hints.json: อ่านไม่ได้ — {exc}")
            hints = []
        by_id = {h.get("id"): h for h in hints if isinstance(h, dict)}
        for w in words:
            h = by_id.get(w["id"])
            if not h:
                warnings.append(f"{w['id']}: ไม่มีคำแนะนำภาพใน image-hints.json (จะค้นด้วยข้อความแทน)")
                continue
            cat = str(h.get("commonsCategory") or "").strip()
            w["commonsCategory"] = cat or None
            w["photo"] = bool(h.get("photo", True))
            if h.get("article"):
                w["article"] = str(h["article"]).strip()
        unknown = sorted(set(by_id) - {w["id"] for w in words})
        if unknown:
            warnings.append(f"image-hints.json มี id ที่ไม่รู้จัก: {unknown}")
        n_emoji = sum(1 for w in words if w.get("photo") is False)
        n_cat = sum(1 for w in words if w.get("commonsCategory"))
        print(f"ผสานคำแนะนำภาพ: ใช้ภาพถ่าย {len(words) - n_emoji} คำ · ใช้เฉพาะอีโมจิ {n_emoji} คำ · มีหมวดหมู่ Commons {n_cat} คำ")
    else:
        print("ไม่พบ data/raw/image-hints.json — ข้ามการผสานคำแนะนำภาพ")

    used_cats = {w["category"] for w in words}
    cats_out = [c for c in CATEGORIES if c["id"] in used_cats]
    for c in CATEGORIES:
        if c["id"] not in used_cats:
            warnings.append(f"หมวด '{c['id']}' ไม่มีคำศัพท์")

    OUT_WORDS.parent.mkdir(parents=True, exist_ok=True)
    OUT_WORDS.write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding="utf-8")
    OUT_CATS.write_text(json.dumps({"categories": cats_out}, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"รวมได้ {len(words)} คำ จาก {len(files)} หมวด")
    for c in cats_out:
        n = sum(1 for w in words if w["category"] == c["id"])
        print(f"  {c['emoji']} {c['th']:<24} {n} คำ")
    print(f"\nเขียน {OUT_WORDS.relative_to(ROOT)} และ {OUT_CATS.relative_to(ROOT)}")

    if warnings:
        print(f"\nคำเตือน {len(warnings)} รายการ:")
        for w in warnings[:40]:
            print("  ! " + w)
    if errors:
        print(f"\nข้อผิดพลาด {len(errors)} รายการ:")
        for e in errors[:60]:
            print("  x " + e)
        return 1
    print("\nตรวจสอบผ่านทั้งหมด ไม่มีข้อผิดพลาด")
    return 0


if __name__ == "__main__":
    sys.exit(main())