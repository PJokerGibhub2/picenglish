/* app.js — ตัวนำทางของ PangPood (V2)
 * ต่างจาก V1: แท็บล่าง 4 อัน, หน้าหลักเป็นเส้นทาง, ไม่มี topbar หนา
 */
import { h, mount, icon, toast } from './ui2.js';
import { loadAudioManifest } from './speech.js';
import { pathView } from './views-path.js';
import { wordsView } from './views-words.js';
import { questView } from './views-quest.js';
import { meView } from './views-me.js';
import { sessionView } from './views-session.js';
import { reviewView } from './views-review.js';
import { VERSION, APP_NAME } from './version.js';

const TABS = [
  { id: 'path', label: 'เส้นทาง', icon: 'route', view: pathView },
  { id: 'quest', label: 'เควส', icon: 'target', view: questView },
  { id: 'words', label: 'คลังคำ', icon: 'book', view: wordsView },
  { id: 'me', label: 'ฉัน', icon: 'user', view: meView },
];

let currentCleanup = null;
let currentTab = 'path';

function parseHash() {
  const raw = (location.hash || '#/path').replace(/^#\/?/, '');
  const [head, query] = raw.split('?');
  const [tab, ...rest] = head.split('/');
  return { tab: tab || 'path', rest, query: new URLSearchParams(query || '') };
}

function renderTabs(active) {
  const barEl = document.getElementById('tabbar');
  mount(barEl, ...TABS.map((t) => h('button', {
    class: `tab${t.id === active ? ' on' : ''}`, type: 'button',
    'data-tab': t.id,
    onclick: () => { location.hash = `#/${t.id}`; },
  }, h('span', { class: 'tab-ico' }, icon(t.icon, 24)), h('span', { class: 'tab-lbl', text: t.label }))));
}

async function route() {
  const { tab, query } = parseHash();
  const inSession = tab === 'lesson';
  const inReview = tab === 'review';
  const found = TABS.find((t) => t.id === tab) || TABS[0];
  currentTab = inSession ? 'path' : found.id;
  renderTabs(currentTab);

  const view = document.getElementById('view');
  if (currentCleanup) { try { currentCleanup(); } catch (e) { /* ignore */ } currentCleanup = null; }
  mount(view);
  view.scrollTop = 0;
  document.body.dataset.tab = currentTab;
  document.body.classList.toggle('in-session', inSession || inReview);

  try {
    const cleanup = inSession
      ? await sessionView(view, query.get('id') || '')
      : inReview ? await reviewView(view)
      : await found.view(view);
    currentCleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (err) {
    document.body.classList.remove('in-session');
    mount(view, h('div', { class: 'card' },
      h('div', { class: 'bold', text: 'เปิดหน้านี้ไม่ได้' }),
      h('div', { class: 'muted small', text: String(err && err.message ? err.message : err) })));
  }
}

function boot() {
  loadAudioManifest().catch(() => {});
  document.getElementById('ver-tag').textContent = VERSION;
  renderTabs(currentTab);
  route();
  window.addEventListener('hashchange', route);

  // service worker (scope = โฟลเดอร์ v2 เท่านั้น)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then((reg) => { reg.update && reg.update(); })
      .catch(() => { /* ออฟไลน์ครั้งแรกก็ยังใช้ได้ */ });
  }

  // ปุ่มตั้งค่าเร็ว
  const gear = document.getElementById('gear');
  if (gear) {
    gear.appendChild(icon('gear', 22));
    gear.onclick = () => { location.hash = '#/me'; };
  }

  // แจ้งเมื่อมีเวอร์ชันใหม่
  window.addEventListener('sw:update', () => toast('มีเวอร์ชันใหม่ — ปิดแล้วเปิดแอปอีกครั้ง'));
}

boot();
