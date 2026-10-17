#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
check_env.py — ตรวจความพร้อมของเครื่อง (ใช้เมื่อย้ายโปรเจกต์ไปเครื่องใหม่ เช่น MacBook)

รัน:  python3 scripts/check_env.py      (macOS/Linux)
      python  scripts/check_env.py      (Windows)

จะบอกว่า: มีอะไรแล้ว / ขาดอะไร / คำสั่งที่ต้องรันต่อในเครื่องนี้โดยเฉพาะ
"""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

OK = "  [มี]   "
NO = "  [ขาด]  "
OPT = "  [เพิ่ม]  "

CHROME_PATHS = {
    "Darwin": [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    "Windows": [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ],
    "Linux": ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
}

TEST_FLAGS = (
    "--headless --disable-gpu --use-fake-ui-for-media-stream "
    "--use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required "
    "--remote-debugging-port=9411 about:blank"
)


def has_module(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:  # noqa: BLE001
        return False


def find_chrome() -> str | None:
    key = platform.system()
    for p in CHROME_PATHS.get(key, []):
        if Path(p).exists():
            return p
    for cmd in ("google-chrome", "chromium", "chrome"):
        hit = shutil.which(cmd)
        if hit:
            return hit
    return None


def main() -> int:
    sysname = platform.system()
    missing_py: list[str] = []
    missing_opt: list[str] = []

    print("=" * 62)
    print(" ตรวจสภาพแวดล้อมสำหรับโปรเจกต์ PicEnglish")
    print("=" * 62)
    print(f"  ระบบ: {sysname} {platform.release()} ({platform.machine()})")
    print(f"  Python: {sys.version.split()[0]}  →  {sys.executable}")
    print(f"  โฟลเดอร์โปรเจกต์: {ROOT}")
    print()

    # ---------- Python packages ----------
    print(" แพ็กเกจ Python")
    pkgs = [
        ("PIL", "Pillow", True, "สร้างไอคอน PWA (scripts/make_icons.py)"),
        ("numpy", "numpy", True, "ใช้ใน make_icons.py"),
        ("lameenc", "lameenc", False, "แปลงเสียงเป็น MP3 สำหรับ Piper (ไม่ต้องมี ffmpeg)"),
        ("edge_tts", "edge-tts", False, "สร้างเสียงด้วย Edge TTS (scripts/make_voice_samples.py)"),
        ("piper", "piper-tts", False, "สร้างเสียงออฟไลน์ (MIT) — ทางเลือกที่ปลอดภัยเชิงพาณิชย์"),
    ]
    for mod, pipname, required, why in pkgs:
        if has_module(mod):
            print(f"{OK}{pipname}")
        else:
            print(f"{NO}{pipname} — {why}")
            (missing_py if required else missing_opt).append(pipname)

    # ---------- Node ----------
    print("\n เครื่องมืออื่น")
    node = shutil.which("node")
    print(f"{OK if node else NO}node {subprocess.run([node, '--version'], capture_output=True, text=True).stdout.strip() if node else '(ต้องมีสำหรับสคริปต์ทดสอบ)'}")
    git = shutil.which("git")
    print(f"{OK if git else OPT}git {('— ใช้เก็บประวัติ/ย้ายเครื่อง' if not git else '')}")
    chrome = find_chrome()
    print(f"{OK if chrome else NO}Chrome/Edge {('→ ' + chrome) if chrome else '(ต้องมีสำหรับ E2E)'}")

    # ---------- Commands for this OS ----------
    serve_py = "python3" if sysname != "Windows" else "python"
    print("\n คำสั่งสำหรับเครื่องนี้")
    print(f"   รันเซิร์ฟเวอร์:      {serve_py} -m http.server 5173")
    print("   ตรวจ import:       node scripts/check_imports.mjs")
    print("   ทดสอบทั้งชุด:      node scripts/e2e_test.mjs")
    print("   สร้างข้อมูลใหม่:    " + f"{serve_py} scripts/build_data.py && {serve_py} scripts/build_dialogues.py")
    if chrome:
        quoted = f'"{chrome}"' if " " in chrome else chrome
        print(f"   เปิด Chrome ทดสอบ:  {quoted} {TEST_FLAGS}")

    # ---------- Verdict ----------
    print("\n" + "-" * 62)
    if missing_py:
        print(f" ❌ ยังขาดของจำเป็น: {', '.join(missing_py)}")
        print(f"    ติดตั้งด้วย: {serve_py} -m pip install " + " ".join(
            m for m in missing_py))
    else:
        print(" ✅ ของจำเป็นครบ — เริ่มรันเซิร์ฟเวอร์แล้วเปิด http://localhost:5173 ได้เลย")
    if missing_opt:
        print(f" ℹ️  ไม่มีก็ได้ (ใช้เฉพาะเมื่อสร้างเสียง): {', '.join(missing_opt)}")
    if not chrome:
        print(" ⚠️  ไม่พบ Chrome — สคริปต์ e2e/screenshot/audit ต้องใช้ Chrome หรือ Edge")
    print("-" * 62)
    print(" ขั้นต่อไป: อ่าน AGENTS.md (สำหรับ AI) หรือ README.md (สำหรับมนุษย์)")
    return 0 if not missing_py else 1


if __name__ == "__main__":
    sys.exit(main())
