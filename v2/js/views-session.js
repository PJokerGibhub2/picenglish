/* views-session.js — หน้าฝึกบทเรียนแบบเกม */
import { h, mount, icon, btn3d, bar, confetti } from './ui2.js';
import { mascot, mascotReact } from './mascot2.js';
import { db, loadAll, normalizeEn } from './data.js';
import { buildSession } from './session.js';
import * as pg from './progress2.js';
import { sayText, stopSpeaking, sttSupported, alignWords } from './speech.js';
import { listenOnce, stopListeningOnce } from './listen-once.js';
import { sfxSuccess, sfxSoft, sfxComplete } from './sfx.js';
import { loadPath } from './views-path.js';

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
    if (!rows.some((row) => row.lessonId === lessonId && row.itemId === item.id)) rows.push({ lessonId, itemId: item.id, type: item.type, answer: item.answer, at: Date.now() });
    localStorage.setItem(key, JSON.stringify(rows));
  } catch (err) { /* พื้นที่จัดเก็บอาจเต็ม */ }
}
function correctAnswer(item) {
  if (item.type === 'chunk-order' || item.type === 'chunk-type') return item.answer;
  return item.answer;
}

export async function sessionView(root, lessonId) {
  const path = await loadPath();
  const entry = pathEntry(path, lessonId);
  if (!entry) { mount(root, h('div', { class: 'card', text: 'ไม่พบบทเรียนนี้' })); return () => {}; }
  await loadAll();
  const items = await buildSession(entry.lesson, { size: 10, stt: sttSupported() });
  if (!items.length) { mount(root, h('div', { class: 'card', text: 'บทนี้ยังไม่มีแบบฝึกให้เล่น' })); return () => {}; }

  document.body.classList.add('in-session');
  const next = nextLesson(path, lessonId);
  const state = { index: 0, firstCorrect: 0, finalCorrect: 0, xp: 0, retried: new Set(), selected: null, built: [], listening: false, done: false };
  const top = h('div', { class: 'session-top' });
  const content = h('div', { class: 'session-content' });
  const questionHost = h('div', { class: 'session-question' });
  const mascotEl = mascot('idle', 112);
  const shell = h('section', { class: 'session' }, top, h('div', { class: 'session-progress' }, bar(0), h('span', { class: 'session-count' })),
    h('div', { class: 'session-stage' }, mascotEl, content), questionHost);
  mount(root, shell);

  const play = (item) => {
    if (!item.audioText) return;
    stopSpeaking();
    sayText(item.audioText, { audioKey: item.audioKey, gender: 'f' });
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
    const prompt = h('div', { class: 'prompt' });
    const audioButton = item.audioText ? h('button', { class: 'listen-again', type: 'button', onclick: () => play(item), 'aria-label': 'ฟังซ้ำ' }, icon('sound', 22), ' ฟังซ้ำ') : null;
    if (item.type === 'word-en-th') prompt.append(h('div', { class: 'prompt-kicker', text: 'เลือกความหมายภาษาไทย' }), h('div', { class: 'prompt-en', text: item.prompt }));
    else if (item.type === 'word-th-en') prompt.append(h('div', { class: 'prompt-kicker', text: 'คำภาษาอังกฤษคือคำใด' }), h('div', { class: 'prompt-th', text: item.prompt }));
    else if (item.type === 'word-listen') prompt.append(h('div', { class: 'prompt-kicker', text: 'ฟังแล้วเลือกคำศัพท์' }));
    else if (item.type === 'chunk-order') prompt.append(h('div', { class: 'prompt-kicker', text: 'เรียงชิปให้เป็นประโยคภาษาอังกฤษ' }), h('div', { class: 'prompt-th', text: item.prompt }));
    else if (item.type === 'chunk-type') prompt.append(h('div', { class: 'prompt-kicker', text: item.prompt }));
    else if (item.type === 'chunk-meaning') prompt.append(h('div', { class: 'prompt-kicker', text: 'เลือกความหมายภาษาไทย' }), h('div', { class: 'prompt-en', text: item.prompt }));
    else if (item.type === 'line-listen') prompt.append(h('div', { class: 'prompt-kicker', text: item.prompt }));
    else prompt.append(h('div', { class: 'prompt-kicker', text: 'พูดตามคำนี้' }), h('div', { class: 'prompt-en', text: item.prompt }));
    if (audioButton) prompt.appendChild(audioButton);
    const parts = [prompt];
    if (['word-en-th', 'word-th-en', 'word-listen', 'chunk-meaning', 'line-listen'].includes(item.type)) parts.push(optionButtons(item));
    if (item.type === 'chunk-order') {
      const built = h('div', { class: 'built-sentence', text: 'แตะคำด้านล่างเพื่อเรียงประโยค' });
      const chips = h('div', { class: 'tile-bank' }, ...item.tiles.map((word, i) => {
        const button = h('button', { class: 'chip-btn tile', type: 'button', onclick: () => {
        state.built.push({ word, i }); button.remove();
        built.textContent = state.built.map((x) => x.word).join(' ') || 'แตะคำด้านล่างเพื่อเรียงประโยค';
        state.selected = state.built.length ? state.built.map((x) => x.word).join(' ') : null;
        questionHost.querySelector('.session-check').disabled = !state.selected;
        } }, word);
        return button;
      }));
      parts.push(built, chips);
    }
    if (item.type === 'chunk-type') {
      const input = h('input', { class: 'session-input', type: 'text', autocomplete: 'off', placeholder: 'พิมพ์ประโยคภาษาอังกฤษ' });
      input.addEventListener('input', () => { state.selected = input.value.trim() || null; questionHost.querySelector('.session-check').disabled = !state.selected; });
      parts.push(input);
    }
    if (item.type === 'speak-word') {
      const result = h('div', { class: 'session-stt muted', text: 'แตะปุ่มไมค์แล้วพูดตาม' });
      const mic = btn3d('เริ่มพูด', { tone: 'violet', block: true, onclick: async () => {
        if (state.listening) return;
        state.listening = true; mic.disabled = true; result.textContent = 'กำลังฟัง…';
        const res = await listenOnce({ onInterim: (said) => { result.textContent = said || 'กำลังฟัง…'; } });
        state.listening = false; mic.disabled = false;
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
      parts.push(mic, result, skipSpeak);
    }
    mount(content, ...parts);
    mount(questionHost);
    const check = btn3d('ตรวจคำตอบ', { block: true, size: 'lg', onclick: checkAnswer });
    check.classList.add('session-check'); check.disabled = true;
    questionHost.appendChild(check);
    if (item.type === 'word-listen' || item.type === 'line-listen') setTimeout(() => play(item), 250);
  };
  const checkAnswer = () => {
    const item = items[state.index];
    const answer = state.selected;
    const correct = item.type === 'chunk-order' || item.type === 'chunk-type'
      ? normalizeEn(answer) === normalizeEn(correctAnswer(item))
      : item.type === 'speak-word' ? normalizeEn(answer) === normalizeEn(item.answer)
        : String(answer).trim().toLowerCase() === String(item.answer).trim().toLowerCase();
    if (correct && !state.retried.has(item.id)) { state.firstCorrect++; state.xp += 2; }
    if (!correct) { rememberReview(lessonId, item); state.retried.add(item.id); }
    if (correct) state.finalCorrect++;
    if (!correct && !state.retried.has(`${item.id}:used`)) {
      state.retried.add(`${item.id}:used`);
      showFeedback(item, false, true);
    } else showFeedback(item, correct, false);
  };
  const showFeedback = (item, correct, allowRetry) => {
    mascotReact(mascotEl, correct ? 'cheer' : 'sad', 1300);
    if (correct) sfxSuccess(); else sfxSoft();
    questionHost.querySelectorAll('.session-check').forEach((el) => el.remove());
    const feedback = h('div', { class: `feedback ${correct ? 'is-correct' : 'is-wrong'}` },
      h('div', { class: 'feedback-title', text: correct ? 'เก่งมาก! ถูกแล้ว 🎉' : 'ไม่เป็นไร ลองอีกครั้งได้นะ' }),
      !correct ? h('div', { class: 'feedback-answer' }, h('span', { class: 'muted small', text: 'คำตอบที่ถูก' }), h('strong', { text: correctAnswer(item) })) : null);
    const actions = h('div', { class: 'feedback-actions' });
    if (allowRetry) actions.appendChild(btn3d('ลองอีกครั้ง', { block: true, onclick: renderQuestion }));
    actions.appendChild(btn3d('ต่อไป', { block: true, tone: allowRetry ? 'ghost' : 'brand', onclick: () => { state.index++; renderQuestion(); } }));
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
    state.done = true; stopSpeaking(); stopListeningOnce();
    const pct = Math.round((state.finalCorrect / items.length) * 100);
    state.xp += 10;
    pg.complete(lessonId, pct);
    pg.bumpDaily({ xp: state.xp - 20 });
    sfxComplete(); confetti(); mascotReact(mascotEl, 'cheer', 2400);
    const nextBtn = next ? btn3d('บทถัดไป', { block: true, size: 'lg', icon: 'play', onclick: () => { clearTimeout(autoTimer); location.hash = `#/lesson?id=${encodeURIComponent(next.lesson.id)}`; } })
      : btn3d('กลับเส้นทาง', { block: true, size: 'lg', onclick: () => { clearTimeout(autoTimer); location.hash = '#/path'; } });
    const cancelAuto = h('button', { class: 'chip-btn', type: 'button', text: 'ยกเลิกการไปต่ออัตโนมัติ', onclick: () => { clearTimeout(autoTimer); cancelAuto.remove(); } });
    mount(top, h('span', { class: 'session-exit-placeholder' }), h('div', { class: 'session-title', text: 'จบบทเรียนแล้ว!' }), h('span', { class: 'session-count', text: '✓' }));
    mount(content, h('div', { class: 'session-summary' }, mascotEl,
      h('div', { class: 'summary-pct', text: `${pct}%` }),
      h('div', { class: 'summary-title', text: `${state.finalCorrect}/${items.length} ข้อถูก` }),
      h('div', { class: 'summary-xp', text: `⭐ ได้รับ ${state.xp} XP` }),
      h('div', { class: 'summary-note muted small', text: 'ข้อที่ต้องทบทวนถูกเก็บไว้ให้กลับมาฝึกอีกครั้ง' }), nextBtn, cancelAuto));
    mount(questionHost);
    shell.querySelector('.bar-fill').style.width = '100%';
    if (next) autoTimer = setTimeout(() => { location.hash = `#/lesson?id=${encodeURIComponent(next.lesson.id)}`; }, 3000);
  }
  let autoTimer = null;
  renderQuestion();
  return () => {
    clearTimeout(autoTimer); stopSpeaking(); stopListeningOnce(); document.body.classList.remove('in-session');
    document.querySelector('.session-confirm-wrap')?.remove();
  };
}
