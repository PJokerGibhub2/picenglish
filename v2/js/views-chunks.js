import { h, mount, btn3d } from './ui2.js';
import { loadChunks } from './data.js';
import { sayText, stopSpeaking } from './speech.js';
import { chunkState, markChunk } from './store.js';
import { sfxCorrect } from './sfx.js';
import * as pg from './progress2.js';

const LABELS = { cafe: 'คาเฟ่', travel: 'เดินทาง', hotel: 'ที่พัก', restaurant: 'ร้านอาหาร', shopping: 'ซื้อของ', health: 'สุขภาพ', work: 'ทำงาน', daily: 'ชีวิตประจำวัน' };
export async function chunksView(root) {
  const chunks = await loadChunks(); let situation = '', search = '';
  const cleanup = () => stopSpeaking();
  const doneCount = () => chunks.filter((c) => chunkState(c.id).done).length;
  function draw() {
    const filtered = chunks.filter((c) => (!situation || c.situation === situation) && (!search || `${c.en} ${c.th}`.toLowerCase().includes(search.toLowerCase())));
    const next = chunks.find((c) => !chunkState(c.id).done);
    mount(root, h('header', { class: 'page-head' }, h('div', { class: 'page-title', text: 'คลังประโยค' }), h('div', { class: 'page-sub', text: 'ประโยคใช้ได้จริงในสถานการณ์ต่าง ๆ' })),
      h('div', { class: 'card' }, h('strong', { text: `ใช้ได้แล้ว ${doneCount()}/${chunks.length}` }), h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: { width: `${chunks.length ? doneCount() / chunks.length * 100 : 0}%` } }))),
      next ? h('button', { class: 'quest-review-card', onclick: () => { location.hash = `#/chunks/type?id=${encodeURIComponent(next.id)}`; } }, h('span', { text: '▶' }), h('span', {}, h('strong', { text: 'เรียนต่อ' }), h('small', { class: 'muted', text: next.en }))) : null,
      h('input', { class: 'search-input', type: 'search', placeholder: 'ค้นหาประโยคหรือคำแปล', value: search, oninput: (e) => { search = e.target.value; draw(); } }),
      h('div', { class: 'filter-row' }, ...['', ...new Set(chunks.map((c) => c.situation))].map((x) => h('button', { class: `chip${situation === x ? ' on' : ''}`, text: LABELS[x] || (x ? x : 'ทั้งหมด'), onclick: () => { situation = x; draw(); } }))),
      ...filtered.map((c) => h('article', { class: 'card chunk-card' }, h('div', { class: 'chunk-title-row' }, h('strong', { class: 'sentence-large', text: c.en }), chunkState(c.id).done ? h('span', { class: 'done-mark', text: '✓' }) : null), h('div', { class: 'muted', text: c.th }), h('div', { class: 'muted small', text: `${LABELS[c.situation] || c.situation} · ${c.level || ''}` }),
        h('div', { class: 'drill-actions' }, btn3d('🔊 ฟัง', { tone: 'ghost', onclick: () => sayText(c.en, { audioKey: `chunk:${c.id}` }) }), btn3d('⌨️ พิมพ์ตาม', { onclick: () => { location.hash = `#/chunks/type?id=${encodeURIComponent(c.id)}`; } }), btn3d('🧩 เรียงประโยค', { tone: 'ghost', onclick: () => { location.hash = `#/chunks/order?id=${encodeURIComponent(c.id)}`; } }), btn3d(chunkState(c.id).done ? '✓ ใช้ได้แล้ว' : '✓ ใช้ได้แล้ว', { tone: 'good', onclick: () => { markChunk(c.id, 100); pg.bumpActivity('chunks'); sfxCorrect(); draw(); } })) )));
  }
  draw(); return cleanup;
}
