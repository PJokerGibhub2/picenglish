/**
 * mockup_shot.mjs — ถ่ายภาพหน้าจอจากหน้ากาก (mockup) ทีละหน้าจอ
 *
 * วิธีใช้:
 *   1) python -m http.server 5173      (ที่โฟลเดอร์ english-picture-app)
 *   2) chrome --headless --remote-debugging-port=9411 about:blank
 *   3) node scripts/mockup_shot.mjs
 *
 * ผลลัพธ์: docs/mockups/*.png (390x844 CSS px @2x = 780x1688)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_PORT = process.env.CDP_PORT || 9411;
const PAGE = process.env.MOCKUP_URL || 'http://127.0.0.1:5173/docs/mockups/index.html';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'mockups');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve: res, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('ไม่พบแท็บ Chrome');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP ไม่ตอบ')); });
  const cdp = new CDP(ws);

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1660, height: 1200, deviceScaleFactor: 2, mobile: false,
  });
  await cdp.send('Page.navigate', { url: PAGE });
  await sleep(2500);

  // รอให้ภาพ SVG ทั้งหมดโหลดเสร็จ
  await cdp.eval(`(async () => {
    await new Promise((r) => { if (document.readyState === 'complete') r(); else window.addEventListener('load', r, { once: true }); });
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    return imgs.length;
  })()`);
  await sleep(600);

  // ถ่ายทีละหน้าจอ (เฉพาะกรอบมือถือ)
  const slots = await cdp.eval(`Array.from(document.querySelectorAll('[data-shot]')).map((el) => {
    const frame = el.querySelector('.frame');
    const r = frame.getBoundingClientRect();
    return { name: el.dataset.shot, x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
  })`);

  console.log(`พบ ${slots.length} หน้าจอ`);
  for (const s of slots) {
    const pad = 6;
    const res = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: Math.max(0, s.x - pad), y: Math.max(0, s.y - pad), width: s.w + pad * 2, height: s.h + pad * 2, scale: 1 },
    });
    const file = join(OUT, `${s.name}.png`);
    writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log('  ✓ ' + s.name + '.png');
  }

  // ถ่ายภาพรวมเฉพาะส่วนดีไซน์ซิสเต็ม
  const ds = await cdp.eval(`(function () {
    const el = document.querySelector('.ds');
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
  })()`);
  const dsRes = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: ds.x - 4, y: ds.y - 4, width: ds.w + 8, height: ds.h + 8, scale: 1 },
  });
  writeFileSync(join(OUT, '00-design-system.png'), Buffer.from(dsRes.data, 'base64'));
  console.log('  ✓ 00-design-system.png');

  ws.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
