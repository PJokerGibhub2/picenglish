/** Listening lessons with line-by-line audio and karaoke transcript. */

import { db, getWord } from './data.js';
import * as store from './store.js';
import { h, mount, progressBar, toast } from './ui.js';
import { audioUrl, sayText, stopSpeaking } from './speech.js';
import { sfxSuccess, sfxSoft } from './sfx.js';

const LEVELS = ['ทั้งหมด', 'A0', 'A1.1', 'A1.2', 'A2.1', 'A2.2'];
const LEVEL_RATE = { A0: 0.75, 'A1.1': 0.85, 'A1.2': 0.85, 'A2.1': 1, 'A2.2': 1 };
const WEIGHT = { gist: 1, detail: 1, number: 1, inference: 1.5 };
const S = () => store.settings();

export function listening(root, params = {}) {
  let filter = 'ทั้งหมด';
  let activeAudio = null;
  let playToken = 0;

  function stopPlayback() {
    playToken += 1;
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (err) { /* ignore */ }
      activeAudio = null;
    }
    stopSpeaking();
  }

  function playLine(lesson, lineIndex, rate, token = ++playToken) {
    const line = lesson.transcript[lineIndex];
    if (!line || params.fast === '1') return Promise.resolve();
    const key = `lis:${lesson.id}:${lineIndex}`;
    const url = audioUrl(key, S().voiceGender);
    if (!url) return sayText(line.en, { rate, gender: S().voiceGender, audioKey: key });
    return new Promise((resolve) => {
      let audio;
      try { audio = new Audio(url); } catch (err) { return resolve(); }
      activeAudio = audio;
      audio.playbackRate = rate;
      audio.preservesPitch = true;
      const finish = () => {
        if (activeAudio === audio) activeAudio = null;
        resolve();
      };
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', () => {
        if (activeAudio === audio) activeAudio = null;
        sayText(line.en, { rate, gender: S().voiceGender, audioKey: null }).then(resolve);
      }, { once: true });
      if (token !== playToken) return finish();
      audio.play().catch(finish);
    });
  }

  function listing() {
    mount(root);
    const placement = store.placement();
    if (placement) root.appendChild(h('div', { class: 'card', style: { marginBottom: '12px' } },
      h('b', { text: `ระดับของคุณ: ${placement.level}` }),
      h('div', { class: 'small muted', text: 'เลือกบทที่เหมาะกับระดับและฝึกได้ตามจังหวะของคุณ' })));
    root.appendChild(h('a', { class: 'btn btn-ghost btn-sm', href: '#/learn', style: { marginBottom: '10px' } }, '← กลับไปหน้าเรียน'));
    const chips = h('div', { class: 'row row-wrap', style: { gap: '6px', margin: '8px 0 14px' } });
    LEVELS.forEach((level) => chips.appendChild(h('button', {
      class: `pill ${filter === level ? 'on' : ''}`, type: 'button',
      onclick: () => { filter = level; listing(); },
    }, level)));
    root.appendChild(chips);
    const lessons = db.listening.filter((lesson) => filter === 'ทั้งหมด' || lesson.level === filter);
    const list = h('div', { class: 'list' });
    lessons.forEach((lesson) => {
      const record = store.S.listening[lesson.id];
      list.appendChild(h('button', {
        class: 'card list-item', type: 'button', style: { width: '100%', textAlign: 'left', marginBottom: '8px' },
        onclick: () => { location.hash = `#/listening?id=${encodeURIComponent(lesson.id)}`; },
      },
      h('div', { class: 'thumb', style: { fontSize: '1.5rem' }, text: lesson.scene || '🎧' }),
      h('div', { class: 'lt' },
        h('b', { text: lesson.title }),
        h('div', { class: 'small muted', text: lesson.contextTh }),
        h('div', { class: 'tiny muted', text: `${lesson.level} · ${lesson.seconds} วินาที · ${lesson.questions.length} คำถาม · ${record && record.completed ? 'จบแล้ว' : 'ยังไม่ทำ'}` }))));
    });
    root.appendChild(list);
  }

  function session(lesson) {
    let step = 0;
    let questionIndex = 0;
    let answers = [];
    let rate = LEVEL_RATE[lesson.level] || 0.85;
    let playing = false;
    let highlighted = -1;
    let transcriptLines = [];
    let saved = false;
    const wrongLines = new Set();
    const toReview = new Set(lesson.targetWords || []);

    function weightedPercent() {
      const total = lesson.questions.reduce((sum, q) => sum + (WEIGHT[q.type] || 1), 0);
      const earned = lesson.questions.reduce((sum, q, i) => sum + (answers[i] ? (WEIGHT[q.type] || 1) : 0), 0);
      return total ? Math.round(earned / total * 100) : 0;
    }

    async function playAll() {
      stopPlayback();
      const token = playToken;
      playing = true;
      render();
      for (let i = 0; i < lesson.transcript.length; i++) {
        if (token !== playToken) break;
        highlighted = i;
        transcriptLines.forEach((el, n) => el.classList.toggle('listening-active', n === i));
        await playLine(lesson, i, rate, token);
        if (token !== playToken) break;
        if (i < lesson.transcript.length - 1 && params.fast !== '1') await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (token === playToken) {
        playing = false;
        highlighted = -1;
        transcriptLines.forEach((el) => el.classList.remove('listening-active'));
        render();
      }
    }

    async function playSingle(index, speed) {
      stopPlayback();
      const token = playToken;
      playing = true;
      highlighted = index;
      transcriptLines.forEach((el, n) => el.classList.toggle('listening-active', n === index));
      render();
      await playLine(lesson, index, speed, token);
      if (token === playToken) {
        playing = false;
        highlighted = -1;
        transcriptLines.forEach((el) => el.classList.remove('listening-active'));
        render();
      }
    }

    function advance() {
      step += 1;
      render();
    }

    function header() {
      root.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/listening' }, '← รายการ'),
        h('div', { class: 'spacer' }),
        h('span', { class: 'small muted', text: `ขั้น ${Math.min(step + 1, 6)}/6` })));
      root.appendChild(progressBar(step, 6));
      root.appendChild(h('div', { class: 'section-title', text: lesson.title }));
    }

    function render() {
      mount(root);
      header();
      if (step === 0) {
        root.appendChild(h('div', { class: 'card' },
          h('div', { class: 'bold', text: 'ก่อนฟัง' }),
          h('p', { text: lesson.contextTh }),
          h('div', { class: 'small muted', text: 'ลองฟังว่าเรื่องนี้เกี่ยวกับอะไร และสังเกตคำที่คุ้นหู' })));
        if (lesson.questions[0]) root.appendChild(h('div', { class: 'card', style: { marginTop: '10px' } },
          h('div', { class: 'tiny muted', text: 'คำถามนำ' }), h('b', { text: lesson.questions[0].q })));
        const words = h('div', { class: 'row row-wrap', style: { gap: '8px', margin: '12px 0' } });
        (lesson.targetWords || []).forEach((id) => {
          const word = getWord(id);
          const label = word ? `${word.word} · ${word.thai}` : id;
          words.appendChild(h('button', { class: 'pill', type: 'button', onclick: () => sayText(word ? word.word : id, { gender: S().voiceGender, audioKey: word ? `word:${id}` : undefined }) }, label));
        });
        root.appendChild(words);
        root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: advance }, 'เริ่มฟัง'));
      } else if (step === 1) {
        root.appendChild(h('div', { class: 'card center', style: { padding: '28px 16px' } },
          h('div', { style: { fontSize: '2.2rem' }, text: '🎧' }),
          h('div', { class: 'bold', text: 'ฟังรอบ 1' }),
          h('div', { class: 'small muted', text: 'ฟังใจความก่อน ยังไม่ต้องอ่านบทพูด' })));
        const speeds = h('div', { class: 'row row-wrap', style: { justifyContent: 'center', gap: '8px', margin: '12px 0' } });
        [0.6, 0.75, 0.85, 1].forEach((speed) => speeds.appendChild(h('button', {
          class: `pill ${rate === speed ? 'on' : ''}`, type: 'button', onclick: () => { rate = speed; render(); },
        }, `${speed.toFixed(2).replace(/0$/, '')}×`)));
        root.appendChild(speeds);
        root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: playing, onclick: playAll }, playing ? 'กำลังเล่น…' : '▶ เล่นบทฟัง'));
        if (playing) root.appendChild(h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => { stopPlayback(); playing = false; render(); } }, 'หยุด'));
        root.appendChild(h('button', { class: 'btn btn-ghost btn-block', type: 'button', disabled: playing, style: { marginTop: '8px' }, onclick: advance }, 'ไปตอบคำถาม'));
      } else if (step === 2) {
        const q = lesson.questions[questionIndex];
        if (!q) { step = 3; return render(); }
        const chosen = answers[questionIndex];
        root.appendChild(h('div', { class: 'card' },
          h('div', { class: 'tiny muted', text: `ข้อ ${questionIndex + 1}/${lesson.questions.length}` }),
          h('div', { class: 'bold', text: q.q })));
        q.options.forEach((option, index) => {
          const selected = chosen !== undefined && chosen === index;
          const correct = index === q.answer;
          const cls = chosen === undefined ? 'btn btn-ghost btn-block' : `btn btn-block ${correct ? 'btn-primary' : selected ? 'btn-ghost' : 'btn-ghost'}`;
          root.appendChild(h('button', {
            class: cls, type: 'button', disabled: chosen !== undefined,
            style: { marginTop: '8px', textAlign: 'left', ...(chosen !== undefined && correct ? { borderColor: 'var(--teal)', color: 'var(--teal)' } : {}) },
            onclick: () => {
              answers[questionIndex] = index === q.answer;
              if (!answers[questionIndex]) wrongLines.add(q.line || 0);
              if (answers[questionIndex]) sfxSuccess(); else sfxSoft();
              render();
            },
          }, `${String.fromCharCode(65 + index)}. ${option}`));
        });
        if (chosen !== undefined) {
          const correct = chosen;
          root.appendChild(h('div', { class: 'card', style: { marginTop: '10px' } },
            h('b', { text: correct ? '✓ เข้าใจแล้ว' : `คำตอบที่ถูก: ${q.options[q.answer]}` })));
          if (!correct) root.appendChild(h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => playSingle(Math.min(q.line || 0, lesson.transcript.length - 1), 0.6) }, '🔊 ฟังท่อนนี้ช้า ๆ'));
          root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '10px' }, onclick: () => {
            if (questionIndex + 1 < lesson.questions.length) { questionIndex += 1; render(); }
            else { step = 3; render(); }
          } }, questionIndex + 1 < lesson.questions.length ? 'ข้อต่อไป' : 'ดูถอดความ'));
        }
      } else if (step === 3) {
        root.appendChild(h('div', { class: 'card' },
          h('div', { class: 'bold', text: 'ฟังรอบ 2 + ถอดความ' }),
          h('div', { class: 'small muted', text: 'แตะบรรทัดเพื่อฟังซ้ำ และดูความหมายภาษาไทย' })));
        root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: playing, onclick: playAll }, playing ? 'กำลังเล่น…' : '▶ ฟังทั้งบทอีกครั้ง'));
        const transcript = h('div', { style: { marginTop: '10px' } });
        transcriptLines = lesson.transcript.map((line, index) => {
          const el = h('button', {
            class: `card list-item listening-line ${highlighted === index ? 'listening-active' : ''}`, type: 'button',
            style: { width: '100%', textAlign: 'left', marginTop: '8px' },
            onclick: () => playSingle(index, 0.85),
          }, h('div', { class: 'lt' }, h('b', { class: 'en', text: line.en }), h('div', { class: 'small muted', text: line.th })));
          transcript.appendChild(el);
          return el;
        });
        root.appendChild(transcript);
        root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: playing, style: { marginTop: '12px' }, onclick: advance }, 'ไปเก็บคำ'));
      } else if (step === 4) {
        const missed = Array.from(wrongLines).map((line) => ({ key: `listening:${lesson.id}:${line}`, label: lesson.transcript[line] ? lesson.transcript[line].en : '' }));
        root.appendChild(h('div', { class: 'card' },
          h('div', { class: 'bold', text: 'เก็บคำไว้ทบทวน' }),
          h('div', { class: 'small muted', text: 'เพิ่มคำเป้าหมายและท่อนที่อยากฟังซ้ำลงในคิว SRS ได้' })));
        const items = [...Array.from(toReview).map((id) => ({ id, word: getWord(id) })), ...missed.map((item) => ({ sentence: item }))];
        if (!items.length) root.appendChild(h('div', { class: 'card', text: 'วันนี้ไม่มีคำที่ต้องเก็บเพิ่ม เยี่ยมเลย!' }));
        items.forEach((item) => {
          const label = item.word ? `${item.word.word} · ${item.word.thai}` : item.sentence.label;
          root.appendChild(h('div', { class: 'list-item card', style: { marginTop: '8px' } },
            h('div', { class: 'lt', text: label }),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
              if (item.word) store.grade(item.word.id, 3);
              else store.gradeSentence(item.sentence.key, 3);
              toast('เพิ่มเข้าคิวทบทวนแล้ว');
            } }, '＋ เพิ่มเข้า SRS')));
        });
        root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '12px' }, onclick: advance }, 'ดูสรุป'));
      } else {
        const percent = weightedPercent();
        if (!saved) { saved = true; store.bumpListening(lesson.id, percent); }
        root.appendChild(h('div', { class: 'card center', style: { padding: '22px' } },
          h('div', { class: 'small muted', text: 'ฟังได้' }),
          h('div', { class: 'word-en', text: `${percent}%` }),
          h('div', { class: 'bold', text: `${answers.filter(Boolean).length}/${lesson.questions.length} ข้อที่ตอบถูก` }),
          h('div', { class: 'small muted', text: percent >= 80 ? 'จับใจความได้ดีมาก ลองฟังซ้ำเพื่อเก็บรายละเอียดอีกนิด' : 'ฝึกฟังซ้ำได้เสมอ ทุกครั้งจะจับคำได้เพิ่มขึ้น' })));
        const reviewWords = Array.from(toReview).map((id) => getWord(id)).filter(Boolean).map((w) => w.word);
        root.appendChild(h('div', { class: 'card', style: { marginTop: '10px' } },
          h('b', { text: 'คำที่ควรทวน' }), h('div', { class: 'small', text: reviewWords.join(' · ') || 'ไม่มีคำค้างทวน' })));
        const nextLesson = db.listening[db.listening.findIndex((item) => item.id === lesson.id) + 1];
        root.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', style: { marginTop: '12px' }, onclick: () => {
          stopPlayback(); location.hash = `#/listening?id=${encodeURIComponent(lesson.id)}&fast=${params.fast === '1' ? '1' : '0'}&run=${Date.now()}`;
        } }, 'ฟังอีกครั้ง'));
        if (nextLesson) root.appendChild(h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => { stopPlayback(); location.hash = `#/listening?id=${encodeURIComponent(nextLesson.id)}${params.fast === '1' ? '&fast=1' : ''}`; } }, 'บทถัดไป'));
        root.appendChild(h('a', { class: 'btn btn-ghost btn-block', href: '#/listening', style: { marginTop: '8px' } }, 'กลับรายการ'));
      }
    }
    render();
    return () => stopPlayback();
  }

  const lesson = params.id && db.listening.find((item) => item.id === params.id);
  if (lesson) return session(lesson);
  listing();
  return () => stopPlayback();
}
