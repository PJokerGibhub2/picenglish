import { h, mount, btn3d } from './ui2.js';
import { loadListening, listeningById } from './data.js';
import { sayText, stopSpeaking, alignWords, sttSupport } from './speech.js';
import { listenOnce, stopListeningOnce } from './listen-once.js';
import { startRecording, playBlob } from './recorder.js';
import { shadowProgress, saveShadowLine } from './store.js';
import { mascot } from './mascot2.js';
import { sfxCorrect, sfxWrong, sfxComplete } from './sfx.js';
import * as pg from './progress2.js';

export async function shadowView(root, query = new URLSearchParams()) {
  const lessons = await loadListening();
  let disposed = false, recorder = null, recording = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); return t; };
  const id = query.get('id');
  const leave = () => { location.hash = '#/shadow'; };
  const cleanup = () => { disposed = true; stopSpeaking(); stopListeningOnce(); timers.forEach(clearTimeout); if (recording && recorder) recorder.stop().catch(() => {}); };
  if (!id) {
    let level = '';
    const drawList = () => mount(root, h('header', { class: 'page-head' }, h('div', { class: 'page-title', text: 'พูดตามเงา' }), h('div', { class: 'page-sub', text: 'ฟังประโยค แล้วลองพูดตามทีละบรรทัด' })),
      h('div', { class: 'filter-row' }, ...['', 'A0', 'A1', 'A2', 'B1'].map((x) => h('button', { class: `chip${level === x ? ' on' : ''}`, text: x || 'ทั้งหมด', onclick: () => { level = x; drawList(); } }))),
      ...lessons.filter((l) => !level || l.level === level).map((l) => { const lines = l.transcript || l.lines || []; const p = shadowProgress(l.id); return h('button', { class: 'listen-list-card', onclick: () => { location.hash = `#/shadow?id=${encodeURIComponent(l.id)}`; } }, h('span', { text: '🗣️' }), h('span', {}, h('strong', { text: l.title || l.contextTh || l.id }), h('small', { class: 'muted', text: `${p.passed.length}/${lines.length} บรรทัด · ${l.level || ''}` }))); }));
    drawList(); return cleanup;
  }
  const lesson = listeningById(id);
  if (!lesson) { mount(root, h('div', { class: 'empty', text: 'ไม่พบบทฝึกนี้' }), btn3d('กลับคลังบทฝึก', { onclick: leave })); return cleanup; }
  const lines = lesson.transcript || lesson.lines || [];
  const state = { i: 0, score: null, said: '', blob: null, busy: false, self: false, recording: false, passed: new Set(shadowProgress(id).passed), complete: false };
  const play = (rate = 1) => sayText(lines[state.i]?.en || '', { audioKey: `lis:${id}:${state.i}`, rate });
  const mark = (i) => { state.passed.add(i); saveShadowLine(id, i, 100); state.score = 100; state.blob = null; sfxCorrect(); draw(); };
  async function record() {
    if (state.busy) return; state.busy = true; draw();
    if (sttSupport().ok) {
      const res = await listenOnce({ onStart: () => { if (!disposed) mount(root, h('section', { class: 'card' }, h('div', { class: 'bold', text: `กำลังฟัง ${state.i + 1}/${lines.length}` }), h('div', { class: 'muted', text: 'พูดประโยคภาษาอังกฤษได้เลย' }), btn3d('หยุด', { tone: 'ghost', onclick: stopListeningOnce }))); } });
      if (disposed) return;
      state.said = res.said; state.blob = res.blob; state.busy = false;
      if (res.said) { const result = alignWords(lines[state.i].en, res.said); state.score = result.score; if (result.score >= 70) mark(state.i); else { sfxWrong(); draw(result.missed); } }
      else draw();
      return;
    }
    state.self = true;
    try { recorder = await startRecording(); } catch { recorder = null; }
    recording = !!recorder; state.recording = recording; state.busy = false; draw();
  }
  async function stopRecord() { if (!recorder) return; recording = false; state.recording = false; state.blob = await recorder.stop(); recorder = null; draw(); }
  function next() { if (state.i + 1 >= lines.length) { state.complete = true; pg.bumpActivity('shadow'); sfxComplete(); draw(); return; } state.i++; state.score = null; state.said = ''; state.blob = null; draw(); }
  function draw(missed = []) {
    if (disposed) return;
      if (state.complete) {
        const p = shadowProgress(id);
        const bests = Object.values(p.best);
        const avg = bests.length ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length) : 0;
        const rows = lines.map((line, i) => h('button', {
          class: 'listen-line',
          onclick: () => { state.i = i; state.complete = false; draw(); play(); },
        },
        h('strong', { text: `${p.passed.includes(i) ? '✓' : '↻'} ${line.en}` }),
        h('small', { class: 'muted', text: line.th || '' })));
        mount(root, btn3d('กลับคลัง', { tone: 'ghost', onclick: leave }),
          h('section', { class: 'card drill-card' },
            mascot('cheer', 100),
            h('h2', { text: 'จบบทแล้ว 🎉' }),
            h('div', { class: 'speak-score', text: `${avg}%` }),
            h('div', { class: 'muted', text: `ผ่านแล้ว ${p.passed.length}/${lines.length} บรรทัด` }),
            ...rows));
        return;
      }
    const line = lines[state.i];
    mount(root, h('div', { class: 'listen-top' }, h('button', { class: 'icon-btn', text: '←', 'aria-label': 'กลับ', onclick: leave }), h('strong', { text: lesson.title || lesson.contextTh || 'พูดตามเงา' }), h('small', { text: `${state.i + 1}/${lines.length}` })),
      h('section', { class: 'card drill-card' }, state.passed.has(state.i) ? mascot('cheer', 76) : null, h('div', { class: 'muted small', text: `ผ่านแล้ว ${state.passed.size}/${lines.length} บรรทัด` }), h('div', { class: 'sentence-large', text: line.en }), h('div', { class: 'muted', text: line.th || '' }),
        h('div', { class: 'drill-actions' }, btn3d('▶ ฟังต้นแบบ', { onclick: () => play() }), btn3d('🐢 0.6×', { tone: 'ghost', onclick: () => play(0.6) }), btn3d('🔁 ฟังซ้ำ', { tone: 'ghost', onclick: () => play() })),
        state.self ? h('div', { class: 'drill-actions' }, state.recording ? btn3d('⏹ หยุดอัดเสียง', { tone: 'coral', onclick: stopRecord }) : btn3d('🎙️ อัดเสียงของฉัน', { tone: 'brand', onclick: record }), state.blob ? btn3d('▶ ฟังเสียงฉัน', { tone: 'ghost', onclick: () => playBlob(state.blob) }) : null, state.blob ? btn3d('⭐ ให้คะแนนตัวเอง 3/5', { onclick: () => mark(state.i) }) : null) : btn3d(state.busy ? 'กำลังฟัง…' : '🎙️ พูดตาม', { tone: 'brand', size: 'lg', block: true, onclick: record }),
        state.score !== null ? h('div', { class: 'speak-score', text: `${state.score}%` }) : null,
        missed.length ? h('div', { class: 'chip-row' }, ...missed.map((w) => h('button', { class: 'chip', text: w, onclick: () => sayText(w) }))) : null,
        state.score !== null && state.score < 70 ? h('div', { class: 'drill-actions' }, btn3d('ลองอีกใหม่', { onclick: record }), btn3d('ฟังช้า ๆ', { tone: 'ghost', onclick: () => play(0.6) })) : state.passed.has(state.i) ? btn3d('บรรทัดถัดไป', { block: true, onclick: next }) : null,
        btn3d('ข้ามบรรทัด', { tone: 'ghost', block: true, onclick: next })));
  }
  draw(); return cleanup;
}