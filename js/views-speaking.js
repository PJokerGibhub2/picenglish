/**
 * views-speaking.js — โหมด "ฝึกพูด" (เฟส 1)
 *
 *  หลักการออกแบบ
 *   - ทุกโหมดต้องจบด้วยการที่ผู้ใช้ "ออกเสียงพูด" จริง (output) ไม่ใช่แค่กดดู
 *   - ต้องมีทางถอยเสมอ: ข้ามได้ ไม่มีคำว่าสอบตก และมี "โหมดไม่ให้คะแนน"
 *     สำหรับเบราว์เซอร์ที่ไม่รองรับการฟังเสียง (Firefox / in-app browser)
 *   - ประโยคที่พูดไม่ได้ เข้าคิวทบทวน SRS ระดับประโยค
 */

import { db, getDialogue, categoryOf, shuffle, sample } from './data.js';
import * as store from './store.js';
import {
  h, mount, clear, toast, openSheet, closeSheet, sheetHeader, photoBox, emptyState,
  progressBar, fmtInterval, icon,
} from './ui.js';
import {
  speak, stopSpeaking, sayText, renderSentence, clearHighlight, speakSentence,
  sttSupported, sttSupport, sttErrorReason, createRecognizer, alignWords, sentenceSimilarity,
} from './speech.js';
import {
  recordingSupported, startRecording, playBlob, stopPlayback,
  saveRecording, recordingSupported as canRecord,
  listRecordings, deleteRecording, updateRecording,
} from './recorder.js';
import { mascot } from './mascot.js';

const S = () => store.settings();
const say = (text, opts = {}) => sayText(text, { rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender, ...opts });
const DEFAULT_PASS = 70;

/** เกณฑ์ผ่าน (ปรับได้ในหน้าตั้งค่า) */
const threshold = () => Number(S().passThreshold) || DEFAULT_PASS;
/** โหมดเข้ม: ต้องพูดให้ผ่านก่อนจึงจะไปบรรทัดถัดไปได้ */
const strictMode = () => S().strictSpeak !== false;
/** บันทึกเสียงผู้ใช้หรือไม่ */
const recordEnabled = () => S().recordVoice !== false && recordingSupported();

/* ---------------- ดัชนีคำศัพท์สำหรับ "สอนออกเสียง" คำที่พูดไม่ชัด ---------------- */

let wordIndex = null;
function buildWordIndex() {
  if (wordIndex) return wordIndex;
  wordIndex = new Map();
  for (const w of db.words) {
    const key = String(w.word || '').toLowerCase().trim();
    if (!key) continue;
    if (!wordIndex.has(key)) wordIndex.set(key, w);
    const first = key.split(' ')[0];
    if (first && !wordIndex.has(first)) wordIndex.set(first, w);
  }
  return wordIndex;
}

