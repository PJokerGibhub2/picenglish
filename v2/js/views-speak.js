import { h, mount, icon, btn3d, bar, toast } from './ui2.js';
import { mascot, mascotReact } from './mascot2.js';
import { db, loadAll, shuffle } from './data.js';
import { sayText, alignWords, sentenceSimilarity, sttSupport, stopSpeaking } from './speech.js';
import { listenOnce, stopListeningOnce } from './listen-once.js';
import { startRecording, playBlob, abortRecording, saveRecording, stopPlayback } from './recorder.js';
import * as store from './store.js';
import * as pg from './progress2.js';
import { sfxCorrect, sfxWrong } from './sfx.js';

const PASS = 70;
export async function speakView(root) {
  await loadAll();
  const state = { mode: 'word', cat: '', round: [], done: 0, result: null, busy: false, record: null, blob: null, rating: 0 };
  const supported = sttSupport();
  let disposed = false;
  const words = () => state.cat ? (db.byCategory.get(state.cat) || []) : db.words;
  const candidates = () => state.mode === 'word' ? words() : words().filter((w) => w.example);
  const nextItem = () => {
    if (!state.round.length || state.done >= state.round.length) {
      state.round = shuffle(candidates()).slice(0, 10); state.done = 0;
    }
    state.result = null; state.blob = null; state.rating = 0;
    draw();
  };
  const current = () => state.round[state.done];
  const target = (item) => state.mode === 'word' ? item.word : item.example;
  const rate = (item, pct, said, blob) => {
    if (disposed || state.result) return;
    const passed = pct >= PASS;
    state.result = { pct, said, passed };
    if (state.mode === 'word') store.grade(item.id, passed ? 3 : 1);
    else store.gradeSentence(`ex:${item.id}`, passed ? 3 : 1);
    pg.bumpActivity('speak');
    if (blob) { state.blob = blob; saveRecording({ kind: 'speak', refId: item.id, label: target(item), blob, seconds: 3 }); }
    (passed ? sfxCorrect : sfxWrong)();
    draw();
    if (passed) mascotReact(root.querySelector('.speak-mascot'), 'cheer', 1000);
  };
  async function recordToggle() {
    const item = current();
    if (state.busy) return;
    if (state.record) {
      state.busy = true; draw();
      const blob = await state.record.stop(); state.record = null; state.busy = false;
      state.blob = blob;
      if (blob) { await playBlob(blob); draw(); } else { toast('ยังบันทึกเสียงไม่ได้ ลองอีกครั้งนะ'); draw(); }
      return;
    }
    state.record = await startRecording();
    if (!state.record) { toast('เปิดไมโครโฟนไม่ได้ ลองตรวจสิทธิ์ไมโครโฟนนะ'); return; }
    draw();
  }
  async function recognize() {
    const item = current();
    state.busy = true; draw();
    const out = await listenOnce({ onInterim: (text) => { const el = root.querySelector('.speak-heard'); if (el) el.textContent = text ? `ได้ยิน: ${text}` : 'กำลังฟัง…'; } });
    state.busy = false;
    if (disposed || out.err === 'aborted') return;
    if (!out.said) { draw(); toast('ยังไม่ได้ยินเสียง ลองพูดอีกครั้งได้เลย'); return; }
    const pct = state.mode === 'word' ? Math.round(sentenceSimilarity(item.word, out.said) * 100) : alignWords(item.example, out.said).score;
    rate(item, pct, out.said, out.blob);
  }
  function draw() {
    if (disposed) return;
    const item = current();
    if (!item) { mount(root, h('div', { class: 'empty', text: 'หมวดนี้ยังไม่มีรายการฝึก' })); return; }
    const cats = [{ id: '', th: 'ทั้งหมด' }, ...db.categories];
    const total = state.round.length || Math.min(10, candidates().length);
    const phrase = target(item);
    const progress = h('div', { class: 'practice-progress' }, bar(total ? state.done / total * 100 : 0), h('span', { class: 'muted small', text: `${Math.min(state.done + 1, total)}/${total}` }));
    const answer = state.result ? (state.mode === 'word' ? alignWords(item.word, state.result.said) : alignWords(item.example, state.result.said)) : null;
    mount(root,
      h('header', { class: 'page-head' }, h('div', { class: 'page-title', text: 'ฝึกออกเสียง' }), h('div', { class: 'page-sub', text: supported.ok ? 'พูดตามต้นแบบ แล้วดูคำที่ได้ยินชัด' : 'อัดเสียง ฟังเทียบ แล้วให้คะแนนตัวเอง' })),
      h('div', { class: 'chips' }, ...[['word', 'คำ'], ['sentence', 'ประโยค']].map(([id, label]) => h('button', { class: `chip${state.mode === id ? ' on' : ''}`, onclick: () => { state.mode = id; state.round = []; state.done = 0; state.result = null; draw(); } }, label))),
      h('div', { class: 'chips' }, ...cats.map((c) => h('button', { class: `chip${state.cat === c.id ? ' on' : ''}`, onclick: () => { state.cat = c.id; state.round = []; state.done = 0; draw(); } }, c.emoji ? `${c.emoji} ${c.th}` : c.th))),
      progress,
      h('section', { class: 'card speak-card' },
        h('div', { class: 'center speak-mascot' }, mascot('idle', 76)),
        h('div', { class: 'speak-target', text: phrase }),
        state.mode === 'word' ? h('div', { class: 'center muted', text: item.ipa || '' }) : null,
        h('div', { class: 'center speak-meaning', text: item.thai || '' }),
        h('div', { class: 'speak-audio-row' },
          btn3d('ฟังต้นแบบ', { tone: 'ghost', icon: 'sound', onclick: () => sayText(phrase, { audioKey: state.mode === 'word' ? `word:${item.id}` : `sent:${item.id}` }) }),
          btn3d('🐢 0.6×', { tone: 'ghost', onclick: () => sayText(phrase, { audioKey: state.mode === 'word' ? `word:${item.id}` : `sent:${item.id}`, rate: 0.6 }) }),
          state.blob ? btn3d('เสียงของฉัน', { tone: 'sun', onclick: () => playBlob(state.blob) }) : null)),
      !state.result ? (supported.ok
        ? h('button', { class: `speak-mic${state.busy ? ' listening' : ''}`, disabled: state.busy, onclick: recognize }, icon('mic', 30), h('span', { text: state.busy ? 'กำลังฟัง…' : 'แตะแล้วพูด' }))
        : h('div', { class: 'card speak-fallback' }, h('p', { class: 'muted', text: supported.note }),
          btn3d(state.record ? 'หยุดอัดเสียง' : 'อัดเสียง', { block: true, icon: 'mic', onclick: recordToggle }),
          state.blob ? h('div', { class: 'self-rate' }, h('span', { text: 'ฟังเทียบแล้วให้คะแนนตัวเอง' }), h('div', { class: 'rating-stars' }, ...[1,2,3,4,5].map((n) => h('button', { class: n <= state.rating ? 'on' : '', text: '★', onclick: () => { state.rating = n; draw(); } }))),
            state.rating ? btn3d('บันทึกคะแนน', { tone: 'brand', onclick: () => rate(item, state.rating >= 3 ? 80 : 40, '', state.blob) }) : null) : null)) : null,
      state.result ? h('div', { class: `speak-result${state.result.passed ? ' passed' : ''}` },
        h('div', { class: 'speak-score', text: `${state.result.pct}%` }),
        h('div', { class: 'bold', text: state.result.passed ? 'พูดได้ชัดแล้ว เยี่ยมเลย!' : 'ค่อย ๆ ฝึกได้ ลองฟังอีกครั้งนะ' }),
        state.result.said ? h('div', { class: 'speak-heard muted', text: `ได้ยิน: ${state.result.said}` }) : null,
        answer && answer.missed.length ? h('div', { class: 'chips speak-missing' }, ...answer.missed.map((w) => h('button', { class: 'chip', text: w, onclick: () => sayText(w) }))) : null,
        !state.result.passed ? h('div', { class: 'speak-actions' }, btn3d('ลองอีกครั้ง', { tone: 'brand', onclick: () => { state.result = null; draw(); } }), btn3d('ฟังช้า ๆ', { tone: 'ghost', onclick: () => sayText(phrase, { audioKey: state.mode === 'word' ? `word:${item.id}` : `sent:${item.id}`, rate: 0.6 }) })) : null,
        btn3d('คำถัดไป', { block: true, icon: 'play', onclick: () => { state.done++; nextItem(); } })) : null,
      h('button', { class: 'practice-skip', onclick: () => { if (state.record) { abortRecording(); state.record = null; } state.done++; nextItem(); }, text: 'ข้ามข้อนี้' }));
  }
  state.round = shuffle(candidates()).slice(0, 10); draw();
  return () => { disposed = true; stopSpeaking(); stopListeningOnce(); abortRecording(); stopPlayback(); };
}
