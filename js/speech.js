/**
 * speech.js — เสียงอ่านออกเสียง (Web Speech API) + ไฮไลท์คำแบบคาราโอเกะ + ฝึกออกเสียง
 * ทำงานในเบราว์เซอร์ล้วน ไม่เรียกบริการภายนอก ไม่มีค่าใช้จ่าย
 */

/* ------------------------------------------------------------------ *
 * 1) Text-to-Speech
 * ------------------------------------------------------------------ */

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let cachedVoices = [];

export function loadVoices() {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) { cachedVoices = now; return Promise.resolve(now); }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cachedVoices = speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
    setTimeout(finish, 1200);
  });
}

export function englishVoices() {
  if (!cachedVoices.length) cachedVoices = ttsSupported() ? speechSynthesis.getVoices() : [];
  return cachedVoices.filter((v) => /^en(-|_|$)/i.test(v.lang));
}

// ชื่อเสียงที่บอกเพศได้จากชื่อ (ครอบคลุมเสียงยอดนิยมของ Windows / macOS / Android / Chrome)
const MALE_NAMES = /\b(david|mark|guy|ryan|andrew|brian|christopher|eric|roger|steffan|alex|daniel|aaron|fred|james|george|oliver|thomas|matthew|joey|stephen|arthur|liam|william|nathan|tom|male|man|jacques|diego|jorge|juan|carlos|pavel|yuri)\b/i;
const FEMALE_NAMES = /\b(aria|jenny|zira|samantha|ava|allison|susan|karen|moira|tessa|victoria|zoe|emma|olivia|sonia|libby|michelle|ana|clara|natasha|serena|kathy|princess|female|woman|hazel|salli|joanna|kendra|kimberly|ivy|ruth|danielle|heather|nicky|martha|catherine|fiona|veena|rishi)\b/i;

// เสียงที่ผู้เรียนไทยมักฟังเข้าใจง่าย (ออกเสียงชัด จังหวะไม่เร็วเกิน)
const CLEAR_FOR_LEARNERS = /\b(guy|brian|andrew|christopher|eric|ryan|daniel|alex|thomas|matthew)\b/i;

export function pickVoice(preferredURI, gender = 'auto') {
  const list = englishVoices();
  if (!list.length) return null;
  if (preferredURI) {
    const hit = list.find((v) => v.voiceURI === preferredURI) || list.find((v) => v.name === preferredURI);
    if (hit) return hit;
  }
  const score = (v) => {
    let s = 0;
    if (/en-US/i.test(v.lang)) s += 30;
    else if (/en-GB/i.test(v.lang)) s += 18;
    else s += 8;
    if (/google/i.test(v.name)) s += 14;
    if (/natural|neural|premium|enhanced/i.test(v.name)) s += 12;
    if (CLEAR_FOR_LEARNERS.test(v.name)) s += 10;
    if (v.localService) s += 4;
    if (gender === 'male') {
      if (MALE_NAMES.test(v.name)) s += 45;
      else if (FEMALE_NAMES.test(v.name)) s -= 45;
    } else if (gender === 'female') {
      if (FEMALE_NAMES.test(v.name)) s += 45;
      else if (MALE_NAMES.test(v.name)) s -= 45;
    }
    return s;
  };
  return list.slice().sort((a, b) => score(b) - score(a))[0];
}

export function stopSpeaking() {
  if (ttsSupported()) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  stopAudio();
}

/**
 * อ่านข้อความออกเสียง
 * คืนค่าเป็น Promise ที่ resolve ตอนอ่านจบ (หรือทันทีถ้าไม่รองรับ)
 */
