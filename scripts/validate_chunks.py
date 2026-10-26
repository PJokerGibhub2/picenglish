#!/usr/bin/env python3
"""ตรวจสัญญาข้อมูลประโยคสำเร็จรูปและการซ้ำกับบทเรียนเดิม"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITUATIONS = ['cafe', 'restaurant', 'shopping', 'travel', 'hotel', 'health', 'work', 'smalltalk']
LEVELS = ['A0', 'A1.1', 'A1.2', 'A2.1', 'A2.2']


def norm(text):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9\s\']', ' ', str(text or '').lower())).strip()


def load(path):
    with path.open(encoding='utf-8') as fh:
        return json.load(fh)


def sentences(data, paths):
    out = set()
    for path in paths:
        if not path.exists():
            continue
        raw = load(path)
        if path.name == 'listening.json':
            items = raw.get('lessons', []) if isinstance(raw, dict) else raw
            for lesson in items:
                out.update(norm(line.get('en')) for line in lesson.get('transcript', []) if line.get('en'))
        else:
            items = raw.get('dialogues', []) if isinstance(raw, dict) else raw
            for dialogue in items:
                for line in dialogue.get('lines', []):
                    if line.get('en'):
                        out.add(norm(line['en']))
                    for phrase in line.get('keyPhrases', []):
                        if phrase.get('en'):
                            out.add(norm(phrase['en']))
                    for alt in line.get('alternative', []):
                        text = alt if isinstance(alt, str) else alt.get('en', '')
                        if text:
                            out.add(norm(text))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--strict', action='store_true')
    args = ap.parse_args()
    raw = load(ROOT / 'data' / 'chunks.json')
    chunks = raw.get('chunks', []) if isinstance(raw, dict) else []
    errors = []
    seen_ids, seen_text = set(), set()
    old = sentences(raw, [ROOT / 'data' / 'listening.json', ROOT / 'data' / 'dialogues.json'])
    for n, c in enumerate(chunks, 1):
        cid = c.get('id') or f'row-{n}'
        if not isinstance(c.get('id'), str) or not c.get('id', '').strip(): errors.append(f'row-{n}: id ต้องเป็นข้อความ')
        if cid in seen_ids: errors.append(f'{cid}: id ซ้ำ')
        seen_ids.add(cid)
        en = c.get('en') if isinstance(c.get('en'), str) else ''
        text = norm(en)
        if text in seen_text: errors.append(f'{cid}: ประโยคซ้ำใน chunks')
        seen_text.add(text)
        if text in old: errors.append(f'{cid}: ประโยคซ้ำกับ listening/dialogues')
        if c.get('situation') not in SITUATIONS: errors.append(f'{cid}: situation ไม่ถูกต้อง ({c.get("situation")})')
        if c.get('level') not in LEVELS: errors.append(f'{cid}: level ไม่ถูกต้อง ({c.get("level")})')
        words = re.findall(r"[A-Za-z0-9]+(?:['’][A-Za-z]+)?", en)
        if not 4 <= len(words) <= 14: errors.append(f'{cid}: ประโยคยาว {len(words)} คำ (ต้อง 4–14)')
        key_phrase = c.get('keyPhrase') if isinstance(c.get('keyPhrase'), str) else ''
        if not key_phrase or key_phrase not in en: errors.append(f'{cid}: keyPhrase ไม่อยู่ใน en')
        if not isinstance(c.get('th'), str) or not c.get('th', '').strip(): errors.append(f'{cid}: ไม่มีคำแปลภาษาไทย')
        note = c.get('note') if isinstance(c.get('note'), str) else ''
        if len(note) > 60: errors.append(f'{cid}: note ยาวเกิน 60 ตัวอักษร')
    situation_counts = Counter(c.get('situation') for c in chunks)
    level_counts = Counter(c.get('level') for c in chunks)
    print('สรุปตามสถานการณ์:')
    for key in SITUATIONS: print(f'  {key:12} {situation_counts[key]:3}')
    print('สรุปตามระดับ:')
    for key in LEVELS: print(f'  {key:12} {level_counts[key]:3}')
    if len(chunks) != 150: errors.append(f'จำนวนประโยค = {len(chunks)} (ต้อง 150)')
    if any(not 15 <= situation_counts[key] <= 20 for key in SITUATIONS): errors.append('แต่ละ situation ต้องมี 15–20 ประโยค')
    if level_counts != Counter({'A0': 30, 'A1.1': 45, 'A1.2': 38, 'A2.1': 22, 'A2.2': 15}): errors.append(f'สัดส่วน level ไม่ตรง: {dict(level_counts)}')
    if errors:
        for error in errors: print('ผิดพลาด: ' + error)
        print(f'VALIDATION FAILED · {len(errors)} ข้อ')
        return 1 if args.strict else 0
    print('VALIDATION PASSED · 150 ประโยค · ไม่มีข้อผิดพลาด')
    return 0


if __name__ == '__main__':
    sys.exit(main())
