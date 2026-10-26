/** ภารกิจรายวันเลือกจากกิจกรรมและความคืบหน้าที่บันทึกในเครื่อง */

import * as store from './store.js';
import { db } from './data.js';
import { continuePoint, modeSummary } from './progress.js';

const CATALOG = [
  { key: 'review', label: 'ทวนคำ/ประโยค', emoji: '🔁', goal: 5, estMinutes: 1, mode: 'review' },
  { key: 'listening', label: 'ฟัง 1 บท', emoji: '🎧', goal: 1, estMinutes: 2, mode: 'listening' },
  { key: 'shadow', label: 'พูดตามเงา 1 บท', emoji: '🗣️', goal: 1, estMinutes: 3, mode: 'shadow' },
  { key: 'chunks', label: 'ใช้ประโยคใหม่', emoji: '💬', goal: 3, estMinutes: 2, mode: 'chunks' },
  { key: 'dictation', label: 'ฟังแล้วพิมพ์', emoji: '⌨️', goal: 1, estMinutes: 2, mode: 'dictation' },
  { key: 'dialogue', dailyKey: 'dialogues', label: 'สนทนา 1 สถานการณ์', emoji: '🎭', goal: 1, estMinutes: 3, mode: 'dialogue' },
];

let cachedKey = '';
let cachedPlan = null;

function dateKey() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function levelKey() {
  const placement = store.placement();
  return placement && (placement.level || placement.recommendedLevel || placement.result && placement.result.level) || 'A0';
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function seededOrder(items, seed) {
  let value = seed >>> 0;
  return items.map((item) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return { item, order: value };
  }).sort((a, b) => a.order - b.order).map(({ item }) => item);
}

function backlogScore(task) {
  if (task.key === 'review') return 0;
  const summary = modeSummary(task.mode);
  if (!summary.total) return -1;
  return (summary.total - summary.done) / summary.total;
}

function choosePlan(seed) {
  const tasks = CATALOG.slice();
  const seeded = seededOrder(tasks, seed);
  const rank = new Map(seeded.map((task, index) => [task.key, index]));
  const backlogOrder = tasks.slice().sort((a, b) => backlogScore(b) - backlogScore(a)
    || rank.get(a.key) - rank.get(b.key));
  const backlogRank = new Map(backlogOrder.map((task, index) => [task.key, index]));
  const candidates = [];
  for (let a = 0; a < tasks.length; a++) for (let b = a + 1; b < tasks.length; b++) for (let c = b + 1; c < tasks.length; c++) {
    const group = [tasks[a], tasks[b], tasks[c]];
    if (!group.some((task) => task.key === 'review' || task.key === 'chunks')) continue;
    if (!group.some((task) => ['listening', 'shadow', 'chunks', 'dictation', 'dialogue'].includes(task.key))) continue;
    const minutes = group.reduce((sum, task) => sum + task.estMinutes, 0);
    const overdueRank = Math.min(...group.map((task) => backlogRank.get(task.key)));
    const seededTie = group.reduce((sum, task) => sum + rank.get(task.key), 0);
    candidates.push({ group, minutes, overdueRank, seededTie });
  }
  candidates.sort((a, b) => a.overdueRank - b.overdueRank || (a.minutes > 5) - (b.minutes > 5)
    || a.seededTie - b.seededTie || a.minutes - b.minutes);
  return (candidates[0] ? candidates[0].group : seeded.slice(0, 3)).map((task) => ({ ...task }));
}

export function todayPlan() {
  const key = `${dateKey()}:${levelKey()}`;
  if (cachedKey !== key) {
    cachedKey = key;
    cachedPlan = choosePlan(hash(key));
  }
  return cachedPlan.map((task) => ({ ...task }));
}

export function taskProgress(task) {
  const item = typeof task === 'string' ? CATALOG.find((entry) => entry.key === task) : task;
  if (!item) return { now: 0, goal: 0, done: false };
  const daily = store.today();
  const now = Math.max(0, Number(daily[item.dailyKey || item.key]) || 0);
  return { now: Math.min(now, item.goal), goal: item.goal, done: now >= item.goal };
}

function taskHref(task) {
  if (task.mode === 'review') return '#/review';
  const point = continuePoint(task.mode);
  if (task.mode === 'dialogue') return point ? `#/roleplay?dlg=${encodeURIComponent(point.id)}` : '#/roleplay';
  if (point) return `#/${task.mode}?id=${encodeURIComponent(point.id)}&line=${point.line || 0}`;
  return `#/${task.mode}`;
}

export function questSummary() {
  const tasks = todayPlan().map((task) => ({ ...task, ...taskProgress(task), href: taskHref(task) }));
  return { tasks, done: tasks.filter((task) => task.done).length, total: tasks.length,
    minutes: tasks.reduce((sum, task) => sum + task.estMinutes, 0) };
}