/** หาคำในคลัง 96 คำ เพื่อดึง IPA/คำแปล/ภาพมาช่วยสอนออกเสียง */
export function lookupWord(token) {
  const idx = buildWordIndex();
  const t = String(token || '').toLowerCase().replace(/[^a-z']/g, '');
  if (!t) return null;
  if (idx.has(t)) return idx.get(t);
  // คำสั้นมาก (I, a, an, we, no) ต้องตรงเป๊ะเท่านั้น ไม่งั้นจะไปได้คำอื่นมาแสดงผิด ๆ
  if (t.length <= 3) return null;
  const bases = [t.replace(/ies$/, 'y'), t.replace(/es$/, ''), t.replace(/s$/, ''), t.replace(/ed$/, ''),
    t.replace(/ing$/, ''), t.replace(/ing$/, 'e')];
  for (const b of bases) if (b && b.length > 2 && idx.has(b)) return idx.get(b);
  // เทียบรากคำแบบระมัดระวัง — เฉพาะคำยาวพอ และคีย์ต้องยาวไม่น้อยกว่าคำที่ค้น
  for (const [key, w] of idx) {
    if (key.length >= 4 && t.length >= 4 && (t.startsWith(key) || key.startsWith(t))) return w;
  }
  return null;
}

/** คำที่ผู้ใช้พูดไม่ถูก จากการจัดตำแหน่งคำของ alignWords() */
function wrongWordsOf(lineEn, marks) {
  const toks = String(lineEn).match(/[A-Za-z0-9']+/g) || [];
  const out = [];
  toks.forEach((tok, i) => { if (i < marks.length && !marks[i]) out.push(tok); });
  return out;
}

/* ================================================================== *
 * ศูนย์รวมโหมดฝึกพูด
 * ================================================================== */

export function speakingHub(root) {
  mount(root);
  const spokenWeek = store.spokenLast7Days();
  const doneDlg = store.completedDialogues();
  const goal = 15;

  root.appendChild(h('div', {
    class: 'card',
    style: {
      background: 'linear-gradient(140deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #ec4899))',
      color: '#fff', border: '0',
    },
  },
  h('div', { class: 'row' },
    h('div', { style: { flex: '1' } },
      h('div', { class: 'bold', style: { fontSize: '1.05rem' }, text: 'เป้าหมาย: พูดให้ได้จริง' }),
      h('div', { class: 'small', style: { opacity: '.92' }, text: 'สัปดาห์นี้คุณพูดไปแล้ว' }),
      h('div', { class: 'bold', style: { fontSize: '1.7rem', fontFamily: 'var(--font-en)' }, text: `${spokenWeek} ประโยค` }),
      h('div', { class: 'small', style: { opacity: '.92' }, text: `เป้าหมาย ${goal} ประโยค · จบบทสนทนา ${doneDlg} สถานการณ์` })),
    h('div', { style: { fontSize: '2.4rem' }, text: '🗣️' }))));

  root.appendChild(h('div', { class: 'section-title', text: 'ฝึกพูด' }));

  const ready = db.dialogues.length > 0;
  root.appendChild(h('a', {
    href: '#/roleplay', class: 'list-item', style: { padding: '14px', opacity: ready ? '1' : '.55' },
  },
  h('div', { class: 'thumb', style: { fontSize: '1.9rem' }, text: '💬' }),
  h('div', { class: 'lt' },
    h('b', { style: { fontFamily: 'var(--font)', fontSize: '1rem' }, text: 'บทสนทนาจำลอง' }),
    h('div', { text: ready ? `มี ${db.dialogues.length} สถานการณ์ · แอปอ่านบทคู่สนทนา คุณพูดบทของคุณ แล้วสลับบท` : 'กำลังเตรียมเนื้อหา' })),
  h('span', { class: 'pill', text: ready ? 'พร้อมใช้' : 'เร็วๆ นี้' })));

  // โหมดพูดคนเดียว 60 วินาที (ใช้งานได้แล้ว)
  root.appendChild(h('a', {
    href: '#/onemin', class: 'list-item', style: { padding: '14px' },
  },
  h('div', { class: 'thumb', style: { fontSize: '1.9rem' }, text: '⏱️' }),
  h('div', { class: 'lt' },
    h('b', { style: { fontFamily: 'var(--font)', fontSize: '1rem' }, text: 'พูดคนเดียว 60 วินาที' }),
    h('div', { text: 'หัวข้อจากคำที่คุณยังไม่แม่น · อัดเสียงเก็บไว้ฟังย้อนหลัง' })),
  h('span', { class: 'pill', text: 'พร้อมใช้' })));

  const soon = [
    { emoji: '🔊', title: 'พูดตามเงา (Shadowing)', desc: 'พูดตามเสียงต้นแบบ ฝึกจังหวะและความคล่อง' },
    { emoji: '⌨️', title: 'เขียนจากเสียง (Dictation)', desc: 'ฟังแล้วพิมพ์ ฝึกทักษะเขียนที่ใช้จริง' },
    { emoji: '🧱', title: 'เรียงประโยค', desc: 'ประกอบประโยคจากคำที่ให้ โดยไม่ต้องท่องไวยากรณ์' },
  ];
  for (const it of soon) {
    root.appendChild(h('div', { class: 'list-item', style: { padding: '14px', opacity: '.6' } },
      h('div', { class: 'thumb', style: { fontSize: '1.9rem' }, text: it.emoji }),
      h('div', { class: 'lt' },
        h('b', { style: { fontFamily: 'var(--font)', fontSize: '1rem' }, text: it.title }),
        h('div', { text: it.desc })),
      h('span', { class: 'pill', text: 'กำลังทำ' })));
  }

  root.appendChild(h('div', { class: 'section-title', text: 'ทบทวนประโยคที่ยังพูดไม่ได้' }));
  const dueS = store.dueSentenceCount();
  root.appendChild(h('div', { class: 'list-item', style: { padding: '14px' } },
    h('div', { class: 'thumb', style: { fontSize: '1.9rem' }, text: '🔁' }),
    h('div', { class: 'lt' },
      h('b', { style: { fontFamily: 'var(--font)', fontSize: '1rem' }, text: 'คิวประโยค' }),
      h('div', { text: dueS > 0 ? `มี ${dueS} ประโยคถึงกำหนดทบทวน` : 'ยังไม่มีประโยคที่ต้องทบทวน' })),
    h('span', { class: 'pill', text: String(dueS) })));

  root.appendChild(h('div', { class: 'section-title', text: 'เกม' }));
  for (const it of [
    { emoji: '🧩', title: 'จับคู่ภาพ-คำ', href: '#/match' },
    { emoji: '❓', title: 'ควิซปรนัย', href: '#/quiz' },
    { emoji: '🎤', title: 'ฝึกออกเสียงคำศัพท์', href: '#/speak' },
  ]) {
    root.appendChild(h('a', { href: it.href, class: 'list-item' },
      h('div', { class: 'thumb', style: { fontSize: '1.6rem' }, text: it.emoji }),
      h('div', { class: 'lt' }, h('b', { style: { fontFamily: 'var(--font)' }, text: it.title })),
      icon('chevron', 18)));
  }
  return () => { stopSpeaking(); };
}

/* ================================================================== *
 * แผงอธิบายก่อนขออนุญาตไมโครโฟน (ขอครั้งเดียว)
 * ================================================================== */

function ensureMicPermission(onReady) {
  if (S().micExplained) { onReady(); return; }
  openSheet((close) => {
    const box = h('div', {});
    box.appendChild(sheetHeader('ขออนุญาตใช้ไมโครโฟน', 'ใช้เฉพาะตอนคุณกดปุ่มพูดเท่านั้น', close));
    box.appendChild(h('div', { class: 'small', style: { lineHeight: '1.8' } },
      h('div', { text: '🎤 แอปต้องใช้ไมค์เพื่อฟังเสียงที่คุณพูด แล้วให้คะแนนทันที' }),
      h('div', { text: '🔒 เสียงของคุณถูกประมวลผลในเบราว์เซอร์ และไม่ถูกส่งไปเก็บที่เซิร์ฟเวอร์ของเรา' }),
      h('div', { text: '🙈 ไม่มีใครฟังคุณ — ไม่มีห้องเรียน ไม่มีคนให้คะแนน นอกจากตัวคุณเอง' }),
      h('div', { text: '⏭ ถ้าไม่อยากให้คะแนน ก็ยังฝึกได้ด้วยโหมดไม่ให้คะแนน' })));
    box.appendChild(h('button', {
      class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '14px' },
      onclick: () => { store.setSetting('micExplained', true); close(); onReady(); },
    }, 'เข้าใจแล้ว เริ่มพูดเลย'));
    return box;
  });
}

/* ================================================================== *
 * บทสนทนาจำลอง
 * ================================================================== */

export function roleplay(root, params = {}) {
  let dlgId = params.dlg || null;
  let myRole = 'me';            // 'me' = บทของผู้ใช้ (สลับได้)
  let idx = 0;
  let scores = [];              // [{index, score}]
  let rec = null;
  let recording = false;
  let noStt = false;   // ตัวรู้จำเสียงล้มเหลว → โหมดอัดเสียง
  let busy = false;
  let bubbleBox = null;
  let actionBox = null;
  let statusEl = null;
  let currentRecognizer = null;
  const lineBlobs = new Map();   // lineKey -> Blob (เสียงที่ผู้ใช้พูดล่าสุด)
  const attempts = new Map();    // lineKey -> จำนวนครั้งที่ลอง
  const lastScore = new Map();   // lineKey -> คะแนนล่าสุด

  function destroy() {
    stopSpeaking();
    stopPlayback();
    try { if (rec && recording) rec.stop(); } catch (e) { /* ignore */ }
    recording = false; busy = false;
  }
  const go = (fn) => { destroy(); fn(); };

  /* ---------- รายการสถานการณ์ ---------- */
  function list() {
    mount(root);
    if (!db.dialogues.length) {
      root.appendChild(emptyState('💬', 'ยังไม่มีบทสนทนา', 'กำลังเตรียมเนื้อหา 8 สถานการณ์สำหรับคุณ'));
      return;
    }
    root.appendChild(h('div', { class: 'small muted', style: { marginBottom: '10px' },
      text: 'เลือกสถานการณ์ที่คุณเจอจริงในชีวิต แล้วพูดบทของคุณเอง — แอปจะอ่านบทคู่สนทนาให้ฟัง' }));

    for (const d of db.dialogues) {
      const p = store.dialogueProgress(d.id);
      const pct = p.completed ? 100 : Math.round((p.lineIndex / Math.max(1, d.lines.length)) * 100);
      root.appendChild(h('div', {
        class: 'list-item', style: { padding: '14px', alignItems: 'flex-start' },
        onclick: () => go(() => { dlgId = d.id; myRole = 'me'; idx = p.lineIndex || 0; scores = []; player(); }),
      },
      h('div', { class: 'thumb', style: { fontSize: '1.7rem' }, text: d.emoji || '💬' }),
      h('div', { class: 'lt' },
        h('b', { style: { fontFamily: 'var(--font)', fontSize: '1rem' }, text: d.title }),
        h('div', { text: `${d.titleEn} · ระดับ ${d.level}` }),
        h('div', { class: 'tiny muted', style: { marginTop: '3px' },
          text: p.completed ? `เล่นจบแล้ว ${p.plays} ครั้ง${p.bestScore ? ' · คะแนนดีที่สุด ' + p.bestScore + '%' : ''}`
            : pct > 0 ? `ค้างไว้ที่บรรทัด ${p.lineIndex + 1}/${d.lines.length}` : 'ยังไม่เคยเล่น' })),
      h('span', { class: 'pill', text: p.completed ? '✓ จบแล้ว' : pct > 0 ? pct + '%' : 'เริ่ม' })));
    }
    return () => {};
  }

  /* ---------- เล่นบทสนทนา ---------- */
  function player() {
    mount(root);
    const d = getDialogue(dlgId);
    if (!d) return list();

    // ส่วนหัว
    root.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => go(list) }, '← ออก'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'small muted', text: `${Math.min(idx + 1, d.lines.length)} / ${d.lines.length}` })));
    root.appendChild(progressBar(idx, d.lines.length));

    // บริบท + ภาพ
    const ctx = h('div', { class: 'card', style: { marginTop: '12px', padding: '12px' } });
    ctx.appendChild(photoBox(d, {
      color: categoryOf(d.category).color,
      showPhotos: S().showPhotos,
      allowCycle: true,
      class: 'dlg-photo',
    }));
    ctx.appendChild(h('div', { class: 'row' },
      h('div', { style: { flex: '1' } },
        h('div', { class: 'bold', text: `${d.emoji || '💬'} ${d.title}` }),
        h('div', { class: 'small muted', text: d.setting })),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'สลับบท',
        onclick: () => go(() => { myRole = myRole === 'me' ? 'staff' : 'me'; idx = 0; scores = []; player(); toast(myRole === 'me' ? 'คุณรับบทลูกค้า' : 'คุณรับบทคู่สนทนา'); }),
      }, icon('shuffle', 18))));
    root.appendChild(ctx);

    // บทสนทนาที่ผ่านมา + บรรทัดปัจจุบัน
    bubbleBox = h('div', { class: 'stack', style: { marginTop: '12px' } });
    root.appendChild(bubbleBox);
    for (let i = 0; i <= Math.min(idx, d.lines.length - 1); i++) {
      bubbleBox.appendChild(bubble(d, d.lines[i], i, i === idx));
    }

    actionBox = h('div', { class: 'card', style: { marginTop: '12px' } });
    root.appendChild(actionBox);

    if (idx >= d.lines.length) return summary(d);
    renderAction(d, d.lines[idx], idx);
    return () => {};
  }

  function bubble(d, line, i, isCurrent) {
    const mine = line.who === myRole;
    const card = h('div', {
      class: `bubble ${mine ? 'me' : 'other'} ${isCurrent ? 'current' : ''}`,
      dataset: { line: String(i) },
    });
    card.appendChild(h('div', { class: 'who', text: mine ? '🙋 คุณ (บทของคุณ)' : `${d.counterpart?.emoji || '🧑'} ${d.counterpart?.labelTh || 'คู่สนทนา'}` }));
    const sent = h('div', { class: 'bubble-en' });
    renderSentence(sent, line.en);
    sent.addEventListener('click', (e) => {
      const w = e.target.closest('.w');
      if (w) say(w.textContent, { rate: Math.min(1, S().rate) });
    });
    card.appendChild(sent);
    card.appendChild(h('div', { class: 'bubble-th', text: line.thai }));

    const prev = scores.find((s) => s.index === i);
    if (prev) {
      card.appendChild(h('div', { class: 'tiny', style: { marginTop: '4px', fontWeight: '800', color: prev.score >= threshold() ? 'var(--success)' : 'var(--warn)' },
        text: prev.score >= threshold() ? `✓ พูดผ่าน ${prev.score}%` : `พูดได้ ${prev.score}% — จะกลับมาทวนให้` }));
    }
    if (isCurrent && !mine) {
      card.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } },
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: () => sayText(line.en, { rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender, audioKey: `${d.id}:${i}` }),
        }, icon('sound', 16), 'ฟังอีกครั้ง')));
    }
    // วลีสำคัญ (แสดงเฉพาะบรรทัดของผู้ใช้)
    if (mine && line.keyPhrases?.length) {
      const kv = h('div', { class: 'keyvocab', style: { marginTop: '8px' } });
      for (const p of line.keyPhrases) {
        kv.appendChild(h('button', {
          class: 'kv', type: 'button',
          onclick: () => say(p.en, { rate: Math.min(1, S().rate) }),
        }, h('b', { text: p.en }), h('span', { text: p.thai })));
      }
      card.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '8px' }, text: 'วลีสำคัญในประโยคนี้ (แตะเพื่อฟัง)' }));
      card.appendChild(kv);
    }
    return card;
  }

  function renderAction(d, line, i) {
    clear(actionBox);
    const mine = line.who === myRole;
    statusEl = h('div', { class: 'transcript', style: { marginTop: '10px', text: '…' } });

    if (!mine) {
      actionBox.appendChild(h('div', { class: 'small muted', text: 'ฟังบทของคู่สนทนา แล้วกดต่อไป' }));
      actionBox.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } },
        h('button', {
          class: 'btn btn-primary btn-block', type: 'button',
          onclick: () => next(d, i),
        }, 'ต่อไป →')));
      if (S().autoPlay) {
        setTimeout(() => {
          if (document.body.contains(actionBox)) {
            sayText(line.en, { rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender, audioKey: `${d.id}:${i}` });
          }
        }, 320);
      }
      return;
    }

    // ---------- ถึงบทของผู้ใช้: ต้องพูด ----------
    if (!sttSupported()) {
      const nskey = `${d.id}:${i}`;
      let handle = null;
      const startBtn = h('button', { class: 'btn btn-ghost btn-block', type: 'button' }, '🎤 อัดเสียงของฉัน');
      const stopBtn = h('button', { class: 'btn btn-primary btn-block hidden', type: 'button' }, '⏹ หยุด & ฟังเสียงตัวเอง');
      const out = h('div', {});
      actionBox.appendChild(h('div', { class: 'small', style: { marginBottom: '8px' },
        text: '⚠️ ' + sttSupport().note + ' — โหมดนี้จะอัดเสียงคุณไว้ฟังเทียบกับต้นแบบ แล้วให้คุณประเมินเอง' }));
      startBtn.onclick = () => ensureMicPermission(async () => {
        handle = await startRecording();
        if (!handle) { toast('บันทึกเสียงไม่สำเร็จ (อาจไม่ได้รับสิทธิ์ไมค์)', 'err'); return; }
        recording = true;
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
      });
      stopBtn.onclick = async () => {
        const blob = handle ? await handle.stop() : null;
        handle = null; recording = false;
        stopBtn.classList.add('hidden');
        startBtn.classList.remove('hidden');
        if (!blob) { toast('ไม่ได้ยินเสียง ลองใหม่', 'err'); return; }
        lineBlobs.set(nskey, blob);
        mount(out,
          h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } },
            h('button', { class: 'btn btn-ghost btn-block btn-sm', type: 'button', onclick: () => playBlob(blob, 1) }, '🔊 เสียงของคุณ'),
            h('button', { class: 'btn btn-ghost btn-block btn-sm', type: 'button', onclick: () => sayText(line.en, { rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender, audioKey: `${d.id}:${i}` }) }, '🔊 เสียงต้นแบบ')),
          h('div', { class: 'tiny muted center', style: { marginTop: '8px' }, text: 'ให้คะแนนตัวเอง بعدฟังเทียบ' }),
          h('div', { class: 'row row-wrap', style: { gap: '6px', justifyContent: 'center', marginTop: '6px' } },
            ...[1, 2, 3, 4, 5].map((n) => h('button', {
              class: 'pill', type: 'button',
              onclick: (e) => { store.addSelfRating(n); e.currentTarget.classList.add('on'); toast('บันทึกคะแนนตัวเอง ' + n + '/5 แล้ว'); },
            }, '★'.repeat(n)))),
          h('button', {
            class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '12px' },
            onclick: () => { store.bumpSpoken(1); store.gradeSentence(nskey, 2); next(d, i); },
          }, 'พูดแล้ว ต่อไป →'));
      };
      actionBox.appendChild(startBtn);
      actionBox.appendChild(stopBtn);
      actionBox.appendChild(out);
      actionBox.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } },
        h('button', {
          class: 'btn btn-ghost btn-block btn-sm', type: 'button',
          onclick: () => sayText(line.en, { rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender, audioKey: `${d.id}:${i}` }),
        }, icon('sound', 16), 'ฟังต้นแบบ'),
        h('button', {
          class: 'btn btn-ghost btn-block btn-sm', type: 'button',
          onclick: () => { store.bumpSpoken(1); store.gradeSentence(nskey, 2); next(d, i); },
        }, 'ข้ามไปก่อน')));
      return;
    }

    const mic = h('button', { class: 'mic-btn', type: 'button', 'aria-label': 'กดเพื่อพูด', style: { width: '78px', height: '78px', fontSize: '1.7rem' } }, '🎤');
    const hint = h('div', { class: 'small muted center', style: { marginTop: '6px' }, text: 'กดไมค์แล้วพูดประโยคของคุณ' });

    mic.onclick = () => {
      startAttempt(line.en, mic, hint, `${d.id}:${i}`, (said, blob) => evaluate(d, line, i, said, blob));
    };

    actionBox.appendChild(h('div', { style: { textAlign: 'center' } }, mic));
    actionBox.appendChild(hint);
    actionBox.appendChild(statusEl);

    const alt = line.alternative || [];
    actionBox.appendChild(h('div', { class: 'row row-wrap', style: { gap: '8px', marginTop: '12px', justifyContent: 'center' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => sayText(line.en, { rate: Math.max(0.55, S().rate - 0.28), voiceURI: S().voiceURI, gender: S().voiceGender, audioKey: `${d.id}:${i}` }) }, '🐢 ฟังช้าๆ'),
      alt.length ? h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => openAlternatives(line),
      }, '💡 พูดแบบอื่นได้ไหม') : null,
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => next(d, i) }, '⏭ ข้าม')));
  }

  function openAlternatives(line) {
    openSheet((close) => {
      const box = h('div', {});
      box.appendChild(sheetHeader('พูดแบบอื่นก็ได้', 'ทุกประโยคต่อไปนี้ใช้แทนกันได้', close));
      for (const a of line.alternative || []) {
        box.appendChild(h('div', { class: 'list-item', onclick: () => { close(); say(a.en, { rate: S().rate }); } },
          h('div', { class: 'lt' }, h('b', { class: 'en', text: a.en }), h('div', { text: a.thai })),
          icon('sound', 18)));
      }
      box.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '12px' },
        text: 'เป้าหมายคือ "สื่อสารได้" ไม่ใช่พูดเหมือนต้นแบบเป๊ะ ๆ — เลือกประโยคที่คุณถนัดที่สุด' }));
      return box;
    });
  }

  /**
   * ฟังเสียงหนึ่งครั้ง — บันทึกเสียงของผู้ใช้ไปพร้อมกัน (ถ้าทำได้)
   * คืนค่า { said, blob, err }
   */
  function listenOnce(hooks = {}) {
    return new Promise((resolve) => {
      stopSpeaking();
      let recHandle = null;
      let settled = false;
      const done = async (said, err) => {
        if (settled) return;
        settled = true;
        currentRecognizer = null;
        let blob = null;
        if (recHandle) {
          // รอเก็บเสียงช่วงท้ายประโยคเล็กน้อย ก่อนหยุดบันทึก
          await new Promise((r) => setTimeout(r, 180));
          try { blob = await recHandle.stop(); } catch (e) { /* ignore */ }
          recHandle = null;
        }
        resolve({ said: said || '', blob: blob && blob.size > 200 ? blob : null, err: err || null });
      };
      (async () => {
        if (recordEnabled()) {
          try { recHandle = await startRecording(); } catch (e) { recHandle = null; }
        }
        const r = createRecognizer({
          lang: 'en-US',
          interim: true,
          onResult: ({ final, interim, done: finished }) => {
            hooks.onInterim && hooks.onInterim(final || interim || '');
            if (finished) done(final || interim, null);
          },
          onError: (err) => done('', err),
          onEnd: () => { /* ปิดงานผ่าน onResult(done) */ },
        });
        if (!r) return done('', 'unsupported');
        currentRecognizer = r;
        try {
          r.start();
          hooks.onStart && hooks.onStart();
        } catch (err) {
          done('', 'start-failed');
        }
      })();
    });
  }

  function stopListening() {
    if (currentRecognizer) {
      try { currentRecognizer.stop(); } catch (e) { /* ignore */ }
    }
  }

  /** เริ่มหนึ่งความพยายาม: อัดเสียง + ฟัง + ให้คะแนน */
  function startAttempt(target, mic, hint, lineKey, onScored) {
    if (recording) { stopListening(); return; }
    ensureMicPermission(async () => {
      mic.classList.add('rec');
      hint.textContent = recordEnabled() ? 'กำลังฟัง… พูดได้เลย (บันทึกเสียงไว้ให้ฟังย้อนหลังด้วย)' : 'กำลังฟัง… พูดได้เลย';
      statusEl.textContent = '…';
      recording = true;
      // เพดานเวลากันตาย: ต่อให้ไมค์/ตัวบันทึกเสียงค้าง UI ก็ต้องไม่ค้างตาม
      const { said, blob, err } = await Promise.race([
        listenOnce({ onInterim: (txt) => { statusEl.textContent = txt || '…'; } }),
        new Promise((resolve) => setTimeout(() => resolve({ said: '', blob: null, err: 'timeout' }), 12000)),
      ]);
      recording = false;
      mic.classList.remove('rec');
      if (err === 'timeout') {
        hint.textContent = 'หมดเวลา — กดไมค์แล้วลองพูดอีกครั้ง';
        return;
      }
      if (blob) lineBlobs.set(lineKey, blob);
      const hardErr = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network'];
      if (hardErr.includes(err)) {
        noStt = true;
        toast(sttErrorReason(err), 'err');
        hint.textContent = sttErrorReason(err);
        if (typeof renderAction === 'function') renderAction(d, line, i);
        return;
      }
      if (err === 'unsupported') { toast('เบราว์เซอร์นี้ไม่รองรับการฟังเสียง', 'err'); return; }
      if (!said) {
        hint.textContent = 'ไม่ได้ยินเสียง — ลองพูดอีกครั้งให้ดังขึ้นหน่อย';
        return;
      }
      onScored(said, blob);
    });
  }

  /** อัปเดตคะแนนบนบับเบิลให้ตรงกับผลล่าสุด (แก้บั๊กคะแนนค้าง) */
  function updateBubbleScore(i, score) {
    const b = bubbleBox?.querySelector(`.bubble[data-line="${i}"]`);
    if (!b) return;
    let badge = b.querySelector('.bubble-score');
    if (!badge) {
      badge = h('div', { class: 'bubble-score tiny', style: { marginTop: '4px', fontWeight: '800' } });
      b.appendChild(badge);
    }
    const ok = score >= threshold();
    badge.style.color = ok ? 'var(--success)' : 'var(--warn)';
    badge.textContent = ok ? `✓ พูดผ่าน ${score}%` : `พูดได้ ${score}% — ยังต้องฝึกอีกนิด`;
  }

  function evaluate(d, line, i, said, blob) {
    const key = `${d.id}:${i}`;
    const { marks, score } = alignWords(line.en, said);
    const sentEl = bubbleBox?.querySelector(`.bubble[data-line="${i}"] .bubble-en`);
    if (sentEl) {
      [...sentEl.querySelectorAll('.w')].forEach((s, k) => {
        s.classList.remove('ok', 'bad');
        if (k < marks.length) s.classList.add(marks[k] ? 'ok' : 'bad');
      });
    }
    const wrongWords = wrongWordsOf(line.en, marks);
    scores = scores.filter((s) => s.index !== i);
    scores.push({ index: i, score });
    lastScore.set(key, score);
    attempts.set(key, (attempts.get(key) || 0) + 1);
    store.bumpSpoken(1);
    updateBubbleScore(i, score);

    const ok = score >= threshold();
    store.gradeSentence(key, ok ? (score >= 92 ? 3 : 2) : 1);
    if (ok && blob) saveRecording({
      kind: 'dialogue', refId: key, label: line.en, blob,
      seconds: Math.max(1, Math.round(said.length / 12)),
    }).catch(() => {});

    renderResult(d, line, i, score, wrongWords, ok, blob);
  }

  /** แผงผลลัพธ์ + สอนออกเสียงคำที่ยังไม่ชัด + ประตู "พูดให้ผ่านก่อนไปต่อ" */
  function renderResult(d, line, i, score, wrongWords, ok, blob) {
    clear(actionBox);
    const key = `${d.id}:${i}`;
    const tried = attempts.get(key) || 1;

    actionBox.appendChild(h('div', { class: 'center' },
      h('div', { style: { fontSize: '1.9rem', fontWeight: '800', fontFamily: 'var(--font-en)' }, text: score + '%' }),
      h('div', { class: 'bold', text: ok ? 'ผ่าน! สื่อสารได้แล้ว 🎉' : score >= 45 ? 'ใกล้แล้ว — มาฝึกคำที่ยังไม่ชัดกัน 💪' : 'ยังไม่ชัด — ฟังต้นแบบช้าๆ แล้วลองใหม่ 🐢' }),
      h('div', { class: 'tiny muted', text: ok ? 'ประโยคนี้จะถูกถามห่างขึ้นในระบบทบทวน'
        : strictMode() ? `โหมดเข้ม: ต้องพูดให้ถึง ${threshold()}% ก่อนจึงจะไปประโยคถัดไปได้` : 'ประโยคนี้จะกลับมาถามอีกครั้งในระบบทบทวน' })));

    // ---- ฟังเสียงของคุณ เทียบกับต้นแบบ (A/B) ----
    const myBlob = blob || lineBlobs.get(key);
    if (myBlob) {
      actionBox.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '12px' } },
        h('button', {
          class: 'btn btn-ghost btn-block btn-sm', type: 'button',
          onclick: () => playBlob(myBlob, 1),
        }, '🔊 เสียงของคุณ'),
        h('button', {
          class: 'btn btn-ghost btn-block btn-sm', type: 'button',
          onclick: () => sayText(line.en, { rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender, audioKey: `${d.id}:${i}` }),
        }, '🔊 เสียงต้นแบบ')));
      actionBox.appendChild(h('div', { class: 'tiny muted center', style: { marginTop: '4px' },
        text: 'ฟังสลับไปมาเพื่อเทียบจังหวะและเสียง — หูของคุณคือครูที่ดีที่สุด' }));
    } else if (recordEnabled()) {
      actionBox.appendChild(h('div', { class: 'tiny muted center', style: { marginTop: '8px' },
        text: 'ครั้งนี้บันทึกเสียงไม่สำเร็จ (ไมค์อาจถูกแอปอื่นใช้อยู่) — ลองใหม่ได้' }));
    }

    // ---- สอนออกเสียงคำที่ยังไม่ชัด ----
    if (!ok && wrongWords.length) {
      actionBox.appendChild(h('div', { class: 'tiny muted', style: { margin: '12px 0 6px' }, text: 'คำที่ยังไม่ชัด — แตะเพื่อฟังช้าๆ และดูวิธีออกเสียง' }));
      const wrap = h('div', { class: 'keyvocab' });
      for (const w of wrongWords.slice(0, 6)) {
        const dict = lookupWord(w);
        wrap.appendChild(h('button', {
          class: 'kv', type: 'button',
          onclick: (e) => { e.stopPropagation(); teachWord(w, dict); },
        }, h('b', { text: w.replace(/[^A-Za-z0-9']/g, '') }), dict ? h('span', { text: dict.ipa }) : null));
      }
      actionBox.appendChild(wrap);
      actionBox.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } },
        h('button', {
          class: 'btn btn-primary btn-block btn-sm', type: 'button',
          onclick: () => wordDrill(d, line, i, wrongWords),
        }, '🔤 ฝึกทีละคำ (' + Math.min(wrongWords.length, 6) + ' คำ)')));
    }

    // ---- ปุ่มลองใหม่ / ไปต่อ ----
    const btnRow = h('div', { class: 'row', style: { gap: '8px', marginTop: '12px' } });
    btnRow.appendChild(h('button', {
      class: 'btn btn-ghost btn-block btn-sm', type: 'button',
      onclick: () => go(() => { idx = i; player(); }),
    }, icon('refresh', 16), ok ? 'พูดอีกครั้ง' : 'ลองอีกครั้ง'));
    if (ok) {
      btnRow.appendChild(h('button', {
        class: 'btn btn-primary btn-block btn-sm', type: 'button', onclick: () => next(d, i),
      }, 'ต่อไป →'));
    } else if (!strictMode() || tried >= 3) {
      btnRow.appendChild(h('button', {
        class: 'btn btn-ghost btn-block btn-sm', type: 'button', onclick: () => next(d, i),
      }, 'ข้ามไปก่อน (จะกลับมาทวน)'));
    } else {
      btnRow.appendChild(h('span', {
        class: 'btn btn-ghost btn-block btn-sm', style: { opacity: '.5', pointerEvents: 'none' },
        text: `พูดให้ถึง ${threshold()}% เพื่อไปต่อ (ลองแล้ว ${tried}/3)`,
      }));
    }
    actionBox.appendChild(btnRow);
    actionBox.appendChild(h('div', { class: 'tiny muted center', style: { marginTop: '10px' },
      text: 'ถ้าแอปฟังผิดทั้งที่คุณพูดถูก ให้กด "ลองอีกครั้ง" ได้เลย — ไม่มีคำว่าตก' }));
  }

  /** สอนออกเสียงคำเดียว: ฟังช้าๆ + IPA + คำแปล + ภาพ (ถ้ามีในคลังคำศัพท์) */
  function teachWord(token, dict) {
    const clean = token.replace(/[^A-Za-z0-9']/g, '');
    openSheet((close) => {
      const box = h('div', {});
      box.appendChild(sheetHeader(clean, dict ? dict.thai : 'ฟังช้าๆ แล้วพูดตาม', close));
      box.appendChild(h('div', { class: 'center', style: { padding: '6px 0 12px' } },
        h('div', { class: 'word-en en', style: { fontSize: '2.1rem' }, text: clean }),
        dict ? h('div', { class: 'word-ipa mono-ipa', text: dict.ipa }) : null));
      if (dict) box.appendChild(photoBox(dict, { showPhotos: S().showPhotos, class: 'dlg-photo' }));
      box.appendChild(h('div', { class: 'row row-wrap', style: { gap: '8px', justifyContent: 'center' } },
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => sayText(clean, { rate: 1, voiceURI: S().voiceURI, gender: S().voiceGender, audioKey: dict ? 'word:' + dict.id : null }) }, '🔊 ฟังช้าๆ (ปกติ)'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => sayText(clean, { rate: 0.55, voiceURI: S().voiceURI, gender: S().voiceGender }) }, '🐢 ช้ามาก'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => speakLetters(clean) }, '🔤 สะกดทีละตัว')));
      if (!dict) {
        box.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '12px' },
          text: 'คำนี้ยังไม่อยู่ในคลังคำศัพท์ของแอป จึงไม่มีรูปคำอ่าน — ฟังช้าๆ แล้วเลียนเสียงตามจังหวะ' }));
      }
      return box;
    });
  }

  function speakLetters(word) {
    const letters = word.toUpperCase().split('');
    let i2 = 0;
    const step = () => {
      if (i2 >= letters.length) return;
      const ch = letters[i2++];
      speak(ch === ' ' ? '' : ch, { rate: 0.8, gender: S().voiceGender, onEnd: () => setTimeout(step, 160) });
    };
    stopSpeaking();
    step();
  }

  /** ฝึกทีละคำ: ต้องพูดคำนั้นให้ผ่านก่อน แล้วจึงกลับไปพูดทั้งประโยค */
  function wordDrill(d, line, i, words) {
    const list = words.slice(0, 6);
    let wi = 0;
    const key = `${d.id}:${i}`;

    function step() {
      if (wi >= list.length) {
        clear(actionBox);
        actionBox.appendChild(h('div', { class: 'center' },
          h('div', { style: { fontSize: '2rem' }, text: '👍' }),
          h('div', { class: 'bold', text: 'ฝึกครบทุกคำแล้ว!' }),
          h('div', { class: 'small muted', text: 'ทีนี้พูดทั้งประโยคอีกครั้งให้ลื่นไหลกัน' })));
        actionBox.appendChild(h('button', {
          class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '12px' },
          onclick: () => go(() => { idx = i; player(); }),
        }, '🎤 พูดทั้งประโยคอีกครั้ง'));
        return;
      }
      const token = list[wi];
      const target = token.replace(/[^A-Za-z0-9']/g, '');
      const dict = lookupWord(token);
      clear(actionBox);
      actionBox.appendChild(h('div', { class: 'center' },
        h('div', { class: 'tiny muted', text: `ฝึกทีละคำ ${wi + 1}/${list.length}` }),
        h('div', { class: 'word-en en', style: { fontSize: '2rem', marginTop: '4px' }, text: target }),
        dict ? h('div', { class: 'word-ipa mono-ipa', text: dict.ipa }) : null,
        dict ? h('div', { class: 'small muted', text: dict.thai }) : null));

      const mic = h('button', { class: 'mic-btn', type: 'button', style: { width: '78px', height: '78px', fontSize: '1.7rem' } }, '🎤');
      const hint = h('div', { class: 'small muted center', style: { marginTop: '6px' }, text: 'กดไมค์แล้วพูดคำนี้' });
      const status = h('div', { class: 'transcript', style: { marginTop: '10px', text: '…' } });
      actionBox.appendChild(h('div', { style: { textAlign: 'center', marginTop: '10px' } }, mic));
      actionBox.appendChild(hint);
      actionBox.appendChild(status);
      actionBox.appendChild(h('div', { class: 'row row-wrap', style: { gap: '8px', marginTop: '10px', justifyContent: 'center' } },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => sayText(target, { rate: 0.6, voiceURI: S().voiceURI, gender: S().voiceGender, audioKey: dict ? 'word:' + dict.id : null }) }, '🐢 ฟังช้าๆ'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { wi += 1; step(); } }, '⏭ ข้ามคำนี้')));

      mic.onclick = () => {
        if (recording) { stopListening(); return; }
        ensureMicPermission(async () => {
          mic.classList.add('rec');
          status.textContent = '…';
          recording = true;
          const { said, blob, err } = await listenOnce({ onInterim: (t) => { status.textContent = t || '…'; } });
          recording = false;
          mic.classList.remove('rec');
          if (err || !said) { hint.textContent = err ? 'ไมค์มีปัญหา: ' + err : 'ไม่ได้ยินเสียง — ลองอีกครั้ง'; return; }
          const r = alignWords(target, said);
          clear(actionBox);
          const pass = r.score >= threshold();
          if (pass) {
            store.bumpSpoken(1);
            if (blob) saveRecording({ kind: 'word', refId: `${key}:${target}`, label: target, blob, seconds: 2 }).catch(() => {});
          }
          actionBox.appendChild(h('div', { class: 'center' },
            h('div', { style: { fontSize: '1.7rem', fontWeight: '800', fontFamily: 'var(--font-en)' }, text: r.score + '%' }),
            h('div', { class: 'bold', text: pass ? 'ชัดแล้ว! 👏' : 'ลองอีกครั้ง — ฟังช้าๆ ก่อนนะ' }),
            h('div', { class: 'small muted', text: `${target}${dict ? ' · ' + dict.ipa : ''}` })));
          const sentEl2 = h('div', { class: 'bubble-en center', style: { marginTop: '6px' } });
          renderSentence(sentEl2, target);
          [...sentEl2.querySelectorAll('.w')].forEach((s, k) => {
            if (k < r.marks.length) s.classList.add(r.marks[k] ? 'ok' : 'bad');
          });
          actionBox.appendChild(sentEl2);
          actionBox.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '12px' } },
            h('button', { class: 'btn btn-ghost btn-block btn-sm', type: 'button', onclick: () => step() }, pass ? 'คำถัดไป →' : 'ลองคำนี้อีกครั้ง'),
            blob ? h('button', { class: 'btn btn-ghost btn-block btn-sm', type: 'button', onclick: () => playBlob(blob, 1) }, '🔊 เสียงของคุณ') : null));
          if (pass) wi += 1;
        });
      };
    }
    step();
  }

  function next(d, i) {
    idx = i + 1;
    store.saveDialogueProgress(d.id, { lineIndex: Math.min(idx, d.lines.length) });
    if (idx >= d.lines.length) {
      store.saveDialogueProgress(d.id, { completed: true, plays: store.dialogueProgress(d.id).plays + 1, bestScore: Math.max(...scores.map((s) => s.score), 0) });
      store.bumpDialogue();
      go(() => summary(d));
      return;
    }
    go(player);
  }

  function summary(d) {
    mount(root);
    const avg = scores.length ? Math.round(scores.reduce((n, s) => n + s.score, 0) / scores.length) : 0;
    const passed = scores.filter((s) => s.score >= threshold()).length;
    root.appendChild(h('div', { class: 'card center' },
      mascot('celebrate', 104),
      h('div', { class: 'bold', style: { fontSize: '1.15rem' }, text: 'จบสถานการณ์แล้ว!' }),
      h('div', { class: 'small muted', text: d.title }),
      h('div', { class: 'stat-grid', style: { marginTop: '14px' } },
        h('div', { class: 'stat' }, h('b', { text: String(scores.length) }), h('span', { text: 'ประโยคที่พูด' })),
        h('div', { class: 'stat' }, h('b', { text: String(passed) }), h('span', { text: 'พูดผ่าน' })),
        h('div', { class: 'stat' }, h('b', { text: avg + '%' }), h('span', { text: 'คะแนนเฉลี่ย' })))));

    if (d.usefulPhrases?.length) {
      root.appendChild(h('div', { class: 'section-title', text: 'วลีที่เจอในสถานการณ์นี้' }));
      const card = h('div', { class: 'card' });
      const kv = h('div', { class: 'keyvocab' });
      for (const p of d.usefulPhrases) {
        kv.appendChild(h('button', { class: 'kv', type: 'button', onclick: () => say(p.en) },
          h('b', { text: p.en }), h('span', { text: p.thai })));
      }
      card.appendChild(kv);
      root.appendChild(card);
    }

    root.appendChild(h('div', { class: 'row', style: { gap: '10px', marginTop: '14px' } },
      h('button', {
        class: 'btn btn-primary btn-block', type: 'button',
        onclick: () => go(() => { myRole = myRole === 'me' ? 'staff' : 'me'; idx = 0; scores = []; player(); }),
      }, icon('shuffle', 18), 'สลับบท'),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => go(list) }, 'สถานการณ์อื่น')));

    root.appendChild(h('div', { class: 'small muted center', style: { marginTop: '12px' },
      text: 'ลองสลับบทดู — คุณจะได้พูดอีกฝั่ง ซึ่งมักเป็นประโยคที่คนอื่นพูดกับเรา' }));
    return () => {};
  }

  if (dlgId && getDialogue(dlgId)) {
    const p = store.dialogueProgress(dlgId);
    idx = Math.min(p.lineIndex || 0, (getDialogue(dlgId).lines.length - 1));
    player();
  } else {
    list();
  }
  return destroy;
}

