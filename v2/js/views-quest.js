/* views-quest.js — เควสรายวันของ PangPood
 * 3 ภารกิจ/วัน สร้างจากวันที่ + สิ่งที่ยังไม่จบ (คงที่ทั้งวัน, ไม่ซ้ำ)
 */
import { h, mount, icon, btn3d, bar, toast } from './ui2.js';
import { mascot, mascotReact } from './mascot2.js';
import { db, loadAll } from './data.js';
import * as pg from './progress2.js';
import { loadPath } from './views-path.js';

let ready = false;
async function ensure() {
  if (ready) return;
  await loadAll();
  ready = true;
}

function seed(str) {
  let n = 2166136261;
  for (let i = 0; i < str.length; i++) { n ^= str.charCodeAt(i); n = Math.imul(n, 16777619); }
  return Math.abs(n);
}

function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const POOL = [
  { key: 'lesson', label: 'จบบทเรียน 1 บท', goal: 1, xp: 20, icon: 'book' },
  { key: 'words', label: 'เปิดฟังคำศัพท์ 10 คำ', goal: 10, xp: 10, icon: 'sound' },
  { key: 'streak', label: 'เข้าแอปวันนี้', goal: 1, xp: 5, icon: 'flame' },
];

export function todaysQuests() {
  const s = seed(dayKey());
  const picked = [POOL[0], POOL[(s % 2) + 1], POOL[2]];
  const st = pg.stats();
  const doneLessons = st.days[dayKey()] ? 1 : 0;   // บันทึกผ่าน bumpDaily แล้ว
  const wordsToday = Number(localStorage.getItem('pangpood-v2.wordsToday') || 0);
  return picked.map((q) => {
    let now = 0;
    if (q.key === 'lesson') now = doneLessons ? 1 : 0;
    if (q.key === 'words') now = Math.min(wordsToday, q.goal);
    if (q.key === 'streak') now = 1;
    return { ...q, now, done: now >= q.goal };
  });
}

export async function questView(root) {
  mount(root, h('div', { class: 'center pad' }, mascot('listen', 96)));
  await ensure();
  const path = await loadPath().catch(() => null);
  const quests = todaysQuests();
  const doneCount = quests.filter((q) => q.done).length;

  const m = mascot(doneCount === quests.length ? 'cheer' : 'idle', 120);

  mount(root,
    h('div', { class: 'page-head' },
      h('div', { class: 'page-title', text: 'เควสวันนี้' }),
      h('div', { class: 'page-sub', text: 'ทำครบ 3 อย่าง = วันเดียวที่ได้ผลจริง' })),
    h('div', { class: 'quest-hero' }, m,
      h('div', { class: 'quest-hero-copy' },
        h('div', { class: 'bold', text: doneCount === quests.length ? 'ครบแล้ว! เก่งมาก 🎉' : `ทำแล้ว ${doneCount}/3` }),
        h('div', { class: 'muted small', text: doneCount === quests.length ? 'พรุ่งนี้มีเควสใหม่รอนะ' : 'ใช้เวลาไม่เกิน 5 นาที' }))),
    ...quests.map((q) => h('div', { class: `quest-row${q.done ? ' done' : ''}` },
      h('div', { class: 'quest-ico' }, icon(q.icon, 22)),
      h('div', { class: 'quest-main' },
        h('div', { class: 'quest-label', text: q.label }),
        bar(Math.round((q.now / q.goal) * 100), { tone: q.done ? 'brand' : 'sun' })),
      h('div', { class: 'quest-count', text: `${Math.min(q.now, q.goal)}/${q.goal}` }))),
    h('div', { class: 'gap' }),
    btn3d('ไปเรียนต่อ', {
      block: true, size: 'lg', icon: 'play',
      onclick: () => { location.hash = '#/path'; },
    }),
    h('button', { class: 'quest-review-card', type: 'button', onclick: () => { location.hash = '#/review'; } },
      h('span', { class: 'quest-review-icon', text: '👑' }),
      h('span', {}, h('strong', { text: 'ทบทวนคำที่พลาด' }), h('small', { class: 'muted', text: 'คำที่ถึงเวลาและคำที่อยากฝึกซ้ำ' })),
      icon('play', 18)));
}
