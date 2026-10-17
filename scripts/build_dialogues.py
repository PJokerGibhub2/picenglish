#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_dialogues.py — รวมและตรวจบทสนทนาจำลองจาก data/raw/dialogues/*.json → data/dialogues.json

รัน:  python scripts/build_dialogues.py
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "dialogues"
OUT = ROOT / "data" / "dialogues.json"

REQUIRED = ["id", "title", "titleEn", "level", "emoji", "category", "commonsCategory",
            "imageQuery", "setting", "counterpart", "lines", "usefulPhrases"]

errors: list[str] = []
warnings: list[str] = []

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

# อักษรที่ไม่ควรปนในข้อความไทย (เจอบ่อยเวลาสั่ง AI เขียน)
FOREIGN_SCRIPT = re.compile(r"[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]")
GRAMMAR_WORDS = re.compile(r"(ประธาน|กริยา|วิภัตติ|tense|ไวยากรณ์|รูปอดีต|พหูพจน์|article|preposition)", re.I)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", str(s)).lower()
    s = s.replace("’", "'").replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


def words_of(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", text or ""))


def main() -> int:
    if not RAW.is_dir():
        print(f"ไม่พบโฟลเดอร์ {RAW} — ยังไม่มีบทสนทนา")
        return 1

    files = sorted(RAW.glob("*.json"))
    if not files:
        print(f"ไม่พบไฟล์บทสนทนาใน {RAW}")
        return 1

    dialogues = []
    vocab_hits: set[str] = set()
    vocab_all: set[str] = set()
    try:
        for w in json.loads((ROOT / "data" / "words.json").read_text(encoding="utf-8")):
            vocab_all.add(w["word"].lower())
    except Exception:  # noqa: BLE001
        pass

    for path in files:
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{path.name}: อ่าน JSON ไม่ได้ — {exc}")
            continue
        tag = path.name
        if not isinstance(d, dict):
            errors.append(f"{tag}: ต้องเป็น JSON object")
            continue

        missing = [k for k in REQUIRED if k not in d]
        if missing:
            errors.append(f"{tag}: ขาดคีย์ {missing}")
            continue
        if d["id"] != path.stem:
            errors.append(f"{tag}: id '{d['id']}' ไม่ตรงกับชื่อไฟล์")

        lines = d["lines"]
        if not isinstance(lines, list) or not (8 <= len(lines) <= 10):
            errors.append(f"{tag}: ต้องมี 8–10 บรรทัด (พบ {len(lines) if isinstance(lines, list) else '?'})")
            continue
        if lines[0].get("who") != "staff":
            errors.append(f"{tag}: บรรทัดแรกต้องเป็น staff")

        for i, ln in enumerate(lines):
            ltag = f"{tag}[{i}]"
            who = ln.get("who")
            if who not in ("staff", "me"):
                errors.append(f"{ltag}: who ต้องเป็น staff หรือ me")
            if not ln.get("thai"):
                errors.append(f"{ltag}: ไม่มีคำแปลไทย")
            en = ln.get("en", "")
            n = words_of(en)
            if who == "me" and not (4 <= n <= 13):
                warnings.append(f"{ltag}: ประโยคของผู้ใช้ยาว {n} คำ (เป้า 4–12)")
            if who == "staff" and not (3 <= n <= 17):
                warnings.append(f"{ltag}: ประโยคคู่สนทนายาว {n} คำ (เป้า 4–16)")

            kps = ln.get("keyPhrases") or []
            if not (1 <= len(kps) <= 4):
                errors.append(f"{ltag}: keyPhrases ต้องมี 1–3 รายการ (พบ {len(kps)})")
            for kp in kps:
                if not isinstance(kp, dict) or "en" not in kp or "thai" not in kp:
                    errors.append(f"{ltag}: keyPhrases รูปแบบผิด {kp!r}")
                elif norm(kp["en"]) not in norm(en):
                    errors.append(f"{ltag}: keyPhrases '{kp['en']}' ไม่ปรากฏในประโยค")

            alt = ln.get("alternative")
            if who == "me":
                if not isinstance(alt, list) or not (2 <= len(alt) <= 4):
                    errors.append(f"{ltag}: บรรทัดของผู้ใช้ต้องมี alternative 2–3 รายการ")
                else:
                    for a in alt:
                        if not isinstance(a, dict) or "en" not in a or "thai" not in a:
                            errors.append(f"{ltag}: alternative รูปแบบผิด {a!r}")

            for field in ("en", "thai"):
                if FOREIGN_SCRIPT.search(str(ln.get(field, ""))):
                    errors.append(f"{ltag}: พบอักษรภาษาต่างประเทศปนใน '{field}'")

        for fld in ("setting",):
            if len(str(d.get(fld, ""))) > 110:
                warnings.append(f"{tag}: {fld} ยาวเกิน 110 ตัวอักษร")
        for fld in ("title", "titleEn"):
            if FOREIGN_SCRIPT.search(str(d.get(fld, ""))):
                errors.append(f"{tag}: พบอักษรต่างประเทศใน '{fld}'")

        ups = d["usefulPhrases"]
        if not isinstance(ups, list) or not (3 <= len(ups) <= 5):
            errors.append(f"{tag}: usefulPhrases ต้องมี 3–5 รายการ")

        if GRAMMAR_WORDS.search(json.dumps(d, ensure_ascii=False)):
            warnings.append(f"{tag}: พบคำเกี่ยวกับไวยากรณ์ในเนื้อหา (เป้าหมายคือไม่เน้นไวยากรณ์)")

        # นับคำศัพท์ที่ใช้ซ้ำกับชุด 96 คำ
        text = " ".join([ln.get("en", "") for ln in lines]).lower()
        for w in vocab_all:
            if re.search(rf"\b{re.escape(w)}\b", text):
                vocab_hits.add(w)

        dialogues.append(d)

    ORDER = ["dlg-cafe", "dlg-restaurant", "dlg-reservation", "dlg-hotel",
             "dlg-directions", "dlg-shopping", "dlg-pharmacy", "dlg-office"]
    dialogues.sort(key=lambda d: ORDER.index(d["id"]) if d["id"] in ORDER else 99)

    OUT.write_text(json.dumps(dialogues, ensure_ascii=False, indent=1), encoding="utf-8")

    total_lines = sum(len(d["lines"]) for d in dialogues)
    me_lines = sum(1 for d in dialogues for ln in d["lines"] if ln["who"] == "me")
    print(f"รวมได้ {len(dialogues)} สถานการณ์ · {total_lines} บรรทัด (บทของผู้ใช้ {me_lines} ประโยค)")
    for d in dialogues:
        n_me = sum(1 for ln in d["lines"] if ln["who"] == "me")
        print(f"  {d['emoji']} {d['title']:<26} {len(d['lines'])} บรรทัด · พูดเอง {n_me} ประโยค")
    if vocab_all:
        pct = len(vocab_hits) / len(vocab_all) * 100
        print(f"\nใช้คำศัพท์จากชุด 96 คำ: {len(vocab_hits)}/{len(vocab_all)} คำ ({pct:.0f}%)")
    print(f"เขียน {OUT.relative_to(ROOT)}")

    if warnings:
        print(f"\nคำเตือน {len(warnings)} รายการ:")
        for w in warnings[:30]:
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
