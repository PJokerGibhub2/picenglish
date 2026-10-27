/* progress2.js — ความคืบหน้าของเส้นทาง PangPood (เก็บแยกจาก V1 เด็ดขาด) */
const KEY = 'pangpood-v2.path';
const STATS_KEY = 'pangpood-v2.stats';
const ACTIVITY_KEY = 'pangpood-v2.activity';

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* พื้นที่เต็ม */ }
}

export function all() { return read(KEY, {}); }
export function stateOf(lessonId) { return all()[lessonId] || null; }
export function isDone(lessonId) { const s = stateOf(lessonId); return !!(s && s.done); }

/** บันทึกว่าจบบทแล้ว */
export function complete(lessonId, score = 100) {
  const data = all();
  const prev = data[lessonId] || {};
  data[lessonId] = {
    done: true,
    best: Math.max(prev.best || 0, Math.round(score)),
    stars: Math.max(prev.stars || 0, Math.round(score) >= 95 ? 3 : Math.round(score) >= 80 ? 2 : 1),
    at: Date.now(),
  };
  write(KEY, data);
  bumpDaily();
  return data[lessonId];
}

/** ลำดับบททั้งหมดตามเส้นทาง */
export function flatten(path) {
  const out = [];
  for (const sec of path.sections) for (const unit of sec.units) for (const lesson of unit.lessons) out.push({ sec, unit, lesson });
  return out;
}

export function totalDone(path) {
  return flatten(path).filter((x) => isDone(x.lesson.id)).length;
}

/** บทที่ควรเล่นต่อ (บทแรกที่ยังไม่จบ) */
export function nextEntry(path) {
  const list = flatten(path);
  return list.find((x) => !isDone(x.lesson.id)) || null;
}

/** ปลดล็อก: บทแรกของ Unit 1 เปิดเสมอ, ที่เหลือเปิดเมื่อบทก่อนหน้าจบ */
export function isUnlocked(path, lessonId) {
  const list = flatten(path);
  const idx = list.findIndex((x) => x.lesson.id === lessonId);
  if (idx <= 0) return true;
  return isDone(list[idx - 1].lesson.id);
}

export function unitDone(unit) {
  return unit.lessons.filter((l) => isDone(l.id)).length;
}

export function sectionDone(sec) {
  const total = sec.units.reduce((n, u) => n + u.lessons.length, 0);
  const done = sec.units.reduce((n, u) => n + unitDone(u), 0);
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/* ── สถิติรายวัน: XP · สตรีค ─────────────────────────────────────────── */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ACTIVITY_KINDS = ['lesson', 'review', 'words', 'speak', 'listen'];

export function bumpActivity(kind, n = 1) {
  if (!ACTIVITY_KINDS.includes(kind)) return todayActivity();
  const data = read(ACTIVITY_KEY, {});
  const day = todayKey();
  const row = { ...Object.fromEntries(ACTIVITY_KINDS.map((key) => [key, 0])), ...(data[day] || {}) };
  row[kind] = Math.max(0, Number(row[kind]) || 0) + Math.max(0, Math.round(Number(n) || 0));
  data[day] = row;
  write(ACTIVITY_KEY, data);
  return row;
}

export function todayActivity() {
  const data = read(ACTIVITY_KEY, {});
  const row = data[todayKey()] || {};
  return Object.fromEntries(ACTIVITY_KINDS.map((key) => [key, Math.max(0, Number(row[key]) || 0)]));
}

export function stats() {
  const s = read(STATS_KEY, { xp: 0, days: {}, streak: 0, lastDay: null, words: 0 });
  return s;
}

export function bumpDaily({ xp = 20, words = 0 } = {}) {
  const s = stats();
  const day = todayKey();
  s.days[day] = (s.days[day] || 0) + xp;
  s.xp = (s.xp || 0) + xp;
  s.words = (s.words || 0) + words;

  if (s.lastDay !== day) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    s.streak = s.lastDay === yKey ? (s.streak || 0) + 1 : 1;
    s.lastDay = day;
  }
  write(STATS_KEY, s);
  return s;
}

/** ความคืบหน้าของสัปดาห์ (7 วันล่าสุด) สำหรับหน้า "ฉัน" */
export function last7() {
  const s = stats();
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ key: k, label: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][d.getDay()], xp: s.days[k] || 0 });
  }
  return out;
}
