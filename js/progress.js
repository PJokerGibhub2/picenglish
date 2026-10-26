/** ความคืบหน้ารวมของบทเรียนทุกโหมด */

import { db } from './data.js';
import * as store from './store.js';

const MODES = ['listening', 'shadow', 'dialogue', 'chunks'];
const lessonsFor = (mode) => mode === 'dialogue' ? db.dialogues : mode === 'chunks' ? db.chunks : db.listening;
const recordFor = (mode) => {
  if (!MODES.includes(mode)) return {};
  if (!store.S.progress || typeof store.S.progress !== 'object') store.S.progress = {};
  if (!store.S.progress[mode] || typeof store.S.progress[mode] !== 'object') store.S.progress[mode] = {};
  return store.S.progress[mode];
};

export function modeOrder(mode) { return lessonsFor(mode).map((lesson) => lesson.id); }

export function lessonState(mode, id) {
  const item = lessonsFor(mode).find((lesson) => lesson.id === id);
  const saved = recordFor(mode)[id] || {};
  const legacy = mode === 'listening' ? store.S.listening[id] || {}
    : mode === 'shadow' ? store.S.shadow[id] || {}
      : store.S.dialogues[id] || {};
  const lineCount = item && (item.transcript || item.lines || []).length || 1;
  let bestPercent = Number(saved.bestPercent) || 0;
  let completed = false;
  let lastLine = Number.isInteger(Number(saved.line)) ? Number(saved.line) : 0;

  if (mode === 'chunks') {
    const chunk = store.chunkState(id);
    bestPercent = Math.max(bestPercent, Number(chunk.bestPct) || 0);
    completed = !!chunk.done;
  } else if (mode === 'listening') {
    bestPercent = Math.max(bestPercent, Number(legacy.bestPercent) || 0);
    completed = (Number(legacy.completed) || 0) > 0;
  } else if (mode === 'shadow') {
    const shadow = store.shadowProgress(id);
    completed = shadow.passed.length / lineCount >= 0.7;
    if (lineCount) lastLine = Math.max(lastLine, Math.min(lineCount - 1, shadow.passed.length ? Math.max(...shadow.passed) + 1 : 0));
    const scores = Object.values(shadow.best);
    const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
    bestPercent = Math.max(bestPercent, average, shadow.passed.length ? Math.round(shadow.passed.length / lineCount * 100) : 0);
  } else if (mode === 'dialogue') {
    completed = !!(store.S.dialogues[id] && store.S.dialogues[id].completed);
    lastLine = Number(store.dialogueProgress(id).lineIndex) || lastLine;
  }

  const hasProgress = !!(saved.updatedAt || saved.started || (mode === 'listening' && legacy.lastPlayed) || (mode === 'shadow' && store.S.shadow[id]) || (mode === 'chunks' && store.chunkState(id).updatedAt));
  let status = 'new';
  if (completed) status = mode === 'listening' && bestPercent < 60 ? 'redo' : 'done';
  else if (hasProgress || (mode === 'listening' && Number(legacy.completed) > 0) || (mode === 'shadow' && store.shadowProgress(id).passed.length)) status = 'doing';
  if (saved.status === 'redo' && !completed) status = 'redo';
  if (status === 'doing' && mode === 'listening' && Number(legacy.completed) > 0 && bestPercent < 60) status = 'redo';
  return { status, lastLine: Math.max(0, Math.min(lineCount - 1, lastLine)), bestPercent, updatedAt: Number(saved.updatedAt || legacy.lastPlayed || 0) };
}

export function savePosition(mode, id, lineIdx, pct = 0) {
  const data = recordFor(mode);
  const old = data[id] || {};
  data[id] = {
    ...old,
    line: Math.max(0, Math.floor(Number(lineIdx) || 0)),
    bestPercent: Math.max(Number(old.bestPercent) || 0, Math.max(0, Math.min(100, Number(pct) || 0))),
    updatedAt: Date.now(),
  };
  store.saveNow();
  return lessonState(mode, id);
}

export function markComplete(mode, id, score) {
  const data = recordFor(mode);
  const old = data[id] || {};
  const state = lessonState(mode, id);
  const bestPercent = Math.max(state.bestPercent, Math.max(0, Math.min(100, Number(score) || 0)));
  let passed = false;
  if (mode === 'chunks') passed = !!store.chunkState(id).done;
  else if (mode === 'listening') passed = bestPercent >= 60;
  else if (mode === 'shadow') passed = state.status === 'done';
  else if (mode === 'dialogue') passed = !!(store.S.dialogues[id] && store.S.dialogues[id].completed);
  data[id] = { ...old, bestPercent, status: passed ? 'done' : 'redo', updatedAt: Date.now() };
  store.saveNow();
  return lessonState(mode, id);
}

export function nextLessonId(mode, id) {
  const order = modeOrder(mode);
  const index = order.indexOf(id);
  return index >= 0 ? order[index + 1] || null : null;
}

export function continuePoint(mode) {
  const ids = modeOrder(mode);
  // 1) บทที่กำลังเรียน/ควรทบทวนอยู่ → เลือกล่าสุด
  let best = null;
  for (const id of ids) {
    const state = lessonState(mode, id);
    if (state.status === 'doing' || state.status === 'redo') {
      if (!best || (state.updatedAt || 0) > (best.state.updatedAt || 0)) {
        best = { id, line: state.lastLine, state };
      }
    }
  }
  if (best) return best;
  // 2) ไม่มีอะไรค้าง → บทใหม่บทแรกตามลำดับ
  for (const id of ids) {
    const state = lessonState(mode, id);
    if (state.status === 'new') return { id, line: 0, state };
  }
  return null;
}

export function modeSummary(mode) {
  const states = modeOrder(mode).map((id) => lessonState(mode, id));
  const done = states.filter((state) => state.status === 'done').length;
  const doing = states.filter((state) => state.status === 'doing' || state.status === 'redo').length;
  return { total: states.length, done, doing, percent: states.length ? Math.round(done / states.length * 100) : 0 };
}
