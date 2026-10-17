#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_art.py — ดาวน์โหลดภาพกราฟฟิกน่ารัก (SVG) ฟรี สำหรับคำศัพท์ทุกคำ

ทำไมใช้ภาพกราฟฟิกแทนภาพถ่าย
  - ตรงความหมายกว่า (ภาพถ่ายจากคลังฟรีตรงเพียง ~75%)
  - สื่อคำนามธรรมได้ (ภูมิใจ / ตรงต่อเวลา / เครียด)
  - ไฟล์เล็กมาก (2–4 KB) → เก็บในแอปได้ ใช้ได้ตอนออฟไลน์ 100%
  - สไตล์สม่ำเสมอทั้งแอป

แหล่งภาพ (ฟรี ใช้เชิงพาณิชย์ได้ ต้องให้เครดิต)
  1) OpenMoji  — CC BY-SA 4.0 — https://openmoji.org
  2) Twemoji   — CC BY 4.0    — https://github.com/jdecked/twemoji

วิธีใช้:
    python scripts/build_art.py                # ดาวน์โหลดเฉพาะที่ยังไม่มี
    python scripts/build_art.py --force        # ดาวน์โหลดใหม่ทั้งหมด
    python scripts/build_art.py --source twemoji

ผลลัพธ์: data/art/<wordId>.svg + data/art/manifest.json
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS = ROOT / "data" / "words.json"
OUT = ROOT / "data" / "art"
MANIFEST = OUT / "manifest.json"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

SOURCES = {
    "openmoji": {
        "url": "https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/color/svg/{name}.svg",
        "license": "CC BY-SA 4.0",
        "credit": "OpenMoji (openmoji.org)",
        "case": str.upper,
    },
    "twemoji": {
        "url": "https://raw.githubusercontent.com/jdecked/twemoji/main/assets/svg/{name}.svg",
        "license": "CC BY 4.0",
        "credit": "Twemoji (github.com/jdecked/twemoji)",
        "case": str.lower,
    },
}


def name_candidates(emoji: str) -> list[str]:
    """แปลงอีโมจิเป็นชื่อไฟล์หลายแบบ (มี/ไม่มี FE0F, เฉพาะตัวแรกของ ZWJ)"""
    cps = [f"{ord(ch):X}" for ch in emoji]
    out: list[str] = []

    def add(seq: list[str]) -> None:
        if not seq:
            return
        name = "-".join(seq)
        if name not in out:
            out.append(name)

    add(cps)
    add([c for c in cps if c not in ("FE0F", "FE0E")])
    if len(cps) > 1:
        add(cps[:1])
    return out


def fetch(url: str, timeout: int = 25) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "PicEnglish-build/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                return None
            data = r.read()
            if b"<svg" not in data[:400]:
                return None
            return data
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--source", choices=list(SOURCES), default=None,
                    help="บังคับใช้แหล่งเดียว (ค่าเริ่มต้น: ลอง OpenMoji ก่อนแล้วจึง Twemoji)")
    args = ap.parse_args()

    if not WORDS.exists():
        print("ไม่พบ data/words.json — รัน scripts/build_data.py ก่อน")
        return 1
    words = json.loads(WORDS.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)

    order = [args.source] if args.source else ["openmoji", "twemoji"]
    manifest: dict[str, dict] = {}
    if MANIFEST.exists() and not args.force:
        try:
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            manifest = {}

    ok = skipped = failed = 0
    missing: list[str] = []
    by_source: dict[str, int] = {}

    for i, w in enumerate(words, 1):
        wid = w["id"]
        emoji = (w.get("emoji") or "").strip()
        dest = OUT / f"{wid}.svg"
        if dest.exists() and dest.stat().st_size > 200 and not args.force and wid in manifest:
            manifest[wid]["emoji"] = emoji
            skipped += 1
            continue
        if not emoji:
            failed += 1
            missing.append(f"{wid} (ไม่มีอีโมจิ)")
            continue

        got = None
        for src in order:
            conf = SOURCES[src]
            for name in name_candidates(emoji):
                data = fetch(conf["url"].format(name=conf["case"](name)))
                if data:
                    dest.write_bytes(data)
                    manifest[wid] = {
                        "file": dest.name,
                        "emoji": emoji,
                        "source": src,
                        "license": conf["license"],
                        "credit": conf["credit"],
                    }
                    got = src
                    break
            if got:
                break

        if got:
            ok += 1
            by_source[got] = by_source.get(got, 0) + 1
            print(f"  [{i}/{len(words)}] {wid:<26} {emoji} → {got}")
        else:
            failed += 1
            missing.append(f"{wid} {emoji}")
            print(f"  [{i}/{len(words)}] {wid:<26} {emoji} → ไม่พบภาพ")

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum((OUT / m["file"]).stat().st_size for m in manifest.values() if (OUT / m["file"]).exists())

    print(f"\nสำเร็จ {ok} · มีอยู่แล้ว {skipped} · ไม่พบ {failed}")
    if by_source:
        print("แหล่งภาพ: " + ", ".join(f"{k} {v}" for k, v in by_source.items()))
    print(f"ไฟล์ทั้งหมด {len(manifest)} ภาพ · ขนาดรวม {total / 1024:.0f} KB → {MANIFEST.relative_to(ROOT)}")
    if missing:
        print(f"\nภาพที่ยังขาด ({len(missing)}):")
        for m in missing[:20]:
            print("  - " + m)
    return 0 if not missing else 0


if __name__ == "__main__":
    sys.exit(main())
