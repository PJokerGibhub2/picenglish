import { db } from './data.js';
import * as store from './store.js';
import { h, mount, clear, progressBar, emptyState } from './ui.js';
import { sayText, alignWords, stopSpeaking } from './speech.js';
import { listenOnce, stopListeningOnce } from './listen-once.js';
import { micPanel } from './micfallback.js';
import { continuePoint } from './progress.js';

const S = () => store.settings();
const situations = [
  ['cafe', '☕ คาเฟ่'], ['restaurant', '🍽️ ร้านอาหาร'], ['shopping', '🛍️ ซื้อของ'],
  ['travel', '🧭 เดินทาง'], ['hotel', '🏨 โรงแรม'], ['health', '🩺 สุขภาพ'],
  ['work', '💼 ที่ทำงาน'], ['smalltalk', '💬 คุยทั่วไป'],
];
const levels = ['A0', 'A1.1', 'A1.2', 'A2.1', 'A2.2'];

export function chunks(root, params = {}) {
  let situation = params.situation || '';
  let level = params.level || '';
  let activeId = params.id || '';
  const scores = new Map();
  let listening = false;
  mount(root);

  if (!db.chunks.length) { root.appendChild(emptyState('💬', 'ยังไม่มีประโยคสำเร็จรูป', '')); return () => {}; }
  const top = h('div', { class: 'card' });
  const heading = h('div', { class: 'bold', text: 'ประโยคสำเร็จรูป' });
  const count = h('div', { class: 'small muted' });
  const bar = h('div', { style: { marginTop: '10px' } });
  const resumeSlot = h('div', {});
  top.append(heading, count, bar, resumeSlot);
  root.appendChild(top);
  const situationWrap = h('div', { class: 'row row-wrap', style: { gap: '6px', marginBottom: '8px' } });
  const levelWrap = h('div', { class: 'row row-wrap', style: { gap: '6px', marginBottom: '12px' } });
  root.append(situationWrap, levelWrap);
  const list = h('div', {});
  root.appendChild(list);

  function refresh() {
    const done = db.chunks.filter((c) => store.chunkState(c.id).done).length;
    count.textContent = `ใช้ได้แล้ว ${done}/${db.chunks.length}`;
    clear(bar);
    bar.appendChild(progressBar(done, db.chunks.length));
    clear(resumeSlot);
    const point = continuePoint('chunks');
    if (point) resumeSlot.appendChild(h('button', {
      class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '10px' },
      onclick: () => { activeId = point.id; situation = ''; level = ''; draw(); document.getElementById('chunk-' + point.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    }, '▶ เรียนต่อ'));
    situationWrap.replaceChildren();
    const all = h('button', { class: `pill ${!situation ? 'on' : ''}`, type: 'button', onclick: () => { situation = ''; draw(); } }, 'ทั้งหมด');
    situationWrap.appendChild(all);
    for (const [id, label] of situations) situationWrap.appendChild(h('button', { class: `pill ${situation === id ? 'on' : ''}`, type: 'button', onclick: () => { situation = situation === id ? '' : id; draw(); } }, label));
    levelWrap.replaceChildren();
    levelWrap.appendChild(h('button', { class: `pill ${!level ? 'on' : ''}`, type: 'button', onclick: () => { level = ''; draw(); } }, 'ทุกระดับ'));
    for (const item of levels) levelWrap.appendChild(h('button', { class: `pill ${level === item ? 'on' : ''}`, type: 'button', onclick: () => { level = level === item ? '' : item; draw(); } }, item));
    draw();
  }

  function draw() {
    [...situationWrap.children].forEach((button, index) => button.classList.toggle('on', index === 0 ? !situation : situation === situations[index - 1][0]));
    [...levelWrap.children].forEach((button, index) => button.classList.toggle('on', index === 0 ? !level : level === levels[index - 1]));
    const filtered = db.chunks.filter((c) => (!situation || c.situation === situation) && (!level || c.level === level));
    clear(list);
    if (!filtered.length) { list.appendChild(emptyState('🔎', 'ไม่พบประโยคในตัวกรองนี้', '')); return; }
    for (const c of filtered) {
      const state = store.chunkState(c.id);
      const situationLabel = (situations.find(([id]) => id === c.situation) || [c.situation, c.situation])[1];
      const card = h('article', { class: 'card', id: 'chunk-' + c.id, style: { scrollMarginTop: '12px' } },
        h('div', { class: 'en bold', style: { fontSize: '1.3rem', lineHeight: '1.45' }, text: c.en }),
        h('div', { style: { marginTop: '6px' }, text: c.th }),
        h('div', { class: 'row row-wrap', style: { gap: '6px', margin: '10px 0' } },
          h('span', { class: 'pill', text: c.level }), h('span', { class: 'pill', text: situationLabel }),
          state.done ? h('span', { class: 'pill on', text: '✓ ใช้ได้แล้ว' + (state.bestPct ? ` · ${state.bestPct}%` : '') }) : null),
        h('div', { class: 'tiny muted', text: c.note }));
      const score = h('div', { class: 'small', style: { marginTop: '8px' } });
      const actions = h('div', { class: 'row row-wrap', style: { gap: '8px', marginTop: '10px' } });
      const say = () => sayText(c.en, { rate: S().rate, gender: S().voiceGender, voiceURI: S().voiceURI, audioKey: 'chunk:' + c.id,
        onStart: () => { score.textContent = 'กำลังเล่นเสียง…'; }, onEnd: () => { score.textContent = 'เล่นเสียงจบ'; } });
      actions.append(
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': '🔊 ' + c.id, onclick: () => { score.textContent = 'กำลังเล่นเสียง…'; say(); } }, '🔊'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async (e) => {
          if (listening) return;
          listening = true; e.currentTarget.disabled = true; score.textContent = 'กำลังฟัง… พูดประโยคนี้ได้เลย';
          const result = await listenOnce({ onStart: () => { score.textContent = 'กำลังฟังเสียงของคุณ…'; } });
          listening = false; e.currentTarget.disabled = false;
          if (result.said) {
            const aligned = alignWords(c.en, result.said);
            const pct = aligned.score;
            scores.set(c.id, pct);
            score.textContent = `ได้ ${pct}% · ${pct >= (Number(S().passThreshold) || 70) ? 'ผ่านแล้ว ไปต่อได้เลย' : 'ลองอีกครั้งได้'} ` + result.said;
            score.style.color = pct >= (Number(S().passThreshold) || 70) ? 'var(--teal)' : '';
            if (pct >= (Number(S().passThreshold) || 70)) { store.markChunk(c.id, pct); refresh(); advance(c.id); }
          } else if (result.err === 'unsupported') {
            score.textContent = 'เบราว์เซอร์นี้ให้คะแนนอัตโนมัติไม่ได้';
            card.appendChild(micPanel({ audioText: c.en, speak: say, banner: 'ฟังเสียงต้นแบบแล้วอัดเสียงตัวเอง จากนั้นให้คะแนนตัวเองได้เลย', onRate: (stars) => { if (stars >= 3) { store.markChunk(c.id, scores.get(c.id) || 0); refresh(); } }, onNext: () => advance(c.id) }));
          } else score.textContent = 'ฟังเสียงไม่สำเร็จ ลองอีกครั้งหรือใช้ปุ่มอัดเสียง';
        } }, '🎤 พูดตาม'),
        h('button', { class: `btn ${state.done ? 'btn-ghost' : 'btn-primary'} btn-sm`, type: 'button', onclick: () => { store.markChunk(c.id, scores.get(c.id) || 0); refresh(); advance(c.id); } }, state.done ? '✓ ใช้ได้แล้ว' : 'ใช้ได้แล้ว'));
      card.append(actions, score);
      list.appendChild(card);
    }
  }
  function advance(id) {
    const visible = db.chunks.filter((c) => (!situation || c.situation === situation) && (!level || c.level === level));
    const next = visible[visible.findIndex((c) => c.id === id) + 1];
    if (next) { activeId = next.id; setTimeout(() => { const el = document.getElementById('chunk-' + next.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80); }
  }
  refresh();
  if (activeId) setTimeout(() => document.getElementById('chunk-' + activeId)?.scrollIntoView({ block: 'center' }), 80);
  return () => { stopListeningOnce(); stopSpeaking(); };
}
