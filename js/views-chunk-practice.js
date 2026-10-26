import { db } from './data.js';
import * as store from './store.js';
import { h, mount, clear, progressBar, emptyState } from './ui.js';
import { sayText, stopSpeaking } from './speech.js';
import { sfxSuccess, sfxSoft } from './sfx.js';
import { continuePoint, lessonState, markComplete, savePosition, nextLessonId } from './progress.js';

const situations = [
  ['cafe', '☕ คาเฟ่'], ['restaurant', '🍽️ ร้านอาหาร'], ['shopping', '🛍️ ซื้อของ'],
  ['travel', '🧳 เดินทาง'], ['hotel', '🏨 โรงแรม'], ['health', '🩺 สุขภาพ'],
  ['work', '💼 ที่ทำงาน'], ['smalltalk', '💬 คุยทั่วไป'],
];
const situationLabel = (id) => (situations.find(([key]) => key === id) || [id, id])[1];
const normalize = (word) => word.toLowerCase().replace(/[.,!?"']/g, '');
const tokens = (text) => text.trim().split(/\s+/).filter(Boolean);
const passed = (id, mode) => lessonState(mode, id).status === 'done';

function alignedWords(expected, actual) {
  const a = expected.map(normalize), b = actual.map(normalize);
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length; i >= 0; i--) for (let j = b.length; j >= 0; j--) {
    if (i === a.length) dp[i][j] = b.length - j;
    else if (j === b.length) dp[i][j] = a.length - i;
    else dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] : Math.min(1 + dp[i + 1][j + 1], 1 + dp[i + 1][j], 1 + dp[i][j + 1]);
  }
  const out = [];
  let i = 0, j = 0, hits = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push({ text: expected[i], kind: 'correct' }); hits++; i++; j++; }
    else if (j < b.length && (i === a.length || dp[i][j] === 1 + dp[i][j + 1])) { out.push({ text: actual[j], kind: 'extra' }); j++; }
    else if (i < a.length && j < b.length && dp[i][j] === 1 + dp[i + 1][j + 1]) { out.push({ text: actual[j], kind: 'wrong' }); i++; j++; }
    else { out.push({ text: expected[i], kind: 'wrong' }); i++; }
  }
  return { out, pct: a.length ? Math.round(hits / a.length * 100) : 0 };
}

function cardState(chunk, mode) {
  const state = lessonState(mode, chunk.id);
  if (state.status === 'done') return `✓ ผ่าน ${state.bestPercent}%`;
  if (state.status === 'redo') return `↻ ต้องทบทวน · ดีที่สุด ${state.bestPercent}%`;
  if (state.status === 'doing') return 'กำลังเรียน';
  return 'ยังไม่ทำ';
}

function listView(root, mode, title, description, open) {
  let situation = '', level = '', status = 'all';
  mount(root);
  const top = h('div', { class: 'card' });
  const count = h('div', { class: 'small muted' });
  const bar = h('div', { style: { marginTop: '10px' } });
  const resume = h('div', {});
  top.append(h('div', { class: 'bold', text: title }), h('div', { class: 'small muted', text: description }), count, bar, resume);
  root.appendChild(top);
  const situationWrap = h('div', { class: 'row row-wrap', style: { gap: '6px', marginBottom: '8px' } });
  const levelWrap = h('div', { class: 'row row-wrap', style: { gap: '6px', marginBottom: '8px' } });
  const statusWrap = h('div', { class: 'row row-wrap', style: { gap: '6px', marginBottom: '12px' } });
  const list = h('div', {});
  root.append(situationWrap, levelWrap, statusWrap, list);
  const buttonGroup = (wrap, values, current, set, allText) => {
    wrap.replaceChildren();
    wrap.appendChild(h('button', { class: `pill ${!current ? 'on' : ''}`, type: 'button', onclick: () => { set(''); draw(); } }, allText));
    for (const [id, label] of values) wrap.appendChild(h('button', { class: `pill ${current === id ? 'on' : ''}`, type: 'button', onclick: () => { set(current === id ? '' : id); draw(); } }, label));
  };
  function draw() {
    const items = db.chunks.filter((c) => (!situation || c.situation === situation) && (!level || c.level === level) && (status === 'all' || (status === 'new' ? ['new', 'doing'].includes(lessonState(mode, c.id).status) : lessonState(mode, c.id).status === 'redo')));
    const done = db.chunks.filter((c) => passed(c.id, mode)).length;
    count.textContent = `ผ่านแล้ว ${done}/${db.chunks.length}`;
    clear(bar); bar.appendChild(progressBar(done, db.chunks.length));
    buttonGroup(situationWrap, situations, situation, (v) => { situation = v; }, 'ทุกสถานการณ์');
    buttonGroup(levelWrap, ['A0', 'A1.1', 'A1.2', 'A2.1', 'A2.2'].map((v) => [v, v]), level, (v) => { level = v; }, 'ทุกระดับ');
    buttonGroup(statusWrap, [['new', 'ยังไม่ทำ'], ['redo', 'ต้องทบทวน']], status === 'all' ? '' : status, (v) => { status = v || 'all'; }, 'ทั้งหมด');
    clear(resume);
    const point = continuePoint(mode);
    if (point) resume.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '10px' }, onclick: () => open(point.id) }, '▶ เรียนต่อ'));
    clear(list);
    if (!items.length) { list.appendChild(emptyState('🔎', 'ไม่พบประโยคในตัวกรองนี้', '')); return; }
    for (const c of items) {
      const phrase = tokens(c.en);
      list.appendChild(h('button', { class: 'card list-item', type: 'button', style: { width: '100%', textAlign: 'left' }, 'data-testid': 'practice-row', onclick: () => open(c.id) },
        h('div', { class: 'thumb', text: '…' }),
        h('div', { class: 'lt' }, h('b', { text: `${phrase.length} คำ · ${c.en.length} ตัวอักษร` }), h('div', { class: 'small muted', text: cardState(c, mode) })),
        h('span', { class: 'pill', text: `${c.level} · ${situationLabel(c.situation)}` })));
    }
  }
  draw();
}

