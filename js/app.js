/**
 * app.js — ตัวควบคุมหลัก: router, ธีม, ปุ่มตั้งค่า, service worker
 */

import { loadAll, db } from './data.js';
import { views, openSettings } from './views.js';
import { speakingHub, roleplay, sentenceReview, oneMinute } from './views-speaking.js';
import { today } from './views-today.js';
import { inAppBanner } from './openinbrowser.js';
import { setPlaybackVolume } from './speech.js';
import { VERSION as APP_VERSION, BUILD_DATE } from './version.js';
import { h, mount, toast, emptyState } from './ui.js';
import * as store from './store.js';
import { loadVoices, loadAudioManifest } from './speech.js';
import { initLiff, profileChip, liffState } from './liff.js';
import { placement } from './views-placement.js';
import { listening } from './views-listening.js';
import { shadow } from './views-shadow.js';
import { chunks } from './views-chunks.js';
import { dictation } from './views-dictation.js';
import { builder } from './views-builder.js';

const TITLES = {
  today: 'PicEnglish',
  placement: 'ทดสอบวัดระดับ',
  learn: 'การ์ดคำศัพท์',
  listen: 'ฟังประโยค',
  listening: 'ฝึกฟัง',
  shadow: 'พูดตามเงา',
  speaking: 'ฝึกพูด',
  roleplay: 'บทสนทนาจำลอง',
  sentenceReview: 'ทบทวนประโยค',
  onemin: 'พูดคนเดียว 60 วินาที',
  games: 'เกม',
  quiz: 'ควิซปรนัย',
  match: 'จับคู่คำอังกฤษ-ไทย',
  speak: 'ฝึกออกเสียง',
  review: 'ทบทวน (SRS)',
  mine: 'คำของฉัน',
  chunks: 'ประโยคสำเร็จรูป',
  dictation: 'ฟังแล้วพิมพ์',
  builder: 'เรียงประโยค',
};

// เส้นทางทั้งหมด (เพิ่มโหมดฝึกพูดเข้าไปโดยไม่แตะ views เดิม)
const ROUTES = {
  today,
  placement,
  ...views,
  speaking: speakingHub,
  roleplay,
  sentenceReview,
  onemin: oneMinute,
  listening,
  shadow,
  chunks,
  dictation,
  builder,
};

const TABS = ['learn', 'listen', 'speaking', 'review', 'mine'];
// หน้าที่ถือว่าอยู่ในแท็บ "ฝึกพูด"
const SPEAKING_PAGES = ['speaking', 'roleplay', 'sentenceReview', 'onemin', 'games', 'quiz', 'match', 'speak', 'shadow', 'chunks'];
// แท็บที่ควรไฮไลต์เมื่ออยู่หน้าย่อย
const TAB_OF = { listen: 'learn', games: 'speaking', quiz: 'speaking', match: 'speaking', speak: 'speaking', roleplay: 'speaking', sentenceReview: 'speaking', onemin: 'speaking', shadow: 'speaking', chunks: 'learn', dictation: 'learn', builder: 'learn' };
const viewEl = document.getElementById('view');
const titleEl = document.getElementById('topbar-title');
const backBtn = document.getElementById('btn-back');
const streakChip = document.getElementById('streak-chip');
const xpChip = document.getElementById('xp-chip');
const dueBadge = document.getElementById('due-badge');

let cleanup = null;
let pendingRefresh = false;
let started = false;

/* ---------------- ธีม ---------------- */
function applyVolume() {
  try { setPlaybackVolume(store.settings().volume); } catch (e) { /* ignore */ }
}

function applyTheme() {
  const mode = store.settings().theme;
  const dark = mode === 'dark'
    || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0f1a' : '#4f46e5');
}

/* ---------------- ตัวเลขบนหน้าจอ ---------------- */
function paintVersionBadge() {
  const el = document.getElementById('topbar-ver');
  if (el) el.textContent = APP_VERSION;
}

function updateBadges() {
  const due = store.dueCount();
  if (due > 0) { dueBadge.textContent = String(due); dueBadge.classList.remove('hidden'); }
  else dueBadge.classList.add('hidden');

  const streak = store.streakDays();
  if (streak > 0) { streakChip.querySelector('b').textContent = String(streak); streakChip.classList.remove('hidden'); }
  else streakChip.classList.add('hidden');

  const xp = store.totalXp();
  if (xp > 0) { xpChip.querySelector('b').textContent = String(xp); xpChip.classList.remove('hidden'); }
  else xpChip.classList.add('hidden');
}

