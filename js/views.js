/**
 * views.js — หน้าจอทั้งหมดของแอป PicEnglish
 * ทุกหน้าคืนค่าเป็นฟังก์ชัน cleanup เพื่อให้ router เรียกตอนออกจากหน้า (หยุดเสียงที่ค้างอยู่)
 */

import { db, wordsOf, categoryOf, shuffle, distractors, getWord } from './data.js';
import * as store from './store.js';
import {
  h, mount, clear, toast, openSheet, closeSheet, sheetHeader, photoBox, starButton,
  fmtInterval, progressBar, emptyState, icon,
} from './ui.js';
import {
  speak, stopSpeaking, sayText, speakSentence, renderSentence, clearHighlight, loadVoices,
  englishVoices, sttSupported, sttSupport, sttErrorReason, sttSelfTest, inAppBrowser, createRecognizer, alignWords,
} from './speech.js';
import { micPanel } from './micfallback.js';
import { sfxTap } from './sfx.js';
import { VERSION, BUILD_DATE } from './version.js';
import { photoFor, preloadPhotos, clearPhotoCache } from './images.js';
import { artFor, artCredits } from './art.js';
import { recordingsUsage, clearRecordings, QUOTA, testMicrophone, micDiagnosticsReport } from './recorder.js';
import { shareToLine, liffState } from './liff.js';

const S = () => store.settings();
const say = (text, opts = {}) => sayText(text, { rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender, ...opts });

/** อ่านประโยคตัวอย่างของคำ พร้อมไฮไลท์คำ (ใช้ไฟล์เสียงที่เตรียมไว้ถ้ามี) */
function speakWordSentence(el, word, opts = {}) {
  return speakSentence(el, word.example, {
    rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender,
    audioKey: 'sent:' + word.id, ...opts,
  });
}

/* ================================================================== *
 * 0) ตัวช่วยกลาง
 * ================================================================== */

function categoryChips(active, onPick, opts = {}) {
  const wrap = h('div', { class: 'row row-wrap', style: { gap: '6px', marginBottom: '12px' } });
  const items = [{ id: null, th: 'ทั้งหมด', emoji: '✨' }, ...db.categories];
  for (const c of items) {
    wrap.appendChild(h('button', {
      class: `pill ${active === c.id ? 'on' : ''}`, type: 'button',
      onclick: () => onPick(c.id),
    }, `${c.emoji} ${c.th}`));
  }
  return wrap;
}

function wordPickerSheet(title, list, onPick) {
  openSheet((close) => {
    const box = h('div', {});
    box.appendChild(sheetHeader(title, `${list.length} คำ`, close));
    const search = h('input', {
      type: 'search', placeholder: 'พิมพ์เพื่อค้นคำ…',
      style: {
        width: '100%', padding: '10px 12px', margin: '6px 0 12px', borderRadius: '12px',
        border: '1px solid var(--border)', background: 'var(--surface-2)',
      },
    });
    const listBox = h('div', {});
    const draw = (q = '') => {
      const qq = q.trim().toLowerCase();
      const filtered = !qq ? list : list.filter((w) =>
        w.word.toLowerCase().includes(qq) || w.thai.includes(qq));
      clear(listBox);
      if (!filtered.length) { listBox.appendChild(emptyState('🔍', 'ไม่พบคำที่ค้นหา', '')); return; }
      for (const w of filtered.slice(0, 120)) {
        listBox.appendChild(h('div', {
          class: 'list-item',
          onclick: () => { close(); onPick(w); },
        },
        h('div', { class: 'thumb', text: w.emoji }),
        h('div', { class: 'lt' }, h('b', { class: 'en', text: w.word }), h('div', { text: w.thai })),
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': 'ออกเสียง',
          onclick: (e) => { e.stopPropagation(); sayWord(w); },
        }, icon('sound', 18))));
      }
    };
    search.addEventListener('input', () => draw(search.value));
    box.appendChild(search);
    box.appendChild(listBox);
    draw('');
    return box;
  });
}

function sayWord(word, opts = {}) {
  return say(word.word, { audioKey: 'word:' + word.id, ...opts });
}

/** ประโยคพร้อมไฮไลท์ + แตะคำใดก็ได้เพื่อฟังคำนั้น */
function sentenceBlock(word, opts = {}) {
  const el = h('div', { class: `sentence ${opts.class || ''}` });
  renderSentence(el, word.example);
  el.addEventListener('click', (e) => {
    const w = e.target.closest('.w');
    if (w) say(w.textContent, { rate: Math.min(1, S().rate) });
  });
  return el;
}

function keyVocabBlock(word) {
  const wrap = h('div', { class: 'keyvocab' });
  for (const kv of (word.keyVocab || [])) {
    wrap.appendChild(h('button', {
      class: 'kv', type: 'button', title: 'แตะเพื่อฟัง',
      onclick: () => { say(kv.en, { rate: Math.min(1, S().rate) }); toast(kv.thai); },
    }, h('b', { text: kv.en }), h('span', { text: kv.thai })));
  }
  return wrap;
}

function flashActions(word, onSpeakWord, onSpeakSentence) {
  return h('div', { class: 'row row-wrap', style: { gap: '8px' } },
    h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: (e) => { e.stopPropagation(); onSpeakWord(); },
    }, icon('sound', 16), 'ออกเสียงคำ'),
    h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: (e) => { e.stopPropagation(); onSpeakSentence(); },
    }, icon('sound', 16), 'อ่านประโยค'),
    starButton(word));
}

/* ================================================================== *
 * 1) การ์ดคำศัพท์ (แฟลชการ์ด)
 * ================================================================== */

export function learn(root, params = {}) {
  let catId = params.cat || null;
  let queue = [];
  let idx = 0;
  let flipped = false;
  let session = { again: 0, good: 0, easy: 0 };
  let current = null;

  function destroy() { stopSpeaking(); }
  const go = (fn) => { destroy(); fn(); };
  let forceRecordMode = false;   // ตัวรู้จำเสียงล้มเหลว → ใช้โหมดอัดเสียงแทน
  let lastSttError = '';

  function picker() {
    mount(root);
    const totalLearned = store.learnedCount();
    root.appendChild(h('div', { class: 'card', style: { background: 'linear-gradient(140deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #ec4899))', color: '#fff', border: '0' } },
      h('div', { class: 'row' },
        h('div', { style: { flex: '1' } },
          h('div', { class: 'bold', style: { fontSize: '1.05rem' }, text: 'เรียนคำศัพท์ด้วยภาพ' }),
          h('div', { class: 'small', style: { opacity: '.9' }, text: `${db.words.length} คำ · 8 หมวด · มีเสียงอ่านและประโยคใช้งาน` })),
        h('div', { style: { fontSize: '2rem' }, text: '📸' }))));

    root.appendChild(h('div', { class: 'section-title', text: 'เลือกหมวด' }));
    const grid = h('div', { class: 'cat-grid' });
    for (const c of db.categories) {
      const words = wordsOf(c.id);
      const learned = words.filter((w) => store.srsOf(w.id).reps > 0).length;
      grid.appendChild(h('button', {
        class: 'cat-card', type: 'button', style: { '--cat': c.color },
        onclick: () => go(() => { catId = c.id; startSession(); }),
      },
      h('div', { class: 'emoji', text: c.emoji }),
      h('div', { class: 'cth', text: c.th }),
      h('div', { class: 'cen', text: c.en }),
      h('div', { class: 'cmeta', text: `เรียนแล้ว ${learned}/${words.length}` })));
    }
    root.appendChild(grid);

    root.appendChild(h('button', {
      class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '14px' },
      onclick: () => go(() => { catId = null; startSession(); }),
    }, '🎲 เรียนรวมทุกหมวด (สุ่ม)'));
    root.appendChild(h('div', { class: 'section-title', text: 'ฟังและทำความเข้าใจ' }));
    root.appendChild(h('a', { href: '#/listen', class: 'list-item' },
      h('div', { class: 'thumb', style: { fontSize: '1.5rem' }, text: '🎧' }),
      h('div', { class: 'lt' },
        h('b', { style: { fontFamily: 'var(--font)' }, text: 'ฟังประโยค + ไฮไลท์คำ' }),
        h('div', { text: 'อ่านตามพร้อมไฮไลท์ แตะคำใดก็ได้เพื่อฟัง' })),
      h('span', { class: 'pill', text: 'ฟัง' })));

    root.appendChild(h('div', { class: 'small muted center', style: { marginTop: '10px' }, text: `เรียนไปแล้วทั้งหมด ${totalLearned} คำ` }));
  }

  function startSession() {
    const pool = wordsOf(catId);
    queue = shuffle(pool).slice(0, Math.min(S().perRound, pool.length));
    idx = 0; flipped = false;
    session = { again: 0, good: 0, easy: 0 };
    sessionView();
  }

  function sessionView() {
    mount(root);
    if (idx >= queue.length) return summary();
    current = queue[idx];

    const cat = categoryOf(current.category);
    root.appendChild(h('div', { class: 'row', style: { marginBottom: '10px' } },
      h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => go(picker),
      }, '← หมวด'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'small muted', text: `${idx + 1} / ${queue.length}` })));
    root.appendChild(progressBar(idx, queue.length));

    const sentEl = sentenceBlock(current);
    const card = h('div', { class: 'flash-card', style: { marginTop: '12px' } });
    const front = h('div', { class: 'flash-face flash-front' },
      photoBox(current, { color: cat.color, showPhotos: S().showPhotos, allowCycle: true }),
      h('div', { class: 'word-block' },
        h('div', { class: 'word-en en', text: current.word }),
        h('div', { class: 'word-ipa mono-ipa', text: current.ipa }),
        S().showThai ? h('div', { class: 'word-th' }, current.thai, h('span', { class: 'pos-tag', text: current.pos })) : null),
      h('div', { class: 'flash-actions' },
        flashActions(current, () => sayWord(current), () => speakWordSentence(sentEl, current))));

    const back = h('div', { class: 'flash-face flash-back' },
      h('div', { class: 'word-block', style: { paddingBottom: '2px' } },
        h('div', { style: { fontSize: '2.2rem', lineHeight: '1.1' }, text: current.emoji }),
        h('div', { class: 'word-en en', style: { fontSize: '1.5rem', marginTop: '4px' }, text: current.word }),
        h('div', { class: 'word-th' }, current.thai, h('span', { class: 'pos-tag', text: current.pos }))),
      h('div', { style: { padding: '0 16px 16px' } },
        h('div', { class: 'tiny muted', style: { margin: '6px 0' }, text: 'แตะคำใดก็ได้ในประโยคเพื่อฟังคำนั้น' }),
        sentEl,
        h('div', { class: 'sentence-th', style: { marginTop: '4px' }, text: current.exampleThai }),
        h('div', { class: 'tiny muted', style: { margin: '12px 0 6px' }, text: 'คำศัพท์สำคัญในประโยค' }),
        keyVocabBlock(current),
        current.tip ? h('div', { class: 'small', style: { marginTop: '12px', padding: '10px', borderRadius: '12px', background: 'var(--surface-2)' }, text: '💡 ' + current.tip }) : null));

    card.appendChild(front);
    card.appendChild(back);
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      flipped = !flipped;
      card.classList.toggle('flipped', flipped);
      advanceBox.classList.toggle('hidden', !flipped);
      hint.classList.toggle('hidden', flipped);
    });
    root.appendChild(card);

    const advanceBox = h('div', { class: 'advance-grid hidden', style: { marginTop: '12px' } },
      h('button', { class: 'btn btn-danger', type: 'button', onclick: () => rate(0) }, '😵 อีกครั้ง'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => rate(2) }, '🙂 จำได้'),
      h('button', { class: 'btn btn-success', type: 'button', onclick: () => rate(3) }, '😎 ง่ายมาก'));
    root.appendChild(advanceBox);

    const hint = h('div', { class: 'row', style: { marginTop: '10px', gap: '8px' } },
      h('button', {
        class: 'btn btn-primary btn-block', type: 'button',
        onclick: () => { flipped = true; card.classList.add('flipped'); advanceBox.classList.remove('hidden'); hint.classList.add('hidden'); },
      }, 'ดูความหมาย & ประโยค'));
    root.appendChild(hint);

    store.markSeen(current.id);
    return () => {};
  }

  function rate(g) {
    store.grade(current.id, g);
    if (g === 0) session.again++;
    else if (g === 2) session.good++;
    else session.easy++;
    idx++;
    flipped = false;
    go(sessionView);
  }

  function summary() {
    mount(root);
    const known = session.good + session.easy;
    root.appendChild(h('div', { class: 'card center' },
      h('div', { style: { fontSize: '3rem' }, text: known >= queue.length * 0.7 ? '🎉' : '💪' }),
      h('div', { class: 'bold', style: { fontSize: '1.15rem' }, text: 'จบรอบนี้แล้ว!' }),
      h('div', { class: 'small muted', text: `เรียน ${queue.length} คำ` })));
    root.appendChild(h('div', { class: 'stat-grid', style: { marginTop: '12px' } },
      h('div', { class: 'stat' }, h('b', { text: String(session.easy) }), h('span', { text: 'ง่ายมาก' })),
      h('div', { class: 'stat' }, h('b', { text: String(session.good) }), h('span', { text: 'จำได้' })),
      h('div', { class: 'stat' }, h('b', { text: String(session.again) }), h('span', { text: 'ต้องทวน' }))));
    root.appendChild(h('div', { class: 'row', style: { marginTop: '14px', gap: '10px' } },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => go(startSession) }, 'เรียนชุดใหม่'),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => go(picker) }, 'เลือกหมวด')));
    return () => {};
  }

  picker();
  return destroy;
}

