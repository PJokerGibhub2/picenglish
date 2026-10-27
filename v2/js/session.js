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

  const listeningLines = [];
  (lesson.listening || []).flat(2).forEach((listeningId) => {
    const source = db.listening.find((item) => item.id === listeningId);
    if (!source) return;
    (source.transcript || []).forEach((line, index) => {
      if (line.en && line.th) listeningLines.push({ ...line, id: source.id, index });
    });
  });
  const eligibleQuestionLines = listeningLines.filter((line) => {
    const source = db.listening.find((item) => item.id === line.id);
    return (source?.questions || []).some((question) => Number(question.line) === line.index);
  });
  const chosenListeningLines = shuffle(eligibleQuestionLines).slice(0, 1);
  chosenListeningLines.push(...shuffle(listeningLines.filter((line) => !chosenListeningLines.includes(line))).slice(0, 1));
  chosenListeningLines.forEach((line) => {
    const options = optionsFor({ th: line.th }, listeningLines, 'th');
    if (options.length) candidates.push({ type: 'line-listen', entityId: `${line.id}:${line.index}`, id: `line:${line.id}:${line.index}`, prompt: 'ฟังแล้วเลือกความหมาย', answer: line.th, options, audioKey: `lis:${line.id}:${line.index}`, audioText: line.en });
  });
  const questionItems = shuffle(chosenListeningLines.flatMap((line) => {
    const source = db.listening.find((item) => item.id === line.id);
    return (source?.questions || []).filter((question) => Number(question.line) === line.index).map((question, qIndex) => ({ line, question, qIndex }));
  })).slice(0, 1);
  questionItems.forEach(({ line, question, qIndex }) => {
    const options = Array.isArray(question.options) && question.options.length === 4 ? question.options : [];
    const answer = options[Number(question.answer)];
    if (answer && options.length === 4) candidates.push({ type: 'listen-question', entityId: `question:${line.id}:${line.index}:${qIndex}`, id: `listen-question:${line.id}:${line.index}:${qIndex}`, prompt: question.q, answer, options: shuffle(options), audioKey: `lis:${line.id}:${line.index}`, audioText: line.en });
  });

  if (lesson.dialogue) {
    const dialogue = db.dialogueById.get(lesson.dialogue);
    const lines = (dialogue?.lines || []).map((line, index) => ({ ...line, index }));
    shuffle(lines.filter((line) => line.en && (line.thai || line.th))).slice(0, 1).forEach((line) => {
      const answer = line.thai || line.th;
      const pool = lines.map((other) => ({ thai: other.thai || other.th })).filter((other) => other.thai && other.thai !== answer);
      const options = optionsFor({ thai: answer }, pool, 'thai');
      if (options.length) candidates.push({ type: 'dialog-line', mode: 'meaning', entityId: `${dialogue.id}:${line.index}`, id: `dialog-meaning:${dialogue.id}:${line.index}`, prompt: 'ฟังแล้วเลือกความหมาย', answer, options, audioKey: `${dialogue.id}:${line.index}`, audioText: line.en });
    });
    const meLine = shuffle(lines.filter((line) => line.who === 'me' && line.en))[0];
    if (meLine) {
      const alts = (meLine.alternative || meLine.alt || []).map((alt) => typeof alt === 'string' ? alt : alt.en).filter(Boolean);
      const distractors = shuffle(lines.filter((line) => line.index !== meLine.index).map((line) => line.en).filter(Boolean));
      const pool = [meLine.en, ...alts, ...distractors.filter((text) => text !== meLine.en && !alts.includes(text))].slice(0, 4);
      const options = shuffle(pool);
      if (options.length === 4) candidates.push({ type: 'dialog-line', mode: 'english', entityId: `dialog-alt:${dialogue.id}:${meLine.index}`, id: `dialog-english:${dialogue.id}:${meLine.index}`, prompt: 'ฟังบรรทัดของเรา แล้วเลือกประโยคที่ตรง', answer: meLine.en, options, audioKey: `${dialogue.id}:${meLine.index}`, audioText: meLine.en });
    }
  }

  // ลดข้อซ้ำจากแหล่งเดียวกันและสลับลำดับให้แต่ละรอบไม่เหมือนกัน
  const unique = [];
  const seen = new Set();
  for (const item of shuffle(candidates)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  const target = Math.max(1, Math.min(12, Math.max(8, Number(size) || 10)));
  const audioTypes = new Set(['line-listen', 'listen-question', 'dialog-line']);
  const selected = shuffle(unique.filter((item) => audioTypes.has(item.type)));
  const selectedIds = new Set(selected.map((item) => item.id));
  const usedEntities = new Set(selected.map((item) => item.entityId));
  const types = shuffle([...new Set(unique.map((item) => item.type))]);
  for (const type of types) {
    const candidate = unique.find((item) => item.type === type && !selectedIds.has(item.id) && !usedEntities.has(item.entityId));
    if (candidate) { selected.push(candidate); selectedIds.add(candidate.id); usedEntities.add(candidate.entityId); }
    if (selected.length >= target) break;
  }
  for (const item of shuffle(unique)) {
    if (selected.length >= target) break;
    if (selectedIds.has(item.id)) continue;
    if (usedEntities.has(item.entityId)) continue;
    selected.push(item); selectedIds.add(item.id); usedEntities.add(item.entityId);
  }
  return shuffle(selected);
}
