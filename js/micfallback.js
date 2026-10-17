/**
 * micfallback.js — แผง "อัดเสียง + ฟังเทียบ + ให้คะแนนตัวเอง"
 *
 * ใช้เมื่อเบราว์เซอร์ไม่มี SpeechRecognition (เช่น iPhone/iPad ทุกเครื่อง,
 * LINE in-app browser, Firefox) — ซึ่งหมายความว่า "ให้คะแนนอัตโนมัติ" ทำไม่ได้
 * แต่ยังทำสิ่งที่สำคัญที่สุดได้: ให้ผู้ใช้พูดจริง ฟังเสียงตัวเองเทียบต้นแบบ
 * และชี้จุดที่ยังไม่ชัดด้วยตัวเอง → เข้าคิวทบทวน
 *
 * หลักการ: ต้องเห็นได้ว่า "แอปได้ยินเสียงจริง" (มิเตอร์ระดับเสียง + เวลาที่อัด)
 */

import { h, mount, clear, toast } from './ui.js';
import { startRecording, playBlob, abortRecording } from './recorder.js';
import * as store from './store.js';

/**
 * @param {object} opts
 * @param {string} opts.banner        ข้อความอธิบายว่าทำไมไม่มีให้คะแนน
 * @param {string} opts.audioText     ข้อความต้นแบบ (ประโยค/คำ)
 * @param {Function} [opts.speak]     ฟังก์ชันอ่านต้นแบบ
 * @param {string[]} [opts.flagWords] คำให้ผู้ใช้ชี้ว่ายังไม่ชัด
 * @param {Function} [opts.onFlag]    เรียกเมื่อผู้ใช้ชี้คำ (word) => void
 * @param {Function} [opts.onNext]    เรียกเมื่อกด "ต่อไป"
 * @param {string} [opts.nextLabel]
 * @param {string} [opts.key]         คีย์ประโยคสำหรับ SRS
 */
