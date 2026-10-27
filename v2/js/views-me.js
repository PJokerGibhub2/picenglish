/* หน้าฉัน: สถิติและการตั้งค่าเสียง */
import { h, mount, icon, btn3d, bar, toast } from './ui2.js';
import { mascot } from './mascot2.js';
import { db, loadAll } from './data.js';
import * as pg from './progress2.js';
import * as store from './store.js';
import { setPlaybackVolume, sayText, loadVoices, loadAudioManifest } from './speech.js';
import { loadPath } from './views-path.js';
import { VERSION } from './version.js';

let ready = false;
async function ensure() {
  if (ready) return;
  await loadAll();
  loadVoices();
  await loadAudioManifest().catch(() => {});
  setPlaybackVolume(Number(store.settings().volume) || 1.8);
  ready = true;
}

export async function meView(root) {
  mount(root, h('div', { class: 'center pad' }, mascot('idle', 96)));
  await ensure();
  const path = await loadPath().catch(() => null);
  const st = pg.stats();
  const done = path ? pg.totalDone(path) : 0;
  const total = path ? pg.flatten(path).length : 60;
  const week = pg.last7();
  const maxXp = Math.max(20, ...week.map((d) => d.xp));
  const activity = pg.todayActivity();
  const vol = Number(store.settings().volume) || 1.8;
  const out = h('span', { class: 'muted small', text: vol.toFixed(1) });
  const slider = h('input', {
    class: 'range', type: 'range', min: '1', max: '2.5', step: '0.1', value: String(vol),
    'aria-label': 'ระดับเสียง',
    oninput: (e) => {
      const v = Number(e.currentTarget.value);
      out.textContent = v.toFixed(1);
      store.setSetting('volume', v);
      setPlaybackVolume(v);
    },
  });
  const sections = (path?.sections || []).slice(0, 3);
  const reset = () => {
    if (window.prompt('พิมพ์คำว่า รีเซ็ต เพื่อยืนยันการล้างความคืบหน้า') !== 'รีเซ็ต') return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pangpood-v2.')) localStorage.removeItem(key);
    }
    // ข้อมูลการตั้งค่าและ XP ของ V2 ใช้คีย์รากนี้ด้วย
    store.resetAll();
    toast('รีเซ็ตความคืบหน้าแล้ว');
    setTimeout(() => location.reload(), 250);
  };

  mount(root,
    h('div', { class: 'me-head' }, mascot('wave', 104), h('div', {},
      h('div', { class: 'page-title', text: 'สวัสดี พัง!' }),
      h('div', { class: 'muted small', text: `เรียนจบแล้ว ${done}/${total} บท` }))),
    h('div', { class: 'stat-row' },
      stat('⭐', String(st.xp || 0), 'XP รวม'),
      stat('🔥', String(st.streak || 0), 'สตรีค (วัน)'),
      stat('✓', `${done}/${total}`, 'บทที่จบ')),
    h('div', { class: 'card me-today' },
      h('div', { class: 'card-title', text: 'วันนี้' }),
      h('div', { class: 'muted small', text: `คำที่ตอบถูก ${activity.words} ข้อ` })),
    h('button', { class: 'quest-review-card', type: 'button', onclick: () => { location.hash = '#/review'; } },
      h('span', { class: 'quest-review-icon', text: '🔁' }),
      h('span', {}, h('strong', { text: 'ทบทวนคำที่พลาด' }), h('small', { class: 'muted', text: 'ฝึกคำที่ถึงเวลาทบทวนอีกครั้ง' })), icon('play', 18)),
    h('div', { class: 'card' },
      h('div', { class: 'card-title', text: '7 วันที่ผ่านมา' }),
      h('div', { class: 'week' }, ...week.map((d) => h('div', { class: 'week-col' },
        h('div', { class: 'week-xp small muted', text: d.xp ? String(d.xp) : '' }),
        h('div', { class: 'week-bar-wrap' },
          h('div', { class: `week-bar${d.key === week[6].key ? ' today' : ''}${d.xp > 0 ? ' active' : ''}`, style: { height: `${Math.max(6, Math.round((d.xp / maxXp) * 64))}px` } })),
        h('div', { class: 'week-lbl', text: d.label }))))),
    h('div', { class: 'card' },
      h('div', { class: 'card-title', text: 'ความคืบหน้าตาม Section' }),
      ...sections.map((sec) => {
        const p = pg.sectionDone(sec);
        return h('div', { class: 'section-progress' },
          h('div', { class: 'section-progress-head' }, h('strong', { text: sec.title }),
            h('span', { class: 'muted small', text: `${p.pct}% · ${p.done}/${p.total} บท` })),
          bar(p.pct, { tone: 'brand' }));
      })),
    h('div', { class: 'card' },
      h('div', { class: 'card-title', text: 'เสียงของแอป' }),
      h('div', { class: 'muted small', text: 'ปรับระดับเสียงและลองฟังเสียงพูด' }),
      h('div', { class: 'row gap8 volume-row' }, slider, out),
      h('div', { class: 'row gap8 voice-buttons' },
        h('button', { class: 'chip-btn', type: 'button', onclick: () => sayText('I usually have breakfast at seven with my wife.', { audioKey: 'sent:food-breakfast', gender: 'female' }) }, icon('sound', 18), h('span', { text: 'หญิง (af_heart)' })),
        h('button', { class: 'chip-btn', type: 'button', onclick: () => sayText('I usually have breakfast at seven with my wife.', { audioKey: 'sent:food-breakfast', gender: 'male' }) }, icon('sound', 18), h('span', { text: 'ชาย (am_adam)' })))),
    h('div', { class: 'card about-card' },
      h('div', { class: 'card-title', text: 'เกี่ยวกับ' }),
      h('div', { class: 'muted small', text: `PangPood ${VERSION} · ${db.words.length} คำ · ${db.categories.length} หมวด` }),
      h('div', { class: 'muted small', text: 'ทำงานออฟไลน์ได้ · ข้อมูลเก็บอยู่ในเครื่องนี้' })),
    h('div', { class: 'card reset-card' },
      h('div', { class: 'card-title', text: 'รีเซ็ตความคืบหน้า' }),
      h('div', { class: 'muted small', text: 'ล้าง XP บทเรียน สถิติ เควส และการตั้งค่าในแอปนี้' }),
      h('button', { class: 'reset-button', type: 'button', onclick: reset }, 'รีเซ็ตความคืบหน้า')),
    h('div', { class: 'gap' }),
    btn3d('กลับไปเส้นทาง', { block: true, tone: 'ghost', icon: 'back', onclick: () => { location.hash = '#/path'; } }));
}

function stat(emoji, value, label) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-emoji', text: emoji }),
    h('div', { class: 'stat-val', text: value }), h('div', { class: 'stat-lbl', text: label }));
}
