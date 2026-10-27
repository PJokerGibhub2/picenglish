import { h, mount, btn3d, toast } from './ui2.js';
import { db, loadAll } from './data.js';
import * as store from './store.js';
import { startRecording, playBlob, saveRecording, listRecordings, deleteRecording, recordingSupported, lastMicError, abortRecording } from './recorder.js';
import { sayText, stopSpeaking } from './speech.js';
import { stopPlayback } from './recorder.js';
import * as pg from './progress2.js';

const STARTERS = [
  ['I would like to talk about my day.', 'Today, I feel happy because I learned something new.'],
  ['One thing I enjoy is spending time with my family.', 'I usually start my morning with a cup of coffee.'],
  ['My favorite place is a small cafe near my home.', 'I like this place because it feels calm and friendly.'],
];

function timerRing() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');
  for (const cls of ['onemin-ring-bg', 'onemin-ring-progress']) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '60'); circle.setAttribute('cy', '60'); circle.setAttribute('r', '52');
    circle.setAttribute('class', cls);
    svg.appendChild(circle);
  }
  return svg;
}

export async function oneminView(root) {
  await loadAll();
  let handle = null;
  let timer = null;
  let seconds = 60;
  let endAt = 0;
  let startedAt = 0;
  let blob = null;
  let rating = 0;
  let disposed = false;
  let topic = chooseTopic();
  function chooseTopic() {
    const due = store.dueWords(db.words, 20);
    if (due.length && Math.random() < 0.4) return { title: `ลองเล่าเรื่องโดยใช้คำว่า “${due[Math.floor(Math.random() * due.length)].word}”`, kind: 'word' };
    const cats = db.categories || [];
    if (cats.length && Math.random() < 0.55) {
      const cat = cats[Math.floor(Math.random() * cats.length)];
      return { title: `เล่าเรื่องเกี่ยวกับ${cat.th}`, kind: 'category', categoryId: cat.id };
    }
    return { title: ['เล่าเรื่องกิจวัตรตอนเช้า', 'พูดถึงอาหารจานโปรดของคุณ', 'เล่าถึงสถานที่ที่อยากไป'][Math.floor(Math.random() * 3)], kind: 'sentence' };
  }
  const prompts = STARTERS[Math.floor(Math.random() * STARTERS.length)];
  function renderHome(message = '') {
    mount(root,
      h('header', { class: 'page-head' }, h('div', { class: 'page-title', text: 'พูดคนเดียว 1 นาที' }),
        h('div', { class: 'page-sub', text: 'พูดต่อเนื่องตามหัวข้อ แล้วฟังเสียงตัวเองได้' })),
      h('section', { class: 'card onemin-card' }, h('div', { class: 'muted small', text: 'หัวข้อวันนี้' }), h('h2', { text: topic.title }),
        db.categories?.length ? h('label', { class: 'onemin-category' }, h('span', { class: 'muted small', text: 'หรือเลือกหมวดที่อยากพูด' }),
          h('select', { class: 'search-input', value: topic.categoryId || '', onchange: (event) => {
            const cat = db.categories.find((item) => item.id === event.currentTarget.value);
            topic = cat ? { title: `เล่าเรื่องเกี่ยวกับ${cat.th}`, kind: 'category', categoryId: cat.id } : chooseTopic();
            renderHome();
          } }, h('option', { value: '' }, 'สุ่มหัวข้อ'), ...db.categories.map((cat) => h('option', { value: cat.id }, cat.th)))
        ) : null,
        h('div', { class: 'onemin-starters' }, ...prompts.map((line) => h('button', { class: 'listen-again', type: 'button', onclick: () => sayText(line) }, `🔊 ${line}`))),
        message ? h('div', { class: 'muted', role: 'status', text: message }) : null,
        btn3d('เริ่มพูด 1 นาที', { block: true, icon: 'mic', onclick: start }),
        h('button', { class: 'practice-skip', type: 'button', onclick: () => { location.hash = '#/practice'; } }, 'กลับไปหน้าฝึก')),
      h('section', { class: 'card' }, h('div', { class: 'card-title', text: 'เสียงของฉัน · 3 รายการล่าสุด' }), h('div', { id: 'onemin-history', class: 'onemin-history' })));
    renderHistory();
  }
  async function start() {
    if (!recordingSupported()) { renderHome('อุปกรณ์นี้ยังไม่รองรับการอัดเสียง กรุณาใช้เบราว์เซอร์ที่รองรับไมโครโฟน'); return; }
    mount(root, h('div', { class: 'center pad', text: 'กำลังขอใช้ไมโครโฟน…' }));
    handle = await startRecording({ onLevel: (level) => { const meter = root.querySelector('.onemin-level-fill'); if (meter) meter.style.width = `${Math.round(level * 100)}%`; } });
    if (disposed) { if (handle) abortRecording(); handle = null; return; }
    if (!handle) { const error = lastMicError(); handle = null; renderHome(error ? `เปิดไมโครโฟนไม่ได้ (${error}) กรุณาตรวจสิทธิ์ไมโครโฟนแล้วลองอีกครั้ง` : 'เปิดไมโครโฟนไม่ได้ กรุณาตรวจสิทธิ์ไมโครโฟนแล้วลองอีกครั้ง'); return; }
    seconds = 60;
    startedAt = Date.now();
    endAt = startedAt + 60000;
    renderTimer();
    timer = setInterval(() => {
      seconds = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (seconds <= 0) stop(); else updateTimer();
    }, 250);
  }
  function renderTimer() {
    mount(root, h('div', { class: 'page-head' }, h('div', { class: 'page-title', text: 'กำลังพูด' }), h('div', { class: 'page-sub', text: topic.title })),
      h('section', { class: 'card onemin-timer-card' }, h('div', { class: 'onemin-ring' },
        timerRing(),
        h('div', { class: 'onemin-count', text: '60' })),
        h('div', { class: 'onemin-level' }, h('div', { class: 'onemin-level-fill' })),
        h('div', { class: 'muted small', text: 'พูดได้ตามสบาย หยุดก่อนครบเวลาก็ได้' }),
        h('button', { class: 'btn3d btn3d-coral btn3d-block', type: 'button', onclick: stop }, 'หยุดและฟัง')));
    updateTimer();
  }
  function updateTimer() {
    const count = root.querySelector('.onemin-count'); if (count) count.textContent = String(seconds);
    const ring = root.querySelector('.onemin-ring-progress'); if (ring) ring.style.strokeDashoffset = String(327 * (1 - seconds / 60));
  }
  async function stop() {
    if (!handle) return;
    clearInterval(timer); timer = null;
    const active = handle; handle = null;
    blob = await active.stop();
    if (disposed) return;
    pg.bumpActivity('speak');
    renderResult();
  }
  function renderResult() {
    mount(root, h('header', { class: 'page-head' }, h('div', { class: 'page-title', text: 'ฟังเสียงของคุณ' }), h('div', { class: 'page-sub', text: topic.title })),
      h('section', { class: 'card onemin-result' }, blob?.size ? h('button', { class: 'listen-again', type: 'button', onclick: () => playBlob(blob) }, '▶ ฟังเสียงตัวเอง') : h('div', { class: 'muted', text: 'ยังไม่มีเสียงที่บันทึกได้ ลองพูดอีกครั้งได้เลย' }),
        h('div', { class: 'card-title', text: 'ให้คะแนนตัวเอง' }),
        h('div', { class: 'rating-stars' }, ...[1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: n <= rating ? 'on' : '', 'aria-label': `${n} ดาว`, onclick: () => { rating = n; renderResult(); } }, '★'))),
        h('div', { class: 'onemin-actions' }, btn3d('อัดใหม่', { tone: 'ghost', onclick: () => { blob = null; rating = 0; renderHome(); } }),
          btn3d('บันทึก', { onclick: save })),
        h('button', { class: 'practice-skip', type: 'button', onclick: () => { location.hash = '#/practice'; } }, 'กลับไปหน้าฝึก')));
  }
  async function save() {
    if (!blob?.size) { toast('ยังไม่มีเสียงให้บันทึก'); return; }
    const id = await saveRecording({ kind: 'onemin', refId: topic.kind, label: topic.title, blob, seconds: Math.min(60, Math.round((Date.now() - startedAt) / 1000)), selfRating: rating });
    if (!id) { toast('บันทึกเสียงไม่สำเร็จ ลองตรวจพื้นที่จัดเก็บ'); return; }
    toast('บันทึกเสียงไว้ในเครื่องแล้ว');
    renderHome();
  }
  async function renderHistory() {
    const host = root.querySelector('#onemin-history'); if (!host) return;
    const rows = (await listRecordings('onemin')).slice(0, 3);
    if (!root.contains(host)) return;
    mount(host, rows.length ? rows.map((rec) => h('div', { class: 'onemin-history-row' },
      h('div', { class: 'onemin-history-label' }, h('strong', { text: rec.label || 'พูดคนเดียว' }), h('small', { class: 'muted', text: `${new Date(rec.createdAt).toLocaleDateString('th-TH')} · ${rec.selfRating || 0} ดาว` })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'เล่นเสียง', onclick: () => playBlob(rec.blob) }, '▶'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ลบเสียง', onclick: async () => { await deleteRecording(rec.id); renderHistory(); } }, 'ลบ'))) : h('div', { class: 'muted small', text: 'คลิปที่บันทึกไว้จะแสดงตรงนี้' }));
  }
  renderHome();
  return () => { disposed = true; clearInterval(timer); timer = null; stopSpeaking(); stopPlayback(); if (handle) { abortRecording(); handle = null; } };
}