/* ================================================================== *
 * 2) ฟังประโยค + ไฮไลท์คำ + สรุปคำศัพท์สำคัญ
 * ================================================================== */

export function listen(root) {
  let catId = null;
  let list = [];
  let idx = 0;
  let autoNext = false;
  let playing = false;
  let sentEl = null;

  function destroy() { stopSpeaking(); autoNext = false; playing = false; }
  const go = (fn) => { destroy(); fn(); };
  let forceRecordMode = false;   // ตัวรู้จำเสียงล้มเหลว → ใช้โหมดอัดเสียงแทน
  let lastSttError = '';

  function rebuildList() {
    list = shuffle(wordsOf(catId));
    idx = 0;
  }

  function render() {
    mount(root);
    const w = list[idx];

    root.appendChild(categoryChips(catId, (id) => go(() => {
      catId = id; rebuildList(); render();
    })));

    if (!w) { root.appendChild(emptyState('📭', 'ไม่พบคำศัพท์', '')); return; }

    const cat = categoryOf(w.category);
    const card = h('div', { class: 'card' });
    card.appendChild(h('div', { class: 'row' },
      h('div', { style: { flex: '1' } },
        h('div', { class: 'word-en en', text: w.word }),
        h('div', { class: 'word-ipa mono-ipa', text: w.ipa }),
        h('div', { class: 'word-th', text: w.thai })),
      h('div', { class: 'pill emoji', style: { fontSize: '1.6rem' }, text: w.emoji })));
    card.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '8px' }, text: `${cat.emoji} ${cat.th} · แตะคำในประโยคเพื่อฟังคำนั้น` }));

    sentEl = sentenceBlock(w, { class: 'en' });
    sentEl.style.marginTop = '8px';
    card.appendChild(sentEl);
    card.appendChild(h('div', {
      class: 'sentence-th', id: 'th-line', style: { marginTop: '6px' },
      text: w.exampleThai,
    }));

    const playBtn = h('button', { class: 'btn btn-primary', type: 'button' },
      icon('play', 18), 'ฟังประโยค');
    const slowBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, '🐢 ช้าๆ');
    const againBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, icon('refresh', 18), 'อีกครั้ง');

    const play = async (rate) => {
      playing = true;
      updatePlayIcon();
      await speakWordSentence(sentEl, w, { rate: rate ?? S().rate });
      playing = false;
      updatePlayIcon();
      if (autoNext) setTimeout(() => { if (autoNext) next(); }, 500);
    };
    const updatePlayIcon = () => {
      clear(playBtn);
      playBtn.appendChild(icon(playing ? 'pause' : 'play', 18));
      playBtn.appendChild(document.createTextNode(playing ? ' กำลังอ่าน…' : ' ฟังประโยค'));
    };

    playBtn.onclick = () => {
      if (playing) { stopSpeaking(); playing = false; updatePlayIcon(); }
      else play();
    };
    slowBtn.onclick = () => { stopSpeaking(); play(Math.max(0.55, S().rate - 0.3)); };
    againBtn.onclick = () => { stopSpeaking(); play(); };

    card.appendChild(h('div', { class: 'row row-wrap', style: { gap: '8px', marginTop: '12px' } },
      playBtn, slowBtn, againBtn, starButton(w)));

    const autoSwitch = h('label', { class: 'row', style: { gap: '8px' } },
      h('span', { class: 'small muted', text: 'อ่านต่ออัตโนมัติ' }),
      h('span', { class: 'switch' },
        h('input', {
          type: 'checkbox', checked: autoNext,
          onchange: (e) => { autoNext = e.target.checked; if (autoNext && !playing) play(); },
        }),
        h('i')));
    card.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, autoSwitch));

    root.appendChild(card);

    root.appendChild(h('div', { class: 'section-title', text: 'คำศัพท์สำคัญในประโยค' }));
    const kvCard = h('div', { class: 'card' });
    kvCard.appendChild(keyVocabBlock(w));
    if (w.tip) kvCard.appendChild(h('div', { class: 'small', style: { marginTop: '10px' }, text: '💡 ' + w.tip }));
    root.appendChild(kvCard);

    root.appendChild(h('div', { class: 'row', style: { marginTop: '14px', gap: '10px' } },
      h('button', {
        class: 'btn btn-ghost btn-block', type: 'button',
        onclick: () => go(() => { idx = (idx - 1 + list.length) % list.length; render(); }),
      }, '← ก่อนหน้า'),
      h('button', {
        class: 'btn btn-primary btn-block', type: 'button',
        onclick: () => go(next),
      }, 'ถัดไป →')));
    root.appendChild(h('button', {
      class: 'btn btn-ghost btn-block', type: 'button', style: { marginTop: '10px' },
      onclick: () => wordPickerSheet('เลือกคำที่อยากฟัง', db.words, (picked) => go(() => {
        const i = list.findIndex((x) => x.id === picked.id);
        if (i >= 0) idx = i;
        else { catId = null; list = [picked, ...shuffle(db.words.filter((x) => x.id !== picked.id))]; idx = 0; }
        render();
      })),
    }, '🔎 เลือกคำเอง'));

    root.appendChild(h('div', { class: 'tiny muted center', style: { marginTop: '12px' }, text: `คำที่ ${idx + 1} จาก ${list.length}` }));

    if (S().autoPlay) play();
  }

  function next() {
    idx = (idx + 1) % list.length;
    render();
  }

  rebuildList();
  render();
  return destroy;
}

/* ================================================================== *
 * 3) ศูนย์รวมเกม
 * ================================================================== */

