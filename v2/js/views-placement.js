import { h, mount, bar, btn3d } from './ui2.js';
import { loadPlacement, createSession } from './placement.js';
import * as store from './store.js';
import { loadPath } from './views-path.js';
import { sayText, stopSpeaking } from './speech.js';

const SKILL_NAMES = { vocab: 'คำศัพท์', listening: 'การฟัง', phrase: 'การใช้ประโยค' };

export async function placementView(root) {
  await loadPlacement();
  let session = null;
  let stopped = false;
  const intro = () => mount(root,
    h('header', { class: 'page-head' }, h('div', { class: 'page-title', text: '🧭 วัดระดับภาษา' }),
      h('div', { class: 'page-sub', text: '18 ข้อ ใช้เวลาประมาณ 3 นาที ระบบจะปรับระดับตามคำตอบของคุณ' })),
    h('section', { class: 'card placement-card' },
      h('p', { text: 'ตอบตามที่รู้ได้เลย ไม่แสดงเฉลย และไม่มีผลเสียหากยังไม่แน่ใจ' }),
      btn3d('เริ่มวัดระดับ', { block: true, onclick: () => start(false) }),
      h('button', { class: 'chip-btn', type: 'button', onclick: () => start(true) }, 'ทำแบบสั้น (5 ข้อ)'),
      h('button', { class: 'practice-skip', type: 'button', onclick: () => { location.hash = '#/practice'; } }, 'กลับไปหน้าฝึก')));
  function start(short) { session = createSession({ short }); renderQuestion(session.next()); }
  function renderQuestion(item) {
    if (!item) return finish();
    const progress = session.progress();
    const choices = h('div', { class: 'placement-options' }, ...item.options.map((option, index) =>
      h('button', { class: 'answer', type: 'button', onclick: () => {
        if (item.audioText) sayText(item.audioText, { audioKey: item.audioKey });
        session.answer(index);
        renderQuestion(session.next());
      } }, option)));
    mount(root,
      h('div', { class: 'session-top' }, h('button', { class: 'session-exit', type: 'button', onclick: intro, 'aria-label': 'ออก' }, '×'),
        h('div', { class: 'session-title', text: 'วัดระดับ' }), h('span', { class: 'session-title', text: `${progress.current + 1}/${progress.total}` })),
      bar((progress.current / progress.total) * 100),
      h('section', { class: 'card placement-card' }, h('div', { class: 'muted small', text: `${item.level} · ${SKILL_NAMES[item.skill] || ''}` }),
        h('h2', { class: 'placement-prompt', text: item.prompt }),
        item.audioText ? h('button', { class: 'listen-again', type: 'button', onclick: () => sayText(item.audioText, { audioKey: item.audioKey }) }, '🔊 ฟังคำถาม') : null,
        choices));
  }
  async function finish() {
    if (stopped) return;
    const result = session.result();
    const path = await loadPath().catch(() => null);
    const sections = path?.sections || [];
    const matchingSection = sections.find((section) => String(section.subtitle || '').toUpperCase().includes(result.level));
    const entry = matchingSection?.units?.flatMap((unit) => unit.lessons)[0]
      || sections.flatMap((section) => section.units).flatMap((unit) => unit.lessons.map((lesson) => ({ lesson, section })))
        .find(({ lesson }) => String(lesson.level || lesson.cefr || '').toUpperCase() === result.level)?.lesson;
    result.recommendLessonId = entry?.id || null;
    store.setPlacement(result);
    const weak = Object.entries(result.skills).sort((a, b) => a[1].percent - b[1].percent).slice(0, 2);
    mount(root, h('div', { class: 'review-empty' }, h('div', { class: 'page-title', text: 'ระดับที่แนะนำ' }),
      h('div', { class: 'placement-level', text: result.level }), h('div', { class: 'muted', text: 'ทักษะที่ฝึกเพิ่มได้' }),
      ...weak.map(([skill, value]) => h('div', { class: 'card placement-skill' }, `${SKILL_NAMES[skill]} · ${value.percent}%`)),
      result.recommendLessonId
        ? btn3d('ไปเรียนบทนี้', { block: true, icon: 'play', onclick: () => { location.hash = `#/lesson?id=${encodeURIComponent(result.recommendLessonId)}`; } })
        : h('div', { class: 'muted small', text: 'ยังหาบทเรียนระดับนี้ไม่พบในเส้นทาง' }),
      h('button', { class: 'practice-skip', type: 'button', onclick: () => { location.hash = '#/path'; } }, 'กลับไปเส้นทาง')));
  }
  intro();
  return () => { stopped = true; stopSpeaking(); };
}
