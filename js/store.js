/**
 * store.js — เก็บความคืบหน้า / ระบบทบทวน SRS (SM-2) / การตั้งค่า
 * ทั้งหมดอยู่ใน localStorage ไม่มี backend และไม่มีการส่งข้อมูลออกนอกเครื่อง
 */

const KEY = 'picenglish.v1';

const DEFAULTS = {
  settings: {
    theme: 'dark',          // dark = ค่าเริ่มต้น (พรีเมียม) | light | auto
    rate: 0.92,             // ความเร็วเสียงอ่าน
    voiceURI: '',           // เลือกเสียงอ่าน (ว่าง = อัตโนมัติ)
    voiceGender: 'female',   // เสียงหลัก = Kokoro af_heart (ผู้หญิง)    // male | female | auto — ผู้ชายฟังง่ายกว่าสำหรับผู้เรียนไทย
    autoPlay: true,         // อ่านออกเสียงอัตโนมัติเมื่อเปิดการ์ด
    imageMode: 'art',       // art = ภาพกราฟฟิกน่ารัก | photo = ภาพถ่ายจริง | emoji = อีโมจิเท่านั้น
    showPhotos: true,       // (เลิกใช้ — คงไว้เพื่อความเข้ากันได้กับข้อมูลเก่า)
    perRound: 10,           // จำนวนคำต่อรอบ
    newPerDay: 12,          // คำใหม่สูงสุดต่อวันในโหมดทบทวน
    showThai: true,         // แสดงคำแปลไทยบนการ์ดด้านหน้า
    micExplained: false,    // เคยอธิบายก่อนขออนุญาตไมค์แล้วหรือยัง
    strictSpeak: true,      // ต้องพูดให้ผ่านก่อนจึงจะไปประโยคถัดไป (โหมดเข้ม)
    passThreshold: 70,      // เกณฑ์ผ่านการออกเสียง (%)
    recordVoice: true,
    sfx: true,              // เสียงเอฟเฟกต์ (Web Audio)      // บันทึกเสียงผู้ใช้ไว้ฟังย้อนหลัง (เก็บในเครื่องเท่านั้น)
  },
  srs: {},                  // id -> {ease, interval, reps, lapses, due, last}
  srsSentences: {},         // "dlgId:lineIndex" -> เหมือน srs (ทบทวนระดับประโยค)
  dialogues: {},            // dlgId -> {lineIndex, completed, plays, bestScore, lastPlayed}
  listening: {},            // lessonId -> { completed, bestPercent, lastPlayed }
  placement: null,          // ผลวัดระดับล่าสุด เก็บในเครื่อง
  xp: 0,                    // แต้มประสบการณ์รวม
  stats: {},                // id -> {seen, correct, wrong, last}
  favorites: [],            // id[]
  hard: [],                 // id[] คำที่กด "ยังไม่แน่ใจ"
  daily: {},                // 'YYYY-MM-DD' -> {reviewed, correct, newWords, spoken, dialogues, secondsSpoken, selfRatings}
};

function todayKey(d = new Date()) {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
}

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    return deepMerge(structuredClone(DEFAULTS), JSON.parse(raw));
  } catch (err) {
    console.warn('[store] อ่านข้อมูลไม่สำเร็จ เริ่มใหม่', err);
    return structuredClone(DEFAULTS);
  }
}

export const S = read();

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (err) {
      console.warn('[store] บันทึกไม่สำเร็จ', err);
    }
  }, 120);
}

export function saveNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (err) { /* ignore */ }
}

/* ---------------- การตั้งค่า ---------------- */
export function setSetting(key, value) {
  S.settings[key] = value;
  save();
}
export function settings() { return S.settings; }
export function setPlacement(result) {
  S.placement = result ? { ...result, takenAt: result.takenAt || Date.now() } : null;
  saveNow();
  return S.placement;
}
export function placement() { return S.placement || null; }

