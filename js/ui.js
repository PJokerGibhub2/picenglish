/**
 * ui.js — ตัวช่วยสร้าง DOM ขนาดเล็ก + toast + bottom sheet + ภาพ
 * (ไม่ใช้เฟรมเวิร์ก เพื่อให้ไฟล์เล็ก เปิดได้เร็ว และไม่ต้องมีขั้นตอน build)
 */

import { photoFor, candidatesOf, setPhotoChoice } from './images.js';
import { artFor } from './art.js';
import { isFavorite, toggleFavorite, settings } from './store.js';

/* ---------------- DOM ---------------- */

// ต้องสร้าง SVG ด้วย createElementNS เท่านั้น
// ถ้าใช้ createElement('svg') เบราว์เซอร์จะได้ HTMLUnknownElement แล้วไอคอนจะไม่แสดงเลย
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'use', 'text', 'tspan', 'ellipse']);

export function h(tag, props = {}, ...kids) {
  const el = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class' || k === 'className') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      // ต้องใช้ setProperty สำหรับ CSS custom property (เช่น --cat) — Object.assign ใช้ไม่ได้
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
        else el.style[sk] = sv;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const kid of kids.flat(4)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function mount(node, ...kids) { clear(node); add(node, kids); return node; }

const ICON_PATHS = {
  play: 'M8 5l11 7-11 7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  sound: 'M11 5L6 9H3v6h3l5 4zM16 9a4 4 0 010 6M19 6a8 8 0 010 12',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.7l5.9-.8z',
  shuffle: 'M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7M21 16v5h-5M14 14l7 7M3 3l7 7',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 5v6h-6',
  check: 'M4 12.5l5 5L20 6.5',
  close: 'M6 6l12 12M18 6L6 18',
  mic: 'M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zM5 11a7 7 0 0014 0M12 18v3',
  chevron: 'M9 5l7 7-7 7',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 19h14',
  trash: 'M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13',
};

const FILLED_ICONS = new Set(['play', 'pause', 'star']);

export function icon(name, size = 20) {
  const svg = h('svg', {
    viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false',
  });
  svg.appendChild(h('path', {
    d: ICON_PATHS[name] || '',
    fill: FILLED_ICONS.has(name) ? 'currentColor' : 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }));
  return svg;
}

export function svgIcon(pathD, size = 20, filled = false) {
  const svg = h('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' });
  svg.appendChild(h('path', {
    d: pathD,
    fill: filled ? 'currentColor' : 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }));
  return svg;
}

/* ---------------- Toast ---------------- */
export function toast(msg, type = '', ms = 2300) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const t = h('div', { class: `toast ${type}`, text: msg });
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .25s, transform .25s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    setTimeout(() => t.remove(), 280);
  }, ms);
}

/* ---------------- Bottom sheet ---------------- */
let sheetEsc = null;
let sheetId = null;

/**
 * เปิดแผงด้านล่าง
 * @param {(close: Function) => Node} build ฟังก์ชันสร้างเนื้อหา
 * @param {{id?: string}} opts  ระบุ id เพื่อให้ผู้ฟังเหตุการณ์รู้ว่าแผงไหนถูกปิด
 *   (สำคัญ: ต้องไม่ re-render หน้าจอเมื่อปิดแผงอื่น เพราะจะทำให้ความคืบหน้าหาย)
 */
export function openSheet(build, opts = {}) {
  const backdrop = document.getElementById('sheet');
  const body = document.getElementById('sheet-body');
  if (!backdrop || !body) return;
  clear(body);
  sheetId = opts.id || null;
  const close = () => closeSheet();
  const content = build(close);
  if (content) body.appendChild(content);
  backdrop.classList.remove('hidden');
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  sheetEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', sheetEsc);
}

