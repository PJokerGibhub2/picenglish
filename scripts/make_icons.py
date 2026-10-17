#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
make_icons.py — สร้างไอคอน PWA (PNG) สำหรับแอป PicEnglish
รัน:  python scripts/make_icons.py
ต้องมี Pillow (มีมาให้ในรันไทม์ของ DSH)
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    print("ต้องติดตั้ง Pillow และ numpy ก่อน")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

C1 = (79, 70, 229)     # indigo
C2 = (236, 72, 153)    # pink
FONT_CANDIDATES = [
    # Windows
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
    # macOS
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    # Linux
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def gradient(size: int) -> Image.Image:
    """ไล่สีทแยงมุมจาก C1 ไป C2"""
    y, x = np.mgrid[0:size, 0:size]
    t = (x + y) / (2.0 * (size - 1))
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    for i in range(3):
        arr[:, :, i] = (C1[i] + (C2[i] - C1[i]) * t).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def load_font(px: int):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, px)
        except Exception:  # noqa: BLE001
            continue
    return ImageFont.load_default()


def make(size: int, maskable: bool = False) -> Image.Image:
    img = gradient(size).convert("RGBA")
    d = ImageDraw.Draw(img)

    # สัดส่วนของการ์ดในไอคอน (เว้นที่ปลอดภัยมากขึ้นถ้าเป็น maskable)
    scale = 0.52 if maskable else 0.66
    card = int(size * scale)
    cx, cy = size // 2, int(size * 0.54)
    box = [cx - card // 2, cy - card // 2, cx + card // 2, cy + card // 2]
    radius = int(card * 0.22)

    # เงาเบาๆ
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [box[0], box[1] + int(size * 0.018), box[2], box[3] + int(size * 0.018)],
        radius=radius, fill=(15, 18, 40, 90))
    img = Image.alpha_composite(img, shadow)
    d = ImageDraw.Draw(img)

    d.rounded_rectangle(box, radius=radius, fill=(255, 255, 255, 245))

    # ตัวอักษร Aa
    font = load_font(int(card * 0.62))
    text = "Aa"
    tb = d.textbbox((0, 0), text, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text((cx - tw / 2 - tb[0], cy - th / 2 - tb[1] - int(card * 0.04)),
           text, font=font, fill=(79, 70, 229, 255))

    # แถบสีใต้ตัวอักษร (สื่อว่าเป็นแอปที่มีเสียง/ภาพ)
    bar_w = int(card * 0.5)
    bar_h = max(2, int(card * 0.045))
    bx = cx - bar_w // 2
    by = cy + int(card * 0.28)
    d.rounded_rectangle([bx, by, bx + bar_w, by + bar_h], radius=bar_h // 2, fill=(236, 72, 153, 230))

    return img


def main() -> int:
    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
    ]
    for name, size, maskable in targets:
        img = make(size, maskable)
        img.convert("RGB").save(OUT / name, "PNG", optimize=True)
        print(f"เขียน {(OUT / name).relative_to(ROOT)}  ({size}x{size})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
