/**
 * liff.js — เชื่อมแอปกับ LINE (LIFF = LINE Front-end Framework)
 *
 * หลักการ: แอปต้องทำงานได้เต็มที่แม้ไม่มี LINE (เว็บ/PWA ปกติ)
 * LIFF เป็น "ส่วนเสริม" ที่เปิดใช้เมื่อมีการตั้งค่า LIFF ID เท่านั้น
 *
 * วิธีเปิดใช้จริง
 *   1) สร้าง LIFF app ที่ https://developers.line.biz/console/ (Endpoint URL = URL ที่ deploy แล้ว)
 *   2) คัดลอก LIFF ID (รูปแบบ 1234567890-AbCdEfGh) มาใส่ใน index.html:
 *        <meta name="liff-id" content="1234567890-AbCdEfGh" />
 *      หรือเปิดด้วย ?liffId=1234567890-AbCdEfGh
 *   3) เปิดผ่าน LINE → แอปจะปรับหน้าจอและระยะปลอดภัย (safe area) อัตโนมัติ
 *
 * ดูหน้าตาแบบไม่ต้องมี LINE: เปิด index.html?preview=liff (ใช้หน้าพรีวิว docs/liff-preview.html)
 */

const SDK_URL = 'https://static.line-scdn.net/liff/edge/2/sdk.js';

let state = {
  ready: false,
  configured: false,
  inClient: false,
  preview: false,
  loggedIn: false,
  profile: null,
  error: null,
};

const PREVIEW_PROFILE = {
  userId: 'U-preview',
  displayName: 'คุณ (ตัวอย่าง)',
  statusMessage: 'โหมดพรีวิว LIFF',
  pictureUrl: '',
};

function qs(name) {
  try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
}

/** LIFF ID จาก ?liffId= หรือจาก <meta name="liff-id"> */
export function getLiffId() {
  const fromQuery = qs('liffId');
  if (fromQuery) return fromQuery;
  const meta = document.querySelector('meta[name="liff-id"]');
  const v = meta ? (meta.getAttribute('content') || '').trim() : '';
  return v && !/your-liff-id/i.test(v) ? v : '';
}

export function isPreview() { return qs('preview') === 'liff'; }

export function liffState() { return { ...state }; }

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('โหลด LIFF SDK ไม่สำเร็จ'));
    document.head.appendChild(s);
  });
}

/**
 * เริ่มต้น LIFF (ถ้ามีการตั้งค่า) — เรียกครั้งเดียวตอนแอปเริ่มทำงาน
 * @returns {Promise<typeof state>}
 */
export async function initLiff() {
  if (state.ready) return state;
  state.preview = isPreview();
  state.configured = !!getLiffId() || state.preview;

  // โหมดพรีวิว: จำลองสภาพแวดล้อมของ LINE โดยไม่ต้องโหลด SDK
  if (state.preview) {
    state.ready = true;
    state.inClient = true;
    state.loggedIn = true;
    state.profile = PREVIEW_PROFILE;
    applyLineLayout();
    return state;
  }

  if (!state.configured) { state.ready = true; return state; }

  try {
    await loadScript(SDK_URL);
    if (!window.liff) throw new Error('ไม่พบ liff ในหน้าเว็บ');
    await window.liff.init({ liffId: getLiffId() });
    state.inClient = window.liff.isInClient();
    state.loggedIn = window.liff.isLoggedIn();
    if (state.inClient || state.loggedIn) applyLineLayout();
    if (state.loggedIn) {
      try { state.profile = await window.liff.getProfile(); } catch (err) { /* อาจไม่ได้ขอ scope profile */ }
    }
  } catch (err) {
    state.error = String(err && err.message ? err.message : err);
    console.warn('[liff] เริ่มต้นไม่สำเร็จ (แอปยังใช้งานได้ปกติ)', err);
  } finally {
    state.ready = true;
  }
  return state;
}

function applyLineLayout() {
  const html = document.documentElement;
  html.classList.add('in-liff');
  if (state.inClient) html.classList.add('liff-client');
  if (state.preview) html.classList.add('liff-preview');
}

/** แสดงชื่อ/รูปผู้ใช้ LINE บนแถบหัว (ถ้ามี) */
export function profileChip() {
  if (!state.profile || !state.profile.displayName) return null;
  const wrap = document.createElement('span');
  wrap.className = 'liff-profile';
  const name = document.createElement('span');
  name.className = 'liff-name';
  name.textContent = state.profile.displayName;
  wrap.appendChild(name);
  if (state.profile.pictureUrl) {
    const img = document.createElement('img');
    img.src = state.profile.pictureUrl;
    img.alt = state.profile.displayName;
    img.className = 'liff-avatar';
    wrap.insertBefore(img, name);
  }
  return wrap;
}

/** แชร์ข้อความให้เพื่อนผ่าน LINE (ทำงานเฉพาะในแอป LINE) */
export async function shareToLine(text) {
  if (state.preview) {
    return { ok: false, reason: 'preview' };
  }
  if (!state.inClient || !window.liff) {
    return { ok: false, reason: 'not-in-line' };
  }
  try {
    await window.liff.shareTargetPicker([{ type: 'text', text }]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
}

/** ปิดหน้าต่าง LIFF (ใช้กับปุ่ม "เสร็จแล้ว" ในแอป LINE) */
export function closeLiff() {
  try {
    if (window.liff && state.inClient) window.liff.closeWindow();
  } catch (e) { /* ignore */ }
}

export function isInLineClient() { return state.inClient; }
