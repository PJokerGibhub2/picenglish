/**
 * screenshot.mjs — เก็บภาพหน้าจอของแอปทุกหน้าจอผ่าน Chrome DevTools Protocol
 *
 * วิธีใช้:
 *   1) python -m http.server 5173
 *   2) chrome --headless --remote-debugging-port=9411 about:blank
 *   3) node scripts/screenshot.mjs
 *
 * ผลลัพธ์: docs/screenshots/*.png (ขนาดมือถือ 412x900 @2x)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_PORT = process.env.CDP_PORT || 9411;
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173/';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const HELPERS = `window.__t = {
  find: (t, scope) => Array.from((scope || document).querySelectorAll('button, a'))
    .filter((b) => b.textContent.includes(t))[0],
  click(t) { const b = this.find(t); if (!b) throw new Error('ไม่พบ: ' + t); b.click(); return true; },
  $(s) { return document.querySelector(s); },
  $$(s) { return Array.from(document.querySelectorAll(s)); },
}; 'ok'`;

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('เชื่อมต่อ CDP ไม่ได้')); });
  const cdp = new CDP(ws);

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  // ไมค์จำลอง + Speech Recognition จำลอง เพื่อถ่ายภาพหน้าจอโหมดสอนออกเสียงได้
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (function () {
        class FakeRecognition {
          constructor() { this.lang='en-US'; this.interimResults=true; this.continuous=false; this._l={}; }
          addEventListener(t,f){ (this._l[t]=this._l[t]||[]).push(f); }
          start(){ const text = window.__fakeSpeech || 'hello';
            setTimeout(()=>{ const alt={transcript:text,confidence:.95}; const res=[alt]; res.isFinal=true;
              (this._l.result||[]).forEach(f=>f({resultIndex:0,results:[res]})); },150);
            setTimeout(()=>{ (this._l.end||[]).forEach(f=>f({})); },400); }
          stop(){ (this._l.end||[]).forEach(f=>f({})); }
        }
        window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
        window.__fakeSpeech = '';
      })();
    `,
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 900, deviceScaleFactor: 2, mobile: true,
  });
  await cdp.send('Page.navigate', { url: APP_URL });
  await sleep(2200);
  await cdp.eval('try { localStorage.clear(); } catch (e) {} "ok"');
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(2600);
  await cdp.eval(HELPERS);

  const shots = [
    { name: '01-การ์ด-เลือกหมวด', hash: '#/learn', before: null, wait: 1200 },
    {
      name: '02-แฟลชการ์ด-ด้านหน้า', hash: '#/learn', wait: 2800,
      before: `__t.$$('.cat-card')[0].click(); return 'ok';`,
    },
    {
      name: '03-แฟลชการ์ด-ด้านหลังพร้อมประโยค', hash: '#/learn', wait: 2600, full: true,
      before: `__t.$$('.cat-card')[0].click(); return 'ok';`,
      after: `await new Promise(r=>setTimeout(r,1200)); __t.$('.flash-card').click(); return 'ok';`,
    },
    { name: '04-ฟังประโยค-ไฮไลท์คำ', hash: '#/listen', wait: 2800 },
    {
      name: '05-ควิซปรนัย', hash: '#/quiz', wait: 2600,
      before: `__t.click('เริ่มควิซ'); return 'ok';`,
    },
    {
      name: '06-ทบทวน-SRS', hash: '#/review', wait: 2600, full: true,
      before: `const b = __t.find('เริ่มทบทวน') || __t.find('เริ่มเรียนคำใหม่'); if (b) b.click(); return 'ok';`,
      after: `await new Promise(r=>setTimeout(r,900)); __t.click('ดูเฉลย'); return 'ok';`,
    },
    {
      name: '07-เกมจับคู่ภาพ-คำ', hash: '#/match', wait: 3200,
      before: `__t.click('เริ่มเกม'); return 'ok';`,
    },
    { name: '08-ฝึกออกเสียง', hash: '#/speak', wait: 2000 },
    { name: '09-คำของฉัน', hash: '#/mine', wait: 1800 },
    { name: '10-ตั้งค่า', hash: '#/mine', wait: 1500,
      before: `document.getElementById('btn-settings').click(); return 'ok';` },
    { name: '11-ฝึกพูด-ศูนย์รวม', hash: '#/speaking', wait: 1200 },
    { name: '12-บทสนทนา-รายการสถานการณ์', hash: '#/roleplay', wait: 1800 },
    {
      name: '13-บทสนทนา-กำลังฝึกพูด', hash: '#/roleplay?dlg=dlg-cafe', wait: 2600,
      after: `const b = __t.find('ต่อไป'); if (b) b.click(); await new Promise(r=>setTimeout(r,700)); return 'ok';`,
    },
    { name: '14-ทบทวนประโยค', hash: '#/sentenceReview', wait: 1200 },
    {
      name: '15-สอนออกเสียงคำที่พูดไม่ชัด', hash: '#/roleplay?dlg=dlg-cafe', wait: 1600, full: true,
      after: `(async () => {
        // เดินไปยังบรรทัดที่เป็นบทของผู้ใช้
        for (let i = 0; i < 6; i++) {
          if (document.querySelector('.mic-btn')) break;
          const b = __t.find('ต่อไป'); if (b) b.click();
          await new Promise(r => setTimeout(r, 600));
        }
        window.__fakeSpeech = 'banana';
        __t.$('.mic-btn').click();
        await new Promise(r => setTimeout(r, 350));
        const gate = __t.find('เข้าใจแล้ว'); if (gate) gate.click();
        await new Promise(r => setTimeout(r, 4500));
        return 'ok';
      })()`,
    },
  ];

  for (const s of shots) {
    // ปิดแผง/โอเวอร์เลย์ที่ค้างจากภาพก่อนหน้า แล้วบังคับให้ router ทำงานใหม่
    // (ต้องเปลี่ยน hash เป็นค่าอื่นก่อน เพราะการตั้ง hash ซ้ำค่าเดิมจะไม่ทำให้ router ทำงาน)
    await cdp.eval(`(function () {
      const sheet = document.getElementById('sheet');
      if (sheet) sheet.classList.add('hidden');
      const toast = document.getElementById('toast-wrap');
      if (toast) toast.innerHTML = '';
      location.hash = '#/__reset__';
      return 'ok';
    })()`);
    await sleep(240);
    await cdp.eval(`location.hash = ${JSON.stringify(s.hash)}; 'ok'`);
    await sleep(900);
    if (s.before) await cdp.eval(`(async () => { ${s.before} })()`);
    await sleep(s.wait);
    if (s.after) await cdp.eval(`(async () => { ${s.after} })()`);
    await sleep(700);

    const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!s.full });
    const file = join(OUT, s.name + '.png');
    writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log('บันทึก ' + file.replace(ROOT + '\\', '').replace(ROOT + '/', ''));
  }

  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