/* ---------------- Router ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const name = (path || 'today').trim();
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name, params };
}

/** แสดงเลขเวอร์ชันท้ายแอป เพื่อให้รู้ว่ากำลังใช้รุ่นไหน */
function renderVersionTag() {
  const slot = document.getElementById('app-version-slot');
  if (!slot) return;
  const d = new Date(BUILD_DATE + 'T00:00:00');
  const thai = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  slot.innerHTML = '';
  const tag = document.createElement('div');
  tag.id = 'app-version';
  tag.className = 'app-version';
  tag.textContent = 'PicEnglish ' + APP_VERSION + ' · ' + thai;
  tag.title = 'เวอร์ชันแอป: ' + APP_VERSION + ' (build ' + BUILD_DATE + ')';
  slot.appendChild(tag);
}
function route() {
  const { name, params } = parseHash();
  const render = ROUTES[name] || ROUTES.today;

  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  document.querySelectorAll('.tabbar a').forEach((a) => {
    const tab = a.dataset.tab;
    const active = tab === name || tab === TAB_OF[name];
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  titleEl.textContent = TITLES[name] || 'PicEnglish';
  backBtn.classList.toggle('hidden', !['quiz', 'match', 'speak', 'roleplay', 'sentenceReview', 'onemin'].includes(name));
  viewEl.scrollTop = 0;
  window.scrollTo(0, 0);

  try {
    cleanup = render(viewEl, params) || null;
  } catch (err) {
    console.error(err);
    mount(viewEl, emptyState('😵', 'เกิดข้อผิดพลาดในการแสดงผล', String(err && err.message || err)));
  }
  updateBadges();
  paintVersionBadge();
}

backBtn.addEventListener('click', () => {
  if (location.hash === '#/games') return;
  location.hash = '#/games';
});

document.getElementById('btn-settings').addEventListener('click', () => {
  openSettings(() => { applyTheme(); pendingRefresh = true; });
});

document.addEventListener('sheet:closed', (e) => {
  // วาดหน้าจอใหม่เฉพาะเมื่อ "แผงตั้งค่า" ถูกปิดเท่านั้น
  // ถ้าวาดใหม่เมื่อปิดแผงอื่น (เช่น แผงเลือกคำ) ความคืบหน้าระหว่างฝึกจะหายไป
  const id = e && e.detail ? e.detail.id : null;
  if (id === 'settings' && pendingRefresh) {
    pendingRefresh = false;
    applyTheme();
    applyVolume();
    route();
  }
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.settings().theme === 'auto') applyTheme();
});

/* ---------------- Service worker ---------------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.register(new URL('sw.js', location.href), { scope: './', updateViaCache: 'none' })
    .then(() => console.info('[app] service worker พร้อมใช้งาน — แอปใช้ offline ได้'))
    .catch((err) => console.warn('[app] ลงทะเบียน service worker ไม่สำเร็จ', err));
}

/* ---------------- อัปเดตเวอร์ชันอัตโนมัติ ---------------- */
let reloadedForUpdate = false;

/** เมื่อ service worker ใหม่เข้าควบคุม → โหลดหน้าใหม่หนึ่งครั้ง (แก้ปัญหา "ติดเวอร์ชันเก่า") */
function watchSwUpdate() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    location.reload();
  });
}

/** เทียบเวอร์ชันที่โหลดอยู่กับเวอร์ชันบนเซิร์ฟเวอร์ → เตือนถ้ามีใหม่ */
async function checkForUpdate() {
  try {
    const res = await fetch('js/version.js?cb=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const txt = await res.text();
    const m = txt.match(/VERSION = '([^']+)'/);
    const server = m && m[1];
    if (server && server !== APP_VERSION) showUpdateBar(server);
  } catch (e) { /* ออฟไลน์ — ไม่เป็นไร */ }
}

function showUpdateBar(serverVer) {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar';
  const msg = document.createElement('span');
  msg.className = 'update-msg';
  msg.textContent = 'มีเวอร์ชันใหม่ ' + serverVer + ' — กดอัปเดตเพื่อใช้ของใหม่';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary btn-sm';
  btn.textContent = 'อัปเดตเลย';
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'กำลังอัปเดต…';
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* ignore */ }
    location.reload();
  };
  bar.append(msg, btn);
  document.body.appendChild(bar);
}
/* ---------------- เริ่มต้น ---------------- */
async function main() {
  applyTheme();
  applyVolume();
  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    mount(viewEl, emptyState('📁', 'โหลดข้อมูลคำศัพท์ไม่สำเร็จ',
      'ถ้าเปิดไฟล์ด้วยการดับเบิลคลิก (file://) เบราว์เซอร์จะบล็อกการอ่านไฟล์ข้อมูล — ต้องเปิดผ่านเว็บเซิร์ฟเวอร์ เช่น "npx serve" หรือ "python -m http.server"'));
    return;
  }

  loadVoices().catch(() => {});
  loadAudioManifest().catch(() => {});

  // LINE (LIFF) — ถ้ามีการตั้งค่า LIFF ID หรือเปิดโหมดพรีวิว
  initLiff().then((st) => {
    if (st.inClient || st.preview) document.body.classList.add('line-mode');
    const chip = profileChip();
    if (chip) {
      const actions = document.querySelector('.topbar-actions');
      if (actions) actions.insertBefore(chip, actions.firstChild);
    }
    if (st.preview) toast('โหมดพรีวิว LINE — ปุ่มแชร์จะทำงานจริงในแอป LINE', '', 3800);
    else if (st.error) console.info('[liff]', st.error);
  }).catch(() => {});

  // แจ้งเตือนเมื่อเปิดจาก LINE/Facebook (ไมค์จะถูกบล็อก) — ต้องพาออกไปเบราว์เซอร์จริง
function renderInAppNotice() {
  const box = document.getElementById('inapp-warning');
  if (!box) return;
  const banner = inAppBanner({ compact: true });
  if (!banner) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.replaceChildren(banner);
}
renderInAppNotice();

  started = true;
  watchSwUpdate();
  route();
  registerSW();
  updateBadges();
  setTimeout(checkForUpdate, 1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });

  // อัปเดตป้ายเตือนทุกนาที (คำที่ครบกำหนดทบทวนจะเพิ่มขึ้นเรื่อยๆ)
  setInterval(() => { if (started) updateBadges(); }, 60000);

  document.addEventListener('visibilitychange', () => { if (!document.hidden && started) updateBadges(); });
}

window.addEventListener('hashchange', route);
main();