/* ---------------- สถิติรายวัน ---------------- */
export function today() {
  const k = todayKey();
  if (!S.daily[k]) S.daily[k] = { reviewed: 0, correct: 0, newWords: 0, spoken: 0, dialogues: 0, listening: 0, secondsSpoken: 0, selfRatings: [] };
  const t = S.daily[k];
  // เผื่อข้อมูลเก่าที่บันทึกไว้ก่อนมีฟิลด์ใหม่
  if (t.spoken === undefined) t.spoken = 0;
  if (t.dialogues === undefined) t.dialogues = 0;
  if (t.listening === undefined) t.listening = 0;
  if (t.secondsSpoken === undefined) t.secondsSpoken = 0;
  if (!Array.isArray(t.selfRatings)) t.selfRatings = [];
  if (t.xp === undefined) t.xp = 0;
  return t;
}
export function bumpListening(lessonId, percent = 0) {
  const rec = S.listening[lessonId] || { completed: 0, bestPercent: 0, lastPlayed: 0 };
  rec.completed += 1;
  rec.bestPercent = Math.max(rec.bestPercent || 0, percent);
  rec.lastPlayed = Date.now();
  S.listening[lessonId] = rec;
  bumpDaily('listening', 1);
  saveNow();
  return rec;
}
export function bumpDaily(field, by = 1) {
  const t = today();
  t[field] = (t[field] || 0) + by;
  save();
}
export function streakDays() {
  let n = 0;
  const d = new Date();
  for (;;) {
    const k = todayKey(d);
    const rec = S.daily[k];
    if (rec && (rec.reviewed > 0 || rec.newWords > 0)) { n++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return n;
}

/* ---------------- สถิติรายคำ ---------------- */
export function statOf(id) {
  return S.stats[id] || { seen: 0, correct: 0, wrong: 0, last: 0 };
}
export function markSeen(id) {
  const st = statOf(id);
  if (!st.seen) bumpDaily('newWords', 1);
  S.stats[id] = { ...st, seen: st.seen + 1, last: Date.now() };
  save();
}
export function markAnswer(id, correct) {
  const st = statOf(id);
  S.stats[id] = {
    ...st,
    correct: st.correct + (correct ? 1 : 0),
    wrong: st.wrong + (correct ? 0 : 1),
    last: Date.now(),
  };
  const t = today();
  t.reviewed += 1;
  if (correct) t.correct += 1;
  S.xp = (S.xp || 0) + (correct ? 2 : 1);
  t.xp = (t.xp || 0) + (correct ? 2 : 1);
  save();
}

/* ---------------- รายการโปรด / คำยาก ---------------- */
export function isFavorite(id) { return S.favorites.includes(id); }
export function toggleFavorite(id) {
  const i = S.favorites.indexOf(id);
  if (i >= 0) S.favorites.splice(i, 1); else S.favorites.push(id);
  save();
  return isFavorite(id);
}
export function favorites() { return S.favorites.slice(); }

export function isHard(id) { return S.hard.includes(id); }
export function toggleHard(id) {
  const i = S.hard.indexOf(id);
  if (i >= 0) S.hard.splice(i, 1); else S.hard.push(id);
  save();
  return isHard(id);
}
export function hardWords() { return S.hard.slice(); }

/* ---------------- SRS (SM-2) ----------------
   grade: 0 = จำไม่ได้ (again) | 1 = ยาก (hard) | 2 = พอได้ (good) | 3 = ง่าย (easy)
   แปลงเป็น q ของ SM-2: 0 -> 1, 1 -> 3, 2 -> 4, 3 -> 5
------------------------------------------------- */
const GRADE_Q = [1, 3, 4, 5];
const DAY = 86400000;

export function srsOf(id) {
  return S.srs[id] || { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: 0, last: 0 };
}

/** คำนวณการ์ดถัดไปแบบไม่บันทึก (ใช้แสดงตัวอย่างช่วงเวลาก่อนผู้ใช้กด) */
function applyGrade(card, g) {
  const c = { ...card };
  const q = GRADE_Q[Math.max(0, Math.min(3, g))];
  if (q < 3) {
    c.reps = 0;
    c.lapses = (c.lapses || 0) + 1;
    c.interval = g === 0 ? 0.007 : 0.35; // ~10 นาที / ~8 ชั่วโมง
  } else {
    c.reps += 1;
    if (c.reps === 1) c.interval = 1;
    else if (c.reps === 2) c.interval = 6;
    else c.interval = Math.round(c.interval * c.ease);
    if (g === 3) c.interval = Math.round(c.interval * 1.3);
    if (g === 1) c.interval = Math.max(1, Math.round(c.interval * 0.6));
  }
  c.ease = Math.max(1.3, c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  c.interval = Math.min(c.interval, 365);
  c.due = Date.now() + c.interval * DAY;
  c.last = Date.now();
  return c;
}

/** ดูช่วงเวลาถัดไปถ้ากดเกรดนี้ (ไม่บันทึก) */
export function simulate(id, g) {
  return applyGrade(srsOf(id), g);
}

export function grade(id, g) {
  const card = applyGrade(srsOf(id), g);
  S.srs[id] = card;
  markAnswer(id, GRADE_Q[Math.max(0, Math.min(3, g))] >= 3);
  save();
  return card;
}

export function dueWords(allWords, limit = 999) {
  const now = Date.now();
  return allWords
    .filter((w) => { const c = S.srs[w.id]; return c && c.reps > 0 && c.due <= now; })
    .sort((a, b) => srsOf(a.id).due - srsOf(b.id).due)
    .slice(0, limit);
}

export function newWords(allWords, limit) {
  return allWords.filter((w) => srsOf(w.id).reps === 0).slice(0, limit);
}

export function dueCount() {
  const now = Date.now();
  return Object.values(S.srs).filter((c) => c.reps > 0 && c.due <= now).length;
}

export function learnedCount() {
  return Object.values(S.srs).filter((c) => c.reps > 0).length;
}

export function masteredCount() {
  return Object.values(S.srs).filter((c) => c.interval >= 21).length;
}

export function totalAnswers() {
  return Object.values(S.stats).reduce((n, s) => n + s.correct + s.wrong, 0);
}

export function accuracy() {
  const vals = Object.values(S.stats);
  const c = vals.reduce((n, s) => n + s.correct, 0);
  const t = vals.reduce((n, s) => n + s.correct + s.wrong, 0);
  return t ? Math.round((c / t) * 100) : 0;
}

/** ระดับความแข็งของคำ (ใช้จัดอันดับในรายการ "คำของฉัน") */
export function difficulty(id) {
  const s = statOf(id);
  const t = s.correct + s.wrong;
  if (!t) return 0;
  return 1 - s.correct / t;
}

/* ---------------- XP ---------------- */

/** เพิ่มแต้มประสบการณ์ (บันทึกลงรายวันด้วย) */
export function addXp(n = 1) {
  const amount = Math.max(0, Math.round(n));
  if (!amount) return S.xp;
  S.xp = (S.xp || 0) + amount;
  const t = today();
  t.xp = (t.xp || 0) + amount;
  save();
  return S.xp;
}

export function totalXp() { return S.xp || 0; }

/** 29/60/90 วันแบบง่าย: นับวันที่ได้ XP จากตาราง daily */
export function activeDays() {
  return Object.values(S.daily || {}).filter((d) => (d.xp || 0) > 0 || (d.reviewed || 0) > 0 || (d.spoken || 0) > 0).length;
}

export function exportJSON() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...S }, null, 2);
}