const GAMES_KEY = 'picenglish.games.v1';
function gameScores() {
  try { return JSON.parse(localStorage.getItem(GAMES_KEY) || '{}'); } catch (e) { return {}; }
}
function saveGameScore(name, value, better = 'high') {
  const s = gameScores();
  const cur = s[name];
  if (cur === undefined || (better === 'high' ? value > cur : value < cur)) {
    s[name] = value;
    try { localStorage.setItem(GAMES_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
}

export function games(root) {
  mount(root);
  const s = gameScores();
  root.appendChild(h('div', { class: 'section-title', text: 'เล่นเพื่อจำให้แม่นขึ้น' }));
  const items = [
    { emoji: '🧩', title: 'จับคู่ภาพ-คำ', desc: 'แตะภาพแล้วแตะคำให้ตรงกัน ฝึกความจำภาพ', href: '#/match', best: s.matchBest ? `เร็วสุด ${s.matchBest} วิ` : null },
    { emoji: '❓', title: 'ควิซปรนัย', desc: '10 ข้อ วัดความเข้าใจคำศัพท์และประโยค', href: '#/quiz', best: s.quizBest !== undefined ? `สูงสุด ${s.quizBest}/10` : null },
    { emoji: '🎤', title: 'ฝึกออกเสียง', desc: 'พูดตามแล้วให้คะแนนทีละคำ', href: '#/speak', best: s.speakBest ? `สูงสุด ${s.speakBest}%` : null },
  ];
  for (const it of items) {
    root.appendChild(h('a', { href: it.href, class: 'list-item', style: { padding: '14px' } },
      h('div', { class: 'thumb', style: { fontSize: '1.9rem' }, text: it.emoji }),
      h('div', { class: 'lt' },
        h('b', { style: { fontFamily: 'var(--font)', fontSize: '1rem' }, text: it.title }),
        h('div', { text: it.desc })),
      it.best ? h('span', { class: 'pill', text: it.best }) : null));
  }
  root.appendChild(h('div', { class: 'small muted center', style: { marginTop: '18px' }, text: 'ทุกเกมป้อนผลเข้าระบบทบทวน SRS อัตโนมัติ' }));
  return () => {};
}

/* ================================================================== *
 * 4) ควิซปรนัย
 * ================================================================== */

function clozeSentence(word) {
  const parts = word.example.split(/(\s+)/);
  const target = word.word.toLowerCase();
  const stem = target.length > 4 ? target.slice(0, Math.max(3, target.length - 2)) : target;
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (!/^[A-Za-z]/.test(t)) continue;
    const clean = t.toLowerCase().replace(/[^a-z']/g, '');
    if (clean === target || clean.startsWith(stem)) {
      parts[i] = '_____' + t.replace(/[A-Za-z'’-]/g, '');
      return parts.join('');
    }
  }
  return null;
}

export function quiz(root) {
  const TOTAL = 10;
  let questions = [];
  let qi = 0;
  let score = 0;
  let answered = false;
  let wrongList = [];
  let catId = null;

  function destroy() { stopSpeaking(); }
  const go = (fn) => { destroy(); fn(); };
  let forceRecordMode = false;   // ตัวรู้จำเสียงล้มเหลว → ใช้โหมดอัดเสียงแทน
  let lastSttError = '';

  function build() {
    const pool = shuffle(wordsOf(catId));
    const picked = pool.slice(0, Math.min(TOTAL, pool.length));
    questions = picked.map((w, i) => {
      const kind = ['photo2word', 'word2thai', 'thai2word', 'cloze'][i % 4];
      return { word: w, kind };
    });
    qi = 0; score = 0; wrongList = [];
  }

  function start() {
    mount(root);
    root.appendChild(h('div', { class: 'section-title', text: 'เลือกขอบเขตคำศัพท์' }));
    root.appendChild(categoryChips(catId, (id) => { catId = id; start(); }));
    const pool = wordsOf(catId);
    root.appendChild(h('div', { class: 'card' },
      h('div', { class: 'bold', text: `พร้อมทำ ${Math.min(TOTAL, pool.length)} ข้อ` }),
      h('div', { class: 'small muted', text: 'คำถามจะสลับ 4 รูปแบบ: ดูภาพเลือกคำ / ดูคำเลือกความหมาย / ดูความหมายเลือกคำ / เติมคำในประโยค' })));
    root.appendChild(h('button', {
      class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '12px' },
      onclick: () => go(() => { build(); question(); }),
    }, 'เริ่มควิซ'));
    return () => {};
  }

  function question() {
    mount(root);
    if (qi >= questions.length) return finish();
    answered = false;
    const q = questions[qi];
    const w = q.word;

    root.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => go(start) }, '← ออก'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'small muted', text: `ข้อ ${qi + 1}/${questions.length}` }),
      h('span', { class: 'pill on', text: `คะแนน ${score}` })));
    root.appendChild(progressBar(qi, questions.length));

    const body = h('div', { class: 'card', style: { marginTop: '12px' } });
    let options = [];
    let prompt;

    if (q.kind === 'photo2word') {
      body.appendChild(photoBox(w, { color: categoryOf(w.category).color, showPhotos: S().showPhotos, showCredit: false }));
      prompt = 'ภาพนี้คือคำใด';
      options = [w, ...distractors(w, 3)].map((x) => ({ id: x.id, label: x.word, en: true }));
    } else if (q.kind === 'word2thai') {
      prompt = 'คำนี้แปลว่าอะไร';
      body.appendChild(h('div', { class: 'center', style: { padding: '10px 0' } },
        h('div', { class: 'word-en en', text: w.word }),
        h('div', { class: 'word-ipa mono-ipa', text: w.ipa }),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: { marginTop: '8px' }, onclick: () => sayWord(w) }, icon('sound', 16), 'ฟังเสียง')));
      options = [w, ...distractors(w, 3)].map((x) => ({ id: x.id, label: x.thai, en: false }));
    } else if (q.kind === 'thai2word') {
      prompt = 'คำภาษาอังกฤษของคำนี้คือ';
      body.appendChild(h('div', { class: 'center', style: { padding: '10px 0' } },
        h('div', { class: 'word-th', style: { fontSize: '1.5rem' }, text: w.thai }),
        h('div', { class: 'tiny muted', text: w.pos })));
      options = [w, ...distractors(w, 3)].map((x) => ({ id: x.id, label: x.word, en: true }));
    } else {
      const cz = clozeSentence(w);
      prompt = 'เติมคำในช่องว่าง';
      body.appendChild(h('div', { class: 'sentence', style: { padding: '6px 0' }, text: cz ? cz.text : w.example.replace(new RegExp(w.word, 'i'), '_____') }));
      body.appendChild(h('div', { class: 'sentence-th', text: w.exampleThai }));
      options = [w, ...distractors(w, 3)].map((x) => ({ id: x.id, label: x.word, en: true }));
    }

    body.insertBefore(h('div', { class: 'bold center', style: { marginBottom: '8px' }, text: prompt }), body.firstChild);
    root.appendChild(body);

    const opts = h('div', { class: 'stack', style: { marginTop: '12px' } });
    const keys = ['A', 'B', 'C', 'D'];
    shuffle(options).forEach((opt, i) => {
      const btn = h('button', { class: 'opt', type: 'button' },
        h('span', { class: 'k', text: keys[i] }),
        h('span', { class: opt.en ? 'en' : '', style: { fontWeight: '700' }, text: opt.label }));
      btn.onclick = () => choose(opt, btn, opts, w);
      opts.appendChild(btn);
    });
    root.appendChild(opts);

    if (S().autoPlay && q.kind === 'word2thai') sayWord(w);
    return () => {};
  }

  function choose(opt, btn, opts, w) {
    if (answered) return;
    answered = true;
    const ok = opt.id === w.id;
    btn.classList.add(ok ? 'correct' : 'wrong');
    [...opts.children].forEach((b) => { b.disabled = true; });
    if (!ok) {
      const correctBtn = [...opts.children].find((b) => b.textContent.includes(w.word) || b.textContent.includes(w.thai));
      if (correctBtn) correctBtn.classList.add('correct');
      wrongList.push(w);
    } else {
      score++;
    }
    store.grade(w.id, ok ? 2 : 0);
    sayWord(w);
    setTimeout(() => { qi++; go(question); }, ok ? 900 : 1700);
  }

  function finish() {
    mount(root);
    saveGameScore('quizBest', score, 'high');
    root.appendChild(h('div', { class: 'card center' },
      h('div', { style: { fontSize: '3rem' }, text: score >= 8 ? '🏆' : score >= 5 ? '👍' : '📚' }),
      h('div', { class: 'bold', style: { fontSize: '1.3rem' }, text: `${score} / ${questions.length}` }),
      h('div', { class: 'small muted', text: score >= 8 ? 'เยี่ยมมาก!' : 'ลองทบทวนคำที่พลาดแล้วเล่นอีกครั้ง' })));
    if (wrongList.length) {
      root.appendChild(h('div', { class: 'section-title', text: 'คำที่ตอบผิด — ควรทบทวน' }));
      for (const w of wrongList) {
        root.appendChild(h('div', { class: 'list-item' },
          h('div', { class: 'thumb', text: w.emoji }),
          h('div', { class: 'lt' }, h('b', { class: 'en', text: w.word }), h('div', { text: w.thai })),
          h('button', { class: 'icon-btn', type: 'button', onclick: () => sayWord(w) }, icon('sound', 18)),
          starButton(w)));
      }
    }
    root.appendChild(h('div', { class: 'row', style: { marginTop: '14px', gap: '10px' } },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => go(() => { build(); question(); }) }, 'เล่นอีกครั้ง'),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => go(start) }, 'เปลี่ยนหมวด')));
    return () => {};
  }

  return start();
}

/* ================================================================== *
 * 5) เกมจับคู่ภาพ-คำ
 * ================================================================== */

