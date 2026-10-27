/* e2e.mjs — ชุดทดสอบอัตโนมัติของ PangPood (V2)
 *
 * วิธีใช้:
 *   1) python -m http.server 5173   (ที่ root ของโปรเจกต์)
 *   2) chrome --headless --remote-debugging-port=9411 about:blank
 *   3) node v2/scripts/e2e.mjs
 *
 * ต้องมี: Chrome ที่เปิด CDP + เซิร์ฟเวอร์ในเครื่อง (ไม่ต้องใช้อินเทอร์เน็ต)
 */
const CDP_PORT = process.env.CDP_PORT || '9411';
const BASE = process.env.BASE || 'http://127.0.0.1:5173/v2/';

const rows = [];
function ok(name, pass, extra = '') {
  rows.push({ name, pass: !!pass, extra: extra ? String(extra) : '' });
  console.log(`${pass ? '  ผ่าน' : '  ตก '}  ${name}${extra ? `   [${extra}]` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const tabs = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pend = new Map(); const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception?.description || d.text || '').slice(0, 200));
    }
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return `EXC:${(r.exceptionDetails.exception?.description || '').slice(0, 160)}`;
    return r.result.value;
  };
  return { ws, send, eval: evalJs, errors };
}

async function main() {
  const { ws, send, eval: ev, errors } = await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // ---- 1) เปิดแอป ----
  console.log('\n1) เปิดแอป');
  await send('Page.navigate', { url: BASE });
  await sleep(3200);
  ok('แอปบูตได้ (มีแท็บล่าง 4 อัน)', (await ev("document.querySelectorAll('.tab').length")) === 4);
  ok('หน้าหลักเป็นเส้นทาง (12 unit)', (await ev("document.querySelectorAll('.unit').length")) === 12);
  ok('มี node ทั้งหมด 60 บท', (await ev("document.querySelectorAll('.node').length")) === 60);
  ok('ไม่มี scroll แนวนอน', (await ev('document.documentElement.scrollWidth <= window.innerWidth + 1')));
  const vTag = await ev("(document.getElementById('ver-tag')||{}).textContent");
  ok('แสดงเวอร์ชันที่ topbar', /^v\d+\.\d+\.\d+$/.test(String(vTag)), vTag);

  // ---- 2) ข้อมูล ----
  console.log('\n2) ข้อมูลและเสียง');
  ok('คำศัพท์ 300 คำ', (await ev("(async () => { const d = await (await fetch('./data/words.json')).json(); return Array.isArray(d) ? d.length : d.words.length; })()")) === 300);
  ok('หมวด 12 หมวด', (await ev("(async () => (await (await fetch('./data/categories.json')).json()).categories.length)()")) === 12);
  ok('บทฟัง 45 บท', (await ev("(async () => { const d = await (await fetch('./data/listening.json')).json(); return (Array.isArray(d) ? d : d.lessons).length; })()")) === 45);
  ok('ประโยคสำเร็จรูป 150', (await ev("(async () => (await (await fetch('./data/chunks.json')).json()).chunks.length)()")) === 150);
  ok('manifest เสียง 1256 คีย์', (await ev("(async () => Object.keys(await (await fetch('./data/audio/manifest.json')).json()).length)()")) === 1256);
  const audioProbe = await ev(`(async () => {
    const m = await import('./js/speech.js');
    await m.loadAudioManifest();
    const url = m.audioUrl('word:feelings-kind', 'female');
    if (!url) return 'no-url';
    const r = await fetch(url);
    return r.status + ':' + (await r.blob()).size;
  })()`);
  ok('ไฟล์เสียงโหลดได้ (af_heart)', String(audioProbe).startsWith('200:'), audioProbe);
  const maleProbe = await ev(`(async () => {
    const m = await import('./js/speech.js');
    const url = m.audioUrl('word:feelings-kind', 'male');
    const r = await fetch(url);
    return r.status;
  })()`);
  ok('ไฟล์เสียงชาย (am_adam) มี', maleProbe === 200, maleProbe);

  // ---- 3) บทเรียน ----
  console.log('\n3) จอเรียน');
  await send('Page.navigate', { url: BASE + '#/lesson?id=u1-l1' });
  await sleep(2600);
  ok('มีมาสคอสในจอเรียน', (await ev("!!document.querySelector('.session-mascot')")));
  const mascotCentered = await ev(`(() => {
    const e = document.querySelector('.session-mascot');
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return Math.abs((r.x + r.width / 2) - window.innerWidth / 2) < 12;
  })()`);
  ok('มาสคอสอยู่กึ่งกลางจอ', mascotCentered);
  ok('มีฟองคำพูด/โจทย์', (await ev("!!document.querySelector('.bubble')")));
  ok('ปุ่มตรวจถูกปิดก่อนเลือกคำตอบ', (await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'ตรวจคำตอบ'); return !!b && b.disabled; })()`)));
  ok('จอเรียนไม่มี scroll แนวนอน', (await ev('document.documentElement.scrollWidth <= window.innerWidth + 1')));

  // เลือกคำตอบแรก + ตรวจ
  const hasAnswer = await ev("document.querySelectorAll('.answer').length");
  if (hasAnswer) {
    await ev("document.querySelectorAll('.answer')[0].click()");
    await sleep(150);
    ok('เลือกคำตอบแล้วปุ่มตรวจใช้งานได้', (await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'ตรวจคำตอบ'); return !!b && !b.disabled; })()`)));
    await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'ตรวจคำตอบ'); if (b) b.click(); })()`);
    await sleep(450);
    ok('ตรวจแล้วมี feedback (ถูก/ผิด)', (await ev("!!document.querySelector('.feedback')")));
  } else {
    ok('ข้อแรกเป็นแบบชิป/พิมพ์ (ข้ามการเลือกตัวเลือก)', true, 'type อื่น');
  }

  // ---- 4) เล่นจนจบ ----
  console.log('\n4) เล่นจนจบบท');
  const exact = (t) => ev(`(() => { const b = [...document.querySelectorAll('#view button')].find((x) => x.textContent.trim() === '${t}'); if (b) { b.click(); return true; } return false; })()`);
  for (let i = 0; i < 70; i++) {
    if (await ev("!!document.querySelector('.session-summary')")) break;
    if (await ev("!!document.querySelector('.session-skip')")) { await ev("document.querySelector('.session-skip').click()"); await sleep(300); continue; }
    if (await ev("document.querySelectorAll('.answer').length")) { await ev("document.querySelectorAll('.answer')[0].click()"); await sleep(110); }
    if (await ev("document.querySelectorAll('.tile-bank button').length")) {
      await ev("(() => { for (let k = 0; k < 12; k++) { const t = document.querySelector('.tile-bank button'); if (!t) break; t.click(); } })()");
      await sleep(160);
    }
    if (await ev("!!document.querySelector('.session-input')")) {
      await ev("(() => { const i = document.querySelector('.session-input'); i.value = 'hello'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
    }
    if (await exact('ตรวจคำตอบ')) { await sleep(360); }
    if (await exact('ต่อไป')) { await sleep(340); continue; }
    if (await exact('ลองอีกครั้ง')) { await sleep(340); continue; }
    await sleep(140);
  }
  ok('เล่นจบบทแล้วเห็นหน้าสรุป', (await ev("!!document.querySelector('.session-summary')")));
  ok('สรุปมีเปอร์เซ็นต์', (await ev("/(\\d+)%/.test((document.querySelector('.session-summary')||{}).textContent || '')")));
  const stored = await ev("Object.keys(JSON.parse(localStorage.getItem('pangpood-v2.path') || '{}')).length");
  ok('บันทึกความคืบหน้าลงเครื่อง', Number(stored) >= 1, `${stored} บท`);

  // ---- 5) หน้าอื่น ----
  console.log('\n5) หน้าอื่น');
  await send('Page.navigate', { url: BASE + '#/path' });
  await sleep(1800);
  ok('node ที่จบแล้วขึ้นเครื่องหมายถูก', (await ev("document.querySelectorAll('.node.done').length")) >= 1);
  await send('Page.navigate', { url: BASE + '#/quest' });
  await sleep(1500);
  ok('หน้าเควสมี 3 ภารกิจ', (await ev("document.querySelectorAll('.quest-row').length")) === 3);
  await send('Page.navigate', { url: BASE + '#/words' });
  await sleep(1800);
  ok('หน้าคลังคำแสดง 300 คำ', (await ev("document.querySelectorAll('.word-row').length")) === 300);
  await send('Page.navigate', { url: BASE + '#/me' });
  await sleep(1500);
  const meText = await ev("document.getElementById('view').textContent");
  ok('หน้าฉันแสดงเวอร์ชัน', String(meText).includes('v2.'), (String(meText).match(/v2\.\d+\.\d+/) || ['-'])[0]);
  ok('หน้าฉันมีปุ่มทดสอบเสียง/ไมค์', String(meText).includes('ทดสอบเสียง') || (await ev("!!document.querySelector('.chip-btn')")));
  await send('Page.navigate', { url: BASE + '#/review' });
  await sleep(1600);
  const reviewText = await ev("document.getElementById('view').textContent");
  ok('โหมดทบทวนเปิดได้', String(reviewText).length > 10, String(reviewText).slice(0, 24));

  // ---- 6) service worker ----
  console.log('\n6) ออฟไลน์');
  const swCount = await ev("(async () => (await navigator.serviceWorker.getRegistrations()).length)()");
  ok('ลงทะเบียน service worker แล้ว', Number(swCount) >= 1, `${swCount} registration`);
  const cacheInfo = await ev("(async () => { const ks = await caches.keys(); let n = 0; for (const k of ks) { n += (await (await caches.open(k)).keys()).length; } return ks.length + ' cache / ' + n + ' ไฟล์'; })()");
  ok('มีแคชของ V2', String(cacheInfo).startsWith('1 cache'), cacheInfo);

  // ---- 7) errors ----
  console.log('\n7) ความถูกต้อง');
  ok('ไม่มี JS error ระหว่างทดสอบ', errors.length === 0, errors.slice(0, 2).join(' | '));

  const pass = rows.filter((r) => r.pass).length;
  console.log(`\nสรุป: ผ่าน ${pass}/${rows.length}`);
  ws.close();
  process.exit(pass === rows.length ? 0 : 1);
}

main().catch((err) => { console.error('การทดสอบล้มเหลวกลางทาง:', err && err.message ? err.message : err); process.exit(1); });
