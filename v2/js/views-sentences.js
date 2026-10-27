import { h, mount, btn3d } from './ui2.js';
import { loadAll, loadChunks, shuffle } from './data.js';
import { sayText, stopSpeaking, normalizeEn } from './speech.js';
import { srsOfSentence, gradeSentence } from './store.js';
import { mascot } from './mascot2.js';
import { sfxCorrect, sfxWrong, sfxComplete } from './sfx.js';
import * as pg from './progress2.js';

export async function sentencesView(root) {
  const db = await loadAll(); const chunks = await loadChunks();
  const now = Date.now();
  const all = [];
  for (const w of db.words) if (w.example) all.push({ key: `ex:${w.id}`, en: w.example, th: w.exampleThai || w.thai || '', owner: w });
  for (const c of chunks) all.push({ key: `chunk:${c.id}`, en: c.en, th: c.th, owner: c });
  const entries = all.filter((x) => { const s = srsOfSentence(x.key); return !s.reps || s.due <= now; })
    .sort((a, b) => { const sa = srsOfSentence(a.key), sb = srsOfSentence(b.key); return Number(!!sb.reps) - Number(!!sa.reps) || (sa.due || 0) - (sb.due || 0); })
    .slice(0, 10);
  let disposed = false, idx = 0, correct = 0, answered = false, mode = 0, typed = '', picked = [], tileSet = [];
  const timers = new Set();
  const cleanup = () => { disposed = true; stopSpeaking(); timers.forEach(clearTimeout); };
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); return t; };
  function finishAnswer(ok) {
    if (answered) return; answered = true; if (ok) correct++;
    gradeSentence(entries[idx].key, ok ? 3 : 1); (ok ? sfxCorrect : sfxWrong)(); draw();
  }
  function advance() { if (idx + 1 >= entries.length) { idx = entries.length; pg.bumpDaily({ xp: correct * 2 }); pg.bumpActivity('review'); sfxComplete(); draw(); return; } idx++; answered = false; typed = ''; picked = []; tileSet = []; mode = (mode + 1) % 3; draw(); }
  function draw() {
    if (disposed) return;
    if (!entries.length) { mount(root, h('section', { class: 'card drill-card' }, mascot('sleep', 120), h('h2', { text: 'วันนี้ทบทวนครบแล้ว' }), h('div', { class: 'muted', text: 'กลับมาอีกครั้งเมื่อมีประโยคถึงเวลาทบทวน' }), btn3d('กลับหน้าฝึก', { onclick: () => { location.hash = '#/practice'; } }))); return; }
    if (idx >= entries.length) { mount(root, h('section', { class: 'card drill-card' }, mascot('cheer', 110), h('h2', { text: 'ทบทวนเสร็จแล้ว' }), h('div', { class: 'speak-score', text: `${Math.round(correct / entries.length * 100)}%` }), h('div', { class: 'muted', text: `ตอบได้ ${correct}/${entries.length} · ได้ ${entries.length * 3 + correct * 2} XP` }), btn3d('กลับหน้าฝึก', { onclick: () => { location.hash = '#/practice'; } }))); return; }
    const item = entries[idx], words = normalizeEn(item.en).split(' ').filter(Boolean);
    const header = h('div', { class: 'listen-top' }, h('button', { class: 'icon-btn', text: '←', onclick: () => { location.hash = '#/practice'; } }), h('strong', { text: 'ทบทวนประโยค' }), h('small', { text: `${idx + 1}/${entries.length}` }));
    let task;
    if (mode === 0) {
      const options = shuffle([item.th, ...shuffle(all.filter((x) => x.key !== item.key).map((x) => x.th).filter(Boolean)).slice(0, 3)]);
      task = h('div', {}, h('div', { class: 'muted', text: 'ฟังแล้วเลือกความหมาย' }), btn3d('▶ ฟังประโยค', { tone: 'ghost', onclick: () => sayText(item.en, { audioKey: item.key.startsWith('chunk:') ? item.key : `sent:${item.owner.id}` }) }), ...options.map((opt) => btn3d(opt, { tone: answered ? (opt === item.th ? 'good' : 'ghost') : 'ghost', block: true, onclick: () => finishAnswer(opt === item.th) })));
    } else if (mode === 1) {
      if (!tileSet.length) tileSet = shuffle(words.map((w, i) => ({ w, i })));
      task = h('div', {},
        h('div', { class: 'muted', text: 'ฟังแล้วแตะเรียงคำ' }),
        btn3d('▶ ฟังประโยค', { tone: 'ghost', onclick: () => sayText(item.en) }),
        h('div', { class: 'chip-row' },
          ...tileSet.filter((x) => !picked.includes(x)).map((x) => h('button', { class: 'word-chip', text: x.w, onclick: () => { picked.push(x); draw(); } })),
          ...picked.map((x) => h('button', { class: 'chip', text: x.w, onclick: () => { picked = picked.filter((v) => v !== x); draw(); } }))),
        btn3d('ตรวจลำดับ', { onclick: () => finishAnswer(picked.length === words.length && picked.every((x, i) => x.i === i)) }));
    } else {
      task = h('div', {}, h('div', { class: 'muted', text: 'ฟังแล้วพิมพ์ตาม' }), btn3d('▶ ฟังประโยค', { tone: 'ghost', onclick: () => sayText(item.en) }), h('input', { class: 'search-input', value: typed, placeholder: 'พิมพ์ประโยคภาษาอังกฤษ', oninput: (e) => { typed = e.target.value; } }), btn3d('ตรวจคำตอบ', { onclick: () => finishAnswer(normalizeEn(typed) === normalizeEn(item.en)) }));
    }
    mount(root, header, h('section', { class: 'card drill-card' }, h('div', { class: 'muted', text: item.th }), task, answered ? h('div', {}, h('div', { class: 'muted', text: 'คำตอบ: ' + item.en }), btn3d(idx + 1 === entries.length ? 'ดูสรุป' : 'ประโยคถัดไป', { block: true, onclick: advance })) : null));
  }
  draw(); return cleanup;
}
