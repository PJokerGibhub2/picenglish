/* views-me.js — หน้า "ฉัน": สถิติ + ตั้งค่าเสียง (2 เสียงเท่านั้น) */
import { h, mount, icon, btn3d, bar, toast } from './ui2.js';
import { mascot } from './mascot2.js';
import { db, loadAll } from './data.js';
import * as pg from './progress2.js';
import * as store from './store.js';
import { setPlaybackVolume, getPlaybackVolume, sayText, loadVoices, loadAudioManifest } from './speech.js';
import { loadPath } from './views-path.js';

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
  const total = path ? pg.flatten(path).length : 0;
  const week = pg.last7();
  const maxXp = Math.max(20, ...week.map((d) => d.xp));

  const vol = Number(store.settings().volume) || 1.8;
  const slider = h('input', {
    class: 'range', type: 'range', min: '1', max: '2.5', step: '0.1', value: String(vol),
    oninput: (e) => {
      const v = Number(e.currentTarget.value);
      out.textContent = v.toFixed(1);
      store.setSetting('volume', v);
      setPlaybackVolume(v);
    },
    onchange: () => sayText('I usually have breakfast at seven with my wife.', { audioKey: 'sent:food-breakfast', gender: 'female' }),
  });
  const out = h('span', { class: 'muted small', text: vol.toFixed(1) });

  mount(root,
    h('div', { class: 'me-head' },
      mascot('wave', 104),
      h('div', {},
        h('div', { class: 'page-title', text: 'สวัสดี พัง!' }),
        h('div', { class: 'muted small', text: `เรียนมาแล้ว ${done}/${total} บท · ${st.xp || 0} XP` }))),

    h('div', { class: 'stat-row' },
      stat('🔥', String(st.streak || 0), 'สตรีค (วัน)'),
      stat('⭐', String(st.xp || 0), 'XP รวม'),
      stat('✓', `${done}`, 'บทที่จบ')),

    h('div', { class: 'card' },
      h('div', { class: 'card-title', text: '7 วันที่ผ่านมา' }),
      h('div', { class: 'week' }, ...week.map((d) => h('div', { class: 'week-col' },
        h('div', { class: 'week-bar-wrap' },
          h('div', { class: 'week-bar', style: { height: `${Math.max(6, Math.round((d.xp / maxXp) * 64))}px` } })),
        h('div', { class: 'week-lbl', text: d.label }))))),

    h('div', { class: 'card' },
      h('div', { class: 'card-title', text: 'เสียงของแอป' }),
      h('div', { class: 'muted small', text: 'ใช้เสียงคุณภาพเดียวกันทุกเครื่อง (2 เสียงเท่านั้น)' }),
      h('div', { class: 'row gap8' }, slider, out),
      h('div', { class: 'row gap8' },
        h('button', { class: 'chip-btn', type: 'button', onclick: () => sayText('I usually have breakfast at seven with my wife.', { audioKey: 'sent:food-breakfast', gender: 'female' }) },
          icon('sound', 18), h('span', { text: 'ฟังเสียง (หญิง)' })),
        h('button', { class: 'chip-btn', type: 'button', onclick: () => sayText('I usually have breakfast at seven with my wife.', { audioKey: 'sent:food-breakfast', gender: 'male' }) },
          icon('sound', 18), h('span', { text: 'ฟังเสียง (ชาย)' })))),

    h('div', { class: 'card' },
      h('div', { class: 'card-title', text: 'เกี่ยวกับ' }),
      h('div', { class: 'muted small', text: `PangPood (พังพูด) · ${db.words.length} คำ · ${db.categories.length} หมวด` }),
      h('div', { class: 'muted small', text: 'ทำงานออฟไลน์ได้ · ไม่มีโฆษณา · ข้อมูลอยู่ในเครื่องคุณเท่านั้น' })),

    h('div', { class: 'gap' }),
    btn3d('กลับไปเส้นทาง', { block: true, tone: 'ghost', icon: 'back', onclick: () => { location.hash = '#/path'; } }));
}

function stat(emoji, value, label) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-emoji', text: emoji }),
    h('div', { class: 'stat-val', text: value }), h('div', { class: 'stat-lbl', text: label }));
}
