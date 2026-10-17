#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
generate_audio.py — สร้างไฟล์เสียงสำหรับเนื้อหาทั้งแอป (คำศัพท์ + ประโยค + บทสนทนา)

ทำไมต้องสร้างไฟล์เสียงล่วงหน้า
  - เสียงเหมือนกันทุกเครื่อง (ไม่ขึ้นกับเสียงของระบบปฏิบัติการของผู้ใช้)
  - เลือกเสียงผู้ชายที่ฟังง่ายได้ตามใจ
  - ใช้ได้ตอนออฟไลน์ และไม่ต้องพึ่งบริการภายนอกตอนผู้ใช้เล่น

วิธีใช้
    # ดูเสียงที่เลือกได้ (Edge)
    python -m edge_tts --list-voices | findstr en-US

    # สร้างเฉพาะคำศัพท์ 12 คำแรก (ทดลองเร็ว)
    python scripts/generate_audio.py --engine edge --voice en-US-AndrewNeural --only words --limit 12

    # สร้างทั้งหมด (คำ + ประโยค + บทสนทนา)
    python scripts/generate_audio.py --engine edge --voice en-US-AndrewNeural

    # ใช้ Piper (MIT ใช้เชิงพาณิชย์ได้ ทำงานออฟไลน์)
    python scripts/generate_audio.py --engine piper --voice en_US-ryan-high

คีย์ใน manifest (ฝั่งแอปอ่านค่านี้จาก js/speech.js)
    word:<wordId>      เสียงอ่านคำศัพท์
    sent:<wordId>      เสียงอ่านประโยคตัวอย่าง
    <dlgId>:<lineIdx>  เสียงอ่านบรรทัดบทสนทนา
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTDIR = ROOT / "data" / "audio"
MANIFEST = OUTDIR / "manifest.json"
VOICE_CACHE = Path.home() / ".cache" / "picenglish-voices"
PIPER_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass


def find_piper() -> str | None:
    """หาโปรแกรม piper ให้ได้ทั้ง Windows (piper.exe) และ macOS/Linux (piper)"""
    import shutil  # noqa: PLC0415
    hit = shutil.which("piper") or shutil.which("piper.exe")
    if hit:
        return hit
    base = Path(sys.executable).parent
    for name in ("piper.exe", "piper"):
        cand = base / name
        if cand.exists():
            return str(cand)
    return None

def load_json(rel: str, default):
    p = ROOT / rel
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return default


def collect_items(only: str) -> list[tuple[str, str, Path]]:
    """คืนรายการ (คีย์, ข้อความ, ปลายทาง)"""
    items: list[tuple[str, str, Path]] = []
    words = load_json("data/words.json", [])
    dialogues = load_json("data/dialogues.json", [])

    if only in ("all", "words"):
        for w in words:
            items.append((f"word:{w['id']}", w["word"], OUTDIR / "words" / f"{w['id']}.mp3"))
    if only in ("all", "sentences"):
        for w in words:
            items.append((f"sent:{w['id']}", w["example"], OUTDIR / "sentences" / f"{w['id']}.mp3"))
    if only in ("all", "dialogues"):
        for d in dialogues:
            for i, ln in enumerate(d["lines"]):
                items.append((f"{d['id']}:{i}", ln["en"], OUTDIR / "dialogues" / f"{d['id']}-{i}.mp3"))
    return items


async def edge_one(voice: str, text: str, dest: Path, rate: str) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, "-m", "edge_tts", "--voice", voice, "--text", text,
           f"--rate={rate}", "--write-media", str(dest)]
    r = subprocess.run(cmd, capture_output=True, timeout=120)
    if r.returncode != 0 or not dest.exists() or dest.stat().st_size < 800:
        print(f"    ล้มเหลว: {r.stderr.decode('utf-8', 'replace')[:140]}")
        return False
    return True


def piper_model(name: str) -> tuple[Path, Path] | None:
    parts = name.split("-")
    lang_region, speaker = parts[0], parts[1]
    quality = parts[2] if len(parts) > 2 else "medium"
    sub = f"{lang_region.split('_')[0]}/{lang_region}/{speaker}/{quality}"
    VOICE_CACHE.mkdir(parents=True, exist_ok=True)
    onnx = VOICE_CACHE / f"{name}.onnx"
    conf = VOICE_CACHE / f"{name}.onnx.json"
    for target, suffix in ((onnx, ".onnx"), (conf, ".onnx.json")):
        if target.exists() and target.stat().st_size > 1000:
            continue
        try:
            urllib.request.urlretrieve(f"{PIPER_BASE}/{sub}/{name}{suffix}", target)
        except Exception as exc:  # noqa: BLE001
            print(f"    ดาวน์โหลดโมเดลไม่สำเร็จ: {exc}")
            return None
    return onnx, conf


