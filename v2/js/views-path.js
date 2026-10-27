/* views-path.js — หน้าหลักของ PangPood: เส้นทางการเรียน
 * แนวคิด: ผู้ใช้เห็น "เส้นทาง" เป็นการเดินทาง (Section → Unit → บท)
 * ใช้สไตล์เกม: node วงกลม เด้งเบา ๆ, เส้นเชื่อม, สถานะ ล็อก/กำลังทำ/ผ่าน/มงกุฎ
 */
import { h, mount, icon, btn3d, bar, sheet, toast, confetti } from './ui2.js';
import { mascot, mascotReact } from './mascot2.js';
import * as pg from './progress2.js';
import { db, loadAll } from './data.js';
import { sayText, loadAudioManifest } from './speech.js';

let pathData = null;
export async function loadPath() {
  if (pathData) return pathData;
  const res = await fetch('./data/path.json', { cache: 'no-cache' });
  pathData = await res.json();
  return pathData;
}

function nodeFor(entry, { unlocked, done, current, stars, onLocked }) {
  const isReview = entry.lesson.kind === 'review';
  const cls = ['node'];
  if (isReview) cls.push('node-review');
  if (done) cls.push('done');
  if (current) cls.push('current');
  if (!unlocked) cls.push('locked');
  const inner = isReview
    ? icon('crown', 28)
    : done
    ? icon('check', 30)
    : unlocked ? icon('play', 28) : icon('lock', 24);
  return h('button', {
    class: cls.join(' '), type: 'button',
    'data-lesson': entry.lesson.id,
    'aria-label': entry.lesson.title,
    onclick: (event) => onNode(entry, { unlocked, done, button: event.currentTarget, onLocked }),
  },
  h('span', { class: 'node-disc', style: { '--unit': entry.unit.color } }, inner,
    done && stars === 3 ? h('span', { class: 'node-star' }, icon('star', 14)) : null),
  h('span', { class: 'node-label', text: entry.lesson.title }));
}

function onNode(entry, { unlocked, done, button, onLocked }) {
  if (!unlocked && !done) {
    onLocked?.(button);
    toast('ทำบทก่อนหน้าให้จบก่อนนะ 🐘');
    return;
  }
  location.hash = `#/lesson?id=${encodeURIComponent(entry.lesson.id)}`;
}

/** การ์ดหัว Unit + เส้นทางย่อย */
function unitBlock(entryUnit, path, onLocked) {
  const { unit } = entryUnit;
  const done = pg.unitDone(unit);
  const total = unit.lessons.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;

  const head = h('div', { class: `unit-head${complete ? ' unit-complete' : ''}`, style: { '--unit': unit.color } },
    h('div', { class: 'unit-emoji', text: unit.emoji }),
    h('div', { class: 'unit-titles' },
      h('div', { class: 'unit-name', text: unit.title }),
      complete ? h('div', { class: 'unit-stamp stamp-in', text: '✓ จบ Unit' }) : null,
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
      unlocked, done: isDone, current: unlocked && !isDone, stars: st ? st.stars : 0, onLocked,
    });
    node.style.setProperty('--node-x', `${offsets[i % offsets.length]}px`);
    trail.appendChild(node);
    if (i < unit.lessons.length - 1) trail.appendChild(h('div', { class: 'trail-link' }));
  });

  return h('section', { class: 'unit' }, head, trail);
}

function guide(unit) {
  const showGuide = async () => {
    await loadAll();
    await loadAudioManifest().catch(() => {});
    const ids = [...new Set(unit.lessons.flatMap((lesson) => lesson.words || []))].slice(0, 5);
    const words = ids.map((id) => db.byId.get(id)).filter(Boolean);
    sheet(`คู่มือ · ${unit.title}`,
    h('div', { class: 'sheet-block' },
      h('p', { class: 'muted', text: `Unit นี้มี ${unit.lessons.length} บท · เป้าหมาย: "${unit.en}"` }),
      h('ol', { class: 'guide-list' }, ...unit.lessons.map((l) => h('li', { text: l.title }))),
      words.length ? h('div', { class: 'guide-words' }, h('div', { class: 'bold', text: 'คำศัพท์ใน Unit นี้' }),
        ...words.map((word) => h('div', { class: 'guide-word' },
          h('span', {}, h('strong', { text: word.en }), h('small', { class: 'muted', text: word.thai || '' })),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `ฟัง ${word.en}`, onclick: () => sayText(word.en, { audioKey: `word:${word.id}`, gender: 'female' }) }, icon('sound', 18))))) : null,
      h('p', { class: 'muted small', text: '💡 เรียนวันละ 1 บท (ประมาณ 5 นาที) ก็พอแล้ว' })));
  };
  showGuide();
}

export async function pathView(root) {
  const path = await loadPath();
  const timers = new Set();
  let scrollFrame = null;
  let disposed = false;
  const onLocked = (button) => {
    if (!button) return;
    button.classList.remove('shake');
    void button.offsetWidth;
    button.classList.add('shake');
    const timer = setTimeout(() => { timers.delete(timer); button.classList.remove('shake'); }, 300);
    timers.add(timer);
  };
  let celebrations = {};
  try { celebrations = JSON.parse(localStorage.getItem('pangpood-v2.unitCelebrated') || '{}') || {}; } catch { celebrations = {}; }
  const newlyDone = [];
  for (const sec of path.sections) for (const unit of sec.units) {
    if (unit.lessons.length === 5 && pg.unitDone(unit) === 5 && !celebrations[unit.id]) {
      celebrations[unit.id] = true;
      newlyDone.push(unit);
    }
  }
  if (newlyDone.length) {
    try { localStorage.setItem('pangpood-v2.unitCelebrated', JSON.stringify(celebrations)); } catch { /* พื้นที่จัดเก็บอาจเต็ม */ }
  }
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
    for (const unit of sec.units) root.appendChild(unitBlock({ unit }, path, onLocked));
    if (sd.total > 0 && sd.done === sd.total) root.appendChild(h('div', { class: 'section-complete', text: 'จบ Section แล้ว 🎉' }));
  }

  // ท้ายเส้นทาง: มาสคอสนอนรอ
  root.appendChild(h('div', { class: 'path-end' },
    mascot('sleep', 92),
    h('div', { class: 'muted small', text: 'พังหลับแล้ว… เรียนต่อวันพรุ่งนี้นะ' })));
  if (newlyDone.length) {
    confetti();
    toast(`จบ Unit ${newlyDone[0].title} แล้ว 🎉`, 2600);
  }
  if (next) {
    scrollFrame = requestAnimationFrame(() => {
      if (disposed) return;
      root.querySelector(`[data-lesson="${CSS.escape(next.lesson.id)}"]`)?.scrollIntoView({ block: 'center' });
    });
  }
  return () => {
    disposed = true;
    timers.forEach(clearTimeout); timers.clear();
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
  };
}