function practiceView(root, mode, params = {}) {
  let timer = null, disposed = false, activeRate = 1, countedDictation = false;
  let chunk = db.chunks.find((c) => c.id === params.id);
  const open = (id) => { location.hash = `#/${mode}?id=${encodeURIComponent(id)}`; };
  if (!chunk) { listView(root, mode, mode === 'dictation' ? 'ฟังแล้วพิมพ์' : 'เรียงประโยค', mode === 'dictation' ? 'ฟังประโยคแล้วพิมพ์ตาม เพื่อฝึกจับคำจากเสียง' : 'อ่านความหมายไทย แล้วแตะชิปคำเพื่อเรียงเป็นประโยค', open); return () => { disposed = true; clearTimeout(timer); stopSpeaking(); }; }
  mount(root);
  const say = (text = chunk.en, rate = activeRate) => sayText(text, { rate, audioKey: 'chunk:' + chunk.id, gender: store.settings().voiceGender });
  const advance = (score) => {
    if (disposed) return;
    clearInterval(timer);
    markComplete(mode, chunk.id, score);
    savePosition(mode, chunk.id, 0, score);
    const next = nextLessonId(mode, chunk.id);
    if (!next) return;
    let remaining = 2;
    const wrap = h('div', { class: 'card center', style: { marginTop: '12px' } });
    const label = h('div', { class: 'small muted', text: `กำลังไปข้อถัดไปใน ${remaining} วินาที` });
    const cancel = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { clearInterval(timer); label.textContent = 'ยกเลิกการไปข้อถัดไปแล้ว'; cancel.remove(); nextNow.remove(); } }, 'ยกเลิก');
    const nextNow = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { clearInterval(timer); open(next); } }, 'ข้อถัดไป');
    wrap.append(label, cancel, nextNow);
    root.appendChild(wrap);
    timer = setInterval(() => { if (disposed) return clearInterval(timer); remaining--; if (remaining <= 0) { clearInterval(timer); open(next); } else label.textContent = `กำลังไปข้อถัดไปใน ${remaining} วินาที`; }, 1000);
  };
  if (mode === 'dictation') {
    const input = h('textarea', { class: 'input', rows: '3', placeholder: 'พิมพ์ประโยคภาษาอังกฤษที่ได้ยิน', autocapitalize: 'off', spellcheck: 'false', 'data-testid': 'dictation-input', style: { width: '100%', marginTop: '12px' } });
    const result = h('div', { class: 'card', style: { display: 'none', marginTop: '10px' }, 'data-testid': 'dictation-result' });
    const actions = h('div', { class: 'row row-wrap', style: { gap: '8px', marginTop: '10px' } });
    const solution = h('div', {});
    const play = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => say() }, '▶ ฟัง');
    const slow = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { activeRate = 0.6; say(chunk.en, 0.6); } }, '🐢 0.6×');
    const check = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
      const aligned = alignedWords(tokens(chunk.en), tokens(input.value));
      const threshold = Number(store.settings().passThreshold) || 70;
      result.replaceChildren(...aligned.out.map((word) => h('span', { class: 'word-result', style: { display: 'inline-block', margin: '2px 4px', color: word.kind === 'correct' ? 'var(--teal)' : word.kind === 'wrong' ? 'var(--danger)' : 'var(--muted)', textDecoration: word.kind === 'extra' ? 'line-through' : 'none' }, text: word.text })));
      result.style.display = '';
      const passedNow = aligned.pct >= threshold;
      const summary = h('div', { class: 'bold', text: `${passedNow ? '✓ ผ่าน' : 'ได้'} ${aligned.pct}%`, style: { marginTop: '8px' } });
      result.appendChild(summary);
      savePosition(mode, chunk.id, 0, aligned.pct);
      markComplete(mode, chunk.id, aligned.pct);
      store.gradeSentence('dict:' + chunk.id, passedNow ? 3 : 1);
      if (passedNow) {
        if (!countedDictation) { countedDictation = true; store.bumpDictation(); }
        sfxSuccess(); actions.replaceChildren(); advance(aligned.pct);
      } else {
        sfxSoft();
        const show = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { solution.replaceChildren(h('div', { class: 'en bold', text: chunk.en }), h('div', { text: chunk.th }), h('div', { class: 'row row-wrap', style: { gap: '4px', marginTop: '8px' } }, ...tokens(chunk.en).map((word) => h('button', { class: 'pill', type: 'button', title: 'แตะเพื่อฟังคำนี้', onclick: () => sayText(word, { rate: 0.85, gender: store.settings().voiceGender }) }, word)))); } }, 'ดูเฉลย');
        actions.replaceChildren(h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { activeRate = 0.6; say(chunk.en, 0.6); } }, 'ฟังช้า ๆ อีกครั้ง'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { input.value = ''; result.style.display = 'none'; input.focus(); } }, 'ลองใหม่'), show);
      }
    } }, 'ตรวจคำตอบ');
    root.append(h('div', { class: 'row row-wrap', style: { gap: '8px' } }, h('span', { class: 'pill', text: situationLabel(chunk.situation) }), h('span', { class: 'pill', text: chunk.level })), play, slow, input, check, result, actions, solution);
  } else {
    const target = tokens(chunk.en), normTarget = target.map(normalize);
    let order = target.map((word, i) => ({ word, i })).sort((a, b) => ((a.i * 37 + chunk.id.length * 13) % 101) - ((b.i * 37 + chunk.id.length * 13) % 101));
    if (order.every((v, i) => v.i === i) && order.length > 1) order = [order[1], order[0], ...order.slice(2)];
    let built = [], wrongAt = -1;
    const bank = h('div', { class: 'row row-wrap', style: { gap: '8px', marginTop: '12px' } });
    const assembled = h('div', { class: 'card row row-wrap', style: { minHeight: '56px', gap: '8px', marginTop: '12px' }, 'data-testid': 'builder-answer' });
    const feedback = h('div', { class: 'small muted', style: { marginTop: '8px' } });
    const draw = () => {
      bank.replaceChildren(); assembled.replaceChildren();
      order.filter((item) => !built.some((b) => b.i === item.i)).forEach((item) => bank.appendChild(h('button', { class: 'pill', type: 'button', 'data-testid': 'builder-chip', onclick: () => { built.push(item); wrongAt = -1; draw(); } }, item.word)));
      built.forEach((item, i) => assembled.appendChild(h('button', { class: `pill ${i === wrongAt ? 'on' : ''}`, type: 'button', style: i === wrongAt ? { color: 'var(--danger)' } : {}, onclick: () => { built.splice(i, 1); wrongAt = -1; draw(); } }, item.word)));
    };
    const check = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
      const first = built.findIndex((item, i) => normTarget[i] !== normalize(item.word));
      if (first === -1 && built.length === target.length) { feedback.textContent = '✓ เรียงได้ถูกต้อง'; feedback.style.color = 'var(--teal)'; store.gradeSentence('builder:' + chunk.id, 3); sfxSuccess(); advance(100); }
      else { wrongAt = Math.max(0, first === -1 ? built.length : first); feedback.textContent = `คำที่ ${wrongAt + 1} ยังไม่ถูก`; feedback.style.color = 'var(--danger)'; store.gradeSentence('builder:' + chunk.id, 1); sfxSoft(); }
    } }, 'ตรวจ');
    const hint = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { savePosition(mode, chunk.id, 0, lessonState(mode, chunk.id).bestPercent, { usedHint: true }); const expected = target[built.length]; const idx = order.findIndex((item) => item.word === expected && !built.some((b) => b.i === item.i)); if (idx >= 0) built.push(order[idx]); feedback.textContent = 'ใบ้แล้ว · เติมคำถัดไปให้ 1 คำ'; draw(); } }, '💡 ใบ้');
    const skip = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { store.gradeSentence('builder:' + chunk.id, 1); advance(0); } }, 'ข้าม');
    const play = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => say() }, '🔊 ฟังต้นแบบ');
    root.append(h('div', { class: 'card' }, h('div', { class: 'small muted', text: `${situationLabel(chunk.situation)} · ${chunk.level}` }), h('div', { class: 'bold', style: { fontSize: '1.2rem', marginTop: '8px' }, text: chunk.th })), play, bank, assembled, h('div', { class: 'row row-wrap', style: { gap: '8px', marginTop: '10px' } }, check, hint, skip), feedback);
    draw();
  }
  return () => { disposed = true; clearInterval(timer); stopSpeaking(); };
}

export function dictation(root, params = {}) { return practiceView(root, 'dictation', params); }
export function builder(root, params = {}) { return practiceView(root, 'builder', params); }
