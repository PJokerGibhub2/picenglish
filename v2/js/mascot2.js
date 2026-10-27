/* mascot2.js — "พัง" ช้างน้อยมาสคอสของ PangPood
 *
 * วาดเองทั้งหมดด้วย SVG (ไม่มีไฟล์ภาพจากภายนอก) แยกเป็นชิ้นส่วน
 * เพื่อให้ CSS ขยับได้ทีละส่วน: หู · งวง · เปลือกตา · ลำตัว · ขา · หาง · ผ้าพันคอ
 *
 * สถานะ: idle | listen | cheer | sad | sleep | wave | point
 */
const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, String(v));
  }
  for (const c of kids.flat(9)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c);
  }
  return el;
}

/** สร้าง SVG มาสคอส (ขนาดเท่าไรก็ได้) */
export function mascotSvg() {
  const body = s('ellipse', { cx: 100, cy: 152, rx: 60, ry: 44, fill: '#AFC6DE' });
  const belly = s('ellipse', { cx: 100, cy: 160, rx: 40, ry: 30, fill: '#DCE9F6' });
  const legL = s('rect', { x: 74, y: 176, width: 24, height: 30, rx: 12, fill: '#9CB6CF' });
  const legR = s('rect', { x: 102, y: 176, width: 24, height: 30, rx: 12, fill: '#9CB6CF' });
  const tail = s('path', { d: 'M158 150 q 16 4 12 18', stroke: '#9CB6CF', 'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round' });

  const earL = s('g', { class: 'p-ear p-ear-l' },
    s('ellipse', { cx: 54, cy: 92, rx: 25, ry: 34, fill: '#A3BCD4' }),
    s('ellipse', { cx: 58, cy: 94, rx: 15, ry: 23, fill: '#F3B7C4' }));
  const earR = s('g', { class: 'p-ear p-ear-r' },
    s('ellipse', { cx: 146, cy: 92, rx: 25, ry: 34, fill: '#A3BCD4' }),
    s('ellipse', { cx: 142, cy: 94, rx: 15, ry: 23, fill: '#F3B7C4' }));

  const eyeL = s('g', { class: 'p-eye' },
    s('circle', { cx: 86, cy: 84, r: 5.4, fill: '#22303C' }),
    s('circle', { cx: 87.8, cy: 82.2, r: 1.8, fill: '#FFFFFF' }),
    s('rect', { class: 'p-lid', x: 79, y: 76, width: 15, height: 16, rx: 7, fill: '#A3BCD4' }));
  const eyeR = s('g', { class: 'p-eye' },
    s('circle', { cx: 114, cy: 84, r: 5.4, fill: '#22303C' }),
    s('circle', { cx: 115.8, cy: 82.2, r: 1.8, fill: '#FFFFFF' }),
    s('rect', { class: 'p-lid', x: 107, y: 76, width: 15, height: 16, rx: 7, fill: '#A3BCD4' }));

  // งวง: กลุ่มที่มีจุดหมุนบน (จะแกว่ง/ชูได้)
  const trunk = s('g', { class: 'p-trunk' },
    s('path', {
      d: 'M100 108 C 102 146, 96 166, 104 176 C 114 188, 128 178, 122 164',
      stroke: '#AFC6DE', 'stroke-width': 17, fill: 'none', 'stroke-linecap': 'round',
    }),
    s('path', { d: 'M100 112 C 101 146, 97 162, 103 172', stroke: '#C6D9EA', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round' }),
    s('circle', { cx: 122, cy: 164, r: 8.5, fill: '#AFC6DE' }));

  const tusk = s('path', { d: 'M112 140 q 8 2 8 9', stroke: '#FFF6E5', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' });
  const scarf = s('path', { class: 'p-scarf', d: 'M64 120 q 36 20 72 0 l 2 12 q -38 22 -76 0 z', fill: '#FF6B6B' });
  const head = s('circle', { cx: 100, cy: 92, r: 44, fill: '#B7CDE2' });
  const cheekL = s('circle', { cx: 74, cy: 100, r: 7, fill: '#F5B6C3', opacity: '.55' });
  const cheekR = s('circle', { cx: 126, cy: 100, r: 7, fill: '#F5B6C3', opacity: '.55' });

  const earBack = s('g', { class: 'p-ear-back' }, earL.cloneNode(true), earR.cloneNode(true));
  earBack.setAttribute('opacity', '.35');

  return s('svg', { viewBox: '0 0 200 220', class: 'p-svg', role: 'img', 'aria-label': 'พัง ช้างน้อยเพื่อนคู่ใจ' },
    s('ellipse', { class: 'p-shadow', cx: 100, cy: 208, rx: 52, ry: 8, fill: '#0F2A24', opacity: '.12' }),
    s('g', { class: 'p-body-group' },
      tail, earBack, body, belly, legL, legR,
      s('g', { class: 'p-head-group' },
        earL, earR, head, trunk, tusk, scarf, cheekL, cheekR, eyeL, eyeR)));
}

/** สร้างมาสคอสพร้อมสถานะ + ขนาด */
export function mascot(state = 'idle', size = 140) {
  const wrap = document.createElement('div');
  wrap.className = `p-mascot is-${state}`;
  wrap.style.width = `${size}px`;
  wrap.style.height = `${Math.round(size * 1.1)}px`;
  const svg = mascotSvg();
  wrap.appendChild(svg);
  return wrap;
}

/** เปลี่ยนสถานะชั่วคราวแล้วกลับเป็น idle */
export function mascotReact(el, state = 'cheer', ms = 1100) {
  if (!el) return;
  el.classList.remove('is-idle', 'is-listen', 'is-cheer', 'is-sad', 'is-sleep', 'is-wave', 'is-point');
  el.classList.add(`is-${state}`);
  clearTimeout(el._reactTimer);
  el._reactTimer = setTimeout(() => {
    el.classList.remove(`is-${state}`);
    el.classList.add('is-idle');
  }, ms);
}
