/* views-session.js — หน้าฝึกบทเรียนแบบเกม */
import { h, mount, icon, btn3d, bar, confetti, toast } from './ui2.js';
import { mascot, mascotReact } from './mascot2.js';
import { db, loadAll, normalizeEn } from './data.js';
import { buildSession } from './session.js';
import * as pg from './progress2.js';
import { sayText, stopSpeaking, sttSupported, alignWords, loadAudioManifest } from './speech.js';
import { listenOnce, stopListeningOnce } from './listen-once.js';
import { sfxCorrect, sfxWrong, sfxTap, sfxComplete } from './sfx.js';
import { startRecording, playBlob } from './recorder.js';
import { loadPath } from './views-path.js';
import * as store from './store.js';

function pathEntry(path, id) { return pg.flatten(path).find((entry) => entry.lesson.id === id) || null; }
function nextLesson(path, id) {
  const entries = pg.flatten(path);
  const index = entries.findIndex((entry) => entry.lesson.id === id);
  return index >= 0 ? entries[index + 1] || null : null;
}
function rememberReview(lessonId, item) {
  try {
    const key = 'pangpood-v2.review';
    const rows = JSON.parse(localStorage.getItem(key) || '[]');
    if (!rows.some((row) => row.lessonId === lessonId && row.itemId === item.id)) rows.push({ lessonId, itemId: item.id, entityId: item.entityId, type: item.type, answer: item.answer, item, at: Date.now() });
    if (rows.length > 50) rows.splice(0, rows.length - 50);
    localStorage.setItem(key, JSON.stringify(rows));
  } catch (err) { /* พื้นที่จัดเก็บอาจเต็ม */ }
}
function correctAnswer(item) {
  if (item.type === 'chunk-order' || item.type === 'chunk-type') return item.answer;
  return item.answer;
}

