/* views-review.js — ทบทวนคำที่ถึงกำหนดหรือเคยพลาด */
import { h, mount } from './ui2.js';
import { mascot } from './mascot2.js';
import { db, loadAll } from './data.js';
import * as store from './store.js';
import { sessionView } from './views-session.js';

export async function reviewView(root) {
  await loadAll();
  const due = store.dueWords(db.words, 10);
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
    mount(root,
      h('div', { class: 'review-empty' }, mascot('sleep', 126),
        h('div', { class: 'page-title', text: 'วันนี้ทบทวนครบแล้ว' }),
        h('div', { class: 'muted', text: 'พังพักผ่อนแล้ว… กลับมาเรียนได้ทุกเมื่อ' }),
        h('button', { class: 'btn3d', type: 'button', text: 'กลับไปเควส', onclick: () => { location.hash = '#/quest'; } })));
    return () => {};
  }
  return sessionView(root, 'review', { review: true, reviewItems: failedItems });
}
