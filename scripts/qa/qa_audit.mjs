/* qa_audit.mjs — "ระบบตรวจสอบการเล่นจริง" (Automated UX/QA Audit) สำหรับ PicEnglish V1 + PangPood V2
 *
 * แนวคิด: เปิดทุกหน้าจอสำคัญของผู้ใช้ → ตรวจสิ่งที่ทำให้ "เล่นไม่ได้/งง/กดไม่โดน"
 * แล้วออกรายงานเป็น JSON + Markdown ให้เทียบสองเวอร์ชัน
 *
 * วิธีใช้ (ต้องมี Chrome + server มาก่อน):
 *   python -m http.server 5173
 *   chrome --headless --remote-debugging-port=9411 about:blank
 *   node scripts/qa/qa_audit.mjs --version v1
 *   node scripts/qa/qa_audit.mjs --version v2
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const VERSION = getArg('version', 'v2');            // v1 | v2
const PORT = getArg('port', process.env.CDP_PORT || '9411');
const ORIGIN = getArg('origin', 'http://127.0.0.1:5173');
const BASE = VERSION === 'v1' ? `${ORIGIN}/` : `${ORIGIN}/v2/`;

const SCREENS = VERSION === 'v1'
  ? [
    ['today', '#/today'], ['learn', '#/learn'], ['listen', '#/listen'], ['quiz', '#/quiz'],
    ['match', '#/match'], ['speak', '#/speak'], ['review', '#/review'], ['mine', '#/mine'],
    ['chunks', '#/chunks'], ['dictation', '#/dictation'], ['builder', '#/builder'],
    ['listening', '#/listening'], ['shadow', '#/shadow'], ['roleplay', '#/roleplay'],
    ['onemin', '#/onemin'], ['sentenceReview', '#/sentenceReview'], ['placement', '#/placement'],
    ['games', '#/games'], ['speaking', '#/speaking'],
  ]
  : [
    ['path', '#/path'], ['quest', '#/quest'], ['practice', '#/practice'], ['words', '#/words'], ['me', '#/me'],
    ['lesson', '#/lesson?id=u1-l1'], ['speak', '#/speak'], ['roleplay', '#/roleplay'], ['listening', '#/listening'],
    ['shadow', '#/shadow'], ['chunks', '#/chunks'], ['chunk-type', '#/chunks/type?id=ch-cafe-01'],
    ['chunk-order', '#/chunks/order?id=ch-cafe-01'], ['sentences', '#/sentences'], ['review', '#/review'],
  ];

const results = [];

async function connect() {
  const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pend = new Map(); const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception?.description || d.text || '').slice(0, 240));
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
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description || '').slice(0, 200) };
    return r.result.value;
  };
  return { ws, send, ev, errors };
}

// ตรวจหน้าจอเดียว: คืนค่า findings
const AUDIT = `(() => {
  const out = { text: '', buttons: 0, disabled: 0, tiny: [], noLabel: [], images: 0, inputs: 0,
                undo: false, hint: false, skip: false, clear: false, back: false, submit: false,
                overflowX: false, viewHeight: 0, interactive: 0, empty: false };
  const view = document.getElementById('view') || document.body;
  out.text = (view.textContent || '').trim().slice(0, 200);
  out.viewHeight = Math.round(view.getBoundingClientRect().height);
  out.overflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
  out.images = document.querySelectorAll('img').length;
  // แยก "ช่องค้นหา" ออกจาก "ช่องตอบคำถาม" (กัน false positive)
  const answerInputs = Array.from(document.querySelectorAll('input, textarea')).filter((el) => {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const ph = (el.getAttribute('placeholder') || '');
    if (type === 'search' || type === 'range' || type === 'checkbox' || type === 'radio') return false;
    if (/ค้นหา|search/i.test(ph)) return false;
    return true;
  });
  out.inputs = answerInputs.length;

  const labels = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
  const all = Array.from(document.querySelectorAll('button, a, input, [role="button"]'));
  out.buttons = all.length;
  for (const el of all) {
    if (el.tagName === 'INPUT' && (el.getAttribute('type') || '') === 'range') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    out.interactive += 1;
    if (el.disabled) out.disabled += 1;
    if ((r.width < 44 || r.height < 44) && !el.classList.contains('tiny')) {
      out.tiny.push(labels(el).slice(0, 18) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    if (!labels(el) && el.tagName !== 'INPUT') out.noLabel.push(el.tagName + '.' + (el.className || '').toString().slice(0, 20));
  }
  const words = (t) => Array.from(all).some((el) => labels(el).includes(t));
  out.undo = words('Undo') || words('ย้อนกลับ') || words('ย้อน') || words('undo');
  out.hint = words('ใบ้') || words('ช่วย') || words('Hint');
  out.skip = words('ข้าม');
  out.clear = words('ล้าง') || words('ลบคำตอบ');
  out.back = words('กลับ') || words('←');
  out.submit = words('ตรวจ') || words('ตรวจคำตอบ') || words('ส่ง') || words('ตอบ');
  out.empty = out.interactive === 0;
  return out;
})()`;

function verdict(screen, a) {
  const issues = [];
  if (a.__exc) issues.push({ level: 'error', code: 'JS_EXCEPTION', detail: a.__exc });
  else {
    if (a.overflowX) issues.push({ level: 'error', code: 'OVERFLOW_X', detail: 'มี scroll แนวนอน' });
    if (a.empty) issues.push({ level: 'error', code: 'DEAD_END', detail: 'ไม่มีปุ่มให้กดเลย' });
    if (a.text.length < 8) issues.push({ level: 'warn', code: 'BLANK_SCREEN', detail: 'ข้อความบนจอสั้นมาก' });
    if (a.tiny.length) issues.push({ level: 'warn', code: 'TAP_TARGET', detail: a.tiny.slice(0, 4).join(' · ') });
    if (a.noLabel.length) issues.push({ level: 'info', code: 'A11Y_LABEL', detail: a.noLabel.slice(0, 3).join(' · ') });
    // ข้อกำหนด UX: จอที่มีช่องพิมพ์/เรียงคำ ต้องมีใบ้/ย้อนกลับ/ล้าง
    if (a.inputs > 0 && !a.hint) issues.push({ level: 'warn', code: 'NO_HINT', detail: 'จอพิมพ์คำไม่มีปุ่มใบ้/ช่วยเหลือ' });
    if (a.inputs > 0 && !a.clear) issues.push({ level: 'info', code: 'NO_CLEAR', detail: 'ไม่มีปุ่มล้างคำตอบ' });
  }
  return issues;
}

async function main() {
  const { ws, send, ev, errors } = await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  console.log(`QA audit · ${VERSION.toUpperCase()} · ${BASE}`);
  for (const [name, route] of SCREENS) {
    const before = errors.length;
    await send('Page.navigate', { url: BASE + route });
    await new Promise((r) => setTimeout(r, 1900));
    const audit = await ev(AUDIT);
    const pageErrors = errors.slice(before);
    const issues = verdict(name, audit);
    for (const e of pageErrors) issues.push({ level: 'error', code: 'CONSOLE_ERROR', detail: String(e).slice(0, 160) });
    results.push({ screen: name, route, audit, issues });
    const badge = issues.some((i) => i.level === 'error') ? 'ERROR' : issues.length ? 'warn ' : 'ok   ';
    console.log(`  ${badge} ${name.padEnd(14)} ปุ่ม ${audit.buttons ?? '?'} · ${String(audit.text || '').slice(0, 40)}`);
  }
  ws.close();

  // ---- รายงาน ----
  mkdirSync('docs/qa', { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const all = results.flatMap((r) => r.issues.map((i) => ({ ...i, screen: r.screen })));
  const errorsCount = all.filter((i) => i.level === 'error').length;
  const warns = all.filter((i) => i.level === 'warn').length;
  const infos = all.filter((i) => i.level === 'info').length;

  writeFileSync(`docs/qa/${VERSION}-audit.json`, JSON.stringify({ version: VERSION, stamp, results }, null, 1), 'utf8');

  const lines = [];
  lines.push(`# QA Audit — ${VERSION === 'v1' ? 'PicEnglish (V1)' : 'PangPood (V2)'}`);
  lines.push('');
  lines.push(`- เวลา: ${stamp}`);
  lines.push(`- หน้าจอที่ตรวจ: **${results.length}** · ข้อผิดพลาด **${errorsCount}** · เตือน **${warns}** · ข้อมูล **${infos}**`);
  lines.push('');
  lines.push('| จอ | ปุ่ม | ช่องพิมพ์ | ใบ้ | ข้าม | ล้าง | ย้อนกลับ | ปัญหา |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const a = r.audit || {};
    const issues = r.issues.map((i) => `${i.level === 'error' ? '🔴' : i.level === 'warn' ? '🟡' : '🔵'} ${i.code}`).join(' ') || '—';
    lines.push(`| ${r.screen} | ${a.buttons ?? '?'} | ${a.inputs ?? 0} | ${a.hint ? '✓' : '—'} | ${a.skip ? '✓' : '—'} | ${a.clear ? '✓' : '—'} | ${a.back ? '✓' : '—'} | ${issues} |`);
  }
  lines.push('');
  if (all.length) {
    lines.push('## รายละเอียดปัญหาที่พบ');
    for (const i of all) lines.push(`- **${i.screen}** · ${i.level.toUpperCase()} \`${i.code}\` — ${i.detail}`);
  } else {
    lines.push('ไม่พบปัญหาในหน้าจอที่ตรวจ 🎉');
  }
  writeFileSync(`docs/qa/${VERSION}-audit.md`, lines.join('\n'), 'utf8');

  console.log(`\nรายงาน: docs/qa/${VERSION}-audit.md (error ${errorsCount} · warn ${warns} · info ${infos})`);
  process.exit(errorsCount > 0 ? 1 : 0);
}

main().catch((e) => { console.error('QA ล้มเหลว:', e && e.message ? e.message : e); process.exit(1); });