/* ---------------- การพูด (โหมดฝึกพูด) ---------------- */

/** บันทึกว่าผู้ใช้พูดออกเสียงจริง 1 ประโยค */
export function bumpSpoken(n = 1) {
  const t = today();
  t.spoken = (t.spoken || 0) + n;
  save();
}

/** บันทึกว่าเล่นบทสนทนาจบ 1 สถานการณ์ */
export function bumpDialogue() {
  const t = today();
  t.dialogues = (t.dialogues || 0) + 1;
  t.xp = (t.xp || 0) + 10;
  S.xp = (S.xp || 0) + 10;
  save();
}

export function addSecondsSpoken(sec) {
  const t = today();
  const add = Math.max(0, Math.round(sec || 0));
  t.secondsSpoken = (t.secondsSpoken || 0) + add;
  const bonus = Math.round(add / 10);       // พูด 60 วิ = +6 XP
  t.xp = (t.xp || 0) + bonus;
  S.xp = (S.xp || 0) + bonus;
  save();
}

export function addSelfRating(rating) {
  const t = today();
  if (!Array.isArray(t.selfRatings)) t.selfRatings = [];
  if (t.xp === undefined) t.xp = 0;
  t.selfRatings.push(Math.max(1, Math.min(5, Math.round(rating))));
  save();
}

export function spokenToday() { return today().spoken || 0; }
export function spokenTotal() {
  return Object.values(S.daily).reduce((n, d) => n + (d.spoken || 0), 0);
}
export function dialoguesTotal() {
  return Object.values(S.daily).reduce((n, d) => n + (d.dialogues || 0), 0);
}
export function secondsSpokenTotal() {
  return Object.values(S.daily).reduce((n, d) => n + (d.secondsSpoken || 0), 0);
}

/** ค่าที่พูดได้ใน 7 วันล่าสุด (ใช้วัดเป้าหมาย "15 ประโยค/สัปดาห์") */
export function spokenLast7Days() {
  const now = new Date();
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const rec = S.daily[todayKey(d)];
    if (rec) n += rec.spoken || 0;
  }
  return n;
}

/* ---------------- SRS ระดับประโยค ---------------- */

export function srsOfSentence(key) {
  return S.srsSentences[key] || { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: 0, last: 0 };
}

export function simulateSentence(key, g) {
  return applyGrade(srsOfSentence(key), g);
}

export function gradeSentence(key, g) {
  const card = applyGrade(srsOfSentence(key), g);
  S.srsSentences[key] = card;
  const t = today();
  t.xp = (t.xp || 0) + 3;
  S.xp = (S.xp || 0) + 3;
  save();
  return card;
}

export function dueSentenceCount() {
  const now = Date.now();
  return Object.values(S.srsSentences).filter((c) => c.reps > 0 && c.due <= now).length;
}

export function dueSentences(limit = 30) {
  const now = Date.now();
  return Object.entries(S.srsSentences)
    .filter(([, c]) => c.reps > 0 && c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .slice(0, limit)
    .map(([key]) => key);
}

/* ---------------- ความคืบหน้าของบทสนทนา ---------------- */

export function dialogueProgress(id) {
  return S.dialogues[id] || { lineIndex: 0, completed: false, plays: 0, bestScore: 0, lastPlayed: 0 };
}

export function saveDialogueProgress(id, patch) {
  S.dialogues[id] = { ...dialogueProgress(id), ...patch, lastPlayed: Date.now() };
  save();
  return S.dialogues[id];
}

export function completedDialogues() {
  return Object.values(S.dialogues).filter((d) => d.completed).length;
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const merged = deepMerge(structuredClone(DEFAULTS), parsed);
  Object.assign(S, merged);
  saveNow();
}

export function resetAll() {
  Object.assign(S, structuredClone(DEFAULTS));
  saveNow();
}
