/**
 * views-today.js — หน้าแรก "วันนี้"
 *
 * หลักคิด: เปิดแอปมาแล้วต้องรู้ทันทีว่า "วันนี้ทำอะไร 5 นาที"
 * มาสคอต (ปิโก) เป็นคนชวน ไม่ใช่คนตัดสิน — ไม่มีคำว่าตก ไม่มีการบังคับ
 */

import { db } from './data.js';
import * as store from './store.js';
import { h, mount } from './ui.js';
import { mascot, MASCOT_NAME } from './mascot.js';
import { continuePoint } from './progress.js';

const WEEK_GOAL = 15;   // เป้าประโยคที่พูดต่อสัปดาห์

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'สวัสดีตอนเช้า';
  if (hour < 16) return 'สวัสดีตอนบ่าย';
  if (hour < 19) return 'สวัสดีตอนเย็น';
  return 'สวัสดีตอนค่ำ';
}

/** สรุปภารกิจวันนี้จากสถิติจริง (ไม่ใช่ตัวเลขสมมติ) */
function buildQuest() {
  const t = store.today();
  const reviewed = (t.reviewed || 0) + (t.newWords || 0);
  const dialogues = t.dialogues || 0;
  const seconds = t.secondsSpoken || 0;
  const listening = t.listening || 0;
  return [
    {
      id: 'review',
      emoji: '🔁',
      label: 'ทวน 5 ข้อ',
      now: Math.min(reviewed, 5),
      goal: 5,
      done: reviewed >= 5,
      href: '#/review',
    },
    {
      id: 'dialogue',
      emoji: '💬',
      label: 'สนทนา 1 สถานการณ์',
      now: Math.min(dialogues, 1),
      goal: 1,
      done: dialogues >= 1,
      href: '#/roleplay',
    },
    {
      id: 'onemin',
      emoji: '⏱️',
      label: 'พูดคนเดียว 60 วินาที',
      now: Math.min(seconds, 60),
      goal: 60,
      done: seconds >= 20,
      href: '#/onemin',
      unit: 'วิ',
    },
    {
      id: 'listening',
      emoji: '🎧',
      label: 'ฟัง 1 บท',
      now: Math.min(listening, 1),
      goal: 1,
      done: listening >= 1,
      href: '#/listening',
    },
  ];
}