export function match(root) {
  const PAIRS = 5;
  let tiles = [];
  let first = null;
  let lock = false;
  let moves = 0;
  let matched = 0;
  let startTime = 0;
  let timerId = null;
  let catId = null;

  function destroy() { stopSpeaking(); clearInterval(timerId); }
  const go = (fn) => { destroy(); fn(); };
  let forceRecordMode = false;   // ตัวรู้จำเสียงล้มเหลว → ใช้โหมดอัดเสียงแทน
  let lastSttError = '';

  function setup() {
    mount(root);
    root.appendChild(h('div', { class: 'section-title', text: 'เลือกหมวดสำหรับเกม' }));
    root.appendChild(categoryChips(catId, (id) => { catId = id; setup(); }));
    root.appendChild(h('div', { class: 'card' },
      h('div', { class: 'bold', text: `จับคู่ ${PAIRS} คู่` }),
      h('div', { class: 'small muted', text: 'แตะภาพ แล้วแตะคำที่ตรงกัน ใช้เวลาน้อยที่สุดเพื่อทำสถิติ' })));
    root.appendChild(h('button', {
      class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '12px' },
      onclick: () => go(play),
    }, 'เริ่มเกม'));
    return () => {};
  }

  function play() {
    mount(root);
    const pool = wordsOf(catId);
    if (pool.length < PAIRS) { root.appendChild(emptyState('😅', 'คำในหมวดนี้ไม่พอ', '')); return () => {}; }
    const picked = shuffle(pool).slice(0, PAIRS);
    tiles = [];
    for (const w of picked) {
      tiles.push({ type: 'pic', word: w, done: false });
      tiles.push({ type: 'word', word: w, done: false });
    }
    tiles = shuffle(tiles);
    first = null; lock = false; moves = 0; matched = 0;
    startTime = Date.now();

    const header = h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => go(setup) }, '← ออก'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'pill', id: 'mv', text: 'จำนวนครั้ง 0' }),
      h('span', { class: 'pill on', id: 'tm', text: '0 วิ' }));
    root.appendChild(header);

    const grid = h('div', { class: 'match-grid' });
    root.appendChild(grid);

    const timeEl = header.querySelector('#tm');
    const moveEl = header.querySelector('#mv');
    timerId = setInterval(() => {
      timeEl.textContent = Math.floor((Date.now() - startTime) / 1000) + ' วิ';
    }, 250);

    for (const t of tiles) {
      const el = h('button', {
        class: `mtile ${t.type === 'pic' ? 'pic' : ''}`, type: 'button',
      }, t.type === 'pic'
        ? h('div', { class: 'ph', text: t.word.emoji })
        : h('div', { class: 'txt en', text: t.word.word }));
      t.el = el;
      el.onclick = () => pick(t);
      grid.appendChild(el);

      const imgMode = S().imageMode || 'art';
      if (t.type === 'pic' && imgMode === 'art' && artFor(t.word.id)) {
        const artEl = h('img', {
          class: 'mtile-art', src: artFor(t.word.id).url, alt: t.word.word, loading: 'lazy',
          onload: () => { const ph = el.querySelector('.ph'); if (ph) ph.remove(); },
        });
        el.insertBefore(artEl, el.firstChild);
      } else if (t.type === 'pic' && imgMode === 'photo') {
        // ใส่ภาพจริงทับอีโมจิเมื่อโหลดเสร็จ (ถ้าออฟไลน์จะเห็นอีโมจิแทน)
        photoFor(t.word).then((p) => {
          if (!p || t.done) return;
          const img = h('img', {
            src: p.url, alt: t.word.word, loading: 'lazy',
            onload: () => { const ph = el.querySelector('.ph'); if (ph) ph.remove(); },
          });
          el.insertBefore(img, el.firstChild);
        }).catch(() => {});
      }
    }
  }

  function pick(t) {
    if (lock || t.done) return;
    if (!first) {
      first = t;
      t.el.classList.add('sel');
      if (t.type === 'word') say(t.word.word);
      return;
    }
    if (first === t) { t.el.classList.remove('sel'); first = null; return; }
    if (first.type === t.type) { // เลือกชนิดเดียวกัน เปลี่ยนใจ
      first.el.classList.remove('sel');
      first = t;
      t.el.classList.add('sel');
      if (t.type === 'word') say(t.word.word);
      return;
    }

    moves++;
    const mv = document.querySelector('#mv');
    if (mv) mv.textContent = 'จำนวนครั้ง ' + moves;

    if (first.word.id === t.word.id) {
      first.done = true; t.done = true;
      first.el.classList.add('done'); t.el.classList.add('done');
      first.el.classList.remove('sel');
      say(t.word.word);
      first = null;
      matched++;
      if (matched === PAIRS) finish();
    } else {
      lock = true;
      first.el.classList.add('shake'); t.el.classList.add('shake');
      const a = first;
      setTimeout(() => {
        a.el.classList.remove('shake', 'sel');
        t.el.classList.remove('shake');
        first = null;
        lock = false;
      }, 480);
    }
  }

  function finish() {
    clearInterval(timerId);
    const secs = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    saveGameScore('matchBest', secs, 'low');
    const best = gameScores().matchBest;
    setTimeout(() => {
      go(() => {
        mount(root);
        root.appendChild(h('div', { class: 'card center' },
          h('div', { style: { fontSize: '3rem' }, text: '🧩' }),
          h('div', { class: 'bold', style: { fontSize: '1.2rem' }, text: `จบใน ${secs} วินาที` }),
          h('div', { class: 'small muted', text: `ใช้ ${moves} ครั้ง · สถิติที่ดีที่สุด ${best} วินาที` })));
        root.appendChild(h('div', { class: 'row', style: { marginTop: '14px', gap: '10px' } },
          h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => go(play) }, 'เล่นอีกครั้ง'),
          h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => go(setup) }, 'เปลี่ยนหมวด')));
      });
    }, 420);
  }

  return setup();
}

/* ================================================================== *
 * 6) ฝึกออกเสียง
 * ================================================================== */

export function speakView(root) {
  let mode = 'sentence';     // sentence | word
  let current = db.words[0];
  let rec = null;
  let recording = false;
  let sentEl = null;
  let resultBox = null;

  function destroy() {
    stopSpeaking();
    try { if (rec && recording) rec.stop(); } catch (e) { /* ignore */ }
    recording = false;
  }
  const go = (fn) => { destroy(); fn(); };
  let forceRecordMode = false;   // ตัวรู้จำเสียงล้มเหลว → ใช้โหมดอัดเสียงแทน
  let lastSttError = '';

  function render() {
    mount(root);

    root.appendChild(h('div', { class: 'row row-wrap', style: { gap: '8px', marginBottom: '12px' } },
      h('button', { class: `pill ${mode === 'sentence' ? 'on' : ''}`, type: 'button', onclick: () => go(() => { mode = 'sentence'; render(); }) }, '📝 ฝึกทั้งประโยค'),
      h('button', { class: `pill ${mode === 'word' ? 'on' : ''}`, type: 'button', onclick: () => go(() => { mode = 'word'; render(); }) }, '🔤 ฝึกคำเดียว')));

    const target = mode === 'word' ? current.word : current.example;
    const card = h('div', { class: 'card' });
    card.appendChild(h('div', { class: 'row' },
      h('div', { style: { flex: '1' } },
        h('div', { class: 'word-en en', style: { fontSize: mode === 'word' ? '1.9rem' : '1.1rem' }, text: current.word }),
        h('div', { class: 'small muted', text: current.thai })),
      starButton(current)));

    sentEl = h('div', { class: 'sentence', style: { marginTop: '10px' } });
    renderSentence(sentEl, target);
    sentEl.addEventListener('click', (e) => {
      const w = e.target.closest('.w');
      if (w) say(w.textContent, { rate: Math.min(1, S().rate) });
    });
    card.appendChild(sentEl);
    if (mode === 'sentence') card.appendChild(h('div', { class: 'sentence-th', text: current.exampleThai }));

    card.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '12px' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => say(target, { rate: S().rate }) }, icon('sound', 16), 'ฟังเสียงต้นแบบ'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => say(target, { rate: Math.max(0.55, S().rate - 0.3) }) }, '🐢 ช้าๆ'),
      h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => wordPickerSheet('เลือกคำที่จะฝึก', db.words, (w) => go(() => { current = w; render(); })),
      }, '🔎 เปลี่ยนคำ')));
    root.appendChild(card);

    const transcript = h('div', { class: 'transcript', style: { marginTop: '12px' }, text: '…' });
    resultBox = h('div', { style: { marginTop: '12px' } });
    const result = resultBox;
    const mic = h('button', {
      class: 'mic-btn', type: 'button', 'aria-label': 'เริ่มอัดเสียง',
      disabled: !sttSupported(),
    }, '🎤');

    const status = h('div', { class: 'small muted center', style: { marginTop: '8px' }, text: sttSupported() ? 'กดไมค์แล้วพูดตามประโยคด้านบน' : 'เบราว์เซอร์ไม่รองรับ' });
    // ทางออกเสมอ: สลับไปโหมดอัดเสียงเทียบเสียงได้ทุกเมื่อ
    if (sttSupported() && !forceRecordMode) {
      root.appendChild(h('div', { class: 'center', style: { marginTop: '8px' } },
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: () => { forceRecordMode = true; lastSttError = ''; render(); },
        }, '🎙️ ใช้โหมดอัดเสียงเทียบเสียง')));
      if (inAppBrowser()) {
        root.appendChild(h('div', { class: 'tiny center', style: { color: 'var(--warn)', marginTop: '8px' },
          text: 'ตรวจพบว่าเปิดในแอป ' + inAppBrowser() + ' — ไมค์มักถูกบล็อก แนะนำเปิดใน Chrome/Safari' }));
      }
    }
    // ไม่มี SpeechRecognition (iPhone/iPad/Safari) → อัดเสียง + ฟังเทียบ + ประเมินตัวเอง
    if (forceRecordMode || !sttSupported()) {
      mic.classList.add('hidden');
      transcript.classList.add('hidden');
      status.classList.add('hidden');
      const wds = mode === 'word'
        ? [current.word]
        : target.split(/\s+/).map((w) => w.replace(/[^A-Za-z']/g, '')).filter((w) => w.length > 3).slice(0, 6);
      root.appendChild(micPanel({
        banner: '⚠️ ' + (lastSttError || sttSupport().note),
        audioText: target,
        speak: () => say(target, { rate: S().rate }),
        flagWords: wds,
        nextLabel: mode === 'word' ? 'คำถัดไป →' : 'ประโยคถัดไป →',
        onNext: () => go(() => render()),
      }));
      return;
    }

    mic.onclick = () => {
      try { sfxTap(); } catch (e) { /* ignore */ }
      if (recording) { try { rec.stop(); } catch (e) { /* ignore */ } return; }
      stopSpeaking();
      clear(result);
      lastWords = [];
      clearHighlight(sentEl);
      transcript.textContent = '…';
      rec = createRecognizer({
        lang: 'en-US',
        interim: true,
        onResult: ({ final, interim, done }) => {
          transcript.textContent = (final || interim || '…');
          if (done && (final || interim)) evaluate(final || interim);
        },
        onError: (err) => {
          recording = false;
          mic.classList.remove('rec');
          status.textContent = sttErrorReason(err);
          const hard = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network'];
          if (hard.includes(err)) {
            lastSttError = sttErrorReason(err);
            forceRecordMode = true;
            toast('สลับเป็นโหมดอัดเสียงเทียบเสียงให้แล้ว', 'ok');
            render();
          }
        },
        onEnd: () => {
          recording = false;
          mic.classList.remove('rec');
        },
      });
      if (!rec) { toast('เบราว์เซอร์นี้ไม่รองรับการฟังเสียง', 'err'); return; }
      try {
        rec.start();
        recording = true;
        mic.classList.add('rec');
        status.textContent = 'กำลังฟัง… พูดได้เลย';
      } catch (err) {
        recording = false;
        mic.classList.remove('rec');
        toast('เริ่มไมค์ไม่สำเร็จ', 'err');
      }
    };

    root.appendChild(h('div', { style: { marginTop: '16px' } }, mic));
    root.appendChild(status);
    root.appendChild(transcript);
    root.appendChild(result);
    return () => {};
  }

  function evaluate(said) {
    const target = mode === 'word' ? current.word : current.example;
    const { marks, score } = alignWords(target, said);
    // ระบายสีคำในประโยคเป้าหมายตามผล
    const spans = [...sentEl.querySelectorAll('.w')];
    spans.forEach((s, i) => {
      s.classList.remove('ok', 'bad');
      if (i < marks.length) s.classList.add(marks[i] ? 'ok' : 'bad');
    });

    const box = h('div', { class: 'card' });
    const msg = score >= 90 ? 'ยอดเยี่ยม! 🎉' : score >= 70 ? 'ดีมาก 👏' : score >= 40 ? 'พอใช้ ลองอีกครั้ง 💪' : 'ลองฟังต้นแบบแล้วพูดตามช้าๆ 🐢';
    box.appendChild(h('div', { class: 'center' },
      h('div', { style: { fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-en)' }, text: score + '%' }),
      h('div', { class: 'bold', text: msg }),
      h('div', { class: 'small muted', text: `ได้ ${marks.filter(Boolean).length} จาก ${marks.length} คำ` })));
    if (score >= 60) store.grade(current.id, score >= 90 ? 3 : 2);
    else store.grade(current.id, 1);
    saveGameScore('speakBest', score, 'high');
    box.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '12px' } },
      h('button', { class: 'btn btn-ghost btn-block btn-sm', type: 'button', onclick: () => say(target) }, icon('sound', 16), 'ฟังต้นแบบอีกครั้ง'),
      h('button', {
        class: 'btn btn-primary btn-block btn-sm', type: 'button',
        onclick: () => go(() => { current = db.words[(db.words.indexOf(current) + 1) % db.words.length]; render(); }),
      }, 'คำถัดไป →')));
    mount(resultBox, box);
  }

  render();
  return destroy;
}

