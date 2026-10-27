/* views-path.js — หน้าหลักของ PangPood: เส้นทางการเรียน
 * แนวคิด: ผู้ใช้เห็น "เส้นทาง" เป็นการเดินทาง (Section → Unit → บท)
 * ใช้สไตล์เกม: node วงกลม เด้งเบา ๆ, เส้นเชื่อม, สถานะ ล็อก/กำลังทำ/ผ่าน/มงกุฎ
 */
import { h, mount, icon, btn3d, bar, sheet, toast } from './ui2.js';
import { mascot, mascotReact } from './mascot2.js';
import * as pg from './progress2.js';

let pathData = null;
export async function loadPath() {
  if (pathData) return pathData;
  const res = await fetch('./data/path.json', { cache: 'no-cache' });
  pathData = await res.json();
  return pathData;
}

function nodeFor(entry, { unlocked, done, current, stars }) {
  const cls = ['node'];
  if (done) cls.push('done');
  if (current) cls.push('current');
  if (!unlocked) cls.push('locked');
  const inner = done
    ? icon('check', 30)
    : unlocked ? icon('play', 28) : icon('lock', 24);
  return h('button', {
    class: cls.join(' '), type: 'button',
    'data-lesson': entry.lesson.id,
    'aria-label': entry.lesson.title,
    onclick: () => onNode(entry, { unlocked, done }),
  },
  h('span', { class: 'node-disc', style: { '--unit': entry.unit.color } }, inner,
    done && stars === 3 ? h('span', { class: 'node-star' }, icon('star', 14)) : null),
  h('span', { class: 'node-label', text: entry.lesson.title }));
}

function onNode(entry, { unlocked, done }) {
  if (!unlocked && !done) {
    toast('ทำบทก่อนหน้าให้จบก่อนนะ 🐘');
    return;
  }
  // Phase 2 จะเปิด session engine ที่นี่
  sheet(`${entry.lesson.kind === 'review' ? '👑 ทบทวน' : '📘'} ${entry.lesson.title}`,
    h('div', { class: 'sheet-block' },
      h('p', { class: 'muted', text: `Unit: ${entry.unit.title} · ${entry.lesson.words.length} คำ · ${entry.lesson.chunks.length} ประโยค` }),
      h('p', { class: 'muted small', text: 'บทเรียนแบบเล่นเกมจะมาในเฟสถัดไป (กำลังสร้างระบบแบบฝึก)' }),
      btn3d('ลองทำแบบทดสอบสั้น', {
        block: true, icon: 'play',
        onclick: () => { location.hash = `#/try?id=${encodeURIComponent(entry.lesson.id)}`; },
      })));
}

/** การ์ดหัว Unit + เส้นทางย่อย */
function unitBlock(entryUnit, path) {
  const { unit } = entryUnit;
  const done = pg.unitDone(unit);
  const total = unit.lessons.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const head = h('div', { class: 'unit-head', style: { '--unit': unit.color } },
    h('div', { class: 'unit-emoji', text: unit.emoji }),
    h('div', { class: 'unit-titles' },
      h('div', { class: 'unit-name', text: unit.title }),
      h('div', { class: 'unit-en', text: unit.en }),
      h('div', { class: 'unit-prog' }, bar(pct, { tone: 'brand' }),
        h('span', { class: 'unit-prog-txt', text: `${done}/${total}` }))),
    h('button', {
      class: 'unit-guide', type: 'button', 'aria-label': 'คู่มือ Unit',
      onclick: () => guide(unit),
    }, icon('book', 20)));

  const trail = h('div', { class: 'trail', style: { '--unit': unit.color } });
  const offsets = [0, 56, 0, -56, 0];
  unit.lessons.forEach((lesson, i) => {
    const unlocked = pg.isUnlocked(path, lesson.id);
    const isDone = pg.isDone(lesson.id);
    const st = pg.stateOf(lesson.id);
    const node = nodeFor({ unit, lesson }, {
      unlocked, done: isDone, current: unlocked && !isDone, stars: st ? st.stars : 0,
    });
    node.style.transform = `translateX(${offsets[i % offsets.length]}px)`;
    trail.appendChild(node);
    if (i < unit.lessons.length - 1) trail.appendChild(h('div', { class: 'trail-link' }));
  });

  return h('section', { class: 'unit' }, head, trail);
}

function guide(unit) {
  sheet(`คู่มือ · ${unit.title}`,
    h('div', { class: 'sheet-block' },
      h('p', { class: 'muted', text: `Unit นี้มี ${unit.lessons.length} บท · เป้าหมาย: "${unit.en}"` }),
      h('ol', { class: 'guide-list' }, ...unit.lessons.map((l) => h('li', { text: l.title }))),
      h('p', { class: 'muted small', text: '💡 เรียนวันละ 1 บท (ประมาณ 5 นาที) ก็พอแล้ว' })));
}

export async function pathView(root) {
  const path = await loadPath();
  mount(root);

  const done = pg.totalDone(path);
  const total = pg.flatten(path).length;
  const next = pg.nextEntry(path);
  const st = pg.stats();

  // หัวจอ: ทักทาย + ความคืบหน้า
  const hero = h('div', { class: 'hero' },
    h('div', { class: 'hero-mascot' }, mascot(done === 0 ? 'wave' : 'idle', 118)),
    h('div', { class: 'hero-copy' },
      h('div', { class: 'hero-hi', text: done === 0 ? 'สวัสดี! ผมพัง 🐘' : 'ดีจัง กลับมาแล้ว!' }),
      h('div', { class: 'hero-text', text: done === 0
        ? 'มาเริ่มพูดอังกฤษกันวันละ 5 นาที'
        : `ทำไปแล้ว ${done}/${total} บท · สตรีค ${st.streak || 0} วัน` }),
      next ? btn3d('ไปต่อ', {
        tone: 'brand', icon: 'play',
        onclick: () => {
          const node = document.querySelector(`[data-lesson="${next.lesson.id}"]`);
          if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          onNode(next, { unlocked: true, done: false });
        },
      }) : h('div', { class: 'hero-done', text: 'จบเส้นทางแล้ว 🎉' })));

  root.appendChild(hero);

  // แถบ Section + Unit
  for (const sec of path.sections) {
    const sd = pg.sectionDone(sec);
    root.appendChild(h('div', { class: 'section-head', style: { '--unit': sec.color } },
      h('div', { class: 'section-title', text: sec.title }),
      h('div', { class: 'section-sub', text: `${sec.subtitle} · ${sd.done}/${sd.total}` })));
    for (const unit of sec.units) root.appendChild(unitBlock({ unit }, path));
  }

  // ท้ายเส้นทาง: มาสคอสนอนรอ
  root.appendChild(h('div', { class: 'path-end' },
    mascot('sleep', 92),
    h('div', { class: 'muted small', text: 'พังหลับแล้ว… เรียนต่อวันพรุ่งนี้นะ' })));
}
