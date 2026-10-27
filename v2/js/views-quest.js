/* เควสรายวันของ PangPood */
import { h, mount, icon, btn3d, bar } from './ui2.js';
import { mascot } from './mascot2.js';
import * as pg from './progress2.js';
import { loadPath } from './views-path.js';

function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function seed(str) {
  let n = 2166136261;
  for (let i = 0; i < str.length; i++) { n ^= str.charCodeAt(i); n = Math.imul(n, 16777619); }
  return n >>> 0;
}

const POOL = [
  { key: 'lesson', label: 'จบบทเรียน 1 บท', goal: 1, icon: 'book' },
  { key: 'review', label: 'ทบทวน 10 ข้อ', goal: 10, icon: 'target' },
  { key: 'words', label: 'ตอบถูก 15 ข้อ', goal: 15, icon: 'check' },
  { key: 'listen', label: 'ฝึกฟัง 5 ข้อ', goal: 5, icon: 'sound' },
  { key: 'speak', label: 'พูด 3 ข้อ', goal: 3, icon: 'sound' },
];

export function todaysQuests() {
  const s = seed(dayKey());
  const first = (s & 1) ? 'lesson' : 'review';
  const second = (s & 2) ? 'listen' : 'speak';
  const rest = POOL.filter((q) => q.key !== first && q.key !== second);
  const third = rest[(s >>> 2) % rest.length];
  const activity = pg.todayActivity();
  return [first, second, third.key].map((key) => {
    const q = POOL.find((item) => item.key === key);
    const now = activity[key] || 0;
    return { ...q, now, done: now >= q.goal };
  });
}

function claimToday() {
  const key = 'pangpood-v2.questClaimed';
  let claimed = {};
  try { claimed = JSON.parse(localStorage.getItem(key) || '{}'); } catch { claimed = {}; }
  const day = dayKey();
  if (claimed[day]) return false;
  pg.bumpDaily({ xp: 20 });
  claimed[day] = true;
  try { localStorage.setItem(key, JSON.stringify(claimed)); } catch { /* พื้นที่จัดเก็บอาจเต็ม */ }
  return true;
}

export async function questView(root) {
  await loadPath().catch(() => null);
  const quests = todaysQuests();
  const doneCount = quests.filter((q) => q.done).length;
  const allDone = doneCount === quests.length;
  let claimed = false;
  try { claimed = !!JSON.parse(localStorage.getItem('pangpood-v2.questClaimed') || '{}')[dayKey()]; } catch { claimed = false; }
  mount(root,
    h('div', { class: 'page-head' },
      h('div', { class: 'page-title', text: 'เควสวันนี้' }),
      h('div', { class: 'page-sub', text: 'ทำภารกิจครบ 3 ข้อเพื่อรับ XP เพิ่ม' })),
    h('div', { class: 'quest-hero' }, mascot(allDone ? 'cheer' : 'idle', 120),
      h('div', { class: 'quest-hero-copy' },
        h('div', { class: 'bold', text: allDone ? 'ครบภารกิจวันนี้ 🎉' : `ทำแล้ว ${doneCount}/3` }),
        h('div', { class: 'muted small', text: allDone ? 'เก่งมาก วันนี้ทำครบแล้ว' : 'ทำทีละนิดก็เก่งขึ้นได้' }),
        allDone && !claimed ? btn3d('รับ XP', { tone: 'brand', onclick: () => {
          if (claimToday()) { claimed = true; btn.disabled = true; btn.textContent = 'รับ XP แล้ว'; }
        } }) : null,
        allDone && claimed ? h('div', { class: 'quest-claimed', text: 'รับ XP วันนี้แล้ว' }) : null)),
    ...quests.map((q) => h('div', { class: `quest-row${q.done ? ' done' : ''}` },
      h('div', { class: 'quest-ico' }, icon(q.icon, 22)),
      h('div', { class: 'quest-main' }, h('div', { class: 'quest-label', text: q.label }),
        bar(Math.round((Math.min(q.now, q.goal) / q.goal) * 100), { tone: q.done ? 'brand' : 'sun' })),
      h('div', { class: 'quest-count', text: `${Math.min(q.now, q.goal)}/${q.goal}` }))),
    h('div', { class: 'gap' }),
    btn3d('ไปเรียนต่อ', { block: true, size: 'lg', icon: 'play', onclick: () => { location.hash = '#/path'; } }),
    h('button', { class: 'quest-review-card', type: 'button', onclick: () => { location.hash = '#/review'; } },
      h('span', { class: 'quest-review-icon', text: '🔁' }),
      h('span', {}, h('strong', { text: 'ทบทวนคำที่พลาด' }), h('small', { class: 'muted', text: 'ฝึกคำที่อยากจำให้แม่นขึ้น' })), icon('play', 18)));
  const btn = root.querySelector('.quest-hero-copy .btn3d');
  if (btn && claimed) { btn.disabled = true; btn.textContent = 'รับ XP แล้ว'; }
}
