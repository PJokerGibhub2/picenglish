import { h, mount } from './ui.js';
import * as store from './store.js';
import { loadPlacement, createSession } from './placement.js';
import { sayText, stopSpeaking } from './speech.js';

const NAMES = { vocab: 'คำศัพท์', listening: 'การฟัง', phrase: 'การเลือกประโยค' };

export function placement(root, params = {}) {
  let session = null;
  let item = null;
  let selected = -1;
  let answered = false;
  let finished = false;
  let savedResult = null;

  function showStart(error = '') {
    mount(root,
      h('div', { class: 'card center' },
        h('div', { style: { fontSize: '2.6rem' }, text: '🧭' }),
        h('div', { class: 'h1', text: 'ทดสอบวัดระดับ 3 นาที' }),
        h('p', { class: 'muted', text: 'ลองทำคำถามสั้น ๆ เพื่อช่วยแนะนำจุดเริ่มเรียนที่เหมาะกับคุณ ข้ามได้ทุกเมื่อ' }),
        error ? h('p', { class: 'small', style: { color: 'var(--danger, #dc2626)' }, text: error }) : null,
        h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: start }, 'เริ่มทดสอบ'),
        h('button', { class: 'btn btn-ghost btn-block', type: 'button', style: { marginTop: '8px' }, onclick: skip }, 'ข้ามไปเริ่มจาก A0')));
  }

  async function start() {
    try {
      const items = await loadPlacement();
      session = createSession({ items, short: params.short === '1' });
      finished = false;
      drawQuestion();
    } catch (error) { showStart('โหลดข้อสอบไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  }

  function skip() {
    const result = { level: 'A0', skills: { vocab: { correct: 0, total: 0, percent: 0 }, listening: { correct: 0, total: 0, percent: 0 }, phrase: { correct: 0, total: 0, percent: 0 } }, correct: 0, total: 0, recommendLessonId: 'A0-U1-L1' };
    store.setPlacement(result);
    savedResult = result;
    showResult();
  }

  function drawQuestion() {
    item = session.next();
    selected = -1;
    answered = false;
    if (!item) { showResult(); return; }
    const progress = session.progress();
    const card = h('div', { class: 'card' },
      h('div', { class: 'row row-wrap', style: { justifyContent: 'space-between' } },
        h('span', { class: 'pill', text: 'ข้อ ' + item.number + '/' + progress.total }),
        h('span', { class: 'pill', text: NAMES[item.skill] })),
      h('h2', { class: 'h2', text: item.prompt }));
    if (item.skill === 'listening') card.appendChild(h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => sayText(item.audioText || item.prompt, { audioKey: item.audioKey, gender: store.settings().voiceGender }) }, '🔊 ฟังคำศัพท์'));
    const options = h('div', { style: { display: 'grid', gap: '8px', marginTop: '14px' } });
    item.options.forEach((option, index) => options.appendChild(h('button', {
      class: 'btn ' + (selected === index ? 'btn-primary' : 'btn-ghost'), type: 'button',
      disabled: answered,
      onclick: () => { selected = index; checkAnswer(); },
    }, option)));
    card.appendChild(options);
    if (answered) {
      card.appendChild(h('p', { class: 'small', role: 'status', text: selected === item.answer ? 'ถูกแล้ว เก่งมาก!' : 'ไม่เป็นไร มาลองข้อต่อไปกัน' }));
      card.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: drawQuestion }, 'ต่อไป'));
    }
    mount(root, card);
  }

  function checkAnswer() {
    if (selected < 0 || answered) return;
    answered = true;
    session.answer(selected, selected === item.answer);
    drawQuestionWithFeedback();
  }

  function drawQuestionWithFeedback() {
    const chosen = selected;
    const wasAnswered = answered;
    const feedback = chosen === item.answer ? 'ถูกแล้ว เก่งมาก!' : 'ไม่เป็นไร มาลองข้อต่อไปกัน';
    const progress = session.progress();
    const card = h('div', { class: 'card' },
      h('div', { class: 'row row-wrap', style: { justifyContent: 'space-between' } },
        h('span', { class: 'pill', text: 'ข้อ ' + Math.min(progress.current, progress.total) + '/' + progress.total }),
        h('span', { class: 'pill', text: NAMES[item.skill] })),
      h('h2', { class: 'h2', text: item.prompt }));
    if (item.skill === 'listening') card.appendChild(h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => sayText(item.audioText || item.prompt, { audioKey: item.audioKey, gender: store.settings().voiceGender }) }, '🔊 ฟังคำศัพท์'));
    item.options.forEach((option, index) => card.appendChild(h('button', {
      class: 'btn ' + (index === chosen ? 'btn-primary' : 'btn-ghost'), type: 'button', disabled: wasAnswered,
      style: { display: 'block', width: '100%', marginTop: '8px' }, text: option,
      onclick: () => { selected = index; checkAnswer(); },
    })));
    card.appendChild(h('p', { class: 'small', role: 'status', text: feedback }));
    card.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: drawQuestion }, 'ต่อไป'));
    mount(root, card);
  }

  function showResult() {
    finished = true;
    const result = savedResult || session.result();
    savedResult = result;
    const scoreRows = Object.entries(result.skills).map(([skill, score]) => h('div', { class: 'row', style: { justifyContent: 'space-between', padding: '7px 0' } },
      h('span', { text: NAMES[skill] || skill }),
      h('b', { text: `${score.correct}/${score.total} · ${score.percent}%` })));
    mount(root, h('div', { class: 'card center' },
      h('div', { style: { fontSize: '2.5rem' }, text: '🌟' }),
      h('div', { class: 'h1', text: 'ระดับของคุณ: ' + result.level }),
      h('p', { class: 'muted', text: `ตอบถูก ${result.correct} จาก ${result.total} ข้อ` }),
      h('div', { style: { textAlign: 'left', margin: '14px 0' } }, ...scoreRows),
      h('a', { class: 'btn btn-primary btn-block', href: '#/learn' }, 'เริ่มเรียนบทแรก'),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', style: { marginTop: '8px' }, onclick: () => { savedResult = null; showStart(); } }, 'ทำใหม่')));
  }

  showStart();
  return () => { stopSpeaking(); };
}