/* ================================================================== *
 * ทบทวนประโยคที่พูดไม่ได้ (SRS ระดับประโยค)
 * ================================================================== */

export function sentenceReview(root) {
  let keys = [];
  let i = 0;

  function destroy() { stopSpeaking(); }
  const go = (fn) => { destroy(); fn(); };

  function home() {
    mount(root);
    const due = store.dueSentences(30);
    root.appendChild(h('div', { class: 'card center' },
      h('div', { style: { fontSize: '2.6rem' }, text: due.length ? '🔁' : '✅' }),
      h('div', { class: 'bold', text: due.length ? `มี ${due.length} ประโยคที่ต้องทวน` : 'ไม่มีประโยคค้างทบทวน' }),
      h('div', { class: 'small muted', text: due.length ? 'ประโยคเหล่านี้คุณพูดไม่ผ่าน หรือพูดได้เมื่อนานมาแล้ว' : 'ไปฝึกบทสนทนาเพิ่มเพื่อให้มีประโยคเข้ามาในคิว' })));
    root.appendChild(h('button', {
      class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '14px' },
      disabled: !due.length, onclick: () => go(() => { keys = due; i = 0; play(); }),
    }, 'เริ่มทบทวนประโยค'));
    return () => {};
  }

  function findLine(key) {
    const [dlgId, lineIdx] = key.split(':');
    const d = getDialogue(dlgId);
    if (!d) return null;
    const line = d.lines[Number(lineIdx)];
    return line ? { d, line, idx: Number(lineIdx) } : null;
  }

  function play() {
    mount(root);
    if (i >= keys.length) {
      root.appendChild(h('div', { class: 'card center' },
        h('div', { style: { fontSize: '3rem' }, text: '🎉' }),
        h('div', { class: 'bold', text: 'ทบทวนประโยคครบแล้ว!' })));
      root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '14px' }, onclick: () => go(home) }, 'กลับ'));
      return () => {};
    }
    const found = findLine(keys[i]);
    if (!found) { i++; return play(); }
    const { d, line } = found;

    root.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => go(home) }, '← ออก'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'small muted', text: `${i + 1}/${keys.length}` })));
    root.appendChild(progressBar(i, keys.length));

    const card = h('div', { class: 'card', style: { marginTop: '12px' } });
    card.appendChild(h('div', { class: 'tiny muted', text: `${d.emoji || '💬'} ${d.title}` }));
    const sent = h('div', { class: 'bubble-en', style: { fontSize: '1.2rem', marginTop: '6px' } });
    renderSentence(sent, line.en);
    card.appendChild(sent);
    card.appendChild(h('div', { class: 'bubble-th', text: line.thai }));
    root.appendChild(card);

    root.appendChild(h('button', {
      class: 'btn btn-ghost btn-block', type: 'button', style: { marginTop: '12px' },
      onclick: () => sayText(line.en, { rate: S().rate, voiceURI: S().voiceURI, gender: S().voiceGender, audioKey: `${d.id}:${found.idx}` }),
    }, icon('sound', 18), 'ฟังต้นแบบ'));

    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '12px' } });
    for (const g of [{ g: 0, label: 'พูดไม่ได้', cls: 'btn-danger' }, { g: 1, label: 'ยังติด ๆ', cls: 'btn-ghost' },
      { g: 2, label: 'พูดได้', cls: 'btn-ghost' }, { g: 3, label: 'คล่องแล้ว', cls: 'btn-success' }]) {
      const nextCard = store.simulateSentence(keys[i], g.g);
      grid.appendChild(h('button', {
        class: `btn ${g.cls}`, type: 'button',
        onclick: () => {
          store.gradeSentence(keys[i], g.g);
          if (g.g <= 1) keys.push(keys[i]);
          i++;
          toast(g.g <= 1 ? 'จะถามซ้ำในรอบนี้' : 'ทบทวนครั้งหน้า ' + fmtInterval(nextCard.interval), g.g <= 1 ? '' : 'ok', 1400);
          go(play);
        },
      }, h('div', {}, h('div', { text: g.label }), h('div', { class: 'tiny', style: { opacity: '.8' }, text: fmtInterval(nextCard.interval) }))));
    }
    root.appendChild(grid);
    return () => {};
  }

  return home();
}