export async function sessionView(root, lessonId, { review = false, reviewItems = [], reviewWords = [] } = {}) {
  const path = review ? null : await loadPath();
  const entry = review ? { lesson: { id: 'review', title: 'ทบทวนคำที่พลาด' } } : pathEntry(path, lessonId);
  if (!entry) { mount(root, h('div', { class: 'card', text: 'ไม่พบบทเรียนนี้' })); return () => {}; }
  await loadAll();
  let lesson = entry.lesson;
  if (review) {
    const due = reviewWords.length ? reviewWords : store.dueWords(db.words, 10);
    let words = due;
    if (!words.length) {
      let rows = [];
      try { rows = JSON.parse(localStorage.getItem('pangpood-v2.review') || '[]'); } catch { rows = []; }
      const ids = [...new Set(rows.map((row) => row.entityId).filter((id) => db.byId.has(id)))].slice(0, 10);
      words = ids.map((id) => db.byId.get(id));
    }
    lesson = { ...entry.lesson, words: words.map((word) => word.id), chunks: [] };
  }
  const items = reviewItems.length ? reviewItems.slice(0, 10) : await buildSession(lesson, { size: 10, stt: false });
  if (!items.length) { mount(root, h('div', { class: 'card', text: 'บทนี้ยังไม่มีแบบฝึกให้เล่น' })); return () => {}; }

  document.body.classList.add('in-session');
  const next = review ? null : nextLesson(path, lessonId);
  const state = { index: 0, firstCorrect: 0, finalCorrect: 0, xp: 0, retried: new Set(), selected: null, built: [], listening: false, done: false, streak: 0, sleeping: false, hintsUsed: 0 };
  const timers = new Set();
  let autoTimer = null;
  let idleTimer = null;
  let disposed = false;
  const schedule = (fn, ms) => {
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed) fn(); }, ms);
    timers.add(timer);
    return timer;
  };
  const clearScheduled = (timer) => { clearTimeout(timer); timers.delete(timer); };
  let summaryFrame = null;
  const top = h('div', { class: 'session-top' });
  const content = h('div', { class: 'session-content' });
  const questionHost = h('div', { class: 'session-question' });
  const mascotEl = mascot('idle', 84);
  mascotEl.setAttribute('aria-hidden', 'true');
  mascotEl.classList.add('session-mascot');
  const sleepHint = h('div', { class: 'session-sleep-hint muted small', hidden: true, text: 'พังหลับแล้ว… แตะเพื่อไปต่อ' });
  const shell = h('section', { class: 'session' }, top,
    h('div', { class: 'session-track' }, bar(0)),
    h('div', { class: 'session-body' }, content),
    h('div', { class: 'session-foot' }, questionHost));
  mount(root, shell);
  shell.addEventListener('click', (event) => {
    if (event.target.closest('button')) sfxTap();
  }, true);
  const wake = () => {
    if (state.done) return;
    if (state.sleeping) { state.sleeping = false; mascotReact(mascotEl, 'idle', 1); sleepHint.hidden = true; }
    clearScheduled(idleTimer);
    idleTimer = schedule(() => {
      if (state.done) return;
      state.sleeping = true;
      mascotReact(mascotEl, 'sleep', 60 * 60 * 1000);
      sleepHint.hidden = false;
    }, 18000);
  };
  shell.addEventListener('pointerdown', wake);
  shell.addEventListener('keydown', wake);

  const play = async (item) => {
    if (!item.audioText) return;
    stopSpeaking();
    await loadAudioManifest().catch(() => {});   // กันกรณีแตะเร็วเกินกว่า manifest จะโหลดเสร็จ
    sayText(item.audioText, { audioKey: item.audioKey, gender: 'female' });
  };
  const updateTop = () => {
    const item = items[state.index];
    mount(top,
      h('button', { class: 'session-exit', type: 'button', 'aria-label': 'ออกจากบทเรียน', onclick: confirmExit }, '✕'),
      h('div', { class: 'session-title', text: entry.lesson.title }),
      h('span', { class: 'session-count', text: `${state.index + 1}/${items.length}` }));
    shell.querySelector('.bar-fill').style.width = `${Math.round((state.index / items.length) * 100)}%`;
  };
  const selectAnswer = (value, button) => {
    state.selected = value;
    questionHost.querySelectorAll('.answer').forEach((el) => el.classList.remove('selected'));
    button.classList.add('selected');
    const check = questionHost.querySelector('.session-check');
    if (check) check.disabled = false;
  };
  const optionButtons = (item) => h('div', { class: 'answers' }, ...item.options.map((option) => {
    const button = h('button', { class: 'answer', type: 'button', onclick: () => selectAnswer(option, button) }, h('span', { text: option }));
    return button;
  }));
  const renderQuestion = () => {
    if (state.index >= items.length) return finish();
    state.selected = null;
    state.built = [];
    state.listening = false;
    const item = items[state.index];
    updateTop();
    const kicker = h('div', { class: 'bubble-kicker' });
    const target = h('div', { class: 'bubble-target' });
    const audioButton = item.audioText ? h('button', { class: 'listen-again', type: 'button', onclick: () => play(item), 'aria-label': 'ฟังซ้ำ' }, icon('sound', 22), h('span', { text: 'ฟังซ้ำ' })) : null;
    if (item.type === 'word-en-th') { kicker.textContent = 'เลือกความหมายภาษาไทย'; target.textContent = item.prompt; target.classList.add('en'); }
    else if (item.type === 'word-th-en') { kicker.textContent = 'คำภาษาอังกฤษคือคำใด'; target.textContent = item.prompt; }
    else if (item.type === 'word-listen') { kicker.textContent = 'ฟังแล้วเลือกคำศัพท์'; target.classList.add('bubble-sound-icon'); target.appendChild(icon('sound', 46)); }
    else if (item.type === 'chunk-order') { kicker.textContent = 'เรียงชิปให้เป็นประโยคภาษาอังกฤษ'; target.textContent = item.prompt; }
    else if (item.type === 'chunk-type') { kicker.textContent = 'ฟังแล้วพิมพ์ตาม'; target.classList.add('bubble-sound-icon'); target.appendChild(icon('sound', 46)); }
    else if (item.type === 'chunk-meaning') { kicker.textContent = 'เลือกความหมายภาษาไทย'; target.textContent = item.prompt; target.classList.add('en'); }
    else if (item.type === 'line-listen' || (item.type === 'dialog-line' && item.mode === 'meaning')) { kicker.textContent = 'ฟังแล้วเลือกความหมาย'; target.classList.add('bubble-sound-icon'); target.appendChild(icon('sound', 46)); }
    else if (item.type === 'listen-question' || (item.type === 'dialog-line' && item.mode === 'english')) { kicker.textContent = item.prompt; target.classList.add('bubble-sound-icon'); target.appendChild(icon('sound', 46)); }
    else { kicker.textContent = 'พูดตามคำนี้'; target.textContent = item.prompt; target.classList.add('en'); }
    const bubble = h('div', { class: 'bubble' }, kicker, target, audioButton);
    const parts = [mascotEl, bubble];
    if (['word-en-th', 'word-th-en', 'word-listen', 'chunk-meaning', 'line-listen', 'listen-question', 'dialog-line'].includes(item.type)) parts.push(optionButtons(item));
    if (item.type === 'chunk-order') {
      const built = h('div', { class: 'built-sentence', 'aria-label': 'คำที่เลือกแล้ว แตะคำเพื่อคืนลงคลัง' });
      const count = h('div', { class: 'muted small', text: `0/${item.tiles.length} คำ` });
      const chips = h('div', { class: 'tile-bank' });
      const buildBank = () => {
        mount(chips, ...item.tiles.map((word, i) => state.built.some((x) => x.i === i) ? null : h('button', { class: 'chip-btn tile', type: 'button', onclick: () => { state.built.push({ word, i }); updateOrder(); } }, word)));
      };
      const updateOrder = () => {
        mount(built, ...(state.built.length ? state.built.map((x, index) => h('button', { class: 'chip-btn tile built-tile', type: 'button', text: x.word, 'aria-label': `คืนคำ ${x.word} ลงคลังคำ`, onclick: () => { state.built.splice(index, 1); updateOrder(); } })) : [h('span', { text: 'แตะคำด้านล่างเพื่อเรียงประโยค' })]));
        count.textContent = `${state.built.length}/${item.tiles.length} คำ`;
        state.selected = state.built.length ? state.built.map((x) => x.word).join(' ') : null;
        const check = questionHost.querySelector('.session-check');
        if (check) check.disabled = !state.selected;
        clearAll.disabled = !state.built.length;
        buildBank();
      };
      const clearAll = h('button', { class: 'chip-btn', type: 'button', text: '🗑 ล้างทั้งหมด', 'aria-label': 'คืนคำทั้งหมดลงคลัง', disabled: true, onclick: () => { sfxTap(); state.built = []; updateOrder(); } });
      buildBank();
      parts.push(count, built, chips, clearAll);
    }
    if (item.type === 'chunk-type') {
      const input = h('input', { class: 'session-input', type: 'text', autocomplete: 'off', placeholder: 'พิมพ์ประโยคภาษาอังกฤษ' });
      const toolRow = h('div', { class: 'drill-actions type-tools' });
      const refreshCheck = () => { state.selected = input.value.trim() || null; const check = questionHost.querySelector('.session-check'); if (check) check.disabled = !state.selected; };
      input.addEventListener('input', refreshCheck);
      const updateTyped = (value) => { input.value = value; refreshCheck(); };
      toolRow.append(
        h('button', { class: 'chip-btn', type: 'button', text: '💡 ใบ้', 'aria-label': 'ใบ้คำถัดไป', onclick: () => { const typed = normalizeEn(input.value).split(' ').filter(Boolean); const next = normalizeEn(item.answer).split(' ').filter(Boolean)[typed.length]; if (next) { state.hintsUsed++; updateTyped(`${input.value.trimEnd()}${input.value.trim() ? ' ' : ''}${next} `); } } }),
        h('button', { class: 'chip-btn', type: 'button', text: '↩︎ ย้อนคำ', 'aria-label': 'ลบคำสุดท้าย', onclick: () => { const typed = input.value.trimEnd().split(/\s+/); typed.pop(); updateTyped(typed.join(' ')); } }),
        h('button', { class: 'chip-btn', type: 'button', text: '🗑 ล้าง', 'aria-label': 'ล้างข้อความทั้งหมด', onclick: () => updateTyped('') }));
      parts.push(input, toolRow);
    }
    if (item.type === 'speak-word') {
      const result = h('div', { class: 'session-stt muted', text: 'แตะปุ่มไมค์แล้วพูดตาม' });
      const fallback = h('div', { class: 'self-record', hidden: true });
      let manualRecording = null;
      let recordedBlob = null;
      const enableSelfMode = (reason) => {
        result.textContent = `${reason} · เปลี่ยนเป็นอัดเสียงแล้วฟังเทียบได้`;
        fallback.hidden = false;
      };
      const startSelfRecord = h('button', { class: 'chip-btn', type: 'button', text: 'เริ่มอัดเสียง', onclick: async () => {
        startSelfRecord.disabled = true;
        manualRecording = await startRecording();
        if (!manualRecording) {
          result.textContent = 'เริ่มอัดไม่ได้ ตรวจสิทธิ์ไมค์หรือเปิดใน Safari/Chrome';
          startSelfRecord.disabled = false;
          return;
        }
        result.textContent = 'กำลังอัด… แตะ “หยุดและฟัง” เมื่อพร้อม';
        stopSelfRecord.disabled = false;
      } });
      const stopSelfRecord = h('button', { class: 'chip-btn', type: 'button', text: 'หยุดและฟัง', disabled: true, onclick: async () => {
        stopSelfRecord.disabled = true;
        recordedBlob = manualRecording ? await manualRecording.stop() : null;
        manualRecording = null;
        startSelfRecord.disabled = false;
        if (!recordedBlob) { result.textContent = 'ไม่ได้เสียงบันทึก ลองอัดอีกครั้งได้'; return; }
        result.textContent = 'กำลังเล่นเสียงของคุณ…';
        await playBlob(recordedBlob);
        result.textContent = 'ฟังเทียบกับคำต้นแบบ แล้วเลือกดาว 1–5 ดวง';
        stars.hidden = false;
      } });
      const stars = h('div', { class: 'self-rating', hidden: true }, ...[1, 2, 3, 4, 5].map((rating) => h('button', {
        class: 'chip-btn', type: 'button', text: '⭐'.repeat(rating), 'aria-label': `${rating} ดาว`,
        onclick: () => {
          state.selected = rating >= 3 ? item.answer : null;
          result.textContent = rating >= 3 ? `ให้คะแนนตัวเอง ${rating}/5 · ผ่านแล้ว` : `ให้คะแนนตัวเอง ${rating}/5 · อัดใหม่หรือข้ามได้`;
          questionHost.querySelector('.session-check').disabled = !state.selected;
        },
      })));
      fallback.append(h('div', { class: 'muted small', text: 'พูดตามคำ แล้วฟังเสียงตัวเองเทียบกับคำต้นแบบ' }), startSelfRecord, stopSelfRecord, stars);
      const mic = btn3d('เริ่มพูด', { tone: 'violet', block: true, onclick: async () => {
        if (state.listening) return;
        if (!sttSupported()) {
          mic.hidden = true;
          enableSelfMode('เบราว์เซอร์นี้แปลงเสียงเป็นข้อความไม่ได้');
          return;
        }
        state.listening = true; mic.disabled = true; result.textContent = 'กำลังฟัง…';
        let probe;
        try {
          if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('ไม่รองรับ getUserMedia'), { name: 'NotFoundError' });
          probe = await navigator.mediaDevices.getUserMedia({ audio: true });
          probe.getTracks().forEach((track) => track.stop());
          probe = null;
        } catch (err) {
          if (probe) probe.getTracks().forEach((track) => track.stop());
          state.listening = false; mic.disabled = false; mic.hidden = true;
          const ua = navigator.userAgent || '';
          const inApp = /Line\//i.test(ua) || /; wv\)/i.test(ua) || /Instagram|FBAN|FBAV/i.test(ua);
          const reason = inApp ? 'เบราว์เซอร์ในแอปไม่อนุญาตไมค์' : err.name === 'NotAllowedError' ? 'ไม่ได้อนุญาตไมค์' : err.name === 'NotFoundError' ? 'ไม่พบไมโครโฟน' : err.name === 'SecurityError' ? 'ต้องเปิดผ่าน HTTPS หรือ localhost' : `ไมค์ใช้ไม่ได้ (${err.name || 'Error'})`;
          enableSelfMode(reason);
          return;
        }
        const res = await listenOnce({ onInterim: (said) => { result.textContent = said || 'กำลังฟัง…'; } });
        state.listening = false; mic.disabled = false;
        if (res.err === 'unsupported') { mic.hidden = true; enableSelfMode('เบราว์เซอร์ไม่รองรับการรู้จำเสียง'); return; }
        if (res.err) { mic.hidden = true; enableSelfMode(`ฟังเสียงไม่สำเร็จ (${res.err})`); return; }
        const score = alignWords(item.answer, res.said).score;
        result.textContent = res.err ? 'ฟังไม่สำเร็จ ลองอีกครั้งได้เลย' : `ได้ยิน: ${res.said || 'ยังไม่ได้ยินคำตอบ'} · ${score}%`;
        state.selected = score >= 70 ? item.answer : (res.said || null);
        questionHost.querySelector('.session-check').disabled = !state.selected;
      } });
      // ข้ามได้เสมอ (เครื่องไม่มีไมค์/ไม่ให้สิทธิ์/LINE in-app) — ไม่มีบทลงโทษ
      const skipSpeak = h('button', {
        class: 'chip-btn session-skip', type: 'button', text: 'ข้ามข้อนี้ (ไม่มีไมค์ก็เรียนต่อได้)',
        onclick: () => { state.selected = item.answer; state.index++; renderQuestion(); },
      });
      if (!sttSupported()) {
        mic.hidden = true;
        enableSelfMode('เบราว์เซอร์นี้แปลงเสียงเป็นข้อความไม่ได้');
      }
      parts.push(mic, result, fallback, skipSpeak);
    }
    parts.splice(1, 0, sleepHint);
    mount(content, ...parts);
    content.classList.remove('session-in');
    void content.offsetWidth;
    content.classList.add('session-in');
    wake();
    mount(questionHost);
    const check = btn3d('ตรวจคำตอบ', { block: true, size: 'lg', onclick: checkAnswer });
    check.classList.add('session-check'); check.disabled = true;
    questionHost.appendChild(check);
    if (item.audioKey) schedule(() => play(item), 250);
  };
  const checkAnswer = () => {
    const item = items[state.index];
    const answer = state.selected;
    const correct = item.type === 'chunk-order' || item.type === 'chunk-type'
      ? normalizeEn(answer) === normalizeEn(correctAnswer(item))
      : item.type === 'speak-word' ? normalizeEn(answer) === normalizeEn(item.answer)
        : String(answer).trim().toLowerCase() === String(item.answer).trim().toLowerCase();
    if (correct && !state.retried.has(item.id)) { state.firstCorrect++; state.xp += 2; }
    state.streak = correct ? state.streak + 1 : 0;
    if (correct && !review) {
      if (item.type === 'speak-word') pg.bumpActivity('speak');
      else if (['word-listen', 'line-listen', 'listen-question'].includes(item.type) || (item.type === 'dialog-line' && item.mode !== 'english')) pg.bumpActivity('listen');
      else pg.bumpActivity('words');
    }
    if (!correct) { rememberReview(lessonId, item); state.retried.add(item.id); }
    if (correct) state.finalCorrect++;
    if (!correct && !state.retried.has(`${item.id}:used`)) {
      state.retried.add(`${item.id}:used`);
      showFeedback(item, false, true);
    } else showFeedback(item, correct, false);
    if (correct && state.streak === 3) {
      mascotReact(mascotEl, 'cheer', 800);
      toast('ต่อเนื่อง 3 ข้อ! 🔥', 1400);
    }
  };
  const showFeedback = (item, correct, allowRetry) => {
    mascotReact(mascotEl, correct ? 'cheer' : 'sad', correct ? 1300 : 900);
    if (correct) sfxCorrect(); else sfxWrong();
    questionHost.querySelectorAll('.session-check').forEach((el) => el.remove());
    const feedback = h('div', { class: `feedback ${correct ? 'is-correct' : 'is-wrong'}` },
      h('div', { class: 'feedback-title', text: correct ? 'เก่งมาก! ถูกแล้ว 🎉' : 'ไม่เป็นไร ลองอีกครั้งได้นะ' }),
      !correct ? h('div', { class: 'feedback-answer' }, h('span', { class: 'muted small', text: 'คำตอบที่ถูก' }), h('strong', { text: correctAnswer(item) })) : null);
    const actions = h('div', { class: 'feedback-actions' });
    if (allowRetry) actions.appendChild(btn3d('ลองอีกครั้ง', { block: true, onclick: renderQuestion }));
    actions.appendChild(btn3d('ต่อไป', { block: true, tone: allowRetry ? 'ghost' : 'brand', onclick: () => {
      if (review) pg.bumpActivity('review');
      state.index++; renderQuestion();
    } }));
    feedback.classList.add('feedback-in');
    questionHost.append(feedback, actions);
  };
  function confirmExit() {
    stopSpeaking(); stopListeningOnce();
    const wrap = h('div', { class: 'session-confirm-wrap' });
    const cancel = () => wrap.remove();
    wrap.appendChild(h('div', { class: 'session-confirm' },
      h('div', { class: 'bold', text: 'ออกจากบทเรียน?' }),
      h('div', { class: 'muted small', text: 'ความคืบหน้าบทนี้จะไม่ถูกบันทึก' }),
      btn3d('เรียนต่อ', { block: true, tone: 'ghost', onclick: cancel }),
      btn3d('ออกไปเส้นทาง', { block: true, tone: 'coral', onclick: () => { cancel(); location.hash = '#/path'; } })));
    document.body.appendChild(wrap);
  }
  function finish() {
    if (state.done) return;
    state.done = true; clearScheduled(idleTimer); stopSpeaking(); stopListeningOnce();
    const pct = Math.round((state.finalCorrect / items.length) * 100);
    state.xp += 10;
    if (!review) { pg.complete(lessonId, pct); pg.bumpActivity('lesson'); }
    pg.bumpDaily({ xp: review ? state.xp : state.xp - 20 });
    sfxComplete(); confetti(); mascotReact(mascotEl, 'cheer', 2400);
    mascotEl.classList.remove('session-mascot');
    const nextBtn = !review && next ? btn3d('บทถัดไป', { block: true, size: 'lg', icon: 'play', onclick: () => { clearTimeout(autoTimer); location.hash = `#/lesson?id=${encodeURIComponent(next.lesson.id)}`; } })
      : btn3d(review ? 'กลับไปเควส' : 'กลับเส้นทาง', { block: true, size: 'lg', onclick: () => { clearTimeout(autoTimer); location.hash = review ? '#/quest' : '#/path'; } });
    const cancelAuto = h('button', { class: 'chip-btn', type: 'button', text: 'ยกเลิกการไปต่ออัตโนมัติ', onclick: () => { clearTimeout(autoTimer); cancelAuto.remove(); } });
    mount(top, h('span', { class: 'session-exit-placeholder' }), h('div', { class: 'session-title', text: 'จบบทเรียนแล้ว!' }), h('span', { class: 'session-count', text: '✓' }));
    const pctEl = h('div', { class: 'summary-pct', text: '0%' });
    const xpEl = h('div', { class: 'summary-xp', text: '⭐ ได้รับ 0 XP' });
    mount(content, h('div', { class: 'session-summary session-in' }, mascotEl,
      pctEl,
      h('div', { class: 'summary-title', text: `${state.finalCorrect}/${items.length} ข้อถูก` }),
      xpEl,
      h('div', { class: 'summary-note muted small', text: 'ข้อที่ต้องทบทวนถูกเก็บไว้ให้กลับมาฝึกอีกครั้ง' }), nextBtn, cancelAuto));
    const started = performance.now();
    const countUp = (now) => {
      if (disposed) return;
      const progress = Math.min(1, (now - started) / 500);
      const eased = 1 - (1 - progress) ** 3;
      pctEl.textContent = `${Math.round(pct * eased)}%`;
      xpEl.textContent = `⭐ ได้รับ ${Math.round(state.xp * eased)} XP`;
      if (progress < 1) summaryFrame = requestAnimationFrame(countUp);
    };
    summaryFrame = requestAnimationFrame(countUp);
    mount(questionHost);
    shell.querySelector('.bar-fill').style.width = '100%';
    if (!review && next) autoTimer = setTimeout(() => { location.hash = `#/lesson?id=${encodeURIComponent(next.lesson.id)}`; }, 3000);
  }
  renderQuestion();
  return () => {
    disposed = true;
    timers.forEach(clearTimeout); timers.clear();
    clearTimeout(autoTimer); clearTimeout(idleTimer);
    if (summaryFrame !== null) cancelAnimationFrame(summaryFrame);
    clearTimeout(mascotEl._reactTimer);
    shell.removeEventListener('pointerdown', wake); shell.removeEventListener('keydown', wake);
    stopSpeaking(); stopListeningOnce(); document.body.classList.remove('in-session');
    document.querySelector('.session-confirm-wrap')?.remove();
  };
}
