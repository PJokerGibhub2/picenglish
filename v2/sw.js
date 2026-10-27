/* sw.js — service worker ของ PangPood (V2) · scope = โฟลเดอร์ /v2/ เท่านั้น
 *
 * บทเรียนจากการใช้งานจริง: cache-first ทำให้เครื่องที่เคยเปิดแอปค้างเวอร์ชันเก่า
 * → เปลี่ยนเป็น "network-first" สำหรับ HTML/JS/CSS และใช้ fetch cache:'reload'
 *   ตอน precache เพื่อไม่ให้ HTTP cache ของเบราว์เซอร์มาทับ
 */
const VERSION = 'v2.11.0';
const CACHE = `pangpood-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/version.js',
  './js/app.js',
  './js/ui2.js',
  './js/mascot2.js',
  './js/progress2.js',
  './js/data.js',
  './js/store.js',
  './js/speech.js',
  './js/recorder.js',
  './js/sfx.js',
  './js/listen-once.js',
  './js/placement.js',
  './js/views-path.js',
  './js/views-words.js',
  './js/views-quest.js',
  './js/views-me.js',
  './js/views-session.js',
  './js/views-review.js',
  './js/views-practice.js',
  './js/views-speak.js',
  './js/views-roleplay.js',
  './js/views-listening.js',
  './js/views-sentences.js',
  './js/views-chunk-drill.js',
  './js/views-chunks.js',
  './js/views-shadow.js',
  './js/session.js',
  './data/path.json',
  './data/words.json',
  './data/categories.json',
  './data/dialogues.json',
  './data/listening.json',
  './data/chunks.json',
  './data/placement.json',
  './data/audio/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res.clone());
      } catch { /* ออฟไลน์ตอนติดตั้ง: ข้ามไฟล์นี้ */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('pangpood-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const scopePath = new URL(self.registration.scope).pathname;
const isInScope = (url) => url.pathname.startsWith(scopePath);
const isData = (url) => url.pathname.includes('/data/') && url.pathname.endsWith('.json');
const isCode = (url) => /\.(html?|js|css)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!isInScope(url)) return;

  // ข้อมูล JSON: ใหม่ก่อน ถ้าออฟไลน์ค่อยใช้แคช
  if (isData(url)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'reload' });
        if (res && res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // HTML/JS/CSS: เอาของใหม่ก่อนเสมอ (กันเครื่องค้างเวอร์ชันเก่า) แล้วค่อย fallback แคช
  if (isCode(url)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'reload' });
        if (res && res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        return Response.error();
      }
    })());
    return;
  }

  // ไฟล์เสียง/อื่น ๆ: แคชก่อน แล้วอัปเดตเบื้องหลัง
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    if (cached) { network; return cached; }
    const res = await network;
    if (res) return res;
    return Response.error();
  })());
});