/* ================================================================== *
 * พูดคนเดียว 60 วินาที (One-minute monologue)
 *
 * ทำไมโหมดนี้สำคัญ: เป็นการ "ผลิตภาษาเอง" โดยไม่มีบทให้อ่าน
 * หัวข้อสร้างจากคำที่ผู้ใช้ยังไม่แม่น (SRS) จึงเป็นการฝึกเฉพาะบุคคลโดยไม่ต้องใช้ AI
 * ผู้ใช้ได้ฟังเสียงตัวเองย้อนหลัง → เห็นพัฒนาการของตัวเอง (แรงจูงใจที่แรงที่สุด)
 * ================================================================== */

const ONEMIN_SECONDS = 60;

const ONEMIN_PROMPTS = {
  food: ['เล่าเรื่องมื้ออาหารที่คุณชอบที่สุด', 'อธิบายเมนูที่คุณทำเองได้', 'เล่าร้านอาหารที่คุณไปครั้งล่าสุด'],
  restaurant: ['เล่าการสั่งอาหารครั้งล่าสุดของคุณ', 'อธิบายร้านอาหารที่คุณอยากลอง'],
  travel: ['เล่าการเดินทางที่คุณชอบที่สุด', 'อธิบายวิธีเดินทางไปสถานที่หนึ่งให้เพื่อนฟัง'],
  home: ['เล่าบ้านหรือห้องที่คุณอยู่ทุกวัน', 'อธิบายบ้านในฝันของคุณ'],
  shopping: ['เล่าการซื้อของที่คุณประทับใจ', 'อธิบายวิธีที่คุณเลือกซื้อของ'],
  health: ['เล่าครั้งล่าสุดที่คุณรู้สึกไม่สบาย', 'อธิบายวิธีดูแลสุขภาพของคุณ'],
  work: ['เล่างานหรือสิ่งที่คุณทำทุกวัน', 'อธิบายวันทำงานปกติของคุณ'],
  feelings: ['เล่าวันที่คุณรู้สึกภูมิใจ', 'อธิบายนิสัยของเพื่อนสนิทของคุณ'],
};

