/* sw.js — service worker ของ PangPood (V2) · scope = โฟลเดอร์ /v2/ เท่านั้น
 * แยก cache จาก V1 เด็ดขาด (ชื่อ cache ขึ้นต้นด้วย pangpood-)
 */
const VERSION = 'v2.6.0';
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
  './js/views-review.js',
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
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('pangpood-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ข้อมูล JSON: เอาใหม่ก่อน ถ้าออฟไลน์ค่อยใช้แคช
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
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

  // ไฟล์เสียง/แอป: แคชก่อน แล้วค่อยอัปเดตเบื้องหลัง
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
    if (req.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return Response.error();
  })());
});