export function today(root) {
  function render() {
    mount(root);
    const quest = buildQuest();
    const doneCount = quest.filter((q) => q.done).length;
    const allDone = doneCount === quest.length;
    const streak = store.streakDays();
    const spokenWeek = store.spokenLast7Days();
    const xp = store.totalXp();
    const dueWords = store.dueCount();
    const dueSent = store.dueSentenceCount();

    // ---------- หัวเรื่อง ----------
    root.appendChild(h('div', { class: 'row', style: { alignItems: 'flex-start', marginBottom: '2px' } },
      h('div', { style: { flex: '1' } },
        h('div', { class: 'greet', text: greeting() }),
        h('div', { class: 'h1', text: allDone ? 'ครบภารกิจแล้ว!' : 'วันนี้ฝึกกันนะ!' })),
      streak > 0 ? h('span', { class: 'chip-streak', text: '🔥 ' + streak }) : null));

    // ---------- มาสคอต + คำพูด ----------
    let speech;
    if (allDone) speech = 'ครบทุกภารกิจแล้ว! เก่งมาก 🎉 อยากฝึกต่ออีกนิดไหม?';
    else if (doneCount === 0) speech = `เหลือ 5 นาทีก็ได้นะ! เริ่มจากอะไรก่อนก็ได้ — ${MASCOT_NAME}เป็นเพื่อนเอง`;
    else if (doneCount === quest.length - 1) speech = 'เหลืออีก 1 อย่างเท่านั้น! ไปกันเลย';
    else speech = `เริ่มได้ดีมาก! อีก ${quest.length - doneCount} อย่างก็ครบแล้ว`;

    root.appendChild(h('div', { class: 'today-hero' },
      mascot(allDone ? 'celebrate' : doneCount > 0 ? 'happy' : 'idle', 116),
      h('div', { class: 'speech', text: speech })));

    const resume = ['listening', 'shadow']
      .map((mode) => ({ mode, point: continuePoint(mode) }))
      .filter(({ point }) => point && point.state.status !== 'done')
      .sort((a, b) => (b.point.state.updatedAt || 0) - (a.point.state.updatedAt || 0))[0];
    if (resume) {
      const lesson = db.listening.find((item) => item.id === resume.point.id);
      if (lesson) root.appendChild(h('button', {
        class: 'card list-item', type: 'button', style: { width: '100%', textAlign: 'left', marginTop: '10px' },
        onclick: () => { location.hash = `#/${resume.mode}?id=${encodeURIComponent(lesson.id)}&line=${resume.point.line}`; },
      }, h('div', { class: 'thumb', text: '▶' }), h('div', { class: 'lt' },
        h('b', { text: `▶ เรียนต่อ: ${lesson.title}` }),
        h('div', { class: 'small muted', text: `บรรทัด ${resume.point.line + 1}/${lesson.transcript.length}` }))));
    }

    if (!store.placement()) root.appendChild(h('button', {
      class: 'card list-item', type: 'button', style: { width: '100%', textAlign: 'left', marginTop: '10px' },
      onclick: () => { location.hash = '#/placement'; },
    }, h('div', { class: 'thumb', text: '🧭' }),
    h('div', { class: 'lt' }, h('b', { text: 'วัดระดับ 3 นาที' }), h('div', { class: 'small', text: 'เลือกจุดเริ่มเรียนที่เหมาะกับคุณ · ไม่บังคับ' })),
    h('span', { class: 'pill', text: 'เริ่ม' })));

    // ---------- ภารกิจ ----------
    root.appendChild(h('div', { class: 'section-title', text: 'ภารกิจวันนี้ · 5 นาที' }));
    const questWrap = h('div', { class: 'quest' });
    for (const q of quest) {
      questWrap.appendChild(h('button', {
        class: `quest-item ${q.done ? 'done' : ''}`, type: 'button',
        style: { textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' },
        onclick: () => { location.hash = q.href; },
      },
      h('span', { class: 'box', text: '✓' }),
      h('span', { class: 't' }, q.emoji + ' ' + q.label),
      h('span', { class: 'n', text: `${q.now}/${q.goal}${q.unit ? ' ' + q.unit : ''}` })));
    }
    root.appendChild(questWrap);

    // ---------- ความคืบหน้าสัปดาห์ ----------
    root.appendChild(h('div', { class: 'weekbar', style: { marginTop: '11px' } },
      h('span', { style: { fontSize: '1rem' }, text: '🎯' }),
      h('span', {}, 'สัปดาห์นี้คุณพูดไปแล้ว ',
        h('b', { style: { color: 'var(--teal)' }, text: `${spokenWeek}` }),
        ' ประโยค')
      ));
    root.appendChild(h('div', { class: 'progress', style: { marginTop: '8px' } },
      h('i', { style: { width: Math.min(100, Math.round((spokenWeek / WEEK_GOAL) * 100)) + '%' } })));

    // ---------- ปุ่มหลัก ----------
    const next = quest.find((q) => !q.done);
    const ctaLabel = allDone ? 'ฝึกต่ออีกนิด' : 'เริ่มเลย · ' + (next ? next.label : '5 นาที');
    root.appendChild(h('div', { style: { marginTop: '14px' } },
      h('button', {
        class: 'btn btn-primary btn-block', type: 'button',
        onclick: () => { location.hash = next ? next.href : '#/speaking'; },
      }, ctaLabel)));

    // ---------- คิวทบทวน ----------
    if (dueWords || dueSent) {
      root.appendChild(h('div', { class: 'section-title', text: 'รอทบทวน' }));
      root.appendChild(h('button', {
        class: 'list-item', type: 'button', style: { width: '100%', textAlign: 'left' },
        onclick: () => { location.hash = '#/review'; },
      },
      h('div', { class: 'thumb', style: { fontSize: '1.4rem' }, text: '🔁' }),
      h('div', { class: 'lt' },
        h('b', { style: { fontFamily: 'var(--font)' }, text: 'คำและประโยคที่ถึงกำหนด' }),
        h('div', { text: `คำ ${dueWords} · ประโยค ${dueSent}` })),
      h('span', { class: 'pill', text: String(dueWords + dueSent) })));
    }

    // ---------- ทางลัด ----------
    root.appendChild(h('div', { class: 'section-title', text: 'ฝึกต่อ' }));
    root.appendChild(h('div', { class: 'cat-grid' },
      h('button', {
        class: 'cat-card', type: 'button', style: { '--cat': 'var(--teal)' },
        onclick: () => { location.hash = '#/roleplay'; },
      },
      h('div', { class: 'emoji', text: '💬' }),
      h('div', { class: 'cth', text: 'บทสนทนา' }),
      h('div', { class: 'cen', text: `${db.dialogues.length} สถานการณ์` })),
      h('button', {
        class: 'cat-card', type: 'button', style: { '--cat': 'var(--gold)' },
        onclick: () => { location.hash = '#/onemin'; },
      },
      h('div', { class: 'emoji', text: '⏱️' }),
      h('div', { class: 'cth', text: 'พูด 60 วินาที' }),
      h('div', { class: 'cen', text: 'หัวข้อจากจุดอ่อน' })),
      h('button', {
        class: 'cat-card', type: 'button', style: { '--cat': 'var(--primary)' },
        onclick: () => { location.hash = '#/shadow'; },
      },
      h('div', { class: 'emoji', text: '🗣️' }),
      h('div', { class: 'cth', text: 'พูดตามเงา' }),
      h('div', { class: 'cen', text: `${db.listening.length} บท` }))));

    // ---------- XP ----------
    root.appendChild(h('div', { class: 'small muted center', style: { marginTop: '16px' },
      text: `XP ทั้งหมด ${xp} · เรียนแล้ว ${store.learnedCount()} คำ` }));
  }

  render();
  return () => {};
}