/** เลือกคำที่ผู้ใช้ "ยังไม่แม่น" (ไม่เคยทบทวน / ease ต่ำ / ตอบผิดบ่อย) */
function pickFocusWords(n = 3) {
  const scored = db.words.map((w) => {
    const s = store.srsOf(w.id);
    const st = store.statOf(w.id);
    let score = 0;
    if (s.reps === 0) score += 90;           // ยังไม่เคยทบทวน
    if (!st.seen) score += 50;               // ไม่เคยเห็น
    score += Math.round((2.6 - (s.ease || 2.5)) * 80);
    score += (s.lapses || 0) * 30;
    score += (st.wrong || 0) * 15;
    return { w, score };
  }).sort((a, b) => b.score - a.score);
  const picked = shuffle(scored.slice(0, 14)).slice(0, n).map((x) => x.w);
  if (picked.length < n) picked.push(...sample(db.words, n - picked.length));
  return picked;
}

function newTopic() {
  const words = pickFocusWords(3);
  const catId = words[0] ? words[0].category : 'food';
  const list = ONEMIN_PROMPTS[catId] || ONEMIN_PROMPTS.food;
  return {
    words,
    category: catId,
    prompt: list[Math.floor(Math.random() * list.length)],
  };
}

const RING_R = 62;
const RING_C = Math.round(2 * Math.PI * RING_R);

