/* PicEnglish service worker — offline-first สำหรับตัวแอป + cache ภาพถ่ายจากคลังฟรี */
const VERSION = 'v19';
const SHELL_CACHE = `picenglish-shell-${VERSION}`;
const PHOTO_CACHE = `picenglish-photos-${VERSION}`;

// ไฟล์โครงแอป (ใช้ relative path ทั้งหมดเพื่อรองรับ deploy ใต้ subpath เช่น GitHub Pages)
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/data.js',
  './js/store.js',
  './js/speech.js',
  './js/images.js',
  './js/ui.js',
  './js/views.js',
  './js/views-speaking.js',
  './js/recorder.js',
  './js/liff.js',
  './js/art.js',
  './js/mascot.js',
  './js/sfx.js',
  './js/version.js',
  './js/micfallback.js',
  './js/openinbrowser.js',
  './js/views-today.js',
  './data/words.json',
  './data/categories.json',
  './data/dialogues.json',
  './data/art/manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // ใส่ทีละไฟล์ เพื่อให้ไฟล์ที่หายไปเพียงไฟล์เดียวไม่ทำให้ install ล้มทั้งหมด
    await Promise.all(SHELL_ASSETS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] ข้ามไฟล์ที่แคชไม่ได้:', url, err);
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('picenglish-') && k !== SHELL_CACHE && k !== PHOTO_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isPhotoRequest(url) {
  return url.hostname.endsWith('wikimedia.org') || url.hostname.endsWith('wikipedia.org');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ภาพถ่ายจากคลังฟรี: cache-first (ใช้ซ้ำได้ตอนออฟไลน์หลังโหลดครั้งแรก)
  if (isPhotoRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(PHOTO_CACHE);
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    })());
    return;
  }

  // ตัวแอปเอง: network-first แล้ว fallback เป็น cache (ให้ได้เวอร์ชันใหม่ แต่ยังเปิดได้ตอนออฟไลน์)
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: false }) || await cache.match('./index.html');
        if (hit) return hit;
        throw err;
      }
    })());
  }
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(PHOTO_CACHE);
      for (const u of data.urls) {
        try { await cache.add(new Request(u, { mode: 'cors' })); } catch (err) { /* ข้าม */ }
      }
    })());
  }
});
