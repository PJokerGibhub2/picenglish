/* ui2.js — เครื่องมือสร้าง DOM ของ PangPood (V2)
 * ตั้งใจให้ต่างจาก V1: ปุ่ม 3 มิติ, ป้ายมน, ไม่มี gradient หนา, ใช้ h() ตัวเดียว
 */

/** สร้าง element: h('div', { class, text, style, onclick, ... }, ...children) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset' && typeof v === 'object') {
      Object.assign(el.dataset, v);
    } else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(9)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

/** ล้างลูกทั้งหมดของ node */
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

/** วาดของใหม่ทับ node เดิม */
export function mount(el, ...children) { clear(el); for (const c of children.flat(9)) { if (c) el.appendChild(c); } }

/** ไอคอน SVG เส้น (ไม่ใช้รูปภาพ extern) */
const ICONS = {
  sound: 'M4 9v6h3l5 4V5L7 9H4zm11.5 3a4.5 4.5 0 0 0-2-3.7v7.4a4.5 4.5 0 0 0 2-3.7z',
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.4 4a8.4 8.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a8.3 8.3 0 0 0-2-1.2L15.5 3h-4l-.4 2.6c-.7.3-1.4.7-2 1.2l-2.4-1-2 3.4 2 1.6a8.4 8.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  back: 'M15 5l-7 7 7 7',
  star: 'M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1zm2 0h6V8a3 3 0 0 0-6 0v2z',
  check: 'M4 12l5 5L20 6',
  play: 'M8 5l12 7-12 7V5z',
  crown: 'M3 8l4 3 5-6 5 6 4-3-2 11H5L3 8z',
  flame: 'M12 2c3 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 2-9z',
  book: 'M4 6a3 3 0 0 1 3-3h4v17H7a3 3 0 0 1-3-3V6zm9-3h4a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-4V3z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z',
  route: 'M7 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14-10a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM5 15V9a4 4 0 0 1 4-4h6',
  target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
};

export function icon(name, size = 22) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.target);
  svg.appendChild(p);
  return svg;
}

/** ปุ่ม 3 มิติ (สไตล์เกม) */
export function btn3d(label, { tone = 'brand', block = false, size = 'md', onclick, icon: ic } = {}) {
  const el = h('button', {
    class: `btn3d btn3d-${tone} btn3d-${size}${block ? ' btn3d-block' : ''}`, type: 'button',
    onclick,
  }, ic ? icon(ic, size === 'lg' ? 24 : 20) : null, h('span', { text: label }));
  return el;
}

/** Toast สั้น ๆ ล่างจอ */
let toastTimer = null;
export function toast(text, ms = 1800) {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast', class: 'toast' });
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), ms);
}

/** แผ่นเลื่อนขึ้น (bottom sheet) */
export function sheet(title, body, { onClose } = {}) {
  const wrap = h('div', { class: 'sheet-wrap' });
  const close = () => { wrap.remove(); document.body.classList.remove('no-scroll'); onClose && onClose(); };
  const panel = h('div', { class: 'sheet-panel' },
    h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-head' },
      h('div', { class: 'sheet-title', text: title }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ปิด', onclick: close }, '✕')),
    h('div', { class: 'sheet-body' }, body));
  wrap.appendChild(h('div', { class: 'sheet-scrim', onclick: close }));
  wrap.appendChild(panel);
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));
  return close;
}

/** คอนเฟตตี (canvas) — ไม่ใช้ไลบรารี */
export function confetti({ count = 90, colors = ['#2EC27E', '#FFB020', '#FF6B6B', '#7C5CFF', '#0EA5E9'] } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = h('canvas', { class: 'confetti-canvas' });
  c.width = window.innerWidth; c.height = window.innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.3,
    r: 3 + Math.random() * 5, vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI, vr: -0.15 + Math.random() * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  let frames = 0;
  const tick = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    frames += 1;
    if (frames < 150) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}

/** แถบความคืบหน้าแบบบาง */
export function bar(pct, { tone = 'brand' } = {}) {
  return h('div', { class: 'bar' },
    h('div', { class: `bar-fill bar-${tone}`, style: { width: `${Math.max(0, Math.min(100, pct))}%` } }));
}
