/* views-words.js — คลังคำ 300 คำ (ค้นหา/กรอง) แบบไม่ใช้ภาพ */
import { h, mount, icon, sheet, toast, bar } from './ui2.js';
import { db, wordsOf, categoryOf, loadAll } from './data.js';
import { sayText, stopSpeaking, loadAudioManifest } from './speech.js';
import { mascot } from './mascot2.js';
import { getPlaybackVolume, setPlaybackVolume } from './speech.js';
import * as store from './store.js';
import { sfxTap } from './sfx.js';

let ready = false;
async function ensure() {
  if (ready) return;
  await loadAll();
  await loadAudioManifest().catch(() => {});
  ready = true;
}

function speak(word) {
  sayText(word.word, { audioKey: `word:${word.id}`, gender: 'female' });
}

function detail(word, refresh) {
  const cat = categoryOf(word.category);
  sheet(word.word,
    h('div', { class: 'word-sheet' },
      h('div', { class: 'word-sheet-mono', style: { '--unit': cat ? cat.color : '#2EC27E' }, text: word.word.charAt(0).toUpperCase() }),
      h('div', { class: 'word-sheet-en en', text: word.word }),
      h('div', { class: 'word-sheet-ipa', text: word.ipa }),
      h('div', { class: 'word-sheet-th', text: word.thai }),
      h('button', { class: 'chip-btn', type: 'button', onclick: () => speak(word) },
        icon('sound', 18), h('span', { text: 'ฟังคำนี้' })),
      h('div', { class: 'word-sheet-actions' },
        h('button', { class: 'chip-btn', type: 'button', onclick: (event) => { const active = store.toggleFavorite(word.id); event.currentTarget.textContent = active ? '⭐ เอาออกจากคำโปรด' : '☆ เพิ่มเป็นคำโปรด'; sfxTap(); refresh(); } }, `${store.isFavorite(word.id) ? '⭐ เอาออกจากคำโปรด' : '☆ เพิ่มเป็นคำโปรด'}`),
        h('button', { class: 'chip-btn', type: 'button', onclick: (event) => { const active = store.toggleHard(word.id); event.currentTarget.textContent = active ? '✓ เอาออกจากคำยาก' : '⚠ ทำเครื่องหมายว่ายาก'; sfxTap(); refresh(); } }, `${store.isHard(word.id) ? '✓ เอาออกจากคำยาก' : '⚠ ทำเครื่องหมายว่ายาก'}`)),
      h('div', { class: 'word-sheet-ex en', text: word.example }),
      h('div', { class: 'muted small', text: word.exampleThai }),
      h('button', { class: 'chip-btn', type: 'button', onclick: () => sayText(word.example, { audioKey: `sent:${word.id}`, gender: 'female' }) },
        icon('sound', 18), h('span', { text: 'ฟังประโยค' })),
      word.tip ? h('div', { class: 'tip-box', text: `💡 ${word.tip}` }) : null));
}