export function speak(text, opts = {}) {
  return new Promise((resolve) => {
    if (!ttsSupported() || !text) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(opts.voiceURI, opts.gender);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
    u.rate = clamp(opts.rate ?? 0.95, 0.5, 1.6);
    u.pitch = clamp(opts.pitch ?? 1, 0.5, 2);
    u.volume = 1;
    if (opts.onBoundary) u.addEventListener('boundary', opts.onBoundary);
    u.addEventListener('start', () => opts.onStart && opts.onStart());
    u.addEventListener('end', () => { opts.onEnd && opts.onEnd(); resolve(); });
    u.addEventListener('error', () => { opts.onEnd && opts.onEnd(); resolve(); });
    try { speechSynthesis.cancel(); speechSynthesis.speak(u); }
    catch (err) { console.warn('[speech] speak ล้มเหลว', err); resolve(); }
  });
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

/* ------------------------------------------------------------------ *
 * 1.5) ไฟล์เสียงที่บันทึกไว้ล่วงหน้า (ถ้ามี)
 *
 * ข้อดีของไฟล์เสียงที่เตรียมไว้: เสียงผู้ชายคุณภาพสูงเหมือนกันทุกเครื่อง ฟังง่าย
 * และใช้ได้ตอนออฟไลน์ โดยไม่ต้องพึ่งเสียงของระบบปฏิบัติการ
 * ถ้าไม่มีไฟล์ ระบบจะถอยกลับไปใช้เสียงของเบราว์เซอร์อัตโนมัติ
 * ------------------------------------------------------------------ */

const AUDIO_MANIFEST_URL = new URL('../data/audio/manifest.json', import.meta.url);
let audioManifest = null;
let currentAudio = null;

export async function loadAudioManifest() {
  if (audioManifest !== null) return audioManifest;
  try {
    const res = await fetch(AUDIO_MANIFEST_URL);
    audioManifest = res.ok ? await res.json() : {};
  } catch (err) {
    audioManifest = {};
  }
  return audioManifest;
}

/** คืน URL ของไฟล์เสียงที่เตรียมไว้ ถ้ามี */
/**
 * คืน URL ของไฟล์เสียงที่เตรียมไว้ (Kokoro TTS)
 * manifest รองรับ 2 แบบ: "path.mp3" (เก่า) หรือ { f: "f/x.mp3", m: "m/x.mp3" }
 * @param {string} key
 * @param {'female'|'male'|'f'|'m'} [gender] ค่าเริ่มต้น = ผู้หญิง (af_heart)
 */
export function audioUrl(key, gender) {
  if (!key || !audioManifest) return null;
  const entry = audioManifest[key];
  if (!entry) return null;
  const g = (gender === 'male' || gender === 'm') ? 'm' : 'f';
  let rel = null;
  if (typeof entry === 'string') rel = entry;
  else rel = entry[g] || entry.f || entry.m || null;
  return rel ? new URL(rel, AUDIO_MANIFEST_URL).href : null;
}

export function stopAudio() {
  if (currentAudio) {
    try { currentAudio.pause(); } catch (e) { /* ignore */ }
    currentAudio = null;
  }
}

export function playFile(url, rate = 1) {
  return new Promise((resolve) => {
    stopAudio();
    let a;
    try { a = new Audio(url); } catch (e) { return resolve(); }
    a.playbackRate = clamp(rate, 0.5, 2);
    a.preservesPitch = true;
    currentAudio = a;
    a.addEventListener('ended', () => { currentAudio = null; resolve(); });
    a.addEventListener('error', () => { currentAudio = null; resolve(); });
    a.play().catch(() => { currentAudio = null; resolve(); });
  });
}

/**
 * พูดข้อความ โดยเลือกอัตโนมัติ: ไฟล์เสียงที่เตรียมไว้ → เสียงของเบราว์เซอร์
 * @param {string} text ข้อความที่จะอ่าน
 * @param {object} opts { audioKey, rate, voiceURI, gender, onEnd }
 */
export function sayText(text, opts = {}) {
  const url = opts.audioKey ? audioUrl(opts.audioKey, opts.gender) : null;
  if (url) {
    return playFile(url, opts.rate ?? 1).then(() => { opts.onEnd && opts.onEnd(); });
  }
  return speak(text, opts);
}

/* ------------------------------------------------------------------ *
 * 2) ไฮไลท์คำแบบคาราโอเกะ
 * ------------------------------------------------------------------ */

const WORD_RE = /[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g;

/**
 * แทนที่ข้อความใน element ด้วย <span class="w"> ทีละคำ
 * พร้อมจำตำแหน่งตัวอักษรเริ่มต้นของแต่ละคำไว้ใช้จับคู่กับเหตุการณ์ boundary
 */
export function renderSentence(el, text) {
  el.textContent = '';
  const frag = document.createDocumentFragment();
  const words = [];
  let last = 0;
  let m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const span = document.createElement('span');
    span.className = 'w';
    span.textContent = m[0];
    span.dataset.start = String(m.index);
    span.dataset.end = String(m.index + m[0].length);
    frag.appendChild(span);
    words.push(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  el.appendChild(frag);
  return words;
}

export function clearHighlight(el) {
  el.querySelectorAll('.w.hl').forEach((s) => s.classList.remove('hl'));
}

function highlightIndex(words, charIndex) {
  let target = null;
  for (const span of words) {
    if (Number(span.dataset.start) <= charIndex) target = span; else break;
  }
  if (!target) return;
  if (target.classList.contains('hl')) return;
  words.forEach((s) => s.classList.remove('hl'));
  target.classList.add('hl');
}

/**
 * อ่านประโยคพร้อมไฮไลท์คำที่กำลังอ่าน
 * ถ้าเบราว์เซอร์ไม่ส่งเหตุการณ์ boundary (เช่น Safari บางเวอร์ชัน) จะใช้การประมาณเวลาแทน
 */
export function speakSentence(el, text, opts = {}) {
  const words = renderSentence(el, text);
  let fallbackTimer = null;
  let stopped = false;
  let sawBoundary = false;

  const startFallback = () => {
    if (sawBoundary || stopped) return;
    // ประมาณเวลาต่อคำจากความยาวคำ (วินาที) แล้วไล่ไฮไลท์ตามลำดับ
    const rate = clamp(opts.rate ?? 0.95, 0.5, 1.6);
    let delay = 0;
    words.forEach((span, i) => {
      const len = span.textContent.length;
      const dur = ((0.26 + 0.052 * len) / rate) * 1000;
      fallbackTimer = setTimeout(() => {
        if (stopped || sawBoundary) return;
        words.forEach((s) => s.classList.remove('hl'));
        span.classList.add('hl');
        if (i === words.length - 1) setTimeout(() => { if (!sawBoundary) clearHighlight(el); }, dur);
      }, delay);
      delay += dur;
    });
  };

  const boundary = (ev) => {
    if (typeof ev.charIndex === 'number') {
      sawBoundary = true;
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
      highlightIndex(words, ev.charIndex);
    }
  };

  const guard = setTimeout(startFallback, 650);

  // ถ้ามีไฟล์เสียงที่เตรียมไว้ ใช้ไฟล์นั้น (เสียงผู้ชายคุณภาพสูงเหมือนกันทุกเครื่อง)
  // ไฟล์เสียงไม่มีเหตุการณ์ boundary จึงใช้การประมาณเวลาไฮไลท์ทั้งประโยค
  const fileUrl = opts.audioKey ? audioUrl(opts.audioKey, opts.gender) : null;
  if (fileUrl) {
    clearTimeout(guard);
    clearHighlight(el);
    opts.onStart && opts.onStart();
    startFallback();
    return playFile(fileUrl, opts.rate ?? 1).then(() => {
      stopped = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      clearHighlight(el);
      opts.onEnd && opts.onEnd();
    });
  }

  return speak(text, {
    ...opts,
    onBoundary: boundary,
    onStart: () => { clearHighlight(el); opts.onStart && opts.onStart(); },
    onEnd: () => {
      stopped = true;
      clearTimeout(guard);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      clearHighlight(el);
      opts.onEnd && opts.onEnd();
    },
  });
}

/* ------------------------------------------------------------------ *
 * 3) Speech Recognition — ฝึกออกเสียง
 * ------------------------------------------------------------------ */

export function sttSupported() {
  return sttSupport().ok;
}

/**
 * ตรวจความสามารถในการ "ฟังเสียง" พร้อมบอกเหตุผลเป็นภาษาไทย
 * iOS/iPadOS = ไม่มี API นี้เลย (Apple เปิดให้เฉพาะแอป native) — ต้องบอกผู้ใช้ตรง ๆ
 */
export function sttSupport() {
  if (typeof window === 'undefined') return { ok: false, reason: 'unknown', note: 'ตรวจสอบสภาพแวดล้อมไม่ได้' };
  if (window.SpeechRecognition || window.webkitSpeechRecognition) return { ok: true, reason: 'ok', note: '' };
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  if (iOS) {
    return {
      ok: false, reason: 'ios',
      note: 'iPhone/iPad ยังไม่เปิดให้เว็บแอปใช้ระบบฟังเสียง (Apple เปิดเฉพาะแอปที่ติดตั้งจาก App Store) — เครื่อง iPhone จึงให้คะแนนอัตโนมัติไม่ได้',
    };
  }
  const safari = /Safari/.test(ua) && !/Chrome|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua);
  if (safari) return { ok: false, reason: 'safari', note: 'Safari เวอร์ชันนี้ยังไม่รองรับการฟังเสียงของเว็บ — ลองใช้ Chrome หรือ Edge' };
  return { ok: false, reason: 'browser', note: 'เบราว์เซอร์นี้ไม่รองรับการฟังเสียง (ลอง Chrome/Edge รุ่นใหม่)' };
}

export function createRecognizer({ lang = 'en-US', interim = true, onResult, onEnd, onError } = {}) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = interim;
  rec.continuous = false;
  rec.maxAlternatives = 3;
  let finalText = '';
  rec.addEventListener('result', (ev) => {
    let interimText = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' ';
      else interimText += r[0].transcript;
    }
    onResult && onResult({ final: finalText.trim(), interim: interimText.trim(), done: false, alternatives: collectAlternatives(ev) });
  });
  rec.addEventListener('end', () => {
    onResult && onResult({ final: finalText.trim(), interim: '', done: true, alternatives: [] });
    onEnd && onEnd(finalText.trim());
  });
  rec.addEventListener('error', (ev) => {
    onError && onError(ev.error || 'unknown');
    onEnd && onEnd(finalText.trim());
  });
  return rec;
}

