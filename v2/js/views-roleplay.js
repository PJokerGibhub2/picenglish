import { h, mount, icon, btn3d, toast } from './ui2.js';
import { db, loadAll } from './data.js';
import { sayText, alignWords, stopSpeaking, sttSupport } from './speech.js';
import { listenOnce, stopListeningOnce } from './listen-once.js';
import { startRecording, playBlob, abortRecording, stopPlayback } from './recorder.js';
import * as store from './store.js';
import { sfxCorrect, sfxWrong } from './sfx.js';

export async function roleplayView(root, query = new URLSearchParams()) {
  await loadAll();
  const id = query.get('dlg');
  let disposed = false;
  let timers = new Set();
  if (!id) return listing();
  const dlg = db.dialogueById.get(id);
  if (!dlg) { mount(root, h('div', { class: 'empty', text: 'ไม่พบบทสนทนานี้' }), btn3d('กลับรายการ', { onclick: goList })); return () => {}; }
  const saved = store.dialogueProgress(id);
  const s = { idx: saved.completed ? 0 : Math.max(0, Math.min(dlg.lines.length - 1, Number(saved.lineIndex) || 0)), role: 'me', alt: 0, result: null, scores: [], busy: false, rec: null, blob: null, rating: 0, ended: false };
  const supported = sttSupport();
  function goList() { location.hash = '#/roleplay'; }
  function exit() { if (confirm('ออกจากบทสนทนานี้ไหม? ความคืบหน้าจะถูกเก็บไว้')) { store.saveDialogueProgress(id, { lineIndex: s.idx, completed: false, plays: (saved.plays || 0) + 1 }); goList(); } }
  const line = () => dlg.lines[s.idx];
  const learnerLine = () => line().who === s.role;
  const phrase = () => { const l = line(); return learnerLine() && l.alternative?.[s.alt] ? l.alternative[s.alt].en : l.en; };
  const phraseAudioKey = () => learnerLine() && line().alternative?.[s.alt] ? `alt:${id}:${s.idx}:${s.alt}` : `${id}:${s.idx}`;
  async function speak() {
    if (s.busy) return;
    s.busy = true; draw();
    const out = await listenOnce(); s.busy = false;
    if (disposed || out.err === 'aborted') return;
    if (!out.said) { draw(); toast('ยังไม่ได้ยินเสียง ลองพูดอีกครั้งได้เลย'); return; }
    const a = alignWords(phrase(), out.said); s.result = { pct: a.score, alignment: a }; s.scores.push(a.score);
    if (out.blob) s.blob = out.blob;
    (a.percent >= 70 ? sfxCorrect : sfxWrong)(); draw();
  }
  async function recToggle() {
    if (s.rec) { const b = await s.rec.stop(); s.rec = null; s.blob = b; draw(); if (b) await playBlob(b); return; }
    s.rec = await startRecording(); if (!s.rec) toast('เปิดไมโครโฟนไม่ได้ ลองตรวจสิทธิ์ไมโครโฟนนะ'); draw();
  }
  function continueLine() {
    if (s.idx >= dlg.lines.length - 1) { s.ended = true; finish(); return; }
    s.idx++; s.alt = 0; s.result = null; s.blob = null; s.rating = 0;
    store.saveDialogueProgress(id, { lineIndex: s.idx, completed: false, plays: saved.plays || 0 }); draw();
  }
  function finish() {
    const pct = s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 100;
    store.saveDialogueProgress(id, { lineIndex: dlg.lines.length - 1, completed: true, plays: (saved.plays || 0) + 1, bestScore: Math.max(saved.bestScore || 0, pct) });
    store.bumpDialogue?.();
    draw();
  }
  function draw() {
    if (disposed) return;
    if (s.ended) {
      const avg = s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 100;
      mount(root, h('section', { class: 'card rp-summary' }, h('div', { class: 'rp-big', text: 'จบบทสนทนาแล้ว 🎉' }), h('div', { class: 'speak-score', text: `${avg}%` }), h('div', { class: 'muted', text: `ผ่าน ${s.scores.filter((p) => p >= 70).length} จาก ${s.scores.length} บรรทัดที่ฝึก` }),
        h('h3', { text: 'วลีที่น่าใช้' }), ...((Array.isArray(dlg.usefulPhrases) ? dlg.usefulPhrases : dlg.usefulPhrases?.value) || []).map((p) => h('button', { class: 'chip rp-phrase', onclick: () => sayText(typeof p === 'string' ? p : p.en) }, typeof p === 'string' ? p : p.en)),
        btn3d('กลับรายการบทสนทนา', { block: true, icon: 'arrow', onclick: goList }))); return;
    }
    const l = line();
    const practice = learnerLine()
      ? h('section', { class: 'card rp-practice' },
        h('div', { class: 'bold', text: 'ประโยคของฉัน' }),
        l.alternative?.length
          ? h('div', { class: 'rp-alts' },
            h('button', { class: 'chip on', text: phrase() }),
            ...l.alternative.map((a, i) => i === s.alt ? null : h('button', { class: 'chip', text: a.en, onclick: () => { s.alt = i; s.result = null; draw(); } })))
          : h('div', { class: 'rp-en', text: phrase() }),
        h('div', { class: 'rp-actions' },
          btn3d('ฟังก่อนพูด', { tone: 'ghost', icon: 'sound', onclick: () => sayText(phrase(), { audioKey: phraseAudioKey() }) }),
          btn3d('🐢 ฟังช้า ๆ', { tone: 'ghost', onclick: () => sayText(phrase(), { audioKey: phraseAudioKey(), rate: 0.6 }) })),
        !s.result
          ? (supported.ok
            ? btn3d(s.busy ? 'กำลังฟัง…' : 'แตะแล้วพูด', { block: true, size: 'lg', icon: 'mic', onclick: speak })
            : h('div', {},
              h('p', { class: 'muted small', text: supported.note }),
              btn3d(s.rec ? 'หยุดอัดเสียง' : 'อัดเสียง', { block: true, icon: 'mic', onclick: recToggle }),
              s.blob ? h('div', {},
                btn3d('ฟังเสียงของฉัน', { tone: 'sun', onclick: () => playBlob(s.blob) }),
                h('div', { class: 'rating-stars' },
                  ...[1, 2, 3, 4, 5].map((n) => h('button', { class: n <= s.rating ? 'on' : '', text: '★', 'aria-label': `ให้คะแนน ${n} ดาว`, onclick: () => { s.rating = n; draw(); } })),
                  s.rating ? btn3d('บันทึกคะแนน', { onclick: () => { s.result = { pct: s.rating * 20, alignment: { missing: [] } }; s.scores.push(s.result.pct); draw(); } }) : null)) : null))
          : h('div', { class: `speak-result${s.result.pct >= 70 ? ' passed' : ''}` },
            h('div', { class: 'speak-score', text: `${s.result.pct}%` }),
            s.result.alignment?.missed?.length ? h('div', { class: 'chips' }, ...s.result.alignment.missed.map((w) => h('button', { class: 'chip', text: w, onclick: () => sayText(w) }))) : null,
            s.result.pct < 70 ? btn3d('ลองอีกครั้ง', { tone: 'ghost', onclick: () => { s.result = null; draw(); } }) : null,
            btn3d('ต่อไป', { block: true, icon: 'play', onclick: continueLine })))
      : h('div', { class: 'rp-prompt muted', text: 'ฟังประโยคของคู่สนทนา แล้วกด “ต่อไป” เมื่อพร้อม' });
    mount(root,
      h('div', { class: 'rp-top' }, h('button', { class: 'icon-btn', 'aria-label': 'ออกจากบทสนทนา', text: '←', onclick: exit }), h('div', {}, h('strong', { text: dlg.title }), h('small', { class: 'muted', text: ` · ${s.idx + 1}/${dlg.lines.length}` })), h('span', {})),
      h('div', { class: 'rp-setting muted small', text: dlg.setting || dlg.titleEn || '' }),
      ...dlg.lines.slice(0, s.idx + 1).map((it, i) => {
        const mine = it.who === s.role;
        const en = i === s.idx && mine && it.alternative?.[s.alt] ? it.alternative[s.alt].en : it.en;
        const audioKey = i === s.idx && mine && it.alternative?.[s.alt] ? `alt:${id}:${i}:${s.alt}` : `${id}:${i}`;
        return h('div', { class: `rp-bubble${mine ? ' mine' : ''}${i === s.idx ? ' active' : ''}` }, h('div', { class: 'rp-bubble-head' }, h('strong', { text: mine ? 'ฉัน' : (dlg.counterpart?.labelTh || 'คู่สนทนา') }), h('button', { class: 'icon-btn', 'aria-label': 'ฟังประโยค', onclick: () => sayText(en, { audioKey }) }, icon('sound', 18))), h('div', { class: 'rp-en', text: en }), h('div', { class: 'rp-th muted', text: it.thai || '' }));
      }),
      practice,
      h('div', { class: 'rp-bottom' }, btn3d('สลับบท', { tone: 'ghost', onclick: () => { s.role = s.role === 'me' ? 'staff' : 'me'; s.result = null; draw(); } }), !learnerLine() ? btn3d('ต่อไป', { tone: 'brand', onclick: continueLine }) : null,
        h('button', { class: 'practice-skip', text: 'ข้ามบรรทัด', onclick: continueLine })));
  }
  draw();
  return () => { disposed = true; timers.forEach(clearTimeout); stopSpeaking(); stopListeningOnce(); abortRecording(); stopPlayback(); };

  async function listing() {
    const completed = store.completedDialogues();
    const unfinished = db.dialogues.find((d) => !store.dialogueProgress(d.id).completed);
    mount(root, h('header', { class: 'page-head' }, h('div', { class: 'page-title', text: 'บทสนทนา' }), h('div', { class: 'page-sub', text: 'เลือกสถานการณ์แล้วฝึกพูดทีละบรรทัด' })),
      unfinished ? h('button', { class: 'rp-continue card', onclick: () => { location.hash = `#/roleplay?dlg=${encodeURIComponent(unfinished.id)}`; } }, h('span', { text: '▶' }), h('span', {}, h('strong', { text: 'เรียนต่อ' }), h('small', { class: 'muted', text: unfinished.title }))) : null,
      h('div', { class: 'page-sub rp-count', text: `จบแล้ว ${completed}/${db.dialogues.length} บท` }),
      ...db.dialogues.map((d) => {
        const done = store.dialogueProgress(d.id).completed;
        return h('button', { class: 'rp-list-card', onclick: () => { location.hash = `#/roleplay?dlg=${encodeURIComponent(d.id)}`; } }, h('span', { class: 'rp-emoji', text: d.emoji || '💬' }), h('span', { class: 'rp-list-main' }, h('strong', { text: d.title }), h('small', { class: 'muted', text: `${d.titleEn || ''} · ${d.level || ''} · ${d.lines.length} บรรทัด` })), h('span', { class: done ? 'rp-done' : 'muted', text: done ? '✓ จบแล้ว' : '›' }));
      }));
    return () => {};
  }
}
