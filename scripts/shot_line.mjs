/**
 * shot_line.mjs — จำลอง "เปิดจาก LINE" เพื่อตรวจแถบเตือน + ปุ่มเปิดเบราว์เซอร์
 * ใช้: node scripts/shot_line.mjs   (ต้องมี Chrome headless ที่พอร์ต 9411)
 */
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || 9411;
const BASE = process.env.APP_URL || 'http://127.0.0.1:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = tabs.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res) => { ws.onopen = res; });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
});
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

const LINE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.6.0 Safari/605.1.15';

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setUserAgentOverride', { userAgent: LINE_UA, platform: 'iPhone' });
await send('Page.navigate', { url: BASE + '#/today' });
await sleep(2800);
console.log('detect =', await evaluate(`(async () => (await import('/js/speech.js')).inAppBrowser())()`));
console.log('banner แสดง =', await evaluate(`!document.getElementById('inapp-warning').classList.contains('hidden')`));
let shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('docs/screenshots/19-เปิดจาก-LINE.jpg-less.png', Buffer.from(shot.data, 'base64'));

await evaluate('location.hash = "#/speak"');
await sleep(1800);
console.log('ปุ่มเปิดเบราว์เซอร์ =', await evaluate(`!!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('เปิดในเบราว์เซอร์'))`));
shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('docs/screenshots/19b-LINE-ฝึกออกเสียง.png', Buffer.from(shot.data, 'base64'));
console.log('บันทึกภาพแล้ว');
ws.close();
