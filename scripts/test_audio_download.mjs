import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const port = process.env.CDP_PORT || 9411;
const app = process.env.APP_URL || 'http://127.0.0.1:5173/';
const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = pages.find((item) => item.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console.error');
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++seq, { resolve, reject });
  ws.send(JSON.stringify({ id: seq, method, params }));
});
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.navigate', { url: app });
  await wait(2500);
  await evaluate(`(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    window.t1Store = await import('./js/store.js');
    t1Store.setSetting('voiceGender', 'female');
    document.getElementById('btn-settings').click();
  })()`);
  const result = await evaluate(`(async () => {
    const row = () => document.querySelector('[data-audio-download]');
    const button = () => row().querySelector('button');
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const until = async (fn) => {
      for (let i = 0; i < 2000; i++) { if (fn()) return; await pause(20); }
      throw new Error('download timeout');
    };
    await until(() => row().textContent.includes('491 คลิป'));
    window.t1Fetch = window.fetch;
    let calls = [];
    let release;
    const entries = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, i === 11 ? { f: 'f/test11.mp3' } : { f: 'f/test' + i + '.mp3', m: 'm/test' + i + '.mp3' }]));
    let mode = 'success';
    window.fetch = async (url, options) => {
      const path = String(url);
      if (path.endsWith('manifest.json')) return new Response(JSON.stringify(entries));
      calls.push({ path, cache: options.cache });
      if (calls.length === 1 && mode === 'success') await new Promise((resolve) => { release = resolve; });
      if (mode === 'all' || (mode === 'partial' && path.includes('test2.'))) throw new Error('simulated offline');
      if (mode === 'html') return new Response('<html>offline fallback</html>', { headers: { 'Content-Type': 'text/html' } });
      return new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } });
    };
    t1Store.setSetting('voiceGender', 'male');
    button().click();
    await until(() => !!release);
    const disabled = button().disabled;
    button().click();
    const duplicateBlocked = calls.length === 1;
    const progress = row().textContent.includes('กำลังโหลด 0/12');
    document.getElementById('btn-settings').click();
    const reopenedDisabled = button().disabled;
    release();
    await until(() => !button().disabled);
    const success = button().textContent === '✅ ดาวน์โหลดครบแล้ว';
    const maleAndFallback = calls.length === 12 && calls.slice(0, 11).every((c) => c.path.includes('/m/')) && calls[11].path.includes('/f/');
    const cacheDefault = calls.every((c) => c.cache === 'default');
    mode = 'partial'; calls = [];
    button().click(); await until(() => !button().disabled);
    const partial = row().textContent.includes('พลาด 1 ไฟล์ — ลองใหม่ได้');
    mode = 'all'; calls = [];
    button().click(); await until(() => !button().disabled);
    const allFailed = row().textContent.includes('ยังดาวน์โหลดเสียงไม่ได้');
    mode = 'html'; calls = [];
    button().click(); await until(() => !button().disabled);
    const htmlRejected = row().textContent.includes('ยังดาวน์โหลดเสียงไม่ได้');
    const cacheDescriptor = Object.getOwnPropertyDescriptor(window, 'caches');
    let noCaches = false;
    try {
      delete window.caches;
      button().click(); await until(() => !button().disabled);
      noCaches = row().textContent.includes('ยังดาวน์โหลดเสียงไม่ได้');
    } finally {
      Object.defineProperty(window, 'caches', cacheDescriptor);
    }
    window.fetch = t1Fetch;
    t1Store.setSetting('voiceGender', 'female');
    document.getElementById('btn-settings').click();
    button().click();
    await until(() => !button().disabled);
    const realSuccess = button().textContent === '✅ ดาวน์โหลดครบแล้ว' && row().textContent.includes('491 คลิป');
    const manifest = await (await fetch('data/audio/manifest.json')).json();
    window.t1AudioUrls = Object.values(manifest).map((e) => new URL('data/audio/' + e.f, location.href).href);
    // cache.put ของ service worker อาจเสร็จหลัง fetch คืนค่าเล็กน้อย
    let cached = 0;
    for (let retry = 0; retry < 50; retry++) {
      cached = (await Promise.all(t1AudioUrls.map(async (url) => !!(await caches.match(url))))).filter(Boolean).length;
      if (cached === t1AudioUrls.length) break;
      await pause(100);
    }
    row().scrollIntoView({ block: 'center' });
    return { disabled, duplicateBlocked, progress, reopenedDisabled, success, maleAndFallback, cacheDefault, partial, allFailed, htmlRejected, noCaches, realSuccess, cached };
  })()`);
  for (const [name, value] of Object.entries(result)) {
    assert.equal(value, name === 'cached' ? 491 : true, name);
    console.log(`PASS ${name}: ${value}`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 900, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('[data-audio-download]').scrollIntoView({ block: 'center' })`);
  mkdirSync('docs/screenshots', { recursive: true });
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('docs/screenshots/t1-audio-download.png', Buffer.from(screenshot.data, 'base64'));
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const offline = await evaluate(`(async () => {
    let count = 0;
    for (const url of t1AudioUrls) {
      const res = await fetch(url);
      if (res.ok && (res.headers.get('content-type') || '').startsWith('audio/') && (await res.arrayBuffer()).byteLength) count++;
    }
    return count;
  })()`);
  assert.equal(offline, 491, 'offline audio');
  console.log('PASS offline audio: 491');
  assert.deepEqual(errors, [], 'browser errors');
  console.log('PASS no browser JS errors');
} finally {
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  ws.close();
}