export async function wordsView(root) {
  mount(root, h('div', { class: 'center pad' }, mascot('listen', 96), h('div', { class: 'muted', text: 'กำลังโหลดคำศัพท์…' })));
  await ensure();

  let cat = 'all';
  let filter = 'all';
  let q = '';

  const list = h('div', { class: 'word-list' });
  let review = [];
  try { review = JSON.parse(localStorage.getItem('pangpood-v2.review') || '[]'); } catch { review = []; }
  const reviewCard = h('section', { class: 'card review-library' });
  function paintReview() {
    mount(reviewCard,
      h('div', { class: 'card-title', text: `📝 ต้องทบทวน · ${review.length} ข้อ` }),
      review.length ? h('div', { class: 'review-rows' }, ...review.slice(-8).reverse().map((item) => h('div', { class: 'review-row' },
        h('div', { class: 'review-copy' },
          h('div', { class: 'bold', text: item.answer }),
          h('div', { class: 'muted small', text: `บท ${item.lessonId}` })),
        h('button', { class: 'chip-btn', type: 'button', onclick: () => { location.hash = `#/lesson?id=${encodeURIComponent(item.lessonId)}`; } }, 'ฝึกบทนี้'))))
        : h('div', { class: 'muted small', text: 'ข้อที่ตอบผิดจะมาอยู่ตรงนี้ ให้กลับมาฝึกซ้ำได้เสมอ' }));
  }

  function paint() {
    const items = (cat === 'all' ? db.words : wordsOf(cat))
      .filter((w) => filter === 'all' || (filter === 'fav' ? store.isFavorite(w.id) : store.isHard(w.id)))
      .filter((w) => !q || w.word.toLowerCase().includes(q) || w.thai.includes(q));
    mount(list, ...items.map((w) => {
      const c = categoryOf(w.category);
      return h('div', { class: 'word-row-wrap' }, h('button', { class: 'word-row', type: 'button', onclick: () => { speak(w); detail(w, paint); } },
        h('span', { class: 'word-mono', style: { '--unit': c ? c.color : '#2EC27E' }, text: w.word.charAt(0).toUpperCase() }),
        h('span', { class: 'word-main' },
          h('span', { class: 'word-en en', text: w.word }),
          h('span', { class: 'word-th', text: w.thai })),
        h('span', { class: 'word-cat', text: c ? c.emoji : '' })),
        h('button', { class: `word-star${store.isFavorite(w.id) ? ' on' : ''}`, type: 'button', 'aria-label': store.isFavorite(w.id) ? 'นำออกจากคำโปรด' : 'เพิ่มเป็นคำโปรด', onclick: (e) => { e.stopPropagation(); store.toggleFavorite(w.id); sfxTap(); paint(); } }, store.isFavorite(w.id) ? '⭐' : '☆'));
    }));
    if (!items.length) mount(list, h('div', { class: 'empty', text: 'ไม่พบคำที่ค้นหา' }));
  }

  const search = h('input', {
    class: 'search', type: 'search', placeholder: 'ค้นหาคำหรือความหมาย…',
    oninput: (e) => { q = e.currentTarget.value.trim().toLowerCase(); paint(); },
  });

  const chips = h('div', { class: 'chips' },
    h('button', {
      class: 'chip on', type: 'button', 'data-cat': 'all',
      onclick: (e) => selectCat(e.currentTarget, 'all'),
    }, 'หมวดทั้งหมด'),
    h('button', { class: 'chip on', type: 'button', 'data-filter': 'all', onclick: (e) => selectFilter(e.currentTarget, 'all') }, 'ทั้งหมด'),
    h('button', { class: 'chip', type: 'button', 'data-filter': 'fav', onclick: (e) => selectFilter(e.currentTarget, 'fav') }, '⭐ โปรด'),
    h('button', { class: 'chip', type: 'button', 'data-filter': 'hard', onclick: (e) => selectFilter(e.currentTarget, 'hard') }, '⚠ ยาก'),
    ...db.categories.map((c) => h('button', {
      class: 'chip', type: 'button', 'data-cat': c.id,
      onclick: (e) => selectCat(e.currentTarget, c.id),
    }, `${c.emoji} ${c.th}`)));

  function selectCat(el, id) {
    cat = id;
    chips.querySelectorAll('[data-cat]').forEach((c) => c.classList.toggle('on', c === el));
    paint();
  }
  function selectFilter(el, id) {
    filter = id;
    chips.querySelectorAll('[data-filter]').forEach((chip) => chip.classList.toggle('on', chip === el));
    chips.querySelectorAll('[data-cat]').forEach((chip) => chip.classList.toggle('on', chip.dataset.cat === cat));
    paint();
  }

  mount(root,
    h('div', { class: 'page-head' },
      h('div', { class: 'page-title', text: 'คลังคำ' }),
      h('div', { class: 'page-sub', text: `${db.words.length} คำ · ${db.categories.length} หมวด · แตะเพื่อฟังเสียง` })),
    reviewCard, search, chips, list);

  paintReview();
  paint();
  return () => { stopSpeaking(); };
}
