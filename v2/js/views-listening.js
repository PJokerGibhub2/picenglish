import { h, mount, icon, btn3d, bar, toast } from './ui2.js';
import { loadListening, listeningById } from './data.js';
import { renderSentence, speakSentence, sayText, stopSpeaking } from './speech.js';
import { sfxCorrect, sfxWrong } from './sfx.js';
import * as store from './store.js';
import * as pg from './progress2.js';

export async function listeningView(root, query = new URLSearchParams()) {
  const lessons = await loadListening();
  const id = query.get('id');
  let disposed = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); return t; };
  const s = { level: '', idx: 0, playing: false, rate: 1, stage: 'listen', qi: 0, answers: [], correct: 0, autoTimer: null };
  if (!id) { drawList(); return () => { disposed = true; stopSpeaking(); timers.forEach(clearTimeout); }; }
  const lesson = listeningById(id);
  if (!lesson) { mount(root, h('div', { class: 'empty', text: 'ไม่พบบทฟังนี้' }), btn3d('กลับรายการ', { onclick: () => { location.hash = '#/listening'; } })); return () => {}; }
  const transcript = lesson.transcript || lesson.lines || [];
  const key = (i) => `lis:${id}:${i}`;
  function playLine(index, rate = s.rate) {
    if (disposed) return;
    s.idx = index; draw();
    const row = root.querySelector(`[data-listen-line="${index}"] .listen-en`);
    if (row) speakSentence(row, transcript[index].en, { audioKey: key(index), rate });
    else sayText(transcript[index].en, { audioKey: key(index), rate });
  }
  function pause() { s.playing = false; stopSpeaking(); draw(); }
  async function playAll() {
    if (s.playing) return;
    s.playing = true; draw();
    for (let i = s.idx; i < transcript.length; i++) {
      if (disposed || !s.playing) break;
      s.idx = i; draw();
      const el = root.querySelector(`[data-listen-line="${i}"] .listen-en`);
      if (el) await speakSentence(el, transcript[i].en, { audioKey: key(i), rate: s.rate });
      else await sayText(transcript[i].en, { audioKey: key(i), rate: s.rate });
      if (s.playing && !disposed) await new Promise((resolve) => later(resolve, 300));
    }
    if (!disposed && s.playing) { s.playing = false; s.idx = Math.max(0, transcript.length - 1); s.stage = 'questions'; draw(); }
  }
  function choose(qIndex, optionIndex) {
    if (s.answers[qIndex] !== undefined) return;
    const q = lesson.questions[qIndex]; const ok = optionIndex === q.answer;
    s.answers[qIndex] = optionIndex; if (ok) s.correct++;
    (ok ? sfxCorrect : sfxWrong)(); draw();
    if (qIndex + 1 < lesson.questions.length) s.qi = qIndex + 1;
    else { s.stage = 'summary'; finish(); }
    draw();
  }
  function finish() {
    const pct = lesson.questions?.length ? Math.round(s.correct / lesson.questions.length * 100) : 100;
    store.bumpListening(id, pct); pg.bumpActivity('listen');
    const nextIndex = lessons.findIndex((x) => x.id === id) + 1;
    if (nextIndex > 0 && nextIndex < lessons.length) {
      s.autoTimer = later(() => { location.hash = `#/listening?id=${encodeURIComponent(lessons[nextIndex].id)}`; }, 3000);
    }
  }
  function draw() {
    if (disposed) return;
    if (s.stage === 'questions') {
      const q = lesson.questions[s.qi];
      mount(root, h('div', { class: 'listen-top' }, h('button', { class: 'icon-btn', text: '←', 'aria-label': 'กลับรายการ', onclick: leave }), h('div', {}, h('strong', { text: lesson.title }), h('small', { class: 'muted', text: ` · คำถาม ${s.qi + 1}/${lesson.questions.length}` })), h('span', {})),
        bar((s.qi + 1) / lesson.questions.length * 100), h('section', { class: 'card listen-question' }, h('div', { class: 'bold', text: q.q }), ...q.options.map((opt, i) => h('button', { class: `listen-option${s.answers[s.qi] === i ? (i === q.answer ? ' correct' : ' incorrect') : ''}`, onclick: () => choose(s.qi, i) }, h('span', { text: opt }), s.answers[s.qi] === i ? h('b', { text: i === q.answer ? '✓' : 'ลองใหม่ได้' }) : null)), s.answers[s.qi] !== undefined ? h('div', { class: 'muted small', text: s.answers[s.qi] === q.answer ? 'ถูกแล้ว เยี่ยมเลย!' : `คำตอบคือ: ${q.options[q.answer]}` }) : null),
        h('button', { class: 'practice-skip', text: 'ข้ามคำถาม', onclick: () => { s.answers[s.qi] = -1; if (s.qi + 1 < lesson.questions.length) { s.qi++; draw(); } else { s.stage = 'summary'; finish(); draw(); } } })); return;
    }
    if (s.stage === 'summary') {
      const pct = lesson.questions?.length ? Math.round(s.correct / lesson.questions.length * 100) : 100;
      const n = lessons.findIndex((x) => x.id === id) + 1;
      mount(root, h('section', { class: 'card listen-summary' }, h('div', { class: 'rp-big', text: 'ฟังจบแล้ว 🎉' }), h('div', { class: 'speak-score', text: `${pct}%` }), h('div', { class: 'muted', text: `ตอบถูก ${s.correct}/${lesson.questions.length} ข้อ` }),
        btn3d('ฟังอีกครั้ง', { tone: 'ghost', block: true, onclick: () => { if (s.autoTimer) { clearTimeout(s.autoTimer); timers.delete(s.autoTimer); s.autoTimer = null; } s.stage = 'listen'; s.idx = 0; s.answers = []; s.correct = 0; draw(); playAll(); } }),
        n > 0 && n < lessons.length ? btn3d('บทถัดไป', { block: true, icon: 'play', onclick: () => { if (s.autoTimer) { clearTimeout(s.autoTimer); timers.delete(s.autoTimer); } location.hash = `#/listening?id=${encodeURIComponent(lessons[n].id)}`; } }) : null,
        btn3d('กลับรายการ', { tone: 'ghost', block: true, onclick: leave }))); return;
    }
    mount(root,
      h('div', { class: 'listen-top' }, h('button', { class: 'icon-btn', text: '←', 'aria-label': 'กลับรายการ', onclick: leave }), h('div', {}, h('strong', { text: lesson.title }), h('small', { class: 'muted', text: ` · ${lesson.level || ''}` })), h('span', {})),
      h('div', { class: 'listen-controls' }, btn3d(s.playing ? 'หยุด' : 'เล่นทั้งหมด', { tone: s.playing ? 'coral' : 'brand', icon: s.playing ? 'target' : 'play', onclick: () => s.playing ? pause() : playAll() }), btn3d(s.rate === 1 ? '🐢 0.7×' : '🐇 1×', { tone: 'ghost', onclick: () => { s.rate = s.rate === 1 ? 0.7 : 1; draw(); } }), btn3d('ฟังซ้ำ', { tone: 'ghost', icon: 'sound', onclick: () => playLine(s.idx) })),
      h('div', { class: 'listen-script' }, ...transcript.map((line, i) => h('button', { class: `listen-line${s.idx === i ? ' active' : ''}`, 'data-listen-line': i, onclick: () => playLine(i) }, h('span', { class: 'listen-en' }), h('small', { class: 'listen-th', text: line.th || line.thai || '' })))),
      s.stage === 'questions' ? null : btn3d('ไปตอบคำถาม', { block: true, icon: 'arrow', onclick: () => { pause(); s.stage = 'questions'; s.qi = 0; draw(); } }));
    transcript.forEach((line, i) => { const el = root.querySelector(`[data-listen-line="${i}"] .listen-en`); if (el) renderSentence(el, line.en); });
  }
  function leave() { pause(); location.hash = '#/listening'; }
  draw();
  return () => { disposed = true; s.playing = false; timers.forEach(clearTimeout); stopSpeaking(); };

  function drawList() {
    const levels = [...new Set(lessons.map((x) => x.level).filter(Boolean))];
    const filtered = () => s.level ? lessons.filter((l) => l.level === s.level) : lessons;
    const render = () => {
      const filters = h('div', { class: 'chips' },
        h('button', { class: `chip${!s.level ? ' on' : ''}`, text: 'ทั้งหมด', onclick: () => { s.level = ''; render(); } }),
        ...levels.map((level) => h('button', { class: `chip${s.level === level ? ' on' : ''}`, text: level, onclick: () => { s.level = level; render(); } })));
      const cards = filtered().map((l) => h('button', { class: 'listen-list-card', onclick: () => { location.hash = `#/listening?id=${encodeURIComponent(l.id)}`; } },
        h('span', { class: 'rp-emoji', text: l.scene || '🎧' }),
        h('span', { class: 'rp-list-main' }, h('strong', { text: l.title }), h('small', { class: 'muted', text: `${l.level || ''} · ${l.seconds || 0} วินาที · ${l.questions?.length || 0} คำถาม` })),
        h('span', { class: 'muted', text: store.S.listening[l.id]?.completed ? '✓' : '›' })));
      mount(root,
        h('header', { class: 'page-head' }, h('div', { class: 'page-title', text: 'ฟังบทเต็ม' }), h('div', { class: 'page-sub', text: 'ฟังเรื่องสั้นพร้อมคำถามเช็กความเข้าใจ' })),
        filters, ...cards);
    };
    render();
  }
}
