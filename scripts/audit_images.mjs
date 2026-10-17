/**
 * audit_images.mjs — ตรวจคุณภาพภาพที่ระบบเลือกให้คำศัพท์ทุกคำ
 *
 * ใช้เมื่อแก้ data/words.json (โดยเฉพาะช่อง imageQuery) แล้วอยากรู้ว่าภาพที่ได้ "ตรงความหมาย" หรือไม่
 *
 * วิธีใช้:
 *   1) python -m http.server 5173
 *   2) chrome --headless --remote-debugging-port=9411 about:blank
 *   3) node scripts/audit_images.mjs
 *
 * ผลลัพธ์: ตารางบนหน้าจอ + ไฟล์ docs/image-audit.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_PORT = process.env.CDP_PORT || 9411;
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173/';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

const AUDIT = `(async () => {
  const words = await (await fetch('data/words.json')).json();
  const img = await import('/js/images.js');
  const out = [];
  for (const w of words) {
    try {
      const p = await img.photoFor(w, { force: true });
      const cands = await img.fetchCandidates(w);
      out.push({
        id: w.id, word: w.word, thai: w.thai, category: w.category, emoji: w.emoji,
        imageQuery: w.imageQuery, commonsCategory: w.commonsCategory || null, photo: w.photo !== false,
        title: p ? p.title : null,
        license: p ? p.license : null,
        url: p ? p.url : null,
        imageCategories: p ? (p.categories || '') : '',
        candidates: cands.length,
      });
    } catch (err) {
      out.push({ id: w.id, word: w.word, imageQuery: w.imageQuery, title: null, error: String(err) });
    }
    await new Promise((r) => setTimeout(r, 220));
  }
  return out;
})()`;

/** ให้คะแนนความน่าเชื่อถือของภาพจากชื่อไฟล์ + หมวดหมู่ต้นทาง */
function judge(rec) {
  if (rec.error) return { flag: 'ERROR', note: rec.error };
  if (rec.photo === false) return { flag: 'EMOJI', note: 'ตั้งใจใช้ภาพอีโมจิ (คำนามธรรม/คำเกี่ยวกับอาการป่วย)' };
  if (!rec.title) return { flag: 'NO-IMAGE', note: 'ไม่พบภาพ (จะใช้อีโมจิ)' };

  // ถ้าภาพมาจากหมวดหมู่ที่กำหนดไว้ แปลว่าตรงหัวข้อโดยโครงสร้าง
  const cat = (rec.commonsCategory || '').toLowerCase();
  const cats = (rec.imageCategories || '').toLowerCase();
  if (cat && cats.includes(cat)) return { flag: 'CAT-OK', note: 'มาจากหมวด ' + rec.commonsCategory };

  const t = rec.title.toLowerCase();
  const q = (rec.imageQuery || '').toLowerCase().split(/\s+/).filter((x) => x.length > 2);
  const tokens = t.replace(/^file:/, '').replace(/\.[a-z0-9]+$/, '').split(/[^a-z0-9]+/).filter(Boolean);
  const overlap = q.filter((x) => tokens.includes(x)).length;
  const wordHit = tokens.includes(rec.word.toLowerCase()) || t.includes(rec.word.toLowerCase());
  if (overlap === 0 && !wordHit && !cat) return { flag: 'WEAK', note: 'ชื่อภาพไม่ตรงกับคำค้นเลย' };
  if (overlap < Math.min(2, q.length)) return { flag: 'CHECK', note: 'ตรงกับคำค้นเพียงบางส่วน' };
  return { flag: 'OK', note: '' };
}

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('เชื่อมต่อ CDP ไม่ได้')); });
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: APP_URL });
  await sleep(2500);

  console.log('กำลังตรวจภาพทั้งชุด (ใช้เวลาประมาณ 1 นาที)…\n');
  const rows = await cdp.eval(AUDIT);

  const scored = rows.map((r) => ({ ...r, ...judge(r) }));
  const order = { ERROR: 0, 'NO-IMAGE': 1, EMOJI: 2, WEAK: 3, CHECK: 4, OK: 5, 'CAT-OK': 6 };
  scored.sort((a, b) => (order[a.flag] - order[b.flag]) || a.word.localeCompare(b.word));

  for (const r of scored) {
    const title = (r.title || '-').replace(/^File:/, '').slice(0, 52);
    const cat = (r.commonsCategory || '-').slice(0, 22);
    console.log(`${r.flag.padEnd(9)} ${String(r.word).padEnd(16)} ${cat.padEnd(22)} ${title.padEnd(52)} ${r.note}`);
  }

  const counts = scored.reduce((acc, r) => { acc[r.flag] = (acc[r.flag] || 0) + 1; return acc; }, {});
  const good = (counts['CAT-OK'] || 0) + (counts.OK || 0);
  console.log('\nสรุป: ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
  console.log(`ภาพที่ยืนยันว่าตรงหัวข้อ (CAT-OK + OK): ${good}/${rows.length}` +
    (counts.EMOJI ? `  ·  ใช้อีโมจิโดยตั้งใจ: ${counts.EMOJI}` : ''));

  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  writeFileSync(join(ROOT, 'docs', 'image-audit.json'), JSON.stringify(scored, null, 1), 'utf8');
  console.log('เขียน docs/image-audit.json');

  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