/* ================================================================== *
 * 7) ทบทวนตามระบบ SRS
 * ================================================================== */

export function review(root) {
  let queue = [];
  let idx = 0;
  let flipped = false;
  let current = null;
  let done = 0;
  let again = 0;

  function destroy() { stopSpeaking(); }
  const go = (fn) => { destroy(); fn(); };
  let forceRecordMode = false;   // ตัวรู้จำเสียงล้มเหลว → ใช้โหมดอัดเสียงแทน
  let lastSttError = '';

  function home() {
    mount(root);
    const due = store.dueCount();
    const learned = store.learnedCount();
    const mastered = store.masteredCount();
    const newLeft = Math.min(S().newPerDay, db.words.filter((w) => store.srsOf(w.id).reps === 0).length);

    root.appendChild(h('div', { class: 'card center', style: { background: 'var(--surface)' } },
      h('div', { style: { fontSize: '2.6rem' }, text: due > 0 ? '🔔' : '✅' }),
      h('div', { class: 'bold', style: { fontSize: '1.1rem' }, text: due > 0 ? `มี ${due} คำถึงกำหนดทบทวน` : 'วันนี้ทบทวนครบแล้ว' }),
      h('div', { class: 'small muted', text: due > 0 ? 'ทบทวนวันละนิด จำได้ยาวนานกว่า' : 'กลับมาอีกครั้งเมื่อมีคำครบกำหนด' })));

    root.appendChild(h('div', { class: 'stat-grid', style: { marginTop: '12px' } },
      h('div', { class: 'stat' }, h('b', { text: String(learned) }), h('span', { text: 'เริ่มเรียนแล้ว' })),
      h('div', { class: 'stat' }, h('b', { text: String(mastered) }), h('span', { text: 'จำได้ระยะยาว' })),
      h('div', { class: 'stat' }, h('b', { text: String(newLeft) }), h('span', { text: 'คำใหม่รออยู่' }))));

    root.appendChild(h('button', {
      class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '14px' },
      disabled: due === 0 && newLeft === 0,
      onclick: () => go(start),
    }, due > 0 ? `เริ่มทบทวน (${due + newLeft} คำ)` : (newLeft ? `เริ่มเรียนคำใหม่ (${newLeft} คำ)` : 'ไม่มีอะไรต้องทบทวน')));

    root.appendChild(h('div', { class: 'card', style: { marginTop: '14px' } },
      h('div', { class: 'bold', text: 'ระบบทบทวนทำงานอย่างไร' }),
      h('div', { class: 'small muted', style: { marginTop: '6px' }, text: 'ใช้วิธีเดียวกับแอป Anki (SM-2) — คำที่คุณตอบว่า "ง่าย" จะถูกถามห่างขึ้น (1 วัน → 6 วัน → 2 สัปดาห์ → เป็นเดือน) ส่วนคำที่ตอบผิดจะกลับมาถามเร็วขึ้น จึงใช้เวลาน้อยแต่จำได้นาน' })));
    return () => {};
  }

  function start() {
    const due = store.dueWords(db.words, 60);
    const fresh = store.newWords(db.words, S().newPerDay);
    queue = [...due, ...fresh];
    if (!queue.length) { toast('ไม่มีคำที่ต้องทบทวนตอนนี้ 🎉', 'ok'); return home(); }
    idx = 0; done = 0; again = 0; flipped = false;
    card();
  }

  function card() {
    mount(root);
    if (idx >= queue.length) return finish();
    current = queue[idx];

    root.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => go(home) }, '← ออก'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'small muted', text: `${idx + 1}/${queue.length}` })));
    root.appendChild(progressBar(idx, queue.length));

    const cat = categoryOf(current.category);
    const sentEl = sentenceBlock(current);
    const el = h('div', { class: 'card', style: { marginTop: '12px', textAlign: 'center' } });
    el.appendChild(h('div', { class: 'word-en en', style: { fontSize: '2rem' }, text: current.word }));
    el.appendChild(h('div', { class: 'word-ipa mono-ipa', text: current.ipa }));
    el.appendChild(h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', style: { marginTop: '8px' },
      onclick: (e) => { e.stopPropagation(); sayWord(current); },
    }, icon('sound', 16), 'ฟังเสียง'));

    const hidden = h('div', { class: 'hidden', style: { marginTop: '12px' } },
      h('div', { class: 'word-th', style: { fontSize: '1.3rem' }, text: current.thai }),
      h('div', { class: 'tiny muted', style: { margin: '10px 0 4px' }, text: 'ตัวอย่างการใช้' }),
      sentEl,
      h('div', { class: 'sentence-th', text: current.exampleThai }),
      h('div', { style: { marginTop: '10px' } }, keyVocabBlock(current)));
    el.appendChild(hidden);
    el.appendChild(photoBox(current, { color: cat.color, showPhotos: S().showPhotos, showCredit: false }));
    root.appendChild(el);

    const revealBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '12px' }, onclick: () => reveal() }, 'ดูเฉลย');
    root.appendChild(revealBtn);

    const gradeBox = h('div', { class: 'hidden', style: { marginTop: '12px' } });
    const grades = [
      { g: 0, label: 'จำไม่ได้', cls: 'btn-danger' },
      { g: 1, label: 'ยาก', cls: 'btn-ghost' },
      { g: 2, label: 'พอได้', cls: 'btn-ghost' },
      { g: 3, label: 'ง่าย', cls: 'btn-success' },
    ];
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' } });
    for (const it of grades) {
      const next = store.simulate(current.id, it.g);
      grid.appendChild(h('button', {
        class: `btn ${it.cls}`, type: 'button',
        onclick: () => rate(it.g),
      }, h('div', {}, h('div', { text: it.label }), h('div', { class: 'tiny', style: { opacity: '.8' }, text: fmtInterval(next.interval) }))));
    }
    gradeBox.appendChild(grid);
    root.appendChild(gradeBox);

    function reveal() {
      hidden.classList.remove('hidden');
      revealBtn.classList.add('hidden');
      gradeBox.classList.remove('hidden');
      if (S().autoPlay) speakWordSentence(sentEl, current);
    }
    revealBtn.onclick = reveal;
    if (S().autoPlay) sayWord(current);
    return () => {};
  }

  function rate(g) {
    const next = store.grade(current.id, g);
    done++;
    if (g <= 1) {
      again++;
      queue.push(current);   // คำที่ยังไม่แม่น ให้วนถามซ้ำในรอบนี้
    }
    idx++;
    flipped = false;
    if (g === 3 || g === 2) toast('ทบทวนครั้งหน้า ' + fmtInterval(next.interval), 'ok', 1400);
    go(card);
  }

  function finish() {
    mount(root);
    root.appendChild(h('div', { class: 'card center' },
      h('div', { style: { fontSize: '3rem' }, text: '🎉' }),
      h('div', { class: 'bold', style: { fontSize: '1.2rem' }, text: 'ทบทวนครบแล้ว!' }),
      h('div', { class: 'small muted', text: `ทบทวน ${done} ครั้ง · ต้องทวนซ้ำ ${again} คำ` })));
    root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '14px' }, onclick: () => go(home) }, 'กลับหน้าทบทวน'));
    return () => {};
  }

  return home();
}

