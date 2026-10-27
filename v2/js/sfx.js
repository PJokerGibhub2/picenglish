/**
 * sfx.js — เสียงเอฟเฟกต์ (สังเคราะห์ด้วย Web Audio ไม่ต้องโหลดไฟล์)
 *
 * ทำไม: เสียงเล็ก ๆ ตอนกด/สำเร็จ ทำให้แอปรู้สึก "แพง" และล้ำ (แบบ Siri/ELSA)
 * ข้อดี: 0 KB, ทำงานออฟไลน์, ปรับความดังได้, ไม่มีลิขสิทธิ์
 *
 * ทุกฟังก์ชันต้องถูกเรียกจาก "การกดของผู้ใช้" (browser ต้องมี gesture ก่อนเล่นเสียง)
 */

import * as store from './store.js';

let ac = null;

function audio() {
  if (store.settings().sfx === false) return null;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!ac) ac = new Ctx();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  } catch (e) {
    return null;
  }
}

/**
 * เล่นโน้ตหนึ่งตัว
 * @param {object} o { freq, dur, type, gain, when, slideTo }
 */
function tone(o = {}) {
  const ctx = audio();
  if (!ctx) return;
  const {
    freq = 440, dur = 0.12, type = 'sine', gain = 0.06, when = 0, slideTo = null,
  } = o;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
  // envelope: ขึ้นเร็ว ลงนุ่ม (ไม่ให้มีเสียง "แป๊ก")
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** แตะปุ่มทั่วไป */
export function sfxTap() {
  tone({ freq: 620, dur: 0.045, gain: 0.035, type: 'triangle' });
}

/** เริ่มอัดเสียง (ขึ้นสองโน้ต — ให้ความรู้สึก "เปิดไมค์") */
export function sfxMicStart() {
  tone({ freq: 523.25, dur: 0.08, gain: 0.05, type: 'sine' });
  tone({ freq: 783.99, dur: 0.09, gain: 0.045, type: 'sine', when: 0.07 });
}

/** หยุดอัดเสียง (ลงสองโน้ต) */
export function sfxMicStop() {
  tone({ freq: 783.99, dur: 0.07, gain: 0.045, type: 'sine' });
  tone({ freq: 523.25, dur: 0.09, gain: 0.05, type: 'sine', when: 0.07 });
}

/** สำเร็จ/ผ่านเกณฑ์ — chime สามโน้ต (แบบ ELSA) */
export function sfxSuccess() {
  [523.25, 659.25, 783.99].forEach((f, i) => {
    tone({ freq: f, dur: 0.18, gain: 0.06, type: 'sine', when: i * 0.085 });
  });
}

/** ยังไม่ผ่าน — สองโน้ตนุ่ม ๆ (ไม่ให้รู้สึกผิด) */
export function sfxSoft() {
  tone({ freq: 392, dur: 0.14, gain: 0.045, type: 'sine' });
  tone({ freq: 329.63, dur: 0.18, gain: 0.04, type: 'sine', when: 0.1 });
}

/** จบบท/ทำครบ — ขึ้นบันไดสั้น ๆ */
export function sfxComplete() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone({ freq: f, dur: 0.2, gain: 0.055, type: 'sine', when: i * 0.1 });
  });
}
