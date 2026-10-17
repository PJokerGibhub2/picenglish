#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
make_voice_samples.py — สร้างไฟล์เสียงตัวอย่างจากหลาย voix เพื่อให้เปรียบเทียบก่อนเลือกใช้จริง

ใช้ประโยคจริงจากแอป (data/words.json) เพื่อให้ตัดสินใจบนบริบทที่ใช้จริง

วิธีใช้:
    python scripts/make_voice_samples.py --edge          # เสียงจาก Microsoft Edge (ฟรี ไม่ต้องมี key)
    python scripts/make_voice_samples.py --piper         # เสียงจาก Piper (MIT, ทำงานออฟไลน์ได้)
    python scripts/make_voice_samples.py --edge --piper  # ทำทั้งสอง
    python scripts/make_voice_samples.py --html          # สร้างหน้ารวมให้กดฟังเทียบ (ทำอัตโนมัติ)

ผลลัพธ์: docs/voice-samples/*.mp3 + docs/voice-samples/index.html
"""
from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "voice-samples"
VOICE_CACHE = Path.home() / ".cache" / "picenglish-voices"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

# ประโยคที่ใช้ทดสอบ (หยิบจากเนื้อหาจริงของแอป)
SENTENCES = [
    ("word", "Could I get a medium latte, please?"),
    ("sentence", "Their new house has a small garden and a garage."),
]

# เสียงผู้ชายภาษาอังกฤษที่นิยมและฟังง่าย (ชื่อจาก edge-tts)
EDGE_VOICES = [
    ("en-US-AndrewNeural", "Andrew (US) — นุ่ม เป็นมิตร นิยมใช้ในงานบรรยาย"),
    ("en-US-BrianNeural", "Brian (US) — ชัดถ้อยชัดคำ เป็นมิตร เหมาะกับผู้เรียน"),
    ("en-US-GuyNeural", "Guy (US) — เสียงผู้ประกาศข่าว ชัดเจน"),
    ("en-US-ChristopherNeural", "Christopher (US) — หนักแน่น น่าเชื่อถือ"),
    ("en-US-EricNeural", "Eric (US) — เรียบง่าย ชัด"),
    ("en-GB-RyanNeural", "Ryan (UK) — สำเนียงอังกฤษ ฟังง่าย"),
]

# เสียง Piper (ฟรี MIT ใช้เชิงพาณิชย์ได้ ทำงานออฟไลน์)
PIPER_VOICES = [
    ("en_US-ryan-high", "Ryan High (US) — คุณภาพสูงสุดของ Piper"),
    ("en_US-joe-medium", "Joe Medium (US) — เบา เร็ว ไฟล์เล็ก"),
    ("en_US-hfc_male-medium", "HFC Male Medium (US) — เสียงผู้ชายชัด ๆ"),
    ("en_GB-alan-medium", "Alan (UK) — สำเนียงอังกฤษ"),
]
PIPER_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"


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

def edge_sample(voice: str, text: str, dest: Path) -> bool:
    """ใช้ edge-tts (ต้องติดตั้ง: pip install edge-tts)"""
    cmd = [sys.executable, "-m", "edge_tts", "--voice", voice, "--text", text,
           "--rate=-8%", "--write-media", str(dest)]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode != 0:
            print(f"    ล้มเหลว: {r.stderr.decode('utf-8', 'replace')[:160]}")
            return False
        return dest.exists() and dest.stat().st_size > 1000
    except Exception as exc:  # noqa: BLE001
        print(f"    ล้มเหลว: {exc}")
        return False


def download_piper_model(name: str) -> tuple[Path, Path] | None:
    """ดาวน์โหลดโมเดล Piper (.onnx + .onnx.json)"""
    # en_US-ryan-high -> en/en_US/ryan/high/en_US-ryan-high.onnx
    parts = name.split("-")
    lang_region = parts[0]              # en_US
    speaker = parts[1]                  # ryan
    quality = parts[2] if len(parts) > 2 else "medium"
    lang = lang_region.split("_")[0]    # en
    sub = f"{lang}/{lang_region}/{speaker}/{quality}"
    VOICE_CACHE.mkdir(parents=True, exist_ok=True)
    onnx = VOICE_CACHE / f"{name}.onnx"
    conf = VOICE_CACHE / f"{name}.onnx.json"
    for target, suffix in ((onnx, ".onnx"), (conf, ".onnx.json")):
        if target.exists() and target.stat().st_size > 1000:
            continue
        url = f"{PIPER_BASE}/{sub}/{name}{suffix}"
        try:
            print(f"    ดาวน์โหลด {url}")
            urllib.request.urlretrieve(url, target)
        except Exception as exc:  # noqa: BLE001
            print(f"    ดาวน์โหลดไม่สำเร็จ: {exc}")
            return None
    return onnx, conf


def piper_sample(name: str, text: str, dest_mp3: Path) -> bool:
    """สร้างเสียงด้วย Piper แล้วบีบอัดเป็น MP3 ด้วย lameenc (ไม่ต้องมี ffmpeg)"""
    model = download_piper_model(name)
    if not model:
        return False
    onnx, conf = model

    # 1) สังเคราะห์เป็น WAV ด้วย CLI ของ piper
    tmp_wav = dest_mp3.with_suffix(".tmp.wav")
    exe = find_piper()
    cmd = [exe, "--model", str(onnx), "--config", str(conf), "--output_file", str(tmp_wav)]
    try:
        r = subprocess.run(cmd, input=text.encode("utf-8"), capture_output=True, timeout=180)
        if not tmp_wav.exists():
            # บางเวอร์ชันใช้ --output_file - แล้วเขียนลง stdout
            if r.stdout[:4] == b"RIFF":
                tmp_wav.write_bytes(r.stdout)
            else:
                print(f"    ล้มเหลว: {r.stderr.decode('utf-8', 'replace')[:160]}")
                return False
    except Exception as exc:  # noqa: BLE001
        print(f"    ล้มเหลว: {exc}")
        return False

    # 2) แปลง WAV -> MP3
    try:
        import lameenc  # noqa: PLC0415
        import wave  # noqa: PLC0415

        with wave.open(str(tmp_wav), "rb") as w:
            channels, rate, width = w.getnchannels(), w.getframerate(), w.getsampwidth()
            frames = w.readframes(w.getnframes())
        enc = lameenc.Encoder()
        enc.set_bit_rate(48)
        enc.set_in_sample_rate(rate)
        enc.set_channels(channels)
        enc.set_quality(2)
        data = enc.encode(frames) + enc.flush()
        dest_mp3.write_bytes(data)
        tmp_wav.unlink(missing_ok=True)
        return len(data) > 1000
    except Exception as exc:  # noqa: BLE001
        print(f"    แปลง MP3 ไม่สำเร็จ ({exc}) — เก็บเป็น WAV แทน")
        dest_mp3.with_suffix(".wav").write_bytes(tmp_wav.read_bytes())
        tmp_wav.unlink(missing_ok=True)
        return True


def build_html(entries: list[dict]) -> None:
    rows = []
    for e in entries:
        rows.append(f"""
      <div class="card">
        <div class="head">
          <div>
            <div class="name">{e['label']}</div>
            <div class="src">{e['engine']} · {e['voice']} · {e['note']}</div>
          </div>
          <span class="tag {e['tagClass']}">{e['tag']}</span>
        </div>
        <div class="text">“{e['text']}”</div>
        <audio controls preload="none" src="{e['file']}"></audio>
      </div>""")

    html = f"""<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ตัวอย่างเสียงสำหรับ PicEnglish</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font-family: "Noto Sans Thai", system-ui, -apple-system, sans-serif;
         margin: 0; padding: 20px; background: #f4f5fb; color: #101828; line-height: 1.6; }}
  h1 {{ font-size: 1.3rem; margin: 0 0 4px; }}
  .lead {{ color: #667085; font-size: .92rem; margin-bottom: 18px; }}
  .grid {{ display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); }}
  .card {{ background: #fff; border: 1px solid #e7e9f2; border-radius: 16px; padding: 14px;
           box-shadow: 0 1px 3px rgba(16,24,40,.06); }}
  .head {{ display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }}
  .name {{ font-weight: 800; }}
  .src {{ font-size: .76rem; color: #667085; }}
  .tag {{ font-size: .68rem; font-weight: 800; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }}
  .free {{ background: #e8f8ef; color: #12b76a; }}
  .careful {{ background: #fef3e2; color: #b54708; }}
  .text {{ font-family: Inter, system-ui, sans-serif; margin: 10px 0 8px; font-size: 1rem; }}
  audio {{ width: 100%; height: 36px; }}
  .note {{ margin-top: 22px; background: #fff; border: 1px solid #e7e9f2; border-radius: 16px; padding: 16px; }}
  .note h2 {{ font-size: 1rem; margin: 0 0 8px; }}
  ul {{ margin: 6px 0 0 18px; padding: 0; }}
  code {{ background: #f4f5fb; padding: 1px 5px; border-radius: 6px; font-size: .85em; }}
</style></head>
<body>
  <h1>ตัวอย่างเสียงชาย — เลือกเสียงที่จะใช้ในแอป</h1>
  <div class="lead">ทุกเสียงพูดประโยคเดียวกัน (ช้ากว่าปกติ 8%) ให้ฟังแล้วเลือกอันที่ “ฟังง่ายที่สุดสำหรับคนไทย”</div>
  <div class="grid">{''.join(rows)}</div>

  <div class="note">
    <h2>หมายเหตุเรื่องลิขสิทธิ์</h2>
    <ul>
      <li><b>Piper</b> — ไลเซนส์ MIT ใช้เชิงพาณิชย์ได้ ทำงานออฟไลน์ได้ ไฟล์เล็ก → <b>ปลอดภัยที่สุดถ้าจะขายจริง</b></li>
      <li><b>Kokoro</b> — Apache-2.0 ใช้เชิงพาณิชย์ได้ คุณภาพสูงกว่า แต่ช้ากว่า Piper ราว 8–9 เท่าบน CPU</li>
      <li><b>Edge TTS</b> — ฟรีและคุณภาพสูงสุด แต่เป็นบริการของ Microsoft ผ่านช่องทางที่ไม่ใช่ API ทางการ
          ควรใช้เพื่อทดลอง/ทำไฟล์ส่วนตัว ถ้าจะใช้เชิงพาณิชย์ให้ตรวจเงื่อนไขก่อน</li>
      <li><b>Azure Speech (ชั้นฟรี F0)</b> — 500,000 ตัวอักษร/เดือน ฟรี ใช้เชิงพาณิชย์ได้ตามเงื่อนไขบัญชี
          → เหมาะถ้าอยากได้เสียงระดับ Andrew/Brian แบบถูกต้องตามเงื่อนไข</li>
    </ul>
    <p style="margin:10px 0 0;font-size:.86rem;color:#667085">
      สร้างด้วยสคริปต์ <code>scripts/make_voice_samples.py</code> — ประโยคตัวอย่างหยิบจากเนื้อหาจริงใน <code>data/words.json</code>
    </p>
  </div>
</body></html>"""
    (OUT / "index.html").write_text(html, encoding="utf-8")


async def main_async(args) -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    # รวมรายการเดิมไว้ด้วย (การรันรอบก่อนอาจสร้างเสียงชุดอื่นไว้แล้ว)
    entries: list[dict] = []
    seen: set[tuple] = set()
    voices_json = OUT / "voices.json"
    if voices_json.exists() and not args.clean:
        try:
            for e in json.loads(voices_json.read_text(encoding="utf-8")):
                if (OUT / e.get("file", "")).exists():
                    entries.append(e)
                    seen.add((e.get("engine"), e.get("voice"), e.get("text")))
        except Exception:  # noqa: BLE001
            pass

    def add(engine: str, voice: str, note: str, text: str, file: str, tag: str, tag_class: str) -> None:
        key = (engine, voice, text)
        if key in seen:
            return
        seen.add(key)
        entries.append({
            "label": voice, "engine": engine, "voice": voice, "note": note,
            "text": text, "file": file, "tag": tag, "tagClass": tag_class,
        })

    if args.edge:
        print("สร้างเสียงตัวอย่างจาก Edge TTS (ฟรี ไม่ต้องมี key)…")
        for voice, note in EDGE_VOICES:
            for kind, text in SENTENCES:
                dest = OUT / f"edge-{voice}-{kind}.mp3"
                if dest.exists() and dest.stat().st_size > 1000 and not args.force:
                    add("Edge TTS", voice, note, text, dest.name, "ทดลองใช้", "careful")
                    print(f"  {voice} [{kind}] — มีอยู่แล้ว")
                    continue
                print(f"  {voice} [{kind}]")
                if edge_sample(voice, text, dest):
                    add("Edge TTS", voice, note, text, dest.name, "ทดลองใช้", "careful")

    if args.piper:
        print("สร้างเสียงตัวอย่างจาก Piper (MIT, ออฟไลน์ได้)…")
        if not find_piper():
            print("  ไม่พบคำสั่ง piper — ข้าม (ติดตั้งด้วย: pip install piper-tts)")
        else:
            for voice, note in PIPER_VOICES:
                for kind, text in SENTENCES:
                    dest = OUT / f"piper-{voice}-{kind}.mp3"
                    if dest.exists() and dest.stat().st_size > 1000 and not args.force:
                        add("Piper", voice, note, text, dest.name, "ฟรี 100%", "free")
                        print(f"  {voice} [{kind}] — มีอยู่แล้ว")
                        continue
                    print(f"  {voice} [{kind}]")
                    if piper_sample(voice, text, dest):
                        file = dest.name if dest.exists() else dest.with_suffix(".wav").name
                        add("Piper", voice, note, text, file, "ฟรี 100%", "free")

    if not entries:
        print("ไม่มีไฟล์เสียงที่สร้างได้")
        return 1

    voices_json.write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8")
    build_html(entries)
    print(f"\nสร้างเสร็จ {len(entries)} ไฟล์ → เปิดดูที่ {(OUT / 'index.html').relative_to(ROOT)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--edge", action="store_true", help="สร้างตัวอย่างจาก Edge TTS")
    ap.add_argument("--piper", action="store_true", help="สร้างตัวอย่างจาก Piper")
    ap.add_argument("--force", action="store_true", help="สร้างทับไฟล์เดิม")
    ap.add_argument("--clean", action="store_true", help="ไม่ต้องรวมรายการเดิม")
    args = ap.parse_args()
    if not (args.edge or args.piper):
        args.edge = True
        args.piper = True
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
