/**
 * mascot.js — มาสคอต "ปิโก" (Pico) หุ่นยนต์ตัวน้อย
 *
 * ทำไมเป็นหุ่นยนต์: สื่อ "เทคโนโลยี/การเรียนรู้" แบบทันสมัย น่ารัก น่าติดตาม
 * และpanimations ทำได้ง่าย (ตากระพริบ, ลอยตัว, เรืองแสง)
 *
 * 4 อารมณ์: idle (ปกติ) · happy (ดีใจ) · sad (ผิดหวัง) · celebrate (ฉลอง)
 * ใช้ SVG ล้วน (~3 KB) ไม่มีไฟล์ภาพ ไม่มีลิขสิทธิ์ของใคร
 */

const EYE = '#5EEAD4';      // ตาสีมิ้นต์
const EYE_2 = '#22D3EE';    // ตาสีฟ้า
const GOLD = '#FBBF24';

function defs() {
  return `
    <defs>
      <radialGradient id="mGlow" cx="50%" cy="45%">
        <stop offset="0" stop-color="#22D3EE" stop-opacity=".42"/>
        <stop offset="1" stop-color="#22D3EE" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="mBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FAFCFF"/><stop offset="1" stop-color="#C3D3EC"/>
      </linearGradient>
      <linearGradient id="mVisor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#161E36"/><stop offset="1" stop-color="#080D1C"/>
      </linearGradient>
      <linearGradient id="mAccent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#7C3AED"/><stop offset="1" stop-color="#22D3EE"/>
      </linearGradient>
    </defs>`;
}

const BODY = `
  <ellipse cx="100" cy="188" rx="44" ry="6.5" fill="#000" opacity=".22"/>
  <path d="M100 54V34" stroke="#94A3B8" stroke-width="5" stroke-linecap="round"/>
  <circle cx="100" cy="27" r="8.5" fill="${GOLD}"/>
  <circle cx="100" cy="27" r="14" fill="${GOLD}" opacity=".18"/>
  <rect x="28" y="88" width="14" height="34" rx="7" fill="#A8BAD4"/>
  <rect x="158" y="88" width="14" height="34" rx="7" fill="#A8BAD4"/>
  <rect x="46" y="54" width="108" height="90" rx="30" fill="url(#mBody)"/>
  <rect x="58" y="68" width="84" height="58" rx="22" fill="url(#mVisor)"/>
  <rect x="70" y="141" width="60" height="33" rx="15" fill="url(#mBody)"/>
  <circle cx="100" cy="157" r="6.5" fill="url(#mAccent)"/>
  <rect x="52" y="145" width="12" height="27" rx="6" fill="#B9C9E2"/>
  <rect x="136" y="145" width="12" height="27" rx="6" fill="#B9C9E2"/>`;

const FACES = {
  idle: `
    <circle cx="80" cy="95" r="9" fill="${EYE}"/>
    <circle cx="120" cy="95" r="9" fill="${EYE_2}"/>
    <circle cx="83" cy="92" r="2.6" fill="#fff" opacity=".9"/>
    <circle cx="123" cy="92" r="2.6" fill="#fff" opacity=".9"/>
    <path d="M92 111q8 6 16 0" stroke="${EYE}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  happy: `
    <path d="M71 99q9-11 18 0" stroke="${EYE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M111 99q9-11 18 0" stroke="${EYE_2}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="100" cy="113" rx="10" ry="7" fill="${EYE}"/>
    <ellipse cx="64" cy="112" rx="6" ry="4" fill="#FB7185" opacity=".45"/>
    <ellipse cx="136" cy="112" rx="6" ry="4" fill="#FB7185" opacity=".45"/>`,
  sad: `
    <path d="M71 91q9 10 18 0" stroke="${EYE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M111 91q9 10 18 0" stroke="${EYE_2}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M92 116h16" stroke="#8FA6C4" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M58 108q5 7 0 11q-5-4 0-11z" fill="#67E8F9" opacity=".9"/>`,
  celebrate: `
    <path d="M80 88l3.2 7.4 7.4 3.2-7.4 3.2-3.2 7.4-3.2-7.4-7.4-3.2 7.4-3.2z" fill="${GOLD}"/>
    <path d="M120 88l3.2 7.4 7.4 3.2-7.4 3.2-3.2 7.4-3.2-7.4-7.4-3.2 7.4-3.2z" fill="${GOLD}"/>
    <path d="M90 112q10 9 20 0" stroke="${EYE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M32 52l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="${GOLD}"/>
    <path d="M172 62l2.4 5.6 5.6 2.4-5.6 2.4-2.4 5.6-2.4-5.6-5.6-2.4 5.6-2.4z" fill="#FDE68A"/>
    <path d="M156 168l2.4 5.6 5.6 2.4-5.6 2.4-2.4 5.6-2.4-5.6-5.6-2.4 5.6-2.4z" fill="#22D3EE"/>`,
};

/**
 * คืนค่าเป็นสตริง SVG ของมาสคอต
 * @param {'idle'|'happy'|'sad'|'celebrate'} variant
 * @param {number} size ขนาด px
 * @param {object} opts { glow: boolean, cls: string }
 */
export function mascotSVG(variant = 'idle', size = 120, opts = {}) {
  const face = FACES[variant] || FACES.idle;
  const glow = opts.glow === false ? '' : '<circle cx="100" cy="102" r="80" fill="url(#mGlow)"/>';
  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" class="mascot-svg ${opts.cls || ''}" aria-hidden="true">${defs()}${glow}${BODY}${face}</svg>`;
}

/** สร้าง element พร้อมแอนิเมชันลอยตัว */
export function mascot(variant = 'idle', size = 120, opts = {}) {
  const span = document.createElement('span');
  span.className = 'mascot ' + (opts.cls || '');
  span.style.display = 'inline-flex';
  span.style.width = size + 'px';
  span.style.height = size + 'px';
  span.innerHTML = mascotSVG(variant, size, opts); // สตริงคงที่ ไม่มีข้อมูลผู้ใช้
  return span;
}

export const MASCOT_NAME = 'ปิโก';
