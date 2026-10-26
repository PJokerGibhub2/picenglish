#!/usr/bin/env python3
"""
generate_kokoro.py — สร้างไฟล์เสียงด้วย Kokoro TTS (ออฟไลน์, ไม่ต้องใช้ API)

เสียงที่ใช้:
  af_heart  → ผู้หญิง (เสียงหลัก)
  am_adam   → ผู้ชาย (เสียงรอง)

สร้างไฟล์ MP3 24 kHz mono 32 kbps ลง data/audio/{f,m}/ + manifest.json
คีย์ต้องตรงกับที่แอปเรียก: app:
  word:<id>        คำศัพท์
  sent:<id>        ประโยคตัวอย่าง
  <dlgId>:<index>  บทสนทนา

วิธีใช้:
  python scripts/generate_kokoro.py            # ทั้งหมด
  python scripts/generate_kokoro.py --limit 3  # ทดสอบเร็ว ๆ
  python scripts/generate_kokoro.py --voice f  # เฉพาะเสียงผู้หญิง
"""
import argparse
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, 'scripts', 'models')
OUT = os.path.join(ROOT, 'data', 'audio')
VOICES = {'f': 'af_heart', 'm': 'am_adam'}
BITRATE = 32
SR = 24000


def slug(key: str) -> str:
    r"""ทำให้คีย์ปลอดภัยสำหรับชื่อไฟล์ (ตัดอักขระพิเศษออก)"""
    out = []
    for ch in key:
        out.append(ch if (ch.isalnum() or ch in '-_') else '_')
    return ''.join(out)


def load_tasks():
    tasks = []
    with open(os.path.join(ROOT, 'data', 'words.json'), encoding='utf-8') as fh:
        wdata = json.load(fh)
    words = wdata.get('words', wdata) if isinstance(wdata, dict) else wdata
    for w in words:
        tasks.append((f"word:{w['id']}", w['word']))
        ex = (w.get('example') or '').strip()
        if ex:
            tasks.append((f"sent:{w['id']}", ex))
    with open(os.path.join(ROOT, 'data', 'dialogues.json'), encoding='utf-8') as fh:
        ddata = json.load(fh)
    dias = ddata.get('dialogues', ddata) if isinstance(ddata, dict) else ddata
    for d in dias:
        for i, line in enumerate(d.get('lines') or []):
            en = (line.get('en') or '').strip()
            if en:
                tasks.append((f"{d['id']}:{i}", en))
            for j, p in enumerate(line.get('keyPhrases') or []):
                txt = (p.get('en') or '').strip()
                if txt:
                    tasks.append((f"kp:{d['id']}:{i}:{j}", txt))
            for j, a in enumerate(line.get('alternative') or []):
                txt = (a.get('en') or '').strip()
                if txt:
                    tasks.append((f"alt:{d['id']}:{i}:{j}", txt))

    # บทฟัง: แยกไฟล์ทีละบรรทัด เพื่อเล่นต่อเนื่องพร้อมไฮไลท์คาราโอเกะ
    lpath = os.path.join(ROOT, 'data', 'listening.json')
    if os.path.exists(lpath):
        with open(lpath, encoding='utf-8') as fh:
            ldata = json.load(fh)
        lessons = ldata.get('lessons', []) if isinstance(ldata, dict) else ldata
        for les in lessons:
            for i, seg in enumerate(les.get('transcript') or []):
                en = (seg.get('en') or '').strip()
                if en:
                    tasks.append((f"lis:{les['id']}:{i}", en))
    cpath = os.path.join(ROOT, 'data', 'chunks.json')
    if os.path.exists(cpath):
        with open(cpath, encoding='utf-8') as fh:
            cdata = json.load(fh)
        chunks = cdata.get('chunks', []) if isinstance(cdata, dict) else cdata
        for c in chunks:
            en = (c.get('en') or '').strip()
            if en:
                tasks.append((f"chunk:{c['id']}", en))
    return tasks


def mp3_bytes(samples, sr):
    import lameenc
    import numpy as np
    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE)
    enc.set_in_sample_rate(sr)
    enc.set_channels(1)
    enc.set_quality(5)
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype('<i2').tobytes()
    return bytes(enc.encode(pcm) + enc.flush())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--voice', choices=['f', 'm', 'both'], default='both')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    from kokoro_onnx import Kokoro
    model = os.path.join(MODELS, 'kokoro-v1.0.onnx')
    voices = os.path.join(MODELS, 'voices-v1.0.bin')
    if not (os.path.exists(model) and os.path.exists(voices)):
        print('ไม่พบโมเดล Kokoro ใน scripts/models/')
        return 1
    t0 = time.time()
    kokoro = Kokoro(model, voices)
    print(f'โหลดโมเดล {time.time() - t0:.1f}s')

    tasks = load_tasks()
    if args.limit:
        tasks = tasks[:args.limit]
    langs = {'f': 'en-us', 'm': 'en-us'}
    want = ['f', 'm'] if args.voice == 'both' else [args.voice]

    manifest = {}
    for g in want:
        os.makedirs(os.path.join(OUT, g), exist_ok=True)

    done = skipped = 0
    errors = []
    started = time.time()
    for idx, (key, text) in enumerate(tasks, 1):
        entry = {}
        for g in want:
            voice = VOICES[g]
            rel = f"{g}/{slug(key)}.mp3"
            dest = os.path.join(OUT, rel)
            if os.path.exists(dest) and not args.force:
                entry[g] = rel
                skipped += 1
                continue
            try:
                samples, sr = kokoro.create(text, voice=voice, speed=1.0, lang=langs[g])
                data = mp3_bytes(samples, sr)
                with open(dest, 'wb') as fh:
                    fh.write(data)
                entry[g] = rel
                done += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{key}/{g}: {exc}")
        if entry:
            manifest[key] = entry
        if idx % 25 == 0:
            rate = idx / max(1e-6, (time.time() - started))
            eta = (len(tasks) - idx) / max(1e-6, rate)
            print(f'  {idx}/{len(tasks)} · {rate:.1f} คีย์/วิ · เหลือ ~{eta/60:.1f} นาที')

    # รวมกับ manifest เดิม (กรณีรันทีละเสียง)
    mpath = os.path.join(OUT, 'manifest.json')
    if os.path.exists(mpath):
        try:
            with open(mpath, encoding='utf-8') as fh:
                old = json.load(fh)
            for k, v in manifest.items():
                merged = old.get(k) if isinstance(old.get(k), dict) else {}
                merged.update(v)
                old[k] = merged
            manifest = old
        except Exception:  # noqa: BLE001
            pass

    with open(mpath, 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=0)
    with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as fh:
        json.dump({
            'engine': 'kokoro-onnx',
            'voices': {'f': 'af_heart', 'm': 'am_adam'},
            'sampleRate': SR, 'bitrate': BITRATE, 'format': 'mp3',
            'count': len(manifest), 'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
        }, fh, ensure_ascii=False, indent=2)

    total = sum(os.path.getsize(os.path.join(OUT, v))
                for e in manifest.values() for v in e.values())
    print(f'เสร็จ: {done} สร้างใหม่ · {skipped} มีอยู่แล้ว · {len(errors)} ผิดพลาด')
    print(f'manifest {len(manifest)} คีย์ · รวม {total/1e6:.2f} MB · ใช้เวลา {(time.time()-started)/60:.1f} นาที')
    if errors:
        print('ผิดพลาด:', errors[:5])
    return 0


if __name__ == '__main__':
    sys.exit(main())