def piper_one(model: tuple[Path, Path], text: str, dest: Path) -> bool:
    import shutil  # noqa: PLC0415
    import wave  # noqa: PLC0415

    dest.parent.mkdir(parents=True, exist_ok=True)
    onnx, conf = model
    tmp = dest.with_suffix(".tmp.wav")
    exe = find_piper()
    r = subprocess.run([exe, "--model", str(onnx), "--config", str(conf), "--output_file", str(tmp)],
                       input=text.encode("utf-8"), capture_output=True, timeout=180)
    if not tmp.exists():
        if r.stdout[:4] == b"RIFF":
            tmp.write_bytes(r.stdout)
        else:
            print(f"    ล้มเหลว: {r.stderr.decode('utf-8', 'replace')[:140]}")
            return False
    try:
        import lameenc  # noqa: PLC0415
        with wave.open(str(tmp), "rb") as w:
            channels, rate, _ = w.getnchannels(), w.getframerate(), w.getsampwidth()
            frames = w.readframes(w.getnframes())
        enc = lameenc.Encoder()
        enc.set_bit_rate(48)
        enc.set_in_sample_rate(rate)
        enc.set_channels(channels)
        enc.set_quality(2)
        dest.write_bytes(enc.encode(frames) + enc.flush())
        tmp.unlink(missing_ok=True)
        return dest.stat().st_size > 800
    except Exception as exc:  # noqa: BLE001
        print(f"    แปลง MP3 ไม่สำเร็จ ({exc})")
        tmp.unlink(missing_ok=True)
        return False


async def main_async(args) -> int:
    OUTDIR.mkdir(parents=True, exist_ok=True)
    items = collect_items(args.only)
    if args.limit:
        items = items[: args.limit]
    if not items:
        print("ไม่พบรายการที่ต้องสร้าง")
        return 1

    manifest = {}
    if MANIFEST.exists() and not args.clean:
        try:
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            manifest = {}

    print(f"จะสร้าง {len(items)} ไฟล์ ด้วย {args.engine} / {args.voice}")
    model = piper_model(args.voice) if args.engine == "piper" else None
    if args.engine == "piper" and not model:
        return 1

    ok = 0
    fail = 0
    for n, (key, text, dest) in enumerate(items, 1):
        if dest.exists() and dest.stat().st_size > 800 and not args.force:
            manifest[key] = str(dest.relative_to(OUTDIR)).replace("\\", "/")
            ok += 1
            continue
        print(f"  [{n}/{len(items)}] {key}")
        if args.engine == "edge":
            done = await edge_one(args.voice, text, dest, args.rate)
        else:
            done = piper_one(model, text, dest)
        if done:
            manifest[key] = str(dest.relative_to(OUTDIR)).replace("\\", "/")
            ok += 1
        else:
            fail += 1

    # เขียน manifest ใหม่ทั้งไฟล์ (เฉพาะไฟล์ที่มีจริง)
    valid = {}
    for k, rel in manifest.items():
        if (OUTDIR / rel).exists():
            valid[k] = rel
    MANIFEST.write_text(json.dumps(valid, ensure_ascii=False, indent=1), encoding="utf-8")

    size = sum((OUTDIR / r).stat().st_size for r in valid.values())
    print(f"\nสำเร็จ {ok} ไฟล์ · ล้มเหลว {fail} ไฟล์ · manifest มี {len(valid)} รายการ")
    print(f"ขนาดรวม {size / 1024 / 1024:.2f} MB → {MANIFEST.relative_to(ROOT)}")
    print("แอปจะใช้ไฟล์เหล่านี้โดยอัตโนมัติ (และถอยกลับไปใช้เสียงเบราว์เซอร์ถ้าไม่มี)")
    return 0 if fail == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", choices=["edge", "piper"], default="edge")
    ap.add_argument("--voice", default="en-US-AndrewNeural")
    ap.add_argument("--only", choices=["all", "words", "sentences", "dialogues"], default="all")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--rate", default="-6%", help="ความเร็ว (Edge เท่านั้น) เช่น -6%% ช้ากว่าปกติเล็กน้อย")
    ap.add_argument("--force", action="store_true", help="สร้างทับไฟล์เดิม")
    ap.add_argument("--clean", action="store_true", help="เริ่ม manifest ใหม่")
    return asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
