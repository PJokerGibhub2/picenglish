import { h, mount, btn3d, toast } from './ui2.js';
import { loadChunks } from './data.js';
import { sayText, stopSpeaking, normalizeEn } from './speech.js';
import { markChunk } from './store.js';
import { shuffle } from './data.js';
import { sfxCorrect, sfxWrong, sfxTap } from './sfx.js';
import * as pg from './progress2.js';

export async function chunkDrillView(root, mode, query = new URLSearchParams()) {
  const chunks = await loadChunks(), item = chunks.find((c) => c.id === query.get('id'));
  let disposed = false, timer = null, result = null, answer = '', bank = [], selected = [], hint = 0, checked = false;
  const cleanup = () => { disposed = true; stopSpeaking(); if (timer) clearTimeout(timer); };
  const back = () => { location.hash = '#/chunks'; };
  if (!item || !['type', 'order'].includes(mode)) { mount(root, h('div', { class: 'empty', text: 'ไม่พบประโยคนี้' }), btn3d('กลับคลังประโยค', { onclick: back })); return cleanup; }
  const words = normalizeEn(item.en).split(' ').filter(Boolean);
  const action = (label, options, aria) => { const button = btn3d(label, options); button.setAttribute('aria-label', aria); return button; };
  function draw() {
    if (disposed) return;
    const isType = mode === 'type';
    const header = h('div', { class: 'listen-top' }, h('button', { class: 'icon-btn', type: 'button', text: '←', 'aria-label': 'กลับคลังประโยค', onclick: back }), h('strong', { text: isType ? 'พิมพ์ตาม' : 'เรียงประโยค' }), h('small', { text: item.level || '' }));
    if (isType) {
      const input = h('input', { class: 'search-input', type: 'text', autocomplete: 'off', placeholder: 'พิมพ์ประโยคภาษาอังกฤษ', value: answer, oninput: (e) => { answer = e.target.value; checkButton.disabled = !answer.trim(); result = null; root.querySelector('.speak-score')?.parentElement.remove(); } });
      let checkButton;
      const updateInput = (value) => { answer = value; input.value = value; checkButton.disabled = !value.trim(); result = null; root.querySelector('.speak-score')?.parentElement.remove(); };
      const tools = h('div', { class: 'drill-actions type-tools' },
        action('💡 ใบ้', { tone: 'ghost', onclick: () => { sfxTap(); const typed = normalizeEn(answer).split(' ').filter(Boolean); const next = words[typed.length]; if (!next) return; updateInput(`${answer.trimEnd()}${answer.trim() ? ' ' : ''}${next} `); hint++; } }, 'ใบ้คำถัดไป'),
        action('↩︎ ย้อนคำ', { tone: 'ghost', onclick: () => { sfxTap(); const typed = answer.trimEnd().split(/\s+/); typed.pop(); updateInput(typed.join(' ')); } }, 'ลบคำสุดท้าย'),
        action('🗑 ล้าง', { tone: 'ghost', onclick: () => { sfxTap(); updateInput(''); } }, 'ล้างข้อความทั้งหมด'));
      checkButton = btn3d('ตรวจคำตอบ', { block: true, onclick: () => { const typed = normalizeEn(answer).split(' ').filter(Boolean); result = words.map((w, i) => ({ word: typed[i] || w, state: !typed[i] ? 'missing' : typed[i] === w ? 'correct' : 'wrong' })); const correct = result.filter((x) => x.state === 'correct').length; const pct = Math.round(correct / words.length * 100); result.score = pct; (pct >= 70 ? sfxCorrect : sfxWrong)(); draw(); if (pct >= 70) { markChunk(item.id, pct); pg.bumpActivity('dictation'); timer = setTimeout(() => { if (!disposed) { toast('ประโยคถัดไปพร้อมแล้ว'); back(); } }, 2000); } } });
      checkButton.disabled = !answer.trim();
      mount(root, header, h('section', { class: 'card drill-card' }, h('div', { class: 'sentence-large', text: 'ฟังประโยคแล้วพิมพ์ตาม' }), h('div', { class: 'muted', text: item.th }), h('div', { class: 'drill-actions' }, btn3d('▶ ฟัง', { onclick: () => sayText(item.en, { audioKey: `chunk:${item.id}` }) }), btn3d('🐢 0.6×', { tone: 'ghost', onclick: () => sayText(item.en, { audioKey: `chunk:${item.id}`, rate: 0.6 }) })),
        input, tools, checkButton,
        result ? h('div', {}, h('div', { class: 'speak-score', text: `${result.score}%` }), h('div', { class: 'word-result' }, ...result.map((x) => h('span', { class: `word-${x.state}`, text: x.state === 'missing' ? `_${x.word}` : x.word }))), result.score >= 70 ? btn3d('ประโยคถัดไป', { onclick: () => { if (timer) clearTimeout(timer); back(); } }) : h('div', { class: 'drill-actions' }, btn3d('ดูเฉลย', { tone: 'ghost', onclick: () => { answer = item.en; draw(); } }), btn3d('ลองใหม่', { onclick: () => { answer = ''; result = null; draw(); } }))) : null));
    } else {
      if (!bank.length && !selected.length) bank = shuffle(words.map((w, i) => ({ w, i })));
      mount(root, header, h('section', { class: 'card drill-card' }, h('div', { class: 'muted', text: 'เรียงคำให้เป็นประโยคตามความหมายภาษาไทย' }), h('div', { class: 'sentence-large', text: item.th }),
        h('div', { class: 'muted small', text: `${selected.length}/${words.length} คำ` }),
        h('div', { class: 'chip-row' }, ...selected.map((x, i) => h('button', { class: `word-chip${checked && x.i !== i ? ' chip-muted' : ''}`, type: 'button', text: x.w, 'aria-label': `ย้ายคำ ${x.w} กลับคลังคำ`, onclick: () => { selected.splice(i, 1); bank.push(x); checked = false; draw(); } }))),
        h('div', { class: 'chip-row' }, ...bank.map((x, i) => h('button', { class: 'chip', text: x.w, onclick: () => { bank.splice(i, 1); selected.push(x); checked = false; draw(); } }))),
        action('🗑 ล้างทั้งหมด', { tone: 'ghost', onclick: () => { sfxTap(); bank.push(...selected); selected = []; checked = false; draw(); } }, 'คืนคำทั้งหมดลงคลัง'),
        btn3d('ตรวจลำดับ', { onclick: () => { checked = true; const first = selected.findIndex((x, i) => x.i !== i); (first < 0 && !bank.length ? sfxCorrect : sfxWrong)(); draw(); } }),
        checked ? h('div', { class: 'muted', text: selected.length === words.length && selected.every((x, i) => x.i === i) ? 'เรียงได้แล้ว!' : `ลองดูคำตำแหน่งที่ ${Math.max(1, selected.findIndex((x, i) => x.i !== i) + 1)}` }) : null,
        checked && selected.length === words.length && selected.every((x, i) => x.i === i) ? btn3d('✓ ใช้ได้แล้ว', { onclick: () => { markChunk(item.id, 100); pg.bumpActivity('chunks'); back(); } }) : null,
        btn3d(`💡 ใบ้คำที่ ${Math.min(hint + 1, words.length)}`, { tone: 'ghost', onclick: () => { hint = Math.min(words.length, hint + 1); toast(`คำใบ้: ${words.slice(0, hint).join(' ')}`); } }), btn3d('ข้าม', { tone: 'ghost', onclick: back })));
    }
  }
  draw(); return cleanup;
}
