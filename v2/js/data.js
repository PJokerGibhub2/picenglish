/**
 * data.js — โหลดชุดคำศัพท์และหมวดหมู่
 * ใช้ URL แบบ relative กับตัวโมดูล เพื่อให้ deploy ใต้ subpath (เช่น GitHub Pages) ได้
 */

const wordsUrl = new URL('../data/words.json', import.meta.url);
const catsUrl = new URL('../data/categories.json', import.meta.url);
const dialoguesUrl = new URL('../data/dialogues.json', import.meta.url);
const listeningUrl = new URL('../data/listening.json', import.meta.url);
const chunksUrl = new URL('../data/chunks.json', import.meta.url);

export const db = {
  ready: false,
  words: [],
  categories: [],
  dialogues: [],
  listening: [],
  chunks: [],
  byId: new Map(),
  byCategory: new Map(),
  dialogueById: new Map(),
};

export async function loadAll() {
  if (db.ready) return db;
  const [wordsRes, catsRes] = await Promise.all([fetch(wordsUrl), fetch(catsUrl)]);
  if (!wordsRes.ok) throw new Error('โหลด data/words.json ไม่สำเร็จ (' + wordsRes.status + ')');
  if (!catsRes.ok) throw new Error('โหลด data/categories.json ไม่สำเร็จ (' + catsRes.status + ')');

  const wordsJson = await wordsRes.json();
  const catsJson = await catsRes.json();

  db.words = Array.isArray(wordsJson) ? wordsJson : (wordsJson.words || []);
  db.categories = Array.isArray(catsJson) ? catsJson : (catsJson.categories || []);

  db.byId = new Map(db.words.map((w) => [w.id, w]));
  db.byCategory = new Map();
  for (const c of db.categories) db.byCategory.set(c.id, []);
  for (const w of db.words) {
    if (!db.byCategory.has(w.category)) db.byCategory.set(w.category, []);
    db.byCategory.get(w.category).push(w);
  }

  // บทสนทนาเป็นส่วนเสริม: ถ้ายังไม่มีไฟล์ แอปยังทำงานได้ตามปกติ
  try {
    const dlgRes = await fetch(dialoguesUrl);
    const dlgJson = dlgRes.ok ? await dlgRes.json() : [];
    db.dialogues = Array.isArray(dlgJson) ? dlgJson : (dlgJson.dialogues || []);
  } catch (err) {
    db.dialogues = [];
  }
  db.dialogueById = new Map(db.dialogues.map((d) => [d.id, d]));

  // บทฟังเป็นข้อมูลเสริม เพื่อให้แอปส่วนอื่นยังเปิดได้ถ้าไฟล์นี้หาย
  try {
    const listeningRes = await fetch(listeningUrl);
    const listeningJson = listeningRes.ok ? await listeningRes.json() : [];
    db.listening = Array.isArray(listeningJson) ? listeningJson : (listeningJson.lessons || []);
  } catch (err) {
    db.listening = [];
  }

  try {
    const chunksRes = await fetch(chunksUrl);
    const chunksJson = chunksRes.ok ? await chunksRes.json() : {};
    db.chunks = Array.isArray(chunksJson) ? chunksJson : (chunksJson.chunks || []);
  } catch (err) {
    db.chunks = [];
  }

  db.ready = true;
  return db;
}

export function getDialogue(id) { return db.dialogueById.get(id); }

export async function loadListening() {
  if (db.listening.length) return db.listening;
  await loadAll();
  return db.listening;
}

export async function loadChunks() {
  if (db.chunks.length) return db.chunks;
  await loadAll();
  return db.chunks;
}

export function listeningById(id) {
  return db.listening.find((lesson) => lesson.id === id);
}

export function getWord(id) { return db.byId.get(id); }

export function wordsOf(categoryId) {
  return categoryId ? (db.byCategory.get(categoryId) || []) : db.words;
}

export function categoryOf(id) {
  return db.categories.find((c) => c.id === id) || { id, th: id, en: id, emoji: '📘', color: '#4f46e5' };
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(arr, n, excludeId) {
  return shuffle(arr.filter((w) => w.id !== excludeId)).slice(0, n);
}

/** ตัวเลือกผิดสำหรับควิซ — เลือกจากหมวดอื่นก่อนเพื่อไม่ให้กำกวมเกินไป */
export function distractors(word, n) {
  const sameCat = wordsOf(word.category).filter((w) => w.id !== word.id);
  const others = db.words.filter((w) => w.category !== word.category);
  const pool = shuffle(sameCat).concat(shuffle(others));
  const seen = new Set([word.thai]);
  const out = [];
  for (const w of pool) {
    if (out.length >= n) break;
    if (seen.has(w.thai)) continue;
    seen.add(w.thai);
    out.push(w);
  }
  return out;
}

export function normalizeEn(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