/* ================================================================== *
 * 8) คำของฉัน + สถิติ
 * ================================================================== */

export function mine(root) {
  let tab = 'fav';
  function destroy() { stopSpeaking(); }
  const go = (fn) => { destroy(); fn(); };
  let forceRecordMode = false;   // ตัวรู้จำเสียงล้มเหลว → ใช้โหมดอัดเสียงแทน
  let lastSttError = '';

  function render() {
    mount(root);
    root.appendChild(h('div', { class: 'stat-grid' },
      h('div', { class: 'stat' }, h('b', { text: String(store.streakDays()) }), h('span', { text: 'วันติดต่อกัน' })),
      h('div', { class: 'stat' }, h('b', { text: String(store.learnedCount()) }), h('span', { text: 'คำที่เริ่มเรียน' })),
      h('div', { class: 'stat' }, h('b', { text: store.accuracy() + '%' }), h('span', { text: 'ความแม่นยำ' }))));

    const tabs = [
      { id: 'fav', label: `⭐ คำโปรด (${store.favorites().length})` },
      { id: 'hard', label: `😵 คำยาก (${store.hardWords().length})` },
      { id: 'all', label: '📚 ทั้งหมด' },
    ];
    root.appendChild(h('div', { class: 'row row-wrap', style: { gap: '6px', margin: '14px 0 10px' } },
      ...tabs.map((t) => h('button', {
        class: `pill ${tab === t.id ? 'on' : ''}`, type: 'button',
        onclick: () => go(() => { tab = t.id; render(); }),
      }, t.label))));

    let list;
    if (tab === 'fav') list = store.favorites().map(getWord).filter(Boolean);
    else if (tab === 'hard') list = store.hardWords().map(getWord).filter(Boolean);
    else list = db.words.filter((w) => store.srsOf(w.id).reps > 0 || store.statOf(w.id).seen > 0);

    if (!list.length) {
      root.appendChild(emptyState(
        tab === 'all' ? '🌱' : '⭐',
        tab === 'fav' ? 'ยังไม่มีคำโปรด' : tab === 'hard' ? 'ยังไม่มีคำยาก' : 'ยังไม่ได้เริ่มเรียน',
        'กดรูปดาวบนการ์ดเพื่อบันทึกคำที่อยากกลับมาทวน'));
      return () => {};
    }

    for (const w of list) {
      const st = store.statOf(w.id);
      const total = st.correct + st.wrong;
      const acc = total ? Math.round((st.correct / total) * 100) + '%' : 'ยังไม่ทดสอบ';
      root.appendChild(h('div', {
        class: 'list-item',
        onclick: () => detail(w),
      },
      h('div', { class: 'thumb', text: w.emoji }),
      h('div', { class: 'lt' },
        h('b', { class: 'en', text: w.word }),
        h('div', { text: `${w.thai} · ${acc}` })),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'ออกเสียง',
        onclick: (e) => { e.stopPropagation(); sayWord(w); },
      }, icon('sound', 18))));
    }
    return () => {};
  }

  function detail(w) {
    openSheet((close) => {
      const box = h('div', {});
      box.appendChild(sheetHeader(w.word, w.thai, close));
      box.appendChild(photoBox(w, { color: categoryOf(w.category).color, showPhotos: S().showPhotos, allowCycle: true }));
      const sentEl = sentenceBlock(w);
      sentEl.style.marginTop = '12px';
      box.appendChild(sentEl);
      box.appendChild(h('div', { class: 'sentence-th', text: w.exampleThai }));
      box.appendChild(h('div', { style: { marginTop: '10px' } }, keyVocabBlock(w)));
      const card = store.srsOf(w.id);
      box.appendChild(h('div', { class: 'small muted', style: { marginTop: '12px' },
        text: card.reps > 0
          ? `ทบทวนแล้ว ${card.reps} ครั้ง · ครั้งถัดไป ${fmtInterval(Math.max(0, (card.due - Date.now()) / 86400000))}`
          : 'ยังไม่เคยทบทวนด้วยระบบ SRS' }));
      box.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '14px' } },
        h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => say(w.example, { rate: S().rate }) }, icon('sound', 18), 'อ่านประโยค'),
        h('button', {
          class: 'btn btn-ghost btn-block', type: 'button',
          onclick: () => { toggleHardWithToast(w); close(); go(render); },
        }, store.isHard(w.id) ? 'เอาออกจากคำยาก' : 'ทำเครื่องหมายว่ายาก'),
        starButton(w, { onChange: () => { close(); go(render); } })));
      return box;
    });
  }

  return render();
}

function toggleHardWithToast(w) {
  const on = store.toggleHard(w.id);
  toast(on ? 'เพิ่มในคำยากแล้ว' : 'นำออกจากคำยากแล้ว');
}

/* ================================================================== *
 * 9) หน้าตั้งค่า
 * ================================================================== */

