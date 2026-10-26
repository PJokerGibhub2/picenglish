/** พูดตามเงาทีละประโยคจากบทฟังที่มีอยู่ */

import { db } from './data.js';
import * as store from './store.js';
import { h, mount, progressBar, toast } from './ui.js';
import { audioUrl, sayText, stopSpeaking, sttSupport, alignWords } from './speech.js';
import { listenOnce, stopListeningOnce } from './listen-once.js';
import { micPanel } from './micfallback.js';
import { playBlob, stopPlayback } from './recorder.js';
import { sfxMicStart, sfxMicStop, sfxSuccess, sfxSoft } from './sfx.js';

const LEVELS = ['ทั้งหมด', 'A0', 'A1.1', 'A1.2', 'A2.1', 'A2.2'];

export function shadow(root, params = {}) {
  let filter = 'ทั้งหมด';
  let lesson = db.listening.find((item) => item.id === params.id) || null;
  let lineIdx = 0;
  let attempts = 0;
  let activeAudio = null;
  let blob = null;
  let currentScore = null;
  let missed = [];
  let fallbackRated = 0;
  let fallbackPanel = null;
  const gradedFailures = new Set();
  let playing = false;
  let alive = true;

  function stopAudio() {
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (e) { /* ignore */ }
      activeAudio = null;
    }
    playing = false;
    stopSpeaking();
  }

  function destroy() {
    alive = false;
    stopAudio();
    stopListeningOnce();
    stopPlayback();
  }

  const speakLine = (idx = lineIdx, rate = 1) => {
    const item = lesson && lesson.transcript[idx];
    if (!item) return Promise.resolve();
    stopAudio();
    const key = `lis:${lesson.id}:${idx}`;
    const url = audioUrl(key, store.settings().voiceGender);
    if (!url) {
      playing = true;
      render();
      return sayText(item.en, { rate, gender: store.settings().voiceGender, audioKey: key }).finally(() => {
        playing = false;
        if (alive) render();
      });
    }
    return new Promise((resolve) => {
      const audio = new Audio(url);
      activeAudio = audio;
      audio.playbackRate = rate;
      audio.preservesPitch = true;
      playing = true;
      const finish = () => {
        if (activeAudio === audio) activeAudio = null;
        playing = false;
        if (alive) render();
        resolve();
      };
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', () => {
        if (activeAudio === audio) activeAudio = null;
        playing = false;
        if (alive) render();
        sayText(item.en, { rate, gender: store.settings().voiceGender }).then(resolve);
      }, { once: true });
      audio.play().catch(finish);
      render();
    });
  };

  function listing() {
    mount(root);
    root.appendChild(h('div', { class: 'card', style: { marginBottom: '12px' } },
      h('div', { class: 'bold', text: 'พูดตามเจ้าของภาษา ทีละประโยค' }),
      h('div', { class: 'small muted', text: 'ฟังจังหวะประโยค แล้วลองพูดตามในแบบของคุณ' })));
    root.appendChild(h('a', { class: 'btn btn-ghost btn-sm', href: '#/learn', style: { marginBottom: '10px' } }, '← กลับไปหน้าเรียน'));
    const chips = h('div', { class: 'row row-wrap', style: { gap: '6px', margin: '8px 0 14px' } });
    for (const level of LEVELS) chips.appendChild(h('button', {
      class: `pill ${filter === level ? 'on' : ''}`, type: 'button', onclick: () => { filter = level; listing(); },
    }, level));
    root.appendChild(chips);
    const list = h('div', { class: 'list' });
    db.listening.filter((item) => filter === 'ทั้งหมด' || item.level === filter).forEach((item) => {
      const p = store.shadowProgress(item.id);
      list.appendChild(h('button', {
        class: 'card list-item', type: 'button', style: { width: '100%', textAlign: 'left', marginBottom: '8px' },
        onclick: () => { location.hash = `#/shadow?id=${encodeURIComponent(item.id)}`; },
      }, h('div', { class: 'thumb', style: { fontSize: '1.5rem' }, text: item.scene || '🗣️' }),
      h('div', { class: 'lt' }, h('b', { text: item.title }),
        h('div', { class: 'small muted', text: `${item.level} · ${item.transcript.length} บรรทัด` }),
        h('div', { class: 'tiny muted', text: `ผ่านแล้ว ${p.passed.length}/${item.transcript.length}` }))));
    });
    root.appendChild(list);
  }

  function resetLine(index) {
    lineIdx = Math.max(0, Math.min(index, lesson.transcript.length - 1));
    attempts = 0;
    currentScore = null;
    missed = [];
    blob = null;
    fallbackRated = 0;
    fallbackPanel = null;
    render();
  }

  function advance() {
    if (lineIdx < lesson.transcript.length - 1) resetLine(lineIdx + 1);
    else summary();
  }

  async function recordAttempt() {
    if (!alive || currentScore !== null) return;
    stopAudio();
    attempts++;
    render();
    try { sfxMicStart(); } catch (e) { /* ignore */ }
    const result = await Promise.race([
      listenOnce({ onInterim: (text) => { const el = root.querySelector('.shadow-status'); if (el) el.textContent = text || 'กำลังฟัง…'; } }),
      new Promise((resolve) => setTimeout(() => resolve({ said: '', blob: null, err: 'timeout' }), 12000)),
    ]);
    if (!alive) return;
    if (result.err === 'timeout') stopListeningOnce();
    try { sfxMicStop(); } catch (e) { /* ignore */ }
    if (result.err || !result.said) {
      toast(result.err === 'timeout' ? 'หมดเวลา ลองกดไมค์แล้วพูดอีกครั้ง' : 'ไม่ได้ยินเสียง ลองอีกครั้งได้เลย', 'err');
      render();
      return;
    }
    blob = result.blob;
    const evaluated = alignWords(lesson.transcript[lineIdx].en, result.said);
    currentScore = evaluated.score;
    missed = evaluated.missed;
    store.saveShadowLine(lesson.id, lineIdx, currentScore);
    if (currentScore >= (Number(store.settings().passThreshold) || 70)) {
      try { sfxSuccess(); } catch (e) { /* ignore */ }
    } else {
      try { sfxSoft(); } catch (e) { /* ignore */ }
      const key = `shadow:${lesson.id}:${lineIdx}`;
      if (!gradedFailures.has(key)) {
        store.gradeSentence(key, 1);
        gradedFailures.add(key);
      }
    }
    render();
  }

  function summary() {
    stopAudio();
    const saved = store.shadowProgress(lesson.id);
    const scores = lesson.transcript.map((_, idx) => saved.best[idx]).filter((score) => Number.isFinite(score));
    const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const passed = saved.passed.length;
    const notPassed = lesson.transcript.map((line, idx) => ({ line, idx })).filter(({ idx }) => !saved.passed.includes(idx));
    mount(root);
    root.appendChild(h('div', { class: 'card center' },
      h('div', { style: { fontSize: '2rem' }, text: '🎉' }),
      h('div', { class: 'bold', text: `${lesson.title} · จบแล้ว` }),
      h('div', { class: 'h1', text: `${average}%` }),
      h('div', { class: 'small muted', text: `ผ่าน ${passed}/${lesson.transcript.length} บรรทัด` })));
    if (notPassed.length) {
      root.appendChild(h('div', { class: 'section-title', text: 'กลับไปฝึกบรรทัดเหล่านี้ได้' }));
      for (const { line, idx } of notPassed) root.appendChild(h('button', {
        class: 'card list-item', type: 'button', style: { width: '100%', textAlign: 'left', marginBottom: '8px' },
        onclick: () => resetLine(idx),
      }, h('div', { class: 'lt' }, h('b', { class: 'en', text: line.en }), h('div', { class: 'small muted', text: line.th }))));
    }
    const sameLevel = db.listening.filter((item) => item.level === lesson.level);
    const next = sameLevel[(sameLevel.findIndex((item) => item.id === lesson.id) + 1) % sameLevel.length];
    root.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '12px' } },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { location.hash = `#/shadow?id=${encodeURIComponent(next.id)}`; } }, 'บทถัดไป'),
      h('a', { class: 'btn btn-ghost btn-block', href: '#/shadow' }, 'กลับรายการ')));
  }

  function render() {
    if (!lesson) return listing();
    if (lineIdx >= lesson.transcript.length) return summary();
    mount(root);
    const line = lesson.transcript[lineIdx];
    root.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/shadow' }, '← รายการ'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'small muted', text: `บรรทัด ${lineIdx + 1}/${lesson.transcript.length}` })));
    root.appendChild(progressBar(lineIdx, lesson.transcript.length));
    root.appendChild(h('div', { class: 'card center', style: { marginTop: '12px' } },
      h('div', { class: 'bubble-en en', style: { fontSize: '1.3rem' }, text: line.en }),
      h('div', { class: 'bubble-th', text: line.th })));
    root.appendChild(h('div', { class: 'row row-wrap', style: { gap: '8px', marginTop: '10px' } },
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => { if (playing) { stopAudio(); render(); } else speakLine(lineIdx, 1); } }, playing ? '⏹ หยุด' : '▶ ฟังต้นแบบ'),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => speakLine(lineIdx, 0.6) }, '🐢 0.6×'),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => speakLine(lineIdx, 1) }, '🔁 ฟังอีกครั้ง')));

    if (sttSupport().ok) {
      if (currentScore === null) {
        root.appendChild(h('button', { class: `mic-btn ${attempts ? 'rec' : ''}`, type: 'button', 'aria-label': 'พูดตาม', style: { margin: '16px auto 4px', display: 'block' }, onclick: recordAttempt }, '🎤'));
        root.appendChild(h('div', { class: 'small muted center shadow-status', text: attempts ? `ลองแล้ว ${attempts} ครั้ง · กดไมค์เพื่อพูดตาม` : 'กดไมค์แล้วพูดตามประโยคด้านบน' }));
      } else {
        const threshold = Number(store.settings().passThreshold) || 70;
        const passed = currentScore >= threshold;
        root.appendChild(h('div', { class: 'card center', style: { marginTop: '12px' } },
          h('div', { class: 'h1', text: `${currentScore}%` }),
          h('div', { class: 'bold', text: passed ? `✓ ผ่าน ${currentScore}%` : `พูดได้ ${currentScore}% · ลองอีกครั้งได้เลย` }),
          h('div', { class: 'tiny muted', text: `ลองแล้ว ${attempts} ครั้ง` })));
        if (!passed) {
          const chips = h('div', { class: 'row row-wrap', style: { gap: '6px', marginTop: '8px' } });
          missed.forEach((word) => chips.appendChild(h('button', { class: 'pill', type: 'button', onclick: () => sayText(word, { audioKey: undefined }) }, word)));
          root.appendChild(chips);
          root.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } },
            h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => speakLine(lineIdx, 0.6) }, 'ฟังช้า ๆ'),
            h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { currentScore = null; missed = []; blob = null; recordAttempt(); } }, 'ลองใหม่')));
          if (attempts >= 3) root.appendChild(h('button', { class: 'btn btn-ghost btn-block', type: 'button', style: { marginTop: '8px' }, onclick: advance }, 'ข้ามบรรทัดนี้'));
        } else root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '10px' }, onclick: advance }, 'บรรทัดถัดไป →'));
      }
      if (blob) root.appendChild(h('button', { class: 'btn btn-ghost btn-block', type: 'button', style: { marginTop: '10px' }, onclick: () => { stopPlayback(); playBlob(blob, 1); } }, '🔊 เสียงของฉัน'));
    } else {
      const key = `shadow:${lesson.id}:${lineIdx}`;
      fallbackRated = 0;
      fallbackPanel = micPanel({
        banner: sttSupport().note,
        audioText: line.en,
        flagWords: line.en.toLowerCase().replace(/[^a-z' ]/g, '').split(/\s+/).filter(Boolean),
        speak: () => speakLine(lineIdx, 1),
        key,
        onRate: (rating) => { fallbackRated = rating; },
        onNext: () => {
          const threshold = Number(store.settings().passThreshold) || 70;
          const pct = fallbackRated >= 3 ? Math.max(threshold, fallbackRated * 20) : fallbackRated * 20;
          store.saveShadowLine(lesson.id, lineIdx, pct);
          advance();
        },
        nextLabel: 'พูดแล้ว ต่อไป →',
      });
      root.appendChild(fallbackPanel);
    }
    root.appendChild(h('div', { class: 'tiny muted center', style: { marginTop: '12px' }, text: 'ฟังและลองใหม่ได้เรื่อย ๆ · ไม่มีการหักคะแนน' }));
  }

  if (lesson) render(); else listing();
  return destroy;
}
