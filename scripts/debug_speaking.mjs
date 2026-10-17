/**
 * debug_speaking.mjs — เครื่องมือตรวจวงจร "กดไมค์ → พูด → ให้คะแนน" ในโหมดบทสนทนา
 *
 * ใช้เมื่ออยากดูว่าทำไมการบันทึกเสียง/การสอนออกเสียง/ประตูบังคับผ่านไม่ทำงาน
 * ต้องเปิด Chrome ด้วยธงไมค์จำลอง (ดูข้อความที่สคริปต์ e2e_test.mjs พิมพ์ออกมา)
 *
 * รัน:  node scripts/debug_speaking.mjs
 */
const CDP_PORT = process.env.CDP_PORT || 9411;
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map(); this.logs = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
        return;
      }
      if (m.method === 'Runtime.consoleAPICalled') {
        this.logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        this.logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return { value: r.result.value };
  }
}

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP ไม่ตอบ')); });
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
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
  await cdp.send('Page.navigate', { url: APP_URL });
  await sleep(2500);

  // เก็บ log ของผู้ใช้เพื่อดูว่า recorder ทำงานหรือไม่
  await cdp.eval(`(function(){ window.__caps=[]; const ow=console.warn; console.warn=(...a)=>{window.__caps.push('warn: '+a.map(String).join(' ')); ow(...a);}; const ol=console.log; console.log=(...a)=>{window.__caps.push('log: '+a.map(String).join(' ')); ol(...a);}; return 'ok'; })()`);

  // ไปที่บทสนทนา
  await cdp.eval(`location.hash = '#/roleplay?dlg=dlg-cafe'; 'ok'`);
  await sleep(1500);

  // เดินไปยังบรรทัดที่เป็นบทของผู้ใช้
  let guard = 0;
  while (guard++ < 12) {
    const r = await cdp.eval(`!!document.querySelector('.mic-btn')`);
    if (r.value) break;
    await cdp.eval(`(function(){ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('ต่อไป')); if(b) b.click(); return 'ok'; })()`);
    await sleep(600);
  }
  console.log('ถึงบรรทัดของผู้ใช้ที่กด ' + guard + ' ครั้ง');

  const before = await cdp.eval(`document.querySelector('.bubble.current .bubble-en').textContent.trim()`);
  console.log('ประโยคเป้าหมาย:', before.value);

  await cdp.eval(`window.__fakeSpeech = 'banana banana banana'; 'ok'`);
  await cdp.eval(`document.querySelector('.mic-btn').click(); 'ok'`);
  await sleep(400);
  // อาจมีแผงอธิบายไมค์
  const gate = await cdp.eval(`(function(){ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('เข้าใจแล้ว')); if(b){b.click(); return 'clicked';} return 'none'; })()`);
  console.log('แผงอธิบายไมค์:', gate.value);
  await sleep(3000);

  const probe = await cdp.eval(`(async () => {
    const st = await import('/js/store.js');
    const rec = await import('/js/recorder.js');
    const out = {
      recordVoice: st.settings().recordVoice,
      strictSpeak: st.settings().strictSpeak,
      passThreshold: st.settings().passThreshold,
      supported: rec.recordingSupported(),
      hasGUM: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      hasMR: !!window.MediaRecorder,
      mime: (window.MediaRecorder && MediaRecorder.isTypeSupported) ? MediaRecorder.isTypeSupported('audio/webm;codecs=opus') : null,
    };
    try {
      const h = await rec.startRecording();
      out.started = !!h;
      if (h) {
        await new Promise(r => setTimeout(r, 900));
        const blob = await h.stop();
        out.blobSize = blob ? blob.size : 0;
        out.blobType = blob ? blob.type : null;
      }
    } catch (e) { out.startError = String(e); }
    return out;
  })()`);
  console.log('\n--- ตรวจระบบบันทึกเสียง ---');
  console.log(JSON.stringify(probe.value || probe, null, 1));

  const dump = await cdp.eval(`(function(){
    const box = document.querySelector('#view .card:last-of-type');
    return {
      micExists: !!document.querySelector('.mic-btn'),
      actionText: box ? box.textContent.replace(/\\s+/g,' ').slice(0,320) : '(ไม่พบ)',
      teach: document.body.textContent.includes('คำที่ยังไม่ชัด'),
      voiceBtn: [...document.querySelectorAll('button')].some(b=>b.textContent.includes('เสียงของคุณ')),
      nextBtn: [...document.querySelectorAll('button')].some(b=>b.textContent.includes('ต่อไป')),
      captures: (window.__caps||[]).slice(-8),
      recSupported: !!(navigator.mediaDevices && window.MediaRecorder),
    };
  })()`);
  console.log('\n--- ผลตรวจ ---');
  console.log(JSON.stringify(dump.value, null, 1));
  if (dump.value && dump.value.captures) {
    console.log('\n--- console จากหน้าเว็บ ---');
    for (const c of dump.value.captures) console.log('  ' + c);
  }
  ws.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
