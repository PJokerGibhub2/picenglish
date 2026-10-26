#!/usr/bin/env python3
"""ตรวจสัญญาหลักสูตร C1-C10 และคลังข้อสอบวัดระดับ โดยไม่พึ่งไลบรารีภายนอก"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVELS = ['A0', 'A1.1', 'A1.2', 'A2.1', 'A2.2']
TASKS = {'listen', 'flashcard', 'quiz', 'match', 'speak', 'roleplay', 'onemin', 'review'}
SKILLS = {'vocab', 'listening', 'phrase'}
errors = []


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f'{path.relative_to(ROOT)}: อ่าน JSON ไม่ได้: {exc}')
        return {}


def err(path, message, obj=None):
    line = ''
    if obj and obj.get('id'):
        try:
            for number, text in enumerate(path.read_text(encoding='utf-8-sig').splitlines(), 1):
                if f'"{obj["id"]}"' in text:
                    line = f':{number}'
                    break
        except OSError:
            pass
    errors.append(f'{path.relative_to(ROOT)}{line}: {message}')


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--strict', action='store_true', help='ให้คำศัพท์หรือบทสนทนาที่ตกหล่นเป็นข้อผิดพลาด')
    args = parser.parse_args()
    cp = ROOT / 'data/curriculum.json'
    pp = ROOT / 'data/placement.json'
    words = read_json(ROOT / 'data/words.json')
    dialogues = read_json(ROOT / 'data/dialogues.json')
    listening = read_json(ROOT / 'data/listening.json')
    manifest = read_json(ROOT / 'data/audio/manifest.json')
    curriculum = read_json(cp)
    placement = read_json(pp)
    if curriculum.get('version') != 1:
        err(cp, 'C1: version ต้องเป็น 1')
    levels = curriculum.get('levels', [])
    if [level.get('id') for level in levels] != LEVELS:
        err(cp, 'ต้องมี level A0, A1.1, A1.2, A2.1, A2.2 ตามลำดับ')
    ids, orders, word_owners, dialogue_owners, listening_owners = set(), [], Counter(), Counter(), Counter()
    total_units = total_lessons = blank_tasks = 0
    known_words = {w.get('id') for w in words if w.get('id')}
    known_dialogues = {d.get('id') for d in dialogues if d.get('id')}
    known_content = known_words | known_dialogues
    for level in levels:
        orders.append(level.get('order'))
        level_titles = set()
        for obj in [level]:
            if not obj.get('id') or obj['id'] in ids: err(cp, 'C1: id หายหรือซ้ำ', obj)
            ids.add(obj.get('id'))
        for unit in level.get('units', []):
            total_units += 1
            if not unit.get('id') or unit['id'] in ids: err(cp, 'C1: id หายหรือซ้ำ', unit)
            ids.add(unit.get('id'))
            lessons = unit.get('lessons', [])
            if not lessons: err(cp, 'C9: unit ต้องมี lesson อย่างน้อย 1 บท', unit)
            for lesson in lessons:
                total_lessons += 1
                if not lesson.get('id') or lesson['id'] in ids: err(cp, 'C1: id หายหรือซ้ำ', lesson)
                ids.add(lesson.get('id'))
                title = lesson.get('title')
                if title in level_titles: err(cp, 'C6: title ซ้ำภายใน level', lesson)
                level_titles.add(title)
                if not lesson.get('canDo'): err(cp, 'lesson ต้องมี canDo อย่างน้อย 1 ข้อ', lesson)
                if not isinstance(lesson.get('estMinutes'), int) or not 3 <= lesson['estMinutes'] <= 8:
                    err(cp, 'C8: estMinutes ต้องอยู่ระหว่าง 3–8', lesson)
                content = lesson.get('content', {})
                for word in content.get('words', []):
                    word_owners[word] += 1
                    if word not in known_words: err(cp, f'C2: ไม่พบคำศัพท์ {word}', lesson)
                for dialogue in content.get('dialogues', []):
                    dialogue_owners[dialogue] += 1
                    if dialogue not in known_dialogues: err(cp, f'C3: ไม่พบบทสนทนา {dialogue}', lesson)
                for listening_id in content.get('listening', []):
                    listening_owners[listening_id] += 1
                revisit = lesson.get('revisit', [])
                if len(revisit) != len(set(revisit)): err(cp, 'C5: revisit มีรายการซ้ำในบทเดียวกัน', lesson)
                for ref in revisit:
                    if ref not in known_content: err(cp, f'C5: revisit อ้างอิงไม่พบ {ref}', lesson)
                    if ref in content.get('words', []) or ref in content.get('dialogues', []):
                        err(cp, f'C5: revisit ซ้ำกับ content {ref}', lesson)
                tasks = lesson.get('tasks', [])
                if not tasks: blank_tasks += 1
                for task in tasks:
                    if task.get('mode') not in TASKS: err(cp, f'C7: task mode ไม่รองรับ {task.get("mode")}', lesson)
        if not level.get('units'): err(cp, 'C9: level ต้องมี unit อย่างน้อย 1 หน่วย', level)
    if orders != sorted(orders) or len(set(orders)) != len(orders): err(cp, 'C10: order ต้องเรียงเพิ่มและไม่ซ้ำ')
    for label, owners, known in [('คำศัพท์', word_owners, known_words), ('บทสนทนา', dialogue_owners, known_dialogues)]:
        duplicate = sorted(key for key, count in owners.items() if count > 1)
        missing = sorted(known - owners.keys())
        if duplicate: err(cp, f'C2/C3: {label}เจ้าของซ้ำ: {", ".join(duplicate)}')
        if missing and args.strict: err(cp, f'C2/C3: {label}ตกหล่น: {", ".join(missing)}')

    items = placement.get('items', [])
    seen, counts = set(), Counter()
    for item in items:
        iid = item.get('id')
        if not iid or iid in seen: err(pp, 'id ข้อสอบหายหรือซ้ำ', item)
        seen.add(iid)
        level, skill = item.get('level'), item.get('skill')
        if level not in LEVELS: err(pp, f'level ไม่ถูกต้อง: {level}', item)
        if skill not in SKILLS: err(pp, f'skill ไม่ถูกต้อง: {skill}', item)
        counts[(level, skill)] += 1
        options, answer = item.get('options', []), item.get('answer')
        prompt = item.get('prompt') if isinstance(item.get('prompt'), str) else ''
        if not isinstance(options, list) or not 3 <= len(options) <= 4: err(pp, 'options ต้องมี 3–4 ตัวเลือก', item)
        if not isinstance(answer, int) or not isinstance(options, list) or not 0 <= answer < len(options): err(pp, 'answer ต้องเป็น index ใน options', item)
        if skill == 'vocab':
            match = re.match(r'^คำว่า (.+) แปลว่าอะไร$', prompt)
            word = next((entry for entry in words if match and entry.get('word') == match.group(1)), None)
            if not word:
                err(pp, 'ข้อ vocab ต้องถามความหมายของคำในคลัง', item)
            elif isinstance(answer, int) and 0 <= answer < len(options) and options[answer] != word.get('thai'):
                err(pp, 'คำตอบ vocab ต้องตรงกับคำแปลไทยในคลัง', item)
        if skill == 'listening':
            if not item.get('audioKey') or item['audioKey'] not in manifest: err(pp, 'audioKey ไม่มีใน manifest', item)
        if skill == 'phrase' and not prompt.startswith('สถานการณ์นี้ควรพูดว่าอะไร'):
            err(pp, 'ข้อ phrase ต้องถามสถานการณ์นี้ควรพูดว่าอะไร', item)
        if skill == 'phrase' and isinstance(options, list) and any(not re.search(r'[A-Za-z]', option) for option in options):
            err(pp, 'ตัวเลือก phrase ต้องเป็นประโยคภาษาอังกฤษ', item)
    if len(items) < 60: err(pp, f'ต้องมีข้อสอบอย่างน้อย 60 ข้อ (พบ {len(items)})')
    for level in LEVELS:
        for skill in SKILLS:
            if counts[(level, skill)] < 4: err(pp, f'ต้องมีอย่างน้อย 4 ข้อ: {level}/{skill} (พบ {counts[(level, skill)]})')

    listening_path = ROOT / 'data/listening.json'
    known_listening = set()
    listening_by_level = Counter()
    total_listening_questions = 0
    valid_question_types = {'gist', 'detail', 'number', 'order', 'inference'}
    listening_titles = {level: set() for level in LEVELS}
    if not isinstance(listening, list):
        err(listening_path, 'L0: listening.json ต้องเป็น array')
        listening = []
    for lesson in listening:
        lid = lesson.get('id') if isinstance(lesson, dict) else None
        if not isinstance(lid, str) or not lid.startswith('lis-') or lid in known_listening:
            err(listening_path, f'L1: id ต้องไม่ซ้ำและขึ้นต้นด้วย lis- ({lid})', lesson if isinstance(lesson, dict) else None)
        if lid:
            known_listening.add(lid)
        level = lesson.get('level') if isinstance(lesson, dict) else None
        if level not in LEVELS:
            err(listening_path, f'L2: level ไม่ถูกต้อง ({level})', lesson if isinstance(lesson, dict) else None)
        else:
            listening_by_level[level] += 1
            title = lesson.get('title')
            if title in listening_titles[level]:
                err(listening_path, f'L2: title ซ้ำในระดับ {level}: {title}', lesson)
            listening_titles[level].add(title)
        transcript = lesson.get('transcript', []) if isinstance(lesson, dict) else []
        if not isinstance(transcript, list) or not 4 <= len(transcript) <= 10:
            err(listening_path, 'L3: transcript ต้องมี 4–10 บรรทัด', lesson if isinstance(lesson, dict) else None)
            transcript = transcript if isinstance(transcript, list) else []
        for index, line in enumerate(transcript):
            if not isinstance(line, dict) or not str(line.get('en', '')).strip() or not str(line.get('th', '')).strip():
                err(listening_path, f'L3: transcript บรรทัด {index} ต้องมี en และ th ไม่ว่าง', lesson)
        questions = lesson.get('questions', []) if isinstance(lesson, dict) else []
        if not isinstance(questions, list) or not 3 <= len(questions) <= 6:
            err(listening_path, 'L4: questions ต้องมี 3–6 ข้อ', lesson if isinstance(lesson, dict) else None)
            questions = questions if isinstance(questions, list) else []
        total_listening_questions += len(questions)
        for qi, question in enumerate(questions):
            if not isinstance(question, dict):
                err(listening_path, f'L4: คำถาม {qi} ต้องเป็น object', lesson)
                continue
            options, answer = question.get('options'), question.get('answer')
            if question.get('type') not in valid_question_types:
                err(listening_path, f'L4: type คำถาม {qi} ไม่ถูกต้อง ({question.get("type")})', lesson)
            if not isinstance(options, list) or not 3 <= len(options) <= 4:
                err(listening_path, f'L4: options คำถาม {qi} ต้องมี 3–4 ตัวเลือก', lesson)
            if not isinstance(answer, int) or isinstance(answer, bool) or not isinstance(options, list) or not 0 <= answer < len(options):
                err(listening_path, f'L4: answer คำถาม {qi} อยู่นอกช่วง options', lesson)
            line_index = question.get('line')
            if not isinstance(line_index, int) or isinstance(line_index, bool) or not 0 <= line_index < len(transcript):
                err(listening_path, f'L5: line คำถาม {qi} ไม่มี index ใน transcript', lesson)
        targets = lesson.get('targetWords', []) if isinstance(lesson, dict) else []
        if not isinstance(targets, list) or not 2 <= len(targets) <= 4 or any(word not in known_words for word in targets):
            missing = [word for word in targets if word not in known_words] if isinstance(targets, list) else []
            err(listening_path, f'L6: targetWords ต้องมี 2–4 id ที่พบใน data/words.json: {missing}', lesson if isinstance(lesson, dict) else None)
        seconds = lesson.get('seconds') if isinstance(lesson, dict) else None
        if not isinstance(seconds, int) or isinstance(seconds, bool) or not 8 <= seconds <= 90:
            err(listening_path, f'L7: seconds ต้องอยู่ระหว่าง 8–90 ({seconds})', lesson if isinstance(lesson, dict) else None)
    for level in LEVELS:
        if listening_by_level[level] != 9:
            err(listening_path, f'L2: {level} ต้องมี 9 บท (พบ {listening_by_level[level]})')
    for listening_id in known_listening | set(listening_owners):
        if listening_owners[listening_id] != 1:
            err(cp, f'L8: {listening_id} ต้องถูกอ้างครั้งเดียว (พบ {listening_owners[listening_id]} ครั้ง)')
    for listening_id in sorted(set(listening_owners) - known_listening):
        err(cp, f'L8: อ้างบทฟังที่ไม่มีอยู่ {listening_id}')

    print('สรุปหลักสูตร:')
    print('+----------------------+------------------+')
    print('| รายการ               | จำนวน            |')
    print('+----------------------+------------------+')
    print(f'| Level / Unit / Lesson | {len(levels)} / {total_units} / {total_lessons:<5}|')
    print(f'| คำศัพท์อ้าง           | {len(word_owners)}/{len(known_words):<14}|')
    print(f'| บทสนทนาอ้าง          | {len(dialogue_owners)}/{len(known_dialogues):<14}|')
    print('| บทฟังต่อระดับ         | ' + ' / '.join(f'{listening_by_level[level]}' for level in LEVELS) + ' (A0–A2.2) |')
    print(f'| บทฟังอ้างแล้ว         | {sum(1 for key in known_listening if listening_owners[key] == 1)}/{len(known_listening):<14}|')
    print(f'| คำถามบทฟังรวม         | {total_listening_questions:<16}|')
    print(f'| บทที่ tasks ว่าง      | {blank_tasks:<16}|')
    print(f'| ข้อสอบ placement      | {len(items):<16}|')
    print('+----------------------+------------------+')
    if errors:
        print('พบข้อผิดพลาด:')
        for message in errors: print('  - ' + message)
        return 1
    print('ผ่าน: C1–C10 และ placement' + (' (strict)' if args.strict else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