export function oneMinute(root) {
  let phase = 'idle';         // idle | recording | review
  let handle = null;
  let timerId = null;
  let remaining = ONEMIN_SECONDS;
  let startedAt = 0;
  let current = newTopic();
  let lastBlob = null;
  let lastId = null;
  let lastSeconds = 0;
  let lastRating = 0;
  let ringEl = null;
  let clockEl = null;
  let historyEl = null;
  let alive = true;

  function destroy() {
    alive = false;
    clearInterval(timerId); timerId = null;
    if (handle) { try { handle.stop(); } catch (e) { /* ignore */ } handle = null; }
    stopPlayback();
  }

  /* ---------- ตัวจับเวลา ---------- */
  function tick() {
    if (!alive) return;
    remaining = Math.max(0, ONEMIN_SECONDS - (Date.now() - startedAt) / 1000);
    patchTimer();
    if (remaining <= 0) stopRecording();
  }

  function patchTimer() {
    if (clockEl) clockEl.textContent = remaining >= 59.5 ? '60' : String(Math.ceil(remaining));
    if (ringEl) {
      const pct = 1 - remaining / ONEMIN_SECONDS;
      ringEl.setAttribute('stroke-dashoffset', String(Math.round(RING_C * (1 - pct))));
    }
  }

  async function startRecordingNow() {
    if (!recordingSupported()) { toast('เบราว์เซอร์นี้บันทึกเสียงไม่ได้', 'err'); return; }
    ensureMicPermission(async () => {
      phase = 'recording';
      remaining = ONEMIN_SECONDS;
      render();
      handle = await startRecording();
      if (!handle) { phase = 'idle'; render(); toast('เริ่มอัดไม่สำเร็จ — ตรวจสิทธิ์ไมโครโฟน', 'err'); return; }
      startedAt = Date.now();
      timerId = setInterval(tick, 200);
      tick();
    });
  }

  async function stopRecording() {
    clearInterval(timerId); timerId = null;
    if (!handle) return;
    const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const blob = await handle.stop();
    handle = null;
    if (!blob) { phase = 'idle'; render(); toast('ไม่ได้ยินเสียง ลองอีกครั้ง', 'err'); return; }
    lastBlob = blob;
    lastSeconds = secs;
    lastRating = 0;
    store.addSecondsSpoken(secs);
    store.bumpSpoken(1);
    lastId = await saveRecording({
      kind: 'onemin',
      refId: current.category,
      label: current.prompt,
      blob,
      seconds: secs,
      selfRating: 0,
    });
    phase = 'review';
    render();
    loadHistory();
    toast('บันทึกเสียงแล้ว ' + secs + ' วินาที', 'ok');
  }

  async function rate(n) {
    lastRating = n;
    store.addSelfRating(n);
    if (lastId) await updateRecording(lastId, { selfRating: n });
    render();
    loadHistory();
    if (n >= 4) toast('เยี่ยม! ครั้งหน้าลองเพิ่มรายละเอียดอีกนิด', 'ok');
  }

  async function loadHistory() {
    if (!historyEl || !alive) return;
    const list = (await listRecordings('onemin')).slice(0, 8);
    if (!alive) return;
    clear(historyEl);
    if (!list.length) {
      historyEl.appendChild(h('div', { class: 'tiny muted center', style: { padding: '10px 0' },
        text: 'ยังไม่มีคลิป — อัดคลิปแรกได้เลย!' }));
      return;
    }
    for (const r of list) {
      const d = new Date(r.createdAt);
      const dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      const stars = r.selfRating ? '★'.repeat(r.selfRating) + '☆'.repeat(5 - r.selfRating) : '☆☆☆☆☆';
      historyEl.appendChild(h('div', { class: 'list-item', style: { padding: '10px 12px' } },
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', style: { width: '44px', minHeight: '40px', padding: 0 },
          onclick: () => playBlob(r.blob, 1),
        }, '🔊'),
        h('div', { class: 'lt' },
          h('b', { style: { fontSize: '.86rem', fontFamily: 'var(--font)' }, text: dateStr + ' · ' + r.seconds + ' วิ' }),
          h('div', { text: (r.label || '').slice(0, 34) })),
        h('span', { class: 'tiny', style: { color: 'var(--warn)', whiteSpace: 'nowrap' }, text: stars }),
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': 'ลบคลิป',
          onclick: async () => { await deleteRecording(r.id); loadHistory(); toast('ลบคลิปแล้ว'); },
        }, icon('close', 16))));
    }
  }

  /* ---------- หน้าจอ ---------- */
  function render() {
    mount(root);

    root.appendChild(h('div', { class: 'row', style: { alignItems: 'center', marginBottom: '10px' } },
      h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => { location.hash = '#/speaking'; },
      }, '← ออก'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'pill', text: ONEMIN_SECONDS + ' วินาที' })));

    // หัวข้อ
    root.appendChild(h('div', {
      class: 'card',
      style: {
        background: 'linear-gradient(150deg, color-mix(in srgb, var(--primary) 88%, #000 4%), color-mix(in srgb, var(--primary) 45%, #ec4899))',
        color: '#fff', border: '0',
      },
    },
    h('div', { class: 'tiny', style: { opacity: '.85', letterSpacing: '.06em' }, text: 'หัวข้อวันนี้' }),
    h('div', { class: 'bold', style: { fontSize: '1.18rem', marginTop: '2px' }, text: current.prompt }),
    h('div', { class: 'tiny', style: { opacity: '.85', marginTop: '8px' }, text: 'ลองใช้คำเหล่านี้ (แตะเพื่อฟัง)' }),
    (() => {
      const wrap = h('div', { class: 'keyvocab', style: { marginTop: '6px' } });
      for (const w of current.words) {
        wrap.appendChild(h('button', {
          class: 'kv', type: 'button',
          style: { background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.28)', color: '#fff' },
          onclick: () => say(w.word, { audioKey: 'word:' + w.id }),
        }, h('b', { text: w.word }), h('span', { style: { color: 'rgba(255,255,255,.8)' }, text: w.thai })));
      }
      return wrap;
    })()));

    if (phase === 'recording') {
      const card = h('div', { class: 'card center', style: { marginTop: '12px' } });
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 150 150');
      svg.setAttribute('width', '170');
      svg.setAttribute('height', '170');
      const bg = document.createElementNS(svgNS, 'circle');
      bg.setAttribute('cx', '75'); bg.setAttribute('cy', '75'); bg.setAttribute('r', String(RING_R));
      bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'var(--border)'); bg.setAttribute('stroke-width', '10');
      const fg = document.createElementNS(svgNS, 'circle');
      fg.setAttribute('cx', '75'); fg.setAttribute('cy', '75'); fg.setAttribute('r', String(RING_R));
      fg.setAttribute('fill', 'none'); fg.setAttribute('stroke', 'var(--primary)');
      fg.setAttribute('stroke-width', '10'); fg.setAttribute('stroke-linecap', 'round');
      fg.setAttribute('stroke-dasharray', String(RING_C));
      fg.setAttribute('stroke-dashoffset', '0');
      fg.setAttribute('transform', 'rotate(-90 75 75)');
      svg.appendChild(bg); svg.appendChild(fg);
      ringEl = fg;
      clockEl = h('div', {
        style: {
          position: 'absolute', fontFamily: 'var(--font-en)', fontSize: '2.2rem', fontWeight: '800',
        },
        text: '60',
      });
      card.appendChild(h('div', { style: { position: 'relative', display: 'grid', placeItems: 'center' } }, svg, clockEl));
      card.appendChild(h('div', { class: 'small muted', style: { marginTop: '-6px' }, text: 'กำลังอัดเสียง — พูดต่อเนื่องได้เลย' }));
      root.appendChild(card);

      root.appendChild(h('div', { style: { marginTop: '12px' } },
        h('button', { class: 'btn btn-danger btn-block', type: 'button', onclick: () => stopRecording() },
          '⏹ หยุด & ฟังเสียงตัวเอง')));
      root.appendChild(h('div', { class: 'tiny muted center', style: { marginTop: '8px' },
        text: 'ไม่ต้องกลัวผิด — ไม่มีใครฟังนอกจากตัวคุณ' }));
    } else if (phase === 'review') {
      const card = h('div', { class: 'card', style: { marginTop: '12px' } });
      card.appendChild(h('div', { class: 'center' },
        h('div', { style: { fontSize: '1.6rem' }, text: '🎙️' }),
        h('div', { class: 'bold', text: 'อัดเสร็จแล้ว · ' + lastSeconds + ' วินาที' }),
        h('div', { class: 'tiny muted', text: 'ฟังย้อนหลังแล้วให้คะแนนตัวเอง' })));
      card.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } },
        h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => lastBlob && playBlob(lastBlob, 1) }, '🔊 ฟังเสียงฉัน')));
      const stars = h('div', { class: 'row', style: { gap: '6px', justifyContent: 'center', marginTop: '10px' } });
      for (let n = 1; n <= 5; n++) {
        stars.appendChild(h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': 'ให้ ' + n + ' ดาว',
          style: { fontSize: '1.5rem', color: n <= lastRating ? 'var(--warn)' : 'var(--text-soft)' },
          onclick: () => rate(n),
        }, n <= lastRating ? '★' : '☆'));
      }
      card.appendChild(stars);
      card.appendChild(h('div', { class: 'tiny muted center', style: { marginTop: '4px' },
        text: 'ความคล่องเป็นเรื่องของ "การฝึกซ้ำ" ไม่ใช่ "ความสามารถ"' }));
      root.appendChild(card);

      root.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '12px' } },
        h('button', {
          class: 'btn btn-ghost btn-block', type: 'button',
          onclick: () => { phase = 'idle'; current = newTopic(); render(); loadHistory(); },
        }, 'หัวข้อใหม่'),
        h('button', {
          class: 'btn btn-primary btn-block', type: 'button',
          onclick: () => { phase = 'idle'; render(); },
        }, 'อัดอีกรอบ')));
    } else {
      root.appendChild(h('div', { class: 'card center', style: { marginTop: '12px' } },
        h('div', { style: { fontSize: '2.6rem' }, text: '🎤' }),
        h('div', { class: 'bold', style: { fontSize: '1.05rem' }, text: 'พูดต่อเนื่อง 60 วินาที' }),
        h('div', { class: 'small muted', style: { marginTop: '4px' },
          text: 'พูดเรื่องในหัวข้อข้างบนให้ได้ 1 นาที ไม่ต้องเป๊ะ ไม่ต้องกลัวผิด — เป้าหมายคือ "พูดได้โดยไม่หยุด"' })));
      root.appendChild(h('div', { style: { marginTop: '12px' } },
        h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => startRecordingNow() },
          '🎤 เริ่มอัด 60 วินาที')));
      if (!recordingSupported()) {
        root.appendChild(h('div', { class: 'tiny muted center', style: { marginTop: '8px' },
          text: '⚠️ เบราว์เซอร์นี้บันทึกเสียงไม่ได้ — ลอง Chrome/Safari รุ่นใหม่' }));
      }
    }

    root.appendChild(h('div', { class: 'section-title', text: 'เสียงของฉัน' }));
    historyEl = h('div', {});
    root.appendChild(historyEl);
    loadHistory();

    return () => {};
  }

  render();
  return destroy;
}