function overlapSheet() {
  openSheet((close) => {
    const out = h('div', { class: 'small', style: { fontFamily: 'monospace', fontSize: '.68rem', lineHeight: '1.7', whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '10px', borderRadius: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)' } });
    const view = document.getElementById('view');
    const lines = [];
    if (view) {
      const vr = view.getBoundingClientRect();
      const limit = { top: vr.top, bottom: vr.top + 110, right: 320 };
      for (const el of view.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.top < limit.bottom && r.bottom > limit.top && r.left < limit.right) {
          const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
          if (!txt) continue;
          const cls = typeof el.className === 'string' ? el.className : '';
          lines.push(`${el.tagName.toLowerCase()}.${cls.split(' ')[0] || '-'} | ${txt}`);
        }
      }
    }
    lines.push('--- scrollWidth/clientWidth ---');
    lines.push('doc ' + document.documentElement.scrollWidth + '/' + document.documentElement.clientWidth);
    lines.push('body ' + document.body.scrollWidth + '/' + document.body.clientWidth);
    out.textContent = lines.slice(0, 18).join('\n') || 'ไม่พบองค์ประกอบ';
    return h('div', {}, sheetHeader('ตรวจองค์ประกอบด้านบน', 'ส่งภาพนี้ให้ผู้พัฒนาเพื่อหาตัวที่เกิน', close), out);
  }, { id: 'overlap' });
}
function micDiagSheet() {
  openSheet((close) => {
    const out = h('div', { class: 'small', style: { lineHeight: '1.9' }, text: 'กำลังตรวจ…' });
    micDiagnosticsReport().then(async (rep) => {
      out.textContent = 'กำลังทดสอบระบบฟังเสียง…';
      const stt = await sttSelfTest(5000);
      const sttLine = 'stt=' + (stt.ok ? 'ok' : (stt.err || 'unknown'));
      const full = rep + ' | ' + sttLine;
      const sttText = stt.ok
        ? '✅ ระบบฟังเสียงทำงาน (ถอดคำได้)'
        : '❌ ระบบฟังเสียงไม่ทำงาน: ' + (stt.err || 'unknown') + ' — ' + sttErrorReason(stt.err);
      mount(out,
        h('div', { class: 'bold', style: { color: stt.ok ? 'var(--success)' : 'var(--danger)', fontSize: '.9rem' }, text: sttText }),
        h('div', { class: 'small', style: { fontFamily: 'monospace', fontSize: '.7rem', lineHeight: '1.7', wordBreak: 'break-word', padding: '10px', borderRadius: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)', marginTop: '8px' }, text: full }),
        h('div', { class: 'tiny muted', style: { marginTop: '8px' }, text: 'คัดลอกข้อความนี้ส่งให้ผู้พัฒนา เพื่อรู้สาเหตุที่แน่นอนบนเครื่องคุณ' }),
        h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } },
          h('button', {
            class: 'btn btn-primary btn-block btn-sm', type: 'button',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(full);
                toast('คัดลอกข้อมูลแล้ว — ส่งมาให้ผู้พัฒนาได้เลย', 'ok');
              } catch (e) {
                toast('คัดลอกไม่สำเร็จ — จด/แคปหน้าจอแทน', 'err');
              }
            },
          }, '📋 คัดลอกข้อมูล')),
      );
    });
    return h('div', {}, sheetHeader('ข้อมูลวินิจฉัยไมโครโฟน', 'ใช้เมื่อไมค์ไม่ทำงาน', close), out);
  }, { id: 'micDiag' });
}
function micTestSheet() {
  openSheet((close) => {
    const out = h('div', {});
    const bar = h('i', { style: { width: '0%' } });
    const body = h('div', {},
      h('div', { class: 'small muted', text: 'กดปุ่มด้านล่างแล้วพูดอะไรก็ได้ 3 วินาที — ใช้ตรวจว่าไมค์ทำงานบนเครื่องนี้จริง' }),
      h('div', { class: 'row', style: { gap: '8px', marginTop: '10px', alignItems: 'center' } },
        h('span', { class: 'pill', text: '🔈 ระดับเสียง' }),
        h('div', { class: 'progress', style: { flex: '1' } }, bar)),
      h('div', { style: { marginTop: '12px' } },
        h('button', {
          class: 'btn btn-primary btn-block', type: 'button',
          onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'กำลังทดสอบ… พูดเลย!';
            const info = await testMicrophone(3000, (lv) => { bar.style.width = Math.round(lv * 100) + '%'; });
            btn.disabled = false;
            btn.textContent = 'ทดสอบอีกครั้ง';
            const ok = info.ok;
            mount(out,
              h('div', { style: { marginTop: '12px', padding: '12px', borderRadius: '16px', background: 'var(--surface-2)', border: '1px solid var(--border)' } },
                h('div', { class: 'bold', style: { color: ok ? 'var(--success)' : 'var(--danger)' },
                  text: ok ? '✅ ไมโครโฟนทำงาน' : '❌ ไม่ได้เสียง (' + info.error + ')' }),
                h('div', { class: 'small muted', style: { marginTop: '6px', lineHeight: '1.8' } },
                  'ได้เสียง ' + Math.round(info.bytes / 1024) + ' KB · นาน ' + (info.durationMs / 1000).toFixed(1) + ' วินาที',
                  h('br'), 'ระดับเสียงสูงสุด ' + Math.round(info.peak * 100) + '%',
                  h('br'), 'รูปแบบไฟล์: ' + (info.mime || 'ไม่ระบุ'),
                  h('br'), 'ฟังเสียงอัตโนมัติ: ' + (sttSupport().ok ? 'รองรับ ✓' : 'ไม่รองรับ — ใช้โหมดอัดเสียงเทียบแทน')),
                !ok ? h('div', { class: 'tiny', style: { marginTop: '8px', color: 'var(--warn)', lineHeight: '1.6' },
                  text: 'ถ้าขึ้น ❌ ให้ตรวจ: (1) อนุญาตไมค์ในเบราว์เซอร์ (2) เปิดผ่าน https (3) ไม่มีแอปอื่นใช้ไมค์อยู่' }) : null));
          },
        }, '🎤 เริ่มทดสอบ 3 วินาที')),
      out);
    return h('div', {}, sheetHeader('ตรวจสอบไมโครโฟน', sttSupport().ok ? 'เครื่องนี้ให้คะแนนอัตโนมัติได้' : 'เครื่องนี้ใช้โหมดอัดเสียงเทียบเสียง', close), body);
  }, { id: 'micTest' });
}
export function openSettings(onChange) {
  openSheet((close) => {
    const box = h('div', {});
    box.appendChild(sheetHeader('ตั้งค่า', 'ข้อมูลทั้งหมดเก็บไว้ในเครื่องของคุณเท่านั้น', close));
  box.appendChild(h('div', { class: 'field' },
    h('div', {}, h('label', { text: 'แสดงกรอบวินิจฉัย' }),
      h('div', { class: 'desc', text: 'เปิดเพื่อดูขอบของทุกองค์ประกอบ (ใช้หาจุดที่ล้นจอ) แล้วปิดกลับ' })),
    h('div', { class: 'row', style: { gap: '6px' } },
      h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: (e) => {
          const on = document.documentElement.classList.toggle('debug-outline');
          e.currentTarget.textContent = on ? 'ปิดกรอบ' : 'เปิดกรอบ';
        },
      }, document.documentElement.classList.contains('debug-outline') ? 'ปิดกรอบ' : 'เปิดกรอบ'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: overlapSheet }, '🧩 ตรวจหน้าจอ'))));
  // เวอร์ชันแอป (ผู้ใช้ขอดูตรงนี้) + ทางออกเมื่อติดแคชเก่า
  box.appendChild(h('div', { class: 'field' },
    h('div', {}, h('label', { text: 'เวอร์ชันแอป' }),
      h('div', { class: 'desc', text: 'PicEnglish ' + VERSION + ' · ' + (() => {
        const d = new Date(BUILD_DATE + 'T00:00:00');
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      })() })),
    h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
          toast('ล้างแคชแล้ว กำลังโหลดใหม่…', 'ok');
          setTimeout(() => location.reload(true), 700);
        } catch (e) {
          toast('ล้างแคชไม่สำเร็จ — ปิดแท็บแล้วเปิดใหม่', 'err');
        }
      },
    }, '↻ ล้างแคช')));

    const voiceSelect = h('select', {});
    const fillVoices = () => {
      clear(voiceSelect);
      voiceSelect.appendChild(h('option', { value: '', text: 'อัตโนมัติ (แนะนำ)' }));
      for (const v of englishVoices()) {
        voiceSelect.appendChild(h('option', { value: v.voiceURI, text: `${v.name} (${v.lang})` }));
      }
      voiceSelect.value = S().voiceURI || '';
    };
    fillVoices();
    loadVoices().then(fillVoices);
    voiceSelect.onchange = () => { store.setSetting('voiceURI', voiceSelect.value); onChange && onChange(); };

    const rows = [
      h('div', { class: 'field' },
        h('div', {}, h('label', { text: 'ธีม' }), h('div', { class: 'desc', text: 'สว่าง / มืด / ตามระบบ' })),
        (() => {
          const sel = h('select', {},
            h('option', { value: 'auto', text: 'ตามระบบ' }),
            h('option', { value: 'light', text: 'สว่าง' }),
            h('option', { value: 'dark', text: 'มืด' }));
          sel.value = S().theme;
          sel.onchange = () => { store.setSetting('theme', sel.value); onChange && onChange(); };
          return sel;
        })()),
      h('div', { class: 'field' },
        h('div', {}, h('label', { text: 'ความเร็วเสียงอ่าน' }), h('div', { class: 'desc', text: '0.6 = ช้ามาก · 1.2 = เร็ว' })),
        (() => {
          const r = h('input', { type: 'range', min: '0.6', max: '1.3', step: '0.05', value: String(S().rate) });
          const out = h('span', { class: 'small muted', text: S().rate.toFixed(2) });
          r.oninput = () => { out.textContent = Number(r.value).toFixed(2); store.setSetting('rate', Number(r.value)); };
          r.onchange = () => { say('This is the reading speed.', { rate: S().rate }); onChange && onChange(); };
          return h('div', { class: 'row', style: { gap: '8px' } }, r, out);
        })()),
      h('div', { class: 'field' },
        h('div', {}, h('label', { text: 'เสียงที่ต้องการ' }), h('div', { class: 'desc', text: 'เสียงผู้ชายมักฟังเข้าใจง่ายกว่าสำหรับผู้เรียนไทย' })),
        (() => {
          const sel = h('select', {},
            h('option', { value: 'male', text: 'เสียงผู้ชาย (แนะนำ)' }),
            h('option', { value: 'female', text: 'เสียงผู้หญิง' }),
            h('option', { value: 'auto', text: 'ดีที่สุดที่มีในเครื่อง' }));
          sel.value = S().voiceGender || 'male';
          sel.onchange = () => {
            store.setSetting('voiceGender', sel.value);
            store.setSetting('voiceURI', '');
            fillVoices();
            say('Hi, I will be your English voice. Let us practice together.', { rate: S().rate, gender: sel.value, voiceURI: '' });
            onChange && onChange();
          };
          return sel;
        })()),
      h('div', { class: 'field' },
        h('div', {}, h('label', { text: 'เสียงอ่านภาษาอังกฤษ' }), h('div', { class: 'desc', text: 'ถ้าเสียงไม่ถูกต้อง ให้ติดตั้งเสียงใหม่ในระบบปฏิบัติการ' })),
        h('div', { class: 'row', style: { gap: '6px' } },
          voiceSelect,
          h('button', {
            class: 'icon-btn', type: 'button', 'aria-label': 'ทดสอบเสียงนี้',
            onclick: () => say('Could I get a medium latte, please?', { rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender }),
          }, icon('sound', 18)))),
      h('div', { class: 'field' },
        h('div', {}, h('label', { text: 'อ่านออกเสียงอัตโนมัติ' }), h('div', { class: 'desc', text: 'เปิดการ์ด/เข้าหน้าฟังแล้วอ่านให้ฟังทันที' })),
        switchEl('autoPlay')),
      h('div', { class: 'field' },
        h('div', {}, h('label', { text: 'ภาพประกอบ' }),
          h('div', { class: 'desc', text: 'ภาพกราฟฟิกน่ารัก = ใช้ได้ออฟไลน์และตรงความหมายกว่า' })),
        (() => {
          const sel = h('select', {},
            h('option', { value: 'art', text: 'ภาพกราฟฟิก (แนะนำ)' }),
            h('option', { value: 'photo', text: 'ภาพถ่ายจริง' }),
            h('option', { value: 'emoji', text: 'อีโมจิเท่านั้น' }));
          sel.value = S().imageMode || 'art';
          sel.onchange = () => { store.setSetting('imageMode', sel.value); onChange && onChange(); };
          return sel;
        })()),
      h('div', { class: 'tiny muted', style: { marginTop: '-4px' },
        text: 'ภาพกราฟฟิก: ' + (artCredits().map((c) => `${c.credit} (${c.license})`).join(' · ') || 'OpenMoji (CC BY-SA 4.0)') }),
      h('div', { class: 'field' },
        h('div', {}, h('label', { text: 'แสดงคำแปลไทยบนการ์ด' }), h('div', { class: 'desc', text: 'ปิดเพื่อทดสอบตัวเองก่อนดูเฉลย' })),
        switchEl('showThai')),
      h('div', { class: 'field' },
        h('div', {}, h('label', { text: 'จำนวนคำต่อรอบเรียน' }), h('div', { class: 'desc', text: '' })),
        (() => {
          const sel = h('select', {});
          for (const n of [5, 10, 15, 20]) sel.appendChild(h('option', { value: String(n), text: n + ' คำ' }));
          sel.value = String(S().perRound);
          sel.onchange = () => { store.setSetting('perRound', Number(sel.value)); onChange && onChange(); };
          return sel;
        })()),
      h('div', { class: 'field' },
        h('div', {}, h('label', { text: 'คำใหม่ต่อวัน (โหมดทบทวน)' }), h('div', { class: 'desc', text: 'มากเกินไปจะทำให้ทบทวนไม่ไหว' })),
        (() => {
          const sel = h('select', {});
          for (const n of [5, 8, 12, 20, 30]) sel.appendChild(h('option', { value: String(n), text: n + ' คำ' }));
          sel.value = String(S().newPerDay);
          sel.onchange = () => { store.setSetting('newPerDay', Number(sel.value)); onChange && onChange(); };
          return sel;
        })()),
    ];
    for (const r of rows) box.appendChild(r);

    /* ---------- การฝึกพูด ---------- */
    box.appendChild(h('div', { class: 'section-title', text: 'การฝึกพูด' }));
    box.appendChild(h('div', { class: 'field' },
      h('div', {}, h('label', { text: 'ตรวจสอบไมโครโฟน' }),
        h('div', { class: 'desc', text: sttSupport().ok
          ? 'เบราว์เซอร์นี้ให้คะแนนอัตโนมัติได้ — กดทดสอบเพื่อเช็กไมค์'
          : 'เครื่องนี้ให้คะแนนอัตโนมัติไม่ได้ แต่ยังอัดเสียงเพื่อฟังเทียบได้' })),
      h('div', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: micTestSheet }, '🎤 ทดสอบ'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: micDiagSheet, 'aria-label': 'ข้อมูลวินิจฉัยไมโครโฟน' }, '🔍 วินิจฉัย'))));
    box.appendChild(h('div', { class: 'field' },
      h('div', {}, h('label', { text: 'ต้องพูดให้ผ่านก่อนไปต่อ' }),
        h('div', { class: 'desc', text: 'โหมดเข้ม: ประโยคเดิมจะวนจนกว่าจะออกเสียงชัด (ข้ามได้หลังลอง 3 ครั้ง)' })),
      switchEl('strictSpeak')));
    box.appendChild(h('div', { class: 'field' },
      h('div', {}, h('label', { text: 'เกณฑ์ผ่านการออกเสียง' }), h('div', { class: 'desc', text: 'ยิ่งสูงยิ่งเข้ม แต่อาจทำให้ท้อได้' })),
      (() => {
        const sel = h('select', {},
          h('option', { value: '60', text: 'ผ่อนปรน (60%)' }),
          h('option', { value: '70', text: 'ปกติ (70%)' }),
          h('option', { value: '85', text: 'เข้ม (85%)' }));
        sel.value = String(S().passThreshold || 70);
        sel.onchange = () => { store.setSetting('passThreshold', Number(sel.value)); onChange && onChange(); };
        return sel;
      })()));
    box.appendChild(h('div', { class: 'field' },
      h('div', {}, h('label', { text: 'เสียงเอฟเฟกต์' }),
        h('div', { class: 'desc', text: 'เสียงตอนกดไมค์ / ตอนผ่านบทเรียน (สังเคราะห์ในเครื่อง ไม่ต้องโหลด)' })),
      switchEl('sfx')));    box.appendChild(h('div', { class: 'field' },
      h('div', {}, h('label', { text: 'บันทึกเสียงของฉัน' }),
        h('div', { class: 'desc', text: 'เก็บไว้ในเครื่องเท่านั้น เพื่อฟังเทียบกับเสียงต้นแบบ' })),
      switchEl('recordVoice')));
    const recStatus = h('div', { class: 'small muted', style: { marginBottom: '8px' } });
    const refreshRecStatus = async () => {
      try {
        const u = await recordingsUsage();
        recStatus.textContent = u.count
          ? `มีเสียงที่บันทึกไว้ ${u.count} คลิป · ${(u.bytes / 1024 / 1024).toFixed(2)} MB (เก็บสูงสุด ${QUOTA.maxItems} คลิป หรือ ${QUOTA.maxBytes / 1024 / 1024} MB — ลบเก่าสุดอัตโนมัติ)`
          : 'ยังไม่มีเสียงที่บันทึกไว้';
      } catch (e) { recStatus.textContent = ''; }
    };
    refreshRecStatus();
    box.appendChild(recStatus);
    box.appendChild(h('button', {
      class: 'btn btn-ghost btn-block', type: 'button',
      onclick: async () => {
        if (!confirm('ลบเสียงที่บันทึกไว้ทั้งหมด?')) return;
        await clearRecordings();
        await refreshRecStatus();
        toast('ลบเสียงที่บันทึกไว้ทั้งหมดแล้ว');
      },
    }, '🗑 ลบเสียงที่บันทึกไว้'));

    box.appendChild(h('div', { class: 'section-title', text: 'ออฟไลน์ & ข้อมูล' }));
    const status = h('div', { class: 'small muted', style: { marginBottom: '8px' }, text: '' });
    box.appendChild(h('button', {
      class: 'btn btn-ghost btn-block', type: 'button',
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        status.textContent = 'กำลังโหลดภาพ… (ใช้เวลาสักครู่)';
        const { done, failed } = await preloadPhotos(db.words, (d, f, total, word) => {
          status.textContent = `โหลดภาพแล้ว ${d + f}/${total} — ${word}`;
        });
        status.textContent = `เสร็จแล้ว: ได้ภาพ ${done} คำ` + (failed.length ? ` · หาไม่เจอ ${failed.length} คำ (จะใช้อีโมจิแทน)` : '');
        btn.disabled = false;
      },
    }, '⬇️ ดาวน์โหลดภาพทั้งหมดไว้ใช้ออฟไลน์'));
    box.appendChild(status);
    box.appendChild(h('button', {
      class: 'btn btn-ghost btn-block', type: 'button', style: { marginTop: '8px' },
      onclick: () => { clearPhotoCache(); toast('ล้างแคชภาพแล้ว'); },
    }, '🧹 ล้างแคชภาพ'));

    box.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } },
      h('button', {
        class: 'btn btn-ghost btn-block', type: 'button',
        onclick: () => {
          const blob = new Blob([store.exportJSON()], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'picenglish-progress.json' });
          document.body.appendChild(a); a.click(); a.remove();
          toast('ส่งออกความคืบหน้าแล้ว', 'ok');
        },
      }, '⬆️ ส่งออกข้อมูล'),
      h('button', {
        class: 'btn btn-ghost btn-block', type: 'button',
        onclick: () => {
          const inp = h('input', { type: 'file', accept: 'application/json' });
          inp.onchange = async () => {
            const f = inp.files[0];
            if (!f) return;
            try { store.importJSON(await f.text()); toast('นำเข้าข้อมูลแล้ว', 'ok'); close(); onChange && onChange(); }
            catch (err) { toast('ไฟล์ไม่ถูกต้อง', 'err'); }
          };
          inp.click();
        },
      }, '⬇️ นำเข้าข้อมูล')));

    box.appendChild(h('button', {
      class: 'btn btn-danger btn-block', type: 'button', style: { marginTop: '8px' },
      onclick: () => {
        if (!confirm('ล้างความคืบหน้าทั้งหมด? การกระทำนี้ย้อนกลับไม่ได้')) return;
        store.resetAll();
        toast('ล้างข้อมูลแล้ว');
        close();
        onChange && onChange();
      },
    }, '🗑 ล้างความคืบหน้าทั้งหมด'));

    /* ---------- LINE ---------- */
    box.appendChild(h('div', { class: 'section-title', text: 'LINE' }));
    const lstate = liffState();
    box.appendChild(h('div', { class: 'small muted', style: { marginBottom: '8px' },
      text: lstate.preview ? 'โหมดพรีวิว: ปุ่มด้านล่างจะทำงานจริงเมื่อเปิดแอปใน LINE'
        : lstate.inClient ? 'คุณกำลังใช้งานผ่านแอป LINE'
          : 'เปิดแอปผ่าน LINE เพื่อใช้ปุ่มแชร์ให้เพื่อน' }));
    box.appendChild(h('button', {
      class: 'btn btn-block', type: 'button',
      style: { background: '#06c755', color: '#fff' },
      onclick: async () => {
        const r = await shareToLine('PicEnglish — เรียนคำศัพท์อังกฤษด้วยภาพ ฟังประโยค และฝึกพูดจริง ๆ (ฟรี ไม่มีโฆษณา)');
        if (r.ok) toast('เปิดหน้าแชร์ของ LINE แล้ว', 'ok');
        else if (r.reason === 'preview') toast('โหมดพรีวิว: ปุ่มแชร์จะทำงานในแอป LINE จริง');
        else toast('ต้องเปิดแอปนี้ผ่าน LINE จึงจะแชร์ได้');
      },
    }, '💚 แชร์ให้เพื่อนใน LINE'));

    box.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '16px' } },
      h('div', { text: 'เครดิตภาพ: Wikimedia Commons (แสดงผู้ถ่ายและไลเซนส์กำกับใต้ภาพทุกภาพ)' }),
      h('div', { text: 'เสียงอ่าน: Web Speech API ของเบราว์เซอร์ · ไม่มีการส่งข้อมูลผู้ใช้ออกจากเครื่อง' })));
    return box;
  }, { id: 'settings' });
}

function switchEl(key) {
  const input = h('input', {
    type: 'checkbox', checked: !!S()[key],
    onchange: () => store.setSetting(key, input.checked),
  });
  return h('span', { class: 'switch' }, input, h('i'));
}

/* ------------------------------------------------------------------ */
export const views = {
  learn, listen, games, quiz, match, speak: speakView, review, mine,
};
