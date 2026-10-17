/**
 * shot_nostt.mjs — ถ่ายภาพหน้า "ฝึกออกเสียง" ในสภาพเหมือน iPhone
 * (ไม่มี SpeechRecognition) เพื่อดูแผงอัดเสียงเทียบเสียง
 *
 * ใช้: chrome --headless --remote-debugging-port=9411 --use-fake-device-for-media-stream
 *      node scripts/shot_nostt.mjs
 */
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || 9411;
const URL_BASE = process.env.APP_URL || 'http://127.0.0.1:5173/';
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
// สำคัญ: ลบ SpeechRecognition ก่อนสคริปต์ของหน้าแอปทำงาน → จำลอง iPhone
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: "try { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; } catch (e) {}",
});
await send('Page.navigate', { url: URL_BASE + '#/speak' });
await sleep(2600);
await evaluate('location.hash = "#/learn"; "ok"');
await sleep(500);
await evaluate('location.hash = "#/speak"; "ok"');
await sleep(1800);
const hasPanel = await evaluate('!!document.querySelector(\'button[aria-label="อัดเสียง"]\')');
console.log('พบแผงอัดเสียง:', hasPanel);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync('docs/screenshots/18b-แผงอัดเสียงเทียบเสียง.png', Buffer.from(shot.data, 'base64'));
console.log('บันทึก 18b-แผงอัดเสียงเทียบเสียง.png');
ws.close();