function collectAlternatives(ev) {
  const out = [];
  for (let i = ev.resultIndex; i < ev.results.length; i++) {
    const r = ev.results[i];
    for (let j = 0; j < r.length; j++) out.push(r[j].transcript.trim());
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 4) ให้คะแนนการออกเสียง
 * ------------------------------------------------------------------ */

export function normalizeEn(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}

/** ความคล้ายของสองประโยค 0..1 (ใช้ทั้งระดับตัวอักษรและระดับคำ) */
export function sentenceSimilarity(target, said) {
  const t = normalizeEn(target);
  const s = normalizeEn(said);
  if (!t) return 0;
  if (!s) return 0;
  const charScore = 1 - levenshtein(t, s) / Math.max(t.length, s.length);
  const tw = t.split(' ');
  const sw = s.split(' ');
  const wordScore = 1 - levenshtein(tw.join(' '), sw.join(' ')) / Math.max(tw.length, sw.length);
  return Math.max(0, Math.min(1, charScore * 0.4 + wordScore * 0.6));
}

/**
 * เทียบคำทีละคำด้วย LCS เพื่อบอกว่าคำไหนออกเสียงถูก/ผิด
 * คืนค่า { marks: boolean[] (ตรงกับคำใน target), score: 0..1, missed: string[] }
 */
export function alignWords(target, said) {
  const tw = normalizeEn(target).split(' ').filter(Boolean);
  const sw = normalizeEn(said).split(' ').filter(Boolean);
  const ok = new Array(tw.length).fill(false);
  const used = new Array(sw.length).fill(false);

  // จับคำที่ตรงกันแบบ fuzzy ด้วยอัตราส่วนตัวอักษร
  for (let i = 0; i < tw.length; i++) {
    let best = -1;
    let bestScore = 0;
    for (let j = 0; j < sw.length; j++) {
      if (used[j]) continue;
      const a = tw[i];
      const b = sw[j];
      const sim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
      const need = a.length <= 3 ? 1 : 0.72;
      if (sim >= need && sim > bestScore) { best = j; bestScore = sim; }
    }
    if (best >= 0) { used[best] = true; ok[i] = true; }
  }

  // ถ้าจับได้น้อยเกินไป (ผู้ใช้อาจพูดคำเดียว) ให้ลองเทียบทั้งประโยคเป็นก้อน
  const hit = ok.filter(Boolean).length;
  if (tw.length > 1 && hit / tw.length < 0.5) {
    const whole = sentenceSimilarity(target, said);
    if (whole > 0.75) ok.fill(true);
  }

  const missed = tw.filter((_, i) => !ok[i]);
  const score = tw.length ? Math.round((ok.filter(Boolean).length / tw.length) * 100) : 0;
  return { marks: ok, score, missed, targetWords: tw };
}

/** แปลงรหัสข้อผิดพลาดของ SpeechRecognition เป็นคำแนะนำภาษาไทยที่ทำตามได้ */
export function sttErrorReason(err) {
  const map = {
    'not-allowed': 'ยังไม่อนุญาตให้ใช้ไมโครโฟน — กดไอคอนรูปไมค์/กุญแจบนแถบที่อยู่เว็บ แล้วเลือก "อนุญาต"',
    'service-not-allowed': 'เบราว์เซอร์นี้ปิดระบบฟังเสียงไว้ — ถ้าเปิดจาก LINE/Facebook ให้กดเปิดใน Chrome หรือ Safari แทน',
    'audio-capture': 'ไม่พบไมโครโฟน หรือมีแอปอื่นใช้ไมค์อยู่ — ปิดแอปนั้นแล้วลองใหม่',
    network: 'Android ต้องต่ออินเทอร์เน็ตเพื่อใช้ระบบฟังเสียงของ Google — เน็ตไม่ถึงหรือ VPN บล็อกอยู่',
    'no-speech': 'ไม่ได้ยินเสียง — พูดดังขึ้นอีกนิดแล้วลองใหม่',
    aborted: 'หยุดฟังก่อนกำหนด — กดไมค์แล้วพูดใหม่',
  };
  return map[err] || ('เกิดข้อผิดพลาด: ' + (err || 'unknown'));
}

/** ตรวจว่าเปิดอยู่ในเบราว์เซอร์ของแอป (LINE/FB/IG/TikTok) ซึ่งมักบล็อกไมค์ */
export function inAppBrowser(uaOverride) {
  try {
    const ua = uaOverride || navigator.userAgent || '';
    const m = ua.match(/\b(Line|FBAN|FBAV|Instagram|TikTok|MicroMessenger|KAKAOTALK|NAVER)\b/i);
    if (m) return m[1];
    return /\bwv\b/.test(ua) ? 'WebView' : '';
  } catch (e) { return ''; }
}
/**
 * ทดสอบระบบฟังเสียงจริง 4 วินาที → คืนรหัส error ที่แท้จริง
 * ใช้แยกว่า "ไม่มี Permission" กับ "เครื่องไม่มีบริการถอดเสียง (network)"
 */
export function sttSelfTest(timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!sttSupported()) { resolve({ ok: false, err: 'unsupported' }); return; }
    let done = false;
    const finish = (res) => { if (done) return; done = true; try { rec && rec.abort && rec.abort(); } catch (e) { /* ignore */ } resolve(res); };
    let rec = null;
    try {
      rec = createRecognizer({
        lang: 'en-US',
        interim: false,
        onResult: ({ final }) => finish({ ok: true, err: '', text: final || '' }),
        onError: (err) => finish({ ok: false, err }),
        onEnd: () => finish({ ok: false, err: 'no-speech' }),
      });
      if (!rec) { resolve({ ok: false, err: 'unsupported' }); return; }
      rec.start();
    } catch (e) {
      finish({ ok: false, err: 'start-failed' });
      return;
    }
    setTimeout(() => finish({ ok: false, err: 'timeout' }), timeoutMs);
  });
}