/* session.js — สร้างชุดข้อฝึกจากข้อมูลบทเรียน โดยไม่แตะ DOM */
import { db, loadAll, shuffle } from './data.js';

function optionsFor(correct, pool, field) {
  const answer = correct[field];
  if (!answer) return [];
  const choices = [answer];
  const seen = new Set([String(answer).toLowerCase()]);
  for (const item of shuffle(pool)) {
    const value = item[field];
    const key = String(value || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    choices.push(value);
    if (choices.length === 4) break;
  }
  return choices.length === 4 ? shuffle(choices) : [];
}

export async function buildSession(lesson, { size = 10, stt = false } = {}) {
  await loadAll();
  const words = (lesson.words || []).map((id) => db.byId.get(id)).filter((x) => x && x.word && x.thai);
  const chunks = (lesson.chunks || []).map((id) => db.chunks.find((x) => x.id === id)).filter((x) => x && x.en && x.th);
  const listening = (lesson.listening || []).flat(2)
    .map((id) => db.listening.find((x) => x.id === id))
    .filter(Boolean)
    .flatMap((item) => (item.transcript || []).map((line, index) => ({ ...line, id: item.id, index })));
  const candidates = [];

  words.forEach((word) => {
    const thaiOptions = optionsFor(word, db.words, 'thai');
    const englishOptions = optionsFor(word, db.words, 'word');
    if (thaiOptions.length) candidates.push({ type: 'word-en-th', entityId: word.id, id: `word-th:${word.id}`, prompt: word.word, answer: word.thai, options: thaiOptions, audioKey: `word:${word.id}`, audioText: word.word });
    if (englishOptions.length) candidates.push({ type: 'word-th-en', entityId: word.id, id: `word-en:${word.id}`, prompt: word.thai, answer: word.word, options: englishOptions });
    if (englishOptions.length) candidates.push({ type: 'word-listen', entityId: word.id, id: `word-listen:${word.id}`, prompt: 'ฟังคำศัพท์แล้วเลือกคำตอบ', answer: word.word, options: englishOptions, audioKey: `word:${word.id}`, audioText: word.word });
    if (stt) candidates.push({ type: 'speak-word', entityId: word.id, id: `speak:${word.id}`, prompt: word.word, answer: word.word, audioKey: `word:${word.id}`, audioText: word.word });
  });

  chunks.forEach((chunk) => {
    const opts = optionsFor({ th: chunk.th }, db.chunks, 'th');
    if (opts.length) candidates.push({ type: 'chunk-meaning', entityId: chunk.id, id: `chunk-meaning:${chunk.id}`, prompt: chunk.en, answer: chunk.th, options: opts, audioKey: `chunk:${chunk.id}`, audioText: chunk.en });
    candidates.push({ type: 'chunk-order', entityId: chunk.id, id: `chunk-order:${chunk.id}`, prompt: chunk.th, answer: chunk.en, tiles: shuffle(chunk.en.replace(/[.,!?;:]/g, '').split(/\s+/).filter(Boolean)), audioKey: `chunk:${chunk.id}`, audioText: chunk.en });
    candidates.push({ type: 'chunk-type', entityId: chunk.id, id: `chunk-type:${chunk.id}`, prompt: 'ฟังแล้วพิมพ์ประโยคภาษาอังกฤษ', answer: chunk.en, audioKey: `chunk:${chunk.id}`, audioText: chunk.en });
  });

  listening.forEach((line) => {
    const options = optionsFor({ th: line.th }, listening, 'th');
    if (line.en && line.th && options.length) candidates.push({ type: 'line-listen', entityId: `${line.id}:${line.index}`, id: `line:${line.id}:${line.index}`, prompt: 'ฟังบทสนทนาแล้วเลือกความหมาย', answer: line.th, options, audioKey: `lis:${line.id}:${line.index}`, audioText: line.en });
  });

  // ลดข้อซ้ำจากแหล่งเดียวกันและสลับลำดับให้แต่ละรอบไม่เหมือนกัน
  const unique = [];
  const seen = new Set();
  for (const item of shuffle(candidates)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  const target = Math.max(1, Math.min(12, Math.max(8, Number(size) || 10)));
  const selected = [];
  const usedEntities = new Set();
  const types = shuffle([...new Set(unique.map((item) => item.type))]);
  for (const type of types) {
    const candidate = unique.find((item) => item.type === type && !usedEntities.has(item.entityId));
    if (candidate) { selected.push(candidate); usedEntities.add(candidate.entityId); }
    if (selected.length >= target) break;
  }
  for (const item of shuffle(unique)) {
    if (selected.length >= target) break;
    if (usedEntities.has(item.entityId)) continue;
    selected.push(item); usedEntities.add(item.entityId);
  }
  return shuffle(selected);
}
