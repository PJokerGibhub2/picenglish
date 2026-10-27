/* views-review.js — ทบทวนคำที่ถึงกำหนดหรือเคยพลาด */
import { h, mount } from './ui2.js';
import { mascot } from './mascot2.js';
import { db, loadAll } from './data.js';
import * as store from './store.js';
import { sessionView } from './views-session.js';

export async function reviewView(root, query = new URLSearchParams()) {
  await loadAll();
  const mode = query.get('mode');
  const selected = mode === 'fav' ? store.favorites() : mode === 'hard' ? store.hardWords() : null;
  const due = selected ? selected.map((id) => db.byId.get(id)).filter(Boolean).slice(0, 30) : store.dueWords(db.words, 10);
  let failed = [];
  let failedItems = [];
  if (!due.length) {
    try {
      const rows = JSON.parse(localStorage.getItem('pangpood-v2.review') || '[]');
      failedItems = rows.map((row) => row.item).filter((item) => item && Array.isArray(item.options) && item.options.length === 4);
      const ids = [...new Set(rows.map((row) => row.entityId).filter((id) => db.byId.has(id)))].slice(0, 10);
      failed = ids.map((id) => db.byId.get(id));
    } catch { failed = []; }
  }
  if (!due.length && !failed.length && !failedItems.length) {
    if (selected) {
      mount(root, h('div', { class: 'review-empty' }, mascot('sleep', 126),
        h('div', { class: 'page-title', text: 'ชุดคำนี้ยังว่างอยู่' }),
        h('div', { class: 'muted', text: 'เพิ่มคำโปรดหรือทำเครื่องหมายคำยากจากคลังคำได้ทุกเมื่อ' }),
        h('button', { class: 'btn3d', type: 'button', text: 'ไปคลังคำ', onclick: () => { location.hash = '#/words'; } })));
      return () => {};
    }
    mount(root,
      h('div', { class: 'review-empty' }, mascot('sleep', 126),
        h('div', { class: 'page-title', text: 'วันนี้ทบทวนครบแล้ว' }),
        h('div', { class: 'muted', text: 'พังพักผ่อนแล้ว… กลับมาเรียนได้ทุกเมื่อ' }),
        h('button', { class: 'btn3d', type: 'button', text: 'กลับไปเควส', onclick: () => { location.hash = '#/quest'; } })));
    return () => {};
  }
  return sessionView(root, 'review', { review: true, reviewItems: failedItems, reviewWords: selected ? due : [] });
}