export function closeSheet() {
  const backdrop = document.getElementById('sheet');
  if (backdrop) backdrop.classList.add('hidden');
  if (sheetEsc) { document.removeEventListener('keydown', sheetEsc); sheetEsc = null; }
  const id = sheetId;
  sheetId = null;
  document.dispatchEvent(new CustomEvent('sheet:closed', { detail: { id } }));
}

export function sheetHeader(title, subtitle, onClose) {
  return h('div', { class: 'row', style: { marginBottom: '6px' } },
    h('div', { style: { flex: '1' } },
      h('h2', { text: title }),
      subtitle ? h('div', { class: 'small muted', text: subtitle }) : null),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ปิด', onclick: onClose }, icon('close')));
}

/* ---------------- ภาพ ---------------- */
/**
 * สร้างกล่องภาพสำหรับคำหนึ่งคำ
 * แสดงอีโมจิทันที (ทำงานออฟไลน์ได้เสมอ) แล้วค่อยแทนที่ด้วยภาพถ่ายจริงเมื่อโหลดเสร็จ
 * opts.allowCycle = true จะมีปุ่ม "เปลี่ยนภาพ" ให้เลือกภาพถัดไปจากคลัง (ภาพจากคลังฟรีอาจไม่ตรงความหมาย 100%)
 */
export function photoBox(word, opts = {}) {
  const cat = opts.color || '#4f46e5';
  const wrap = h('div', { class: `photo-wrap ${opts.class || ''}`, style: { '--cat': cat } });
  const emoji = h('div', { class: 'photo-emoji', text: word.emoji || '🖼️' });
  wrap.appendChild(emoji);

  let img = null;
  let credit = null;
  let loading = null;

  const apply = (photo) => {
    if (!photo) { if (loading) { loading.remove(); loading = null; } return; }
    if (!img) {
      img = h('img', {
        alt: word.word || word.titleEn || word.title || '',
        loading: 'lazy', decoding: 'async',
        onerror: () => { if (img) { img.remove(); img = null; } },
        onload: () => { if (loading) { loading.remove(); loading = null; } emoji.remove(); },
      });
      wrap.insertBefore(img, wrap.firstChild);
    }
    img.src = photo.url;
    if (opts.showCredit !== false) {
      if (!credit) {
        credit = h('div', { class: 'photo-credit' });
        wrap.appendChild(credit);
      }
      mount(credit,
        h('a', { href: photo.page, target: '_blank', rel: 'noopener noreferrer', text: photo.artist }),
        ' · ',
        photo.licenseUrl
          ? h('a', { href: photo.licenseUrl, target: '_blank', rel: 'noopener noreferrer', text: photo.license })
          : photo.license);
    }
    wrap.dataset.photoUrl = photo.url;
  };

  // โหมดภาพ: art = ภาพกราฟฟิกน่ารัก (แนะนำ, ออฟไลน์) | photo = ภาพถ่ายจริง | emoji = อีโมจิเท่านั้น
  const mode = opts.mode || (settings().imageMode || 'art');

  if (mode === 'art') {
    const art = artFor(word.id);
    if (art) {
      const imgEl = h('img', {
        class: 'art-img', src: art.url, alt: word.word || word.titleEn || '',
        loading: 'lazy', decoding: 'async',
        onerror: () => { if (imgEl) imgEl.remove(); },
      });
      wrap.appendChild(imgEl);
      emoji.remove();
    }
  } else if (mode === 'photo') {
    loading = h('div', { class: 'photo-loading' }, h('div', { class: 'tiny muted', text: '…' }));
    wrap.appendChild(loading);
    photoFor(word, { cycle: !!opts.cycle }).then(apply).catch(() => { if (loading) loading.remove(); });
  }

  if (opts.allowCycle && mode === 'photo') {
    wrap.appendChild(h('button', {
      class: 'photo-btn', type: 'button', text: '🖼 เปลี่ยนภาพ',
      onclick: (e) => {
        e.stopPropagation();
        openPhotoPicker(word, (photo) => apply(photo));
      },
    }));
  }

  return wrap;
}

/**
 * แผงให้ผู้ใช้เลือกภาพเอง — ภาพจากคลังฟรีบางครั้งไม่ตรงความหมาย
 * การให้ผู้ใช้เลือกเองทำให้แก้ปัญหาได้ทันที และจำภาพที่เลือกไว้ถาวร
 */
export function openPhotoPicker(word, onPick) {
  openSheet((close) => {
    const box = h('div', {});
    box.appendChild(sheetHeader('เลือกภาพให้คำนี้', `${word.word} — ${word.thai}`, close));
    const status = h('div', { class: 'small muted', style: { marginBottom: '10px' }, text: 'กำลังโหลดรายการภาพ…' });
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' } });
    box.appendChild(status);
    box.appendChild(grid);

    candidatesOf(word).then((list) => {
      if (!list.length) {
        status.textContent = 'ไม่พบภาพถ่ายสำหรับคำนี้ — จะใช้ภาพอีโมจิแทน (ดูสวยและใช้ได้ตอนออฟไลน์)';
        return;
      }
      status.textContent = `พบ ${list.length} ภาพ — แตะภาพที่ตรงความหมายที่สุด (มีเครดิตและไลเซนส์กำกับให้อัตโนมัติ)`;
      list.forEach((c, i) => {
        grid.appendChild(h('button', {
          class: 'mtile pic', type: 'button', style: { height: '104px' }, title: c.title,
          onclick: async () => {
            await setPhotoChoice(word.id, i);
            close();
            onPick && onPick(c);
            toast('บันทึกภาพที่เลือกไว้แล้ว', 'ok');
          },
        }, h('img', { src: c.url, alt: c.title, loading: 'lazy' })));
      });
    }).catch(() => { status.textContent = 'โหลดรายการภาพไม่สำเร็จ ลองใหม่อีกครั้ง'; });

    return box;
  });
}

export function starButton(word, opts = {}) {
  const btn = h('button', {
    class: 'icon-btn', type: 'button', 'aria-label': 'บันทึกเป็นคำโปรด',
    style: { color: isFavorite(word.id) ? '#f59e0b' : 'var(--text-soft)' },
    onclick: (e) => {
      e.stopPropagation();
      const on = toggleFavorite(word.id);
      btn.style.color = on ? '#f59e0b' : 'var(--text-soft)';
      toast(on ? 'เพิ่มในคำของฉันแล้ว ⭐' : 'นำออกจากคำของฉันแล้ว');
      opts.onChange && opts.onChange(on);
    },
  }, icon('star', 20));
  return btn;
}

/* ---------------- รูปแบบข้อความ ---------------- */
export function fmtInterval(days) {
  if (days < 1 / 24) return 'อีกไม่กี่นาที';
  if (days < 1) return `อีก ${Math.max(1, Math.round(days * 24))} ชั่วโมง`;
  if (days < 30) return `อีก ${Math.round(days)} วัน`;
  if (days < 365) return `อีก ${Math.round(days / 30)} เดือน`;
  return `อีก ${(days / 365).toFixed(1)} ปี`;
}

export function progressBar(value, max) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return h('div', { class: 'progress' }, h('i', { style: { width: pct + '%' } }));
}

export function emptyState(emoji, title, sub, action) {
  return h('div', { class: 'empty' },
    h('div', { class: 'e', text: emoji }),
    h('div', { class: 'bold', style: { marginTop: '6px' }, text: title }),
    sub ? h('div', { class: 'small', style: { marginTop: '4px' }, text: sub }) : null,
    action ? h('div', { style: { marginTop: '16px' } }, action) : null);
}

export function speakBtn(text, opts = {}) {
  const label = opts.label || 'ฟังเสียง';
  return h('button', {
    class: `btn ${opts.class || 'btn-ghost'} ${opts.block ? 'btn-block' : ''}`,
    type: 'button', onclick: opts.onclick,
  }, icon('sound', 18), label);
}