export function micPanel(opts = {}) {
  const {
    banner = '',
    audioText = '',
    speak = null,
    flagWords = [],
    onFlag = null,
    onNext = null,
    nextLabel = 'พูดแล้ว ต่อไป →',
    key = null,
  } = opts;

  let handle = null;
  let recording = false;
  let t0 = 0;
  let timerId = null;
  let peak = 0;

  const levelBar = h('i', { style: { width: '0%' } });
  const levelPill = h('span', { class: 'pill', style: { opacity: '.45' }, text: '🔈 ยังไม่ได้ยินเสียง' });
  const statusEl = h('div', { class: 'small muted center', style: { marginTop: '6px' }, text: 'กดไมค์แล้วพูดตามประโยคด้านบน' });

  const micBtn = h('button', { class: 'mic-btn', type: 'button', 'aria-label': 'อัดเสียง' }, '🎤');
  const resultBox = h('div', {});

  const panel = h('div', { class: 'card', style: { marginTop: '12px' } },
    banner ? h('div', { class: 'tiny', style: { color: 'var(--warn)', marginBottom: '10px', lineHeight: '1.5' }, text: banner }) : null,
    h('div', { class: 'center' }, micBtn),
    statusEl,
    h('div', { class: 'row', style: { gap: '8px', marginTop: '10px', alignItems: 'center' } },
      levelPill,
      h('div', { class: 'progress', style: { flex: '1' } }, levelBar)),
    resultBox);

  function setLevel(v) {
    const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
    levelBar.style.width = pct + '%';
    peak = Math.max(peak, v);
    if (v > 0.06) {
      levelPill.textContent = '🔊 ได้ยินเสียงแล้ว';
      levelPill.style.opacity = '1';
      levelPill.classList.add('on');
    }
    micBtn.style.boxShadow = `0 0 0 ${8 + pct * 0.12}px color-mix(in srgb, var(--teal) ${10 + pct * 0.2}%, transparent), var(--shadow-lg)`;
  }

  async function start() {
    if (recording) return;
    clear(resultBox);
    peak = 0;
    handle = await startRecording({ onLevel: setLevel });
    if (!handle) {
      toast('เริ่มอัดไม่ได้ — ตรวจสิทธิ์ไมโครโฟน', 'err');
      statusEl.textContent = 'เริ่มอัดไม่ได้ — ไปที่ตั้งค่าเบราว์เซอร์แล้วอนุญาตไมค์';
      return;
    }
    recording = true;
    t0 = Date.now();
    micBtn.classList.add('rec');
    micBtn.textContent = '⏹';
    statusEl.textContent = 'กำลังอัด… พูดต่อเนื่องได้เลย';
    timerId = setInterval(() => {
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      statusEl.textContent = `กำลังอัด… ${sec} วินาที`;
    }, 200);
  }

  async function stop() {
    if (!recording) return;
    recording = false;
    clearInterval(timerId); timerId = null;
    micBtn.classList.remove('rec');
    micBtn.textContent = '🎤';
    const sec = Math.max(0.1, (Date.now() - t0) / 1000);
    const blob = handle ? await handle.stop() : null;
    handle = null;
    setLevel(0);
    if (!blob) {
      statusEl.textContent = 'ไม่ได้ยินเสียง — ลองพูดดังขึ้นอีกนิด';
      toast('ไม่ได้ยินเสียง ลองใหม่', 'err');
      return;
    }
    statusEl.textContent = `อัดได้ ${sec.toFixed(1)} วินาที · ${Math.round(blob.size / 1024)} KB`;
    store.bumpSpoken(1);
    store.addSecondsSpoken(sec);
    store.addSelfRating(0); // กันไม่ให้ตารางรายวันว่าง

    const stars = h('div', { class: 'row row-wrap', style: { gap: '6px', justifyContent: 'center', marginTop: '8px' } });
    let rated = 0;
    for (let n = 1; n <= 5; n++) {
      stars.appendChild(h('button', {
        class: 'pill', type: 'button',
        onclick: (e) => {
          rated = n;
          store.addSelfRating(n);
          [...stars.children].forEach((b, idx) => b.classList.toggle('on', idx < n));
          toast('บันทึกคะแนนตัวเอง ' + n + '/5');
        },
      }, '★'.repeat(n)));
    }

    const flagWrap = h('div', { class: 'keyvocab', style: { justifyContent: 'center', marginTop: '8px' } });
    const flagged = new Set();
    for (const w of flagWords) {
      flagWrap.appendChild(h('button', {
        class: 'kv', type: 'button',
        onclick: (e) => {
          const on = flagged.has(w);
          if (on) { flagged.delete(w); e.currentTarget.style.opacity = '1'; }
          else { flagged.add(w); e.currentTarget.style.opacity = '.45'; if (onFlag) onFlag(w); }
        },
      }, w));
    }

    mount(resultBox,
      h('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } },
        h('button', { class: 'btn btn-ghost btn-block btn-sm', type: 'button', onclick: () => playBlob(blob, 1) }, '🔊 เสียงของคุณ'),
        speak ? h('button', { class: 'btn btn-ghost btn-block btn-sm', type: 'button', onclick: () => speak() }, '🔊 เสียงต้นแบบ') : null),
      h('div', { class: 'tiny muted center', style: { marginTop: '8px' }, text: 'ฟังเทียบแล้วให้คะแนนตัวเอง' }),
      stars,
      flagWords.length ? h('div', {
        class: 'tiny muted center', style: { marginTop: '10px' },
        text: 'คำไหนยังไม่ชัด? แตะเพื่อเก็บไว้ทบทวน',
      }) : null,
      flagWords.length ? flagWrap : null,
      h('div', { class: 'row', style: { gap: '8px', marginTop: '12px' } },
        h('button', { class: 'btn btn-ghost btn-block btn-sm', type: 'button', onclick: () => { clear(resultBox); statusEl.textContent = 'กดไมค์แล้วพูดอีกครั้ง'; } }, 'อัดใหม่'),
        h('button', {
          class: 'btn btn-primary btn-block', type: 'button',
          onclick: () => {
            if (key) store.gradeSentence(key, rated >= 3 ? 3 : 1);
            if (onNext) onNext();
          },
        }, nextLabel)));
  }

  micBtn.onclick = () => { if (recording) stop(); else start(); };

  // กันไมค์ค้างเมื่อผู้ใช้ออกหน้าไปก่อน
  const onHash = () => {
    if (!document.body.contains(panel)) {
      if (recording) { abortRecording(); recording = false; }
      clearInterval(timerId);
      window.removeEventListener('hashchange', onHash);
    }
  };
  window.addEventListener('hashchange', onHash);

  return panel;
}
