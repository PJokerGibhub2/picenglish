import { h, mount, icon } from './ui2.js';

const MODES = [
  ['mic', '🎤', 'ฝึกออกเสียง', 'ฝึกคำศัพท์และประโยคทีละข้อ', '#/speak'],
  ['chat', '🎭', 'บทสนทนา', 'ฝึกพูดในสถานการณ์จริง', '#/roleplay'],
  ['chat', '🗣️', 'พูดตามเงา', 'ฟังแล้วฝึกพูดตามทีละประโยค', '#/shadow'],
  ['headphones', '🎧', 'ฟังบทเต็ม', 'ฟังเรื่องสั้นพร้อมคำถาม', '#/listening'],
  ['chat', '💬', 'คลังประโยค', 'รวมวลีที่ใช้ได้ในชีวิตประจำวัน', '#/chunks'],
  ['arrow', '🔁', 'ทบทวนประโยค', 'กลับมาฝึกประโยคที่เคยเรียน', '#/sentences'],
];

export function practiceView(root) {
  mount(root,
    h('header', { class: 'page-head' }, h('div', { class: 'page-title', text: 'ฝึกพูดและฟัง' }), h('div', { class: 'page-sub', text: 'เลือกกิจกรรมที่อยากฝึกได้เลย' })),
    h('div', { class: 'practice-grid' }, ...MODES.map(([ic, emoji, title, desc, href]) =>
      h('button', { class: `practice-card${href ? '' : ' coming'}`, type: 'button', onclick: () => { if (href) location.hash = href; } },
        h('div', { class: 'practice-icon' }, icon(ic, 24), h('span', { text: emoji })),
        h('div', { class: 'practice-copy' }, h('strong', { text: title }), h('small', { class: 'muted', text: desc }),
          href ? null : h('span', { class: 'practice-soon', text: 'กำลังมา' })),
        href ? icon('arrow', 19) : null))));
  return () => {};
}
