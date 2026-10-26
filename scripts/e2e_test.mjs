/**
 * e2e_test.mjs — ทดสอบการทำงานจริงของแอปผ่าน Chrome DevTools Protocol
 *
 * วิธีใช้:
 *   1) เปิดเซิร์ฟเวอร์ท้องถิ่น:  python -m http.server 5173
 *   2) เปิด Chrome แบบ debug:    chrome --headless --remote-debugging-port=9222 about:blank
 *   3) รัน:                      node scripts/e2e_test.mjs
 *
 * ตัวทดสอบจะคลิกจริงในหน้าเว็บ ตรวจ localStorage/DOM และสรุปผลเป็นตาราง
 */
const CDP_PORT = process.env.CDP_PORT || 9222;
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.errors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push(d.exception?.description || d.text || 'exception');
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error('page error: ' + (d.exception?.description || d.text));
    }
    return res.result.value;
  }
}

/* ---------------- โค้ดทดสอบที่รันในหน้าเว็บ ---------------- */
const PAGE_TEST = `(async () => {
  const R = [];
  const ok = (name, cond, extra) => R.push({ name, pass: !!cond, extra: extra === undefined ? '' : String(extra).slice(0, 90) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const findByText = (t, scope) => $$('button, a').filter((b) => b.textContent.includes(t))
    .filter((b) => !scope || scope.contains(b))[0];
  const click = (t, scope) => {
    const b = findByText(t, scope);
    if (!b) throw new Error('ไม่พบปุ่ม/ลิงก์: ' + t);
    b.click();
    return b;
  };
  const waitFor = async (fn, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 4000)) { if (fn()) return true; await sleep(60); }
    return false;
  };
  const store = () => JSON.parse(localStorage.getItem('picenglish.v1') || '{}');

  /* ---------- 1) การ์ดคำศัพท์ ---------- */
  location.hash = '#/learn';
  await sleep(700);
  ok('หน้าแรกแสดง 8 หมวด', $$('.cat-card').length === 8, $$('.cat-card').length + ' หมวด');
  ok('มีปุ่มเรียนรวมทุกหมวด', !!findByText('เรียนรวมทุกหมวด'));

  $$('.cat-card')[0].click();
  await sleep(500);
  ok('เปิดการ์ดคำศัพท์ได้', !!$('.flash-card'));
  const firstWord = $('.word-en') ? $('.word-en').textContent : '';
  ok('การ์ดมีคำอังกฤษ + IPA + คำแปล', !!/[a-z]/i.test(firstWord) && !!$('.word-ipa') && !!$('.word-th'), firstWord);
  ok('การ์ดมีปุ่มออกเสียง/อ่านประโยค', !!findByText('ออกเสียงคำ') && !!findByText('อ่านประโยค'));

  // โหมดภาพเริ่มต้น = ภาพกราฟฟิกน่ารัก (SVG ในเครื่อง ใช้งานออฟไลน์ได้)
  const artImgs = $$('.photo-wrap .art-img');
  ok('การ์ดแสดงภาพกราฟฟิกน่ารัก (โหมดเริ่มต้น)', artImgs.length >= 1, artImgs.length + ' ภาพ');
  ok('ภาพกราฟฟิกโหลดจากไฟล์ในเครื่อง (data/art/)', artImgs.length > 0 && /\/data\/art\//.test(artImgs[0].getAttribute('src')),
     artImgs.length ? artImgs[0].getAttribute('src').split('/').slice(-1)[0] : '-');
  ok('ภาพกราฟฟิกแสดงจริง (โหลดสำเร็จ)', artImgs.length > 0 && artImgs[0].complete && artImgs[0].naturalWidth > 0,
     artImgs.length ? artImgs[0].naturalWidth + 'px' : '-');
  ok('ไม่มีปุ่มเปลี่ยนภาพในโหมดภาพกราฟฟิก (ไม่ต้องใช้)', !findByText('เปลี่ยนภาพ'));

  // ไอคอนต้องเป็น SVG จริงและมีขนาดvisible (บั๊ก createElement('svg') จะทำให้ไอคอนหายทั้งแอป)
  const svgs = $$('svg');
  ok('ไอคอนถูกสร้างในเนมสเปซ SVG จริง', svgs.length > 0 && svgs.every((s) => s.namespaceURI === 'http://www.w3.org/2000/svg'), svgs.length + ' ไอคอน');
  ok('ไอคอนมี path ที่มีข้อมูล', svgs.length > 0 && svgs.every((s) => { const p = s.querySelector('path'); return p && (p.getAttribute('d') || '').length > 0; }));
  const shownSvg = svgs.filter((s) => s.getClientRects().length > 0);
  ok('ไอคอนที่แสดงอยู่มีขนาดจริงมองเห็นได้',
     shownSvg.length > 0 && shownSvg.every((s) => { const r = s.getBoundingClientRect(); return r.width > 4 && r.height > 4; }),
     shownSvg.length + '/' + svgs.length + ' ไอคอนที่มองเห็น');

  /* ---------- 2.1) โหมดภาพถ่ายจริง + แผงเลือกภาพ (ยังใช้งานได้เมื่อผู้ใช้เลือก) ---------- */
  // ต้องบังคับให้ router วาดหน้าใหม่ (การตั้ง hash ซ้ำค่าเดิมจะไม่ทำให้ router ทำงาน)
  const goLearnFresh = async () => {
    location.hash = '#/__reset__';
    await sleep(260);
    location.hash = '#/learn';
    await sleep(500);
  };
  const storeMod = await import('/js/store.js');
  storeMod.setSetting('imageMode', 'photo');
  await goLearnFresh();
  $$('.cat-card')[0].click();
  await sleep(2600);
  ok('สลับเป็นโหมดภาพถ่ายจริงได้', !!$('.photo-wrap img'));
  ok('โหมดภาพถ่ายมีปุ่มเปลี่ยนภาพ', !!findByText('เปลี่ยนภาพ'));
  const photoImgBefore = $('.photo-wrap img') ? $('.photo-wrap img').getAttribute('src') : '';
  click('เปลี่ยนภาพ');
  await sleep(2600);
  const thumbs = $$('#sheet-body .mtile img');
  ok('แผงเลือกภาพแสดงภาพตัวเลือก', thumbs.length >= 1, thumbs.length + ' ภาพ');
  if (thumbs.length >= 2) {
    thumbs[1].closest('button').click();
    await sleep(900);
    const after = $('.photo-wrap img') ? $('.photo-wrap img').getAttribute('src') : '';
    const short = (u) => decodeURIComponent(((u || '').split('/').pop() || '').split('?')[0]).slice(0, 34);
    ok('เลือกภาพอื่นแล้วภาพบนการ์ดเปลี่ยนตาม', after && after !== photoImgBefore, short(photoImgBefore) + ' -> ' + short(after));
    ok('ปิดแผงหลังเลือกภาพแล้ว', $('#sheet').classList.contains('hidden'));
  } else {
    $('#sheet').classList.add('hidden');
  }
  const credit = $('.photo-credit');
  ok('แสดงเครดิต/ไลเซนส์ของภาพถ่าย (ข้อกำหนดของคลังฟรี)', !!credit && credit.textContent.length > 3, credit ? credit.textContent.slice(0, 40) : 'ไม่พบเครดิต');
  // กลับไปโหมดภาพกราฟฟิก (ค่าเริ่มต้น)
  storeMod.setSetting('imageMode', 'art');
  await goLearnFresh();
  $$('.cat-card')[0].click();
  await sleep(1200);
  ok('กลับมาโหมดภาพกราฟฟิกได้', $$('.photo-wrap .art-img').length >= 1);
  ok('ยังไม่เฉลย (ปุ่มให้คะแนนซ่อนอยู่)', $('.advance-grid').classList.contains('hidden'));

  $('.flash-card').click();
  await sleep(350);
  ok('พลิกการ์ดแล้วเห็นประโยค', $('.flash-card').classList.contains('flipped'));
  ok('พลิกแล้วด้านหน้าถูกซ่อน ด้านหลังแสดง (ไม่ใช่การหมุน 3D ที่ทำให้ข้อความกลับด้าน)',
     getComputedStyle($('.flash-card .flash-front')).display === 'none'
     && getComputedStyle($('.flash-card .flash-back')).display !== 'none',
     getComputedStyle($('.flash-card .flash-front')).display + '/' + getComputedStyle($('.flash-card .flash-back')).display);
  ok('ประโยคถูกแบ่งเป็นคำให้ไฮไลท์', $$('.flash-card .sentence .w').length >= 3, $$('.flash-card .sentence .w').length + ' คำ');
  ok('มีสรุปคำศัพท์สำคัญ', $$('.flash-card .kv').length >= 1, $$('.flash-card .kv').length + ' รายการ');
  ok('มีคำแปลประโยคไทย', !!$('.flash-card .sentence-th'));
  ok('แสดงปุ่มให้คะแนน 3 ระดับ', $$('.advance-grid button').length === 3);

  $$('.advance-grid button')[1].click();   // จำได้
  await sleep(500);
  const s1 = store();
  ok('บันทึก SRS ลง localStorage', Object.keys(s1.srs || {}).length === 1, Object.keys(s1.srs || {}).join(','));
  ok('บันทึกสถิติรายคำ', Object.keys(s1.stats || {}).length >= 1, Object.keys(s1.stats || {}).join(','));
  ok('เดินหน้าไปคำที่ 2', ($('.view, #view').textContent.match(/2 \\/ \\d+/) || [''])[0] !== '', ($('.view, #view').textContent.match(/[0-9]+ \\/ [0-9]+/) || ['?'])[0]);

  /* ---------- 2) ปุ่มดาว (คำโปรด) ---------- */
  const star = $('.flash-card .icon-btn[aria-label="บันทึกเป็นคำโปรด"]') || $$('.flash-card button').find((b) => b.getAttribute('aria-label') === 'บันทึกเป็นคำโปรด');
  ok('มีการ์ดมีปุ่มติดดาว', !!star);
  if (star) { star.click(); await sleep(300); }
  ok('ติดดาวแล้วบันทึกลงข้อมูล', (store().favorites || []).length === 1, JSON.stringify(store().favorites));

  /* ---------- 3) ฟังประโยค ---------- */
  location.hash = '#/listen';
  await sleep(900);
  ok('หน้าฟังประโยคแสดงประโยค', $$('.sentence .w').length >= 3, $$('.sentence .w').length + ' คำ');
  ok('มีปุ่มฟังประโยค', !!(findByText('ฟังประโยค') || findByText('กำลังอ่าน')), 'ปุ่มเล่นเสียงอยู่');
  ok('มีปุ่มอ่านช้าๆ', !!findByText('ช้าๆ'));
  ok('มีหัวข้อสรุปคำศัพท์สำคัญ', document.body.textContent.includes('คำศัพท์สำคัญในประโยค'));
  ok('มีสวิตช์อ่านต่ออัตโนมัติ', !!$('.switch input'));
  const beforeWord = $('.word-en').textContent;
  click('ถัดไป');
  await sleep(700);
  ok('กด "ถัดไป" แล้วเปลี่ยนคำ', $('.word-en').textContent !== beforeWord, beforeWord + ' -> ' + $('.word-en').textContent);
  click('เลือกคำเอง');
  await sleep(400);
  ok('เปิดแผงเลือกคำได้', !!$('#sheet-body .list-item') || document.body.textContent.includes('พิมพ์เพื่อค้นคำ'));
  const search = $('#sheet-body input[type="search"]');
  if (search) {
    search.value = 'breakfast';
    search.dispatchEvent(new Event('input'));
    await sleep(350);
    const hits = $$('#sheet-body .list-item').length;
    ok('ค้นหาในแผงเลือกคำเจอผลลัพธ์', hits >= 1, hits + ' รายการ');
    search.value = 'zzzzz';
    search.dispatchEvent(new Event('input'));
    await sleep(300);
    ok('ค้นหาคำที่ไม่มีแล้วขึ้นสถานะว่าง', $$('#sheet-body .list-item').length === 0 && document.body.textContent.includes('ไม่พบคำที่ค้นหา'));
  }
  const backdrop = $('#sheet');
  if (backdrop) backdrop.classList.add('hidden');

  /* ---------- 4) ควิซ ---------- */
  location.hash = '#/quiz';
  await sleep(800);
  click('เริ่มควิซ');
  await sleep(700);
  ok('ควิซแสดง 4 ตัวเลือก', $$('.opt').length === 4, $$('.opt').length + ' ตัวเลือก');
  ok('ควิซมีแถบความคืบหน้า', !!$('.progress'));
  const firstOptText = $('.opt').textContent;
  $('.opt').click();
  await sleep(400);
  ok('ตอบแล้วขึ้นสถานะถูก/ผิด', $$('.opt.correct').length + $$('.opt.wrong').length >= 1,
     'correct=' + $$('.opt.correct').length + ' wrong=' + $$('.opt.wrong').length);
  ok('ตอบแล้วล็อกตัวเลือก', $$('.opt[disabled]').length === 4);
  ok('ตอบแล้วบันทึกสถิติ', Object.keys(store().stats || {}).length >= 2, Object.keys(store().stats || {}).length + ' คำ');
  await waitFor(() => $$('.opt').length === 4 && $('.opt').textContent !== firstOptText, 4000);
  ok('ไปข้อถัดไปอัตโนมัติ', document.body.textContent.includes('ข้อ 2/'), '');

  /* ---------- 5) เกมจับคู่ ---------- */
  location.hash = '#/match';
  await sleep(800);
  click('เริ่มเกม');
  await sleep(600);
  ok('กระดานมี 10 ช่อง (5 คู่)', $$('.mtile').length === 10, $$('.mtile').length + ' ช่อง');
  ok('มีช่องภาพและช่องคำอย่างละ 5', $$('.mtile.pic').length === 5 && $$('.mtile:not(.pic)').length === 5);

  const words = await (await fetch('data/words.json')).json();
  const wordTile = $$('.mtile:not(.pic)')[0];
  const label = wordTile.querySelector('.txt').textContent.trim();
  const rec = words.find((w) => w.word === label);
  const picTile = $$('.mtile.pic').find((t) => {
    const img = t.querySelector('img');
    if (img && img.alt === label) return true;
    const ph = t.querySelector('.ph');
    return rec && ph && ph.textContent.trim() === rec.emoji;
  });
  ok('จับคู่ภาพกับคำได้ถูกต้อง', !!picTile, label);
  if (picTile) {
    picTile.click();
    await sleep(200);
    wordTile.click();
    await sleep(400);
    ok('คู่ที่ถูกต้องถูกทำเครื่องหมายว่าจบ', picTile.classList.contains('done') && wordTile.classList.contains('done'));
  }
  const a = $$('.mtile:not(.done)')[0];
  const aIsPic = a.classList.contains('pic');
  const aLabel = aIsPic
    ? ((a.querySelector('img') || {}).alt
       || (words.find((x) => x.emoji === (a.querySelector('.ph') ? a.querySelector('.ph').textContent.trim() : '')) || {}).word)
    : a.querySelector('.txt').textContent.trim();
  const mismatch = $$('.mtile:not(.done)').filter((t) => t.classList.contains('pic') !== aIsPic)
    .find((t) => {
      const label = aIsPic ? t.querySelector('.txt').textContent.trim()
        : ((t.querySelector('img') || {}).alt
           || (words.find((x) => x.emoji === (t.querySelector('.ph') ? t.querySelector('.ph').textContent.trim() : '')) || {}).word);
      return label && label !== aLabel;
    });
  ok('เลือกคู่ที่ไม่ตรงกันได้สำหรับทดสอบ', !!mismatch, aLabel + ' vs อื่นๆ');
  if (mismatch) {
    a.click(); await sleep(130); mismatch.click(); await sleep(180);
    ok('คู่ที่ผิดขึ้นอนิเมชันสั่น', a.classList.contains('shake') || mismatch.classList.contains('shake'));
    await sleep(700);
  }

  /* ---------- 6) ฝึกออกเสียง ---------- */
  location.hash = '#/speak';
  await sleep(800);
  ok('หน้าฝึกออกเสียงมีปุ่มไมค์', !!$('.mic-btn'));
  ok('เลือกโหมดคำเดียว/ประโยคได้', !!findByText('ฝึกทั้งประโยค') && !!findByText('ฝึกคำเดียว'));
  click('ฝึกคำเดียว');
  await sleep(500);
  ok('โหมดคำเดียวแสดงคำเป้าหมาย', $$('.sentence .w').length === 1, $$('.sentence .w').length + ' คำ');
  click('ฝึกทั้งประโยค');
  await sleep(500);
  ok('โหมดประโยคแสดงหลายคำ', $$('.sentence .w').length >= 3);
  ok('มีข้อความแจ้งเมื่อเบราว์เซอร์ไม่รองรับ/พร้อมใช้งาน',
     document.body.textContent.includes('กำลังฟัง') || document.body.textContent.includes('ไม่รองรับ') || document.body.textContent.includes('กดไมค์'));

  /* ---------- 7) ทบทวน SRS ---------- */
  location.hash = '#/review';
  await sleep(800);
  ok('หน้าทบทวนแสดงสถิติ 3 ช่อง', $$('.stat').length === 3);
  ok('หน้าทบทวนอธิบายวิธีทำงาน', document.body.textContent.includes('SM-2'));
  const startBtn = findByText('เริ่มทบทวน') || findByText('เริ่มเรียนคำใหม่');
  ok('มีปุ่มเริ่มทบทวน', !!startBtn);
  if (startBtn) {
    startBtn.click();
    await sleep(600);
    ok('เข้าสู่การ์ดทบทวน', !!findByText('ดูเฉลย'));
    click('ดูเฉลย');
    await sleep(400);
    ok('เฉลยแล้วเห็นคำแปล + ประโยค', !!$('.word-th') && $$('.sentence .w').length >= 3);
    const gradeBtns = $$('.card ~ div button').filter((b) => ['จำไม่ได้', 'ยาก', 'พอได้', 'ง่าย'].some((t) => b.textContent.includes(t)));
    ok('มีปุ่มให้คะแนน 4 ระดับพร้อมเวลาทบทวนครั้งถัดไป', gradeBtns.length === 4, gradeBtns.length + ' ปุ่ม');
    if (gradeBtns.length) {
      const easy = gradeBtns.find((b) => b.textContent.includes('ง่าย'));
      easy.click();
      await sleep(600);
      const rec2 = Object.values(store().srs || {})[0] || {};
      ok('กด "ง่าย" แล้วตั้งรอบถัดไปไกลขึ้น', (rec2.interval || 0) >= 1, 'interval=' + rec2.interval + ' วัน');
    }
  }

  /* ---------- 8) คำของฉัน ---------- */
  location.hash = '#/mine';
  await sleep(700);
  ok('หน้าคำของฉันมีสถิติ 3 ช่อง', $$('.stat').length === 3);
  ok('มีแท็บคำโปรด/คำยาก/ทั้งหมด', !!findByText('คำโปรด') && !!findByText('คำยาก') && !!findByText('ทั้งหมด'));
  ok('คำที่ติดดาวปรากฏในคำโปรด', $$('.list-item').length >= 1, $$('.list-item').length + ' รายการ');
  click('คำยาก');
  await sleep(500);
  ok('แท็บคำยากทำงาน (ว่างเพราะยังไม่ทำเครื่องหมาย)', document.body.textContent.includes('ยังไม่มีคำยาก'));
  click('ทั้งหมด');
  await sleep(500);
  ok('แท็บทั้งหมดแสดงคำที่เรียนแล้ว', $$('.list-item').length >= 1, $$('.list-item').length + ' รายการ');
  $$('.list-item')[0].click();
  await sleep(500);
  ok('แตะรายการแล้วเปิดรายละเอียดคำ', !!$('#sheet-body') && $('#sheet-body').textContent.includes('ทบทวน'));
  $('#sheet').classList.add('hidden');

  /* ---------- 9) ตั้งค่า ---------- */
  document.getElementById('btn-settings').click();
  await sleep(500);
  const sheetText = $('#sheet-body').textContent;
  ok('เปิดหน้าตั้งค่าได้', sheetText.includes('ตั้งค่า'));
  ok('มีตัวเลือกเสียงอ่าน', !!$('#sheet-body select'));
  ok('มีปุ่มดาวน์โหลดภาพออฟไลน์', sheetText.includes('ดาวน์โหลดภาพทั้งหมด'));
  ok('มีแถวดาวน์โหลดเสียงออฟไลน์', !!$('[data-audio-download] button') && sheetText.includes('ดาวน์โหลดเสียงทั้งหมด'));
  ok('มีปุ่มส่งออก/นำเข้า/ล้างข้อมูล', sheetText.includes('ส่งออกข้อมูล') && sheetText.includes('นำเข้าข้อมูล') && sheetText.includes('ล้างความคืบหน้า'));
  const themeSel = $$('#sheet-body select').find((s) => Array.from(s.options).some((o) => o.value === 'dark'));
  if (themeSel) {
    themeSel.value = 'dark';
    themeSel.dispatchEvent(new Event('change'));
    await sleep(250);
    ok('เปลี่ยนธีมเป็นมืดแล้วมีผลทันที', document.documentElement.dataset.theme === 'dark', document.documentElement.dataset.theme);
    themeSel.value = 'light';
    themeSel.dispatchEvent(new Event('change'));
    await sleep(200);
    ok('เปลี่ยนธีมกลับเป็นสว่างได้', document.documentElement.dataset.theme === 'light');
  }
  const photoSwitch = $$('#sheet-body .switch input');
  ok('มีสวิตช์ตั้งค่าอย่างน้อย 3 ตัว', photoSwitch.length >= 3, photoSwitch.length + ' ตัว');
  document.getElementById('sheet').classList.add('hidden');

  /* ---------- 10) โหมดฝึกพูด: บทสนทนาจำลอง (ทดสอบวงจรการพูดจริง) ---------- */
  location.hash = '#/speaking';
  await sleep(800);
  ok('แท็บฝึกพูดแสดงศูนย์รวมโหมดพูด', document.body.textContent.includes('เป้าหมาย: พูดให้ได้จริง'));
  ok('มีรายการบทสนทนาจำลอง (พร้อมใช้)', !!findByText('บทสนทนาจำลอง') && document.body.textContent.includes('พร้อมใช้'));
  ok('โหมดที่ยังไม่ทำขึ้นป้าย "กำลังทำ"', document.body.textContent.includes('กำลังทำ'));

  location.hash = '#/roleplay';
  await sleep(900);
  const dlgItems = $$('.list-item').filter((el) => /ระดับ A2/.test(el.textContent));
  ok('แสดงรายการสถานการณ์ครบ 8 ชุด', dlgItems.length === 8, dlgItems.length + ' สถานการณ์');

  location.hash = '#/roleplay?dlg=dlg-cafe';
  await sleep(1000);
  ok('เปิดบทสนทนาแล้วเห็นบริบทและภาพ', !!$('.bubble') && document.body.textContent.includes('ร้านกาแฟ'));
  ok('บรรทัดแรกเป็นบทคู่สนทนา (แอปอ่านให้ฟัง)', $$('.bubble.other').length >= 1);
  ok('มีแถบความคืบหน้า', !!$('.progress'));

  // เดินจนจบ พร้อมทดสอบ 3 ฟีเจอร์สำคัญ:
  //   (1) ฟังเสียงที่ตัวเองพูด  (2) สอนออกเสียงคำที่พูดไม่ชัด  (3) พูดจนกว่าจะผ่าน
  let steps = 0;
  let scored = 0;
  let gateTested = false;
  let teachOk = false;
  let drillOk = false;
  let playbackOk = false;
  let bubbleConsistent = true;

  while (steps++ < 60) {
    if (document.body.textContent.includes('จบสถานการณ์แล้ว')) break;

    const mic = $('.mic-btn');
    if (mic) {
      // ---------- ครั้งแรก: จงใจพูดผิด เพื่อทดสอบประตู "พูดจนกว่าจะผ่าน" + การสอนออกเสียง ----------
      if (!gateTested) {
        window.__fakeSpeech = 'banana banana banana';
        mic.click();
        await sleep(350);
        const gate = findByText('เข้าใจแล้ว');           // แผงอธิบายไมค์ครั้งแรก
        if (gate) { gate.click(); await sleep(700); }
        // รอผลการให้คะแนนปรากฏ (ครั้งแรกต้องรอ getUserMedia ด้วย จึงอาจใช้เวลามากกว่า)
        const t0 = Date.now();
        while (Date.now() - t0 < 6000) {
          if (document.body.textContent.includes('คำที่ยังไม่ชัด') || /\\d+%/.test(document.body.textContent)) break;
          await sleep(150);
        }
        await sleep(300);

        const noNext = !findByText('ต่อไป');
        const hasTeach = document.body.textContent.includes('คำที่ยังไม่ชัด');
        const hasVoice = !!findByText('เสียงของคุณ');
        const dbg = (($('#view .card:last-of-type') || { textContent: '' }).textContent || '').replace(/\\s+/g, ' ').slice(0, 130);
        ok('พูดไม่ผ่านแล้วยังไปต่อไม่ได้ (ประตูบังคับพูดให้ผ่าน)', noNext, 'มีปุ่มต่อไป=' + !noNext + ' | ' + dbg);
        ok('แสดงคำที่ออกเสียงไม่ชัดให้ฝึก', hasTeach, hasTeach ? '' : dbg);
        ok('มีปุ่มฟังเสียงที่ตัวเองพูด (เทียบ A/B)', hasVoice, hasVoice ? '' : dbg);
        playbackOk = hasVoice;
        gateTested = noNext && hasTeach;

        // ---------- ฝึกทีละคำ ----------
        const drillBtn = findByText('ฝึกทีละคำ');
        if (drillBtn) {
          drillBtn.click();
          await sleep(600);
          let dguard = 0;
          while (dguard++ < 14 && !document.body.textContent.includes('ฝึกครบทุกคำแล้ว')) {
            const wEl = $('.word-en');
            const wTarget = wEl ? wEl.textContent.trim() : '';
            const dmic = $('.mic-btn');
            if (!wTarget || !dmic) break;
            window.__fakeSpeech = wTarget;
            dmic.click();
            await sleep(700);
            const nextW = findByText('คำถัดไป') || findByText('ลองคำนี้อีกครั้ง') || findByText('ข้ามคำนี้');
            if (nextW) nextW.click();
            await sleep(450);
          }
          drillOk = document.body.textContent.includes('ฝึกครบทุกคำแล้ว');
          ok('โหมดฝึกทีละคำพาไปจนครบทุกคำที่ผิด', drillOk, 'วน ' + dguard + ' ครั้ง');
          const back = findByText('พูดทั้งประโยคอีกครั้ง');
          if (back) { back.click(); await sleep(800); }
        }
      }

      // ---------- พูดให้ถูกต้อง ----------
      const target = ($('.bubble.current .bubble-en') || { textContent: '' }).textContent.replace(/\\s+/g, ' ').trim();
      window.__fakeSpeech = target;
      const mic2 = $('.mic-btn');
      if (mic2) { mic2.click(); await sleep(1200); }
      if (/\\d+%/.test(document.body.textContent)) scored++;

      // คะแนนบนบับเบิลต้องตรงกับคะแนนล่าสุด (กันบั๊กคะแนนค้าง)
      const cardScore = (document.body.textContent.match(/(\\d+)%/) || [])[1];
      const badge = $('.bubble.current .bubble-score');
      if (badge && cardScore && !badge.textContent.includes(cardScore)) bubbleConsistent = false;
      await sleep(200);
    }

    const btn = findByText('ต่อไป') || findByText('พูดแล้ว ต่อไป') || findByText('ข้ามไปก่อน') || findByText('ข้าม');
    if (!btn) { await sleep(300); continue; }
    btn.click();
    await sleep(340);
  }
  ok('คะแนนบนบับเบิลตรงกับคะแนนล่าสุด (แก้บั๊กคะแนนค้าง)', bubbleConsistent);
  ok('บันทึกเสียงผู้ใช้ไว้ฟังย้อนหลังได้', playbackOk || drillOk);
  ok('เล่นจบสถานการณ์ได้', document.body.textContent.includes('จบสถานการณ์แล้ว'), 'กด ' + steps + ' ครั้ง · ให้คะแนน ' + scored + ' ครั้ง');
  ok('ให้คะแนนคำตอบจากการพูดได้', scored >= 3, scored + ' ประโยค');
  ok('หน้าสรุปมีปุ่มสลับบทและวลีที่ใช้ได้', !!findByText('สลับบท') && document.body.textContent.includes('ประโยคที่พูด'));
  const st1 = store();
  ok('นับจำนวนประโยคที่ผู้ใช้พูดจริง', Object.values(st1.daily || {}).some((d) => (d.spoken || 0) >= 3),
     JSON.stringify(Object.values(st1.daily || {}).map((d) => d.spoken)));
  ok('บันทึกความคืบหน้าบทสนทนา', (st1.dialogues || {})['dlg-cafe'] && st1.dialogues['dlg-cafe'].completed === true);
  ok('เก็บบทสนทนาที่จบในสถิติรายวัน', Object.values(st1.daily || {}).some((d) => (d.dialogues || 0) >= 1));
  ok('ประโยคที่พูดได้เข้าคิว SRS ระดับประโยค', Object.keys(st1.srsSentences || {}).length >= 3,
     Object.keys(st1.srsSentences || {}).length + ' ประโยค');

  click('สลับบท');
  await sleep(900);
  const swappedWho = $('.bubble.current .who');
  // หลังสลับบท ผู้ใช้รับบทคู่สนทนา → บรรทัดแรก (ที่เป็นบทของคู่สนทนา) กลายเป็นบทที่ผู้ใช้ต้องพูด
  ok('สลับบทแล้วผู้ใช้ต้องพูดบทของคู่สนทนา', !!$('.mic-btn') && !!swappedWho && /คุณ/.test(swappedWho.textContent),
     (swappedWho ? swappedWho.textContent.trim() : 'ไม่พบบับเบิล') + ' · mic=' + !!$('.mic-btn'));

  location.hash = '#/sentenceReview';
  await sleep(800);
  ok('หน้าทบทวนประโยคเปิดได้', document.body.textContent.includes('ประโยค'));

  /* ---------- 10.4) เอฟเฟกต์เสียง + ปุ่มฟังบทสนทนา + ไม่มีรูปในโหมดสนทนา ---------- */
  const sfxMod = await import('/js/sfx.js');
  ok('มีโมดูลเสียงเอฟเฟกต์ (สังเคราะห์ในเครื่อง)', typeof sfxMod.sfxMicStart === 'function' && typeof sfxMod.sfxSuccess === 'function');
  ok('ตั้งค่าเสียงเอฟเฟกต์เปิดเป็นค่าเริ่มต้น', store().settings.sfx !== false, String(store().settings.sfx));
  location.hash = '#/learn';
  await sleep(400);
  location.hash = '#/roleplay?dlg=dlg-cafe';
  await sleep(1600);
  ok('เข้าห้องสนทนาได้', !!$('.bubble'), $$('.bubble').length + ' บับเบิล');
  ok('โหมดสนทนาไม่มีรูปภาพประกอบแล้ว', !$('.dlg-photo'), $('.dlg-photo') ? 'ยังมีรูป' : 'ไม่มีรูป');
  ok('บับเบิลมีปุ่มฟังเสียงประโยค', $$('button[aria-label="ฟังเสียงประโยคนี้"]').length >= 1,
     $$('button[aria-label="ฟังเสียงประโยคนี้"]').length + ' ปุ่ม');
  /* ---------- 10.5) พูดคนเดียว 60 วินาที ---------- */
  location.hash = '#/onemin';
  await sleep(1100);
  ok('เปิดโหมดพูดคนเดียว 60 วินาทีได้', document.body.textContent.includes('พูดต่อเนื่อง 60 วินาที'));
  ok('มีหัวข้อให้พูด', document.body.textContent.includes('หัวข้อวันนี้'));
  ok('แนะนำคำศัพท์จากจุดอ่อน (แตะฟังได้)', $$('.card .kv').length >= 1, $$('.card .kv').length + ' คำ');
  ok('มีปุ่มเริ่มอัด 60 วินาที', !!findByText('เริ่มอัด 60 วินาที'));

  click('เริ่มอัด 60 วินาที');
  await sleep(400);
  const gate2 = findByText('เข้าใจแล้ว');
  if (gate2) { gate2.click(); await sleep(700); }
  await sleep(2200);
  ok('กำลังอัดและมีตัวจับเวลา', document.body.textContent.includes('กำลังอัดเสียง'));
  const stopBtn = findByText('หยุด & ฟังเสียงตัวเอง');
  ok('มีปุ่มหยุดอัด', !!stopBtn);
  if (stopBtn) { stopBtn.click(); await sleep(1900); }
  ok('หยุดแล้วเห็นผลและฟังเสียงตัวเองได้',
     document.body.textContent.includes('อัดเสร็จแล้ว') && !!findByText('ฟังเสียงฉัน'));
  const selfStars = $$('button[aria-label^="ให้ "]');
  ok('มีดาวให้คะแนนตัวเอง 5 ดวง', selfStars.length === 5, selfStars.length + ' ดวง');
  if (selfStars.length === 5) { selfStars[4].click(); await sleep(900); }
  const st2 = store();
  ok('บันทึกคะแนนตัวเองลงสถิติ', Object.values(st2.daily || {}).some((d) => (d.selfRatings || []).length >= 1));
  ok('นับวินาทีที่พูดได้', Object.values(st2.daily || {}).some((d) => (d.secondsSpoken || 0) >= 1),
     JSON.stringify(Object.values(st2.daily || {}).map((d) => d.secondsSpoken)));
  ok('คลิปเข้าประวัติ "เสียงของฉัน"', document.body.textContent.includes('เสียงของฉัน')
     && (document.body.textContent.includes('★') || document.body.textContent.includes('☆')));

  /* ---------- 10.7) โหมดไม่มี SpeechRecognition (iPhone / Firefox) ---------- */
  const SR = window.SpeechRecognition;
  const WSR = window.webkitSpeechRecognition;
  try {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    location.hash = '#/learn';
    await sleep(400);
    location.hash = '#/speak';
    await sleep(1200);
    const recBtn = $('button[aria-label="อัดเสียง"]');
    ok('เบราว์เซอร์ไม่มี STT → แสดงแผงอัดเสียงแทน (ไม่ใช่ปุ่มตาย)', !!recBtn);
    ok('มีคำอธิบายเหตุผลให้ผู้ใช้เข้าใจ', /ไม่รองรับ|ยังไม่เปิด|iPhone/.test(document.body.textContent));
    if (recBtn) {
      recBtn.click();
      await sleep(1500);
      ok('กดแล้วเริ่มอัดจริงและมีมิเตอร์เสียง', document.body.textContent.includes('กำลังอัด'));
      recBtn.click();
      await sleep(1700);
      ok('หยุดแล้วเห็นเวลา/ขนาดไฟล์ + ฟังเสียงตัวเองได้',
        document.body.textContent.includes('อัดได้') && !!findByText('เสียงของคุณ'));
      ok('มีดาวให้คะแนนตัวเองในโหมดนี้', $$('button').some((b) => /^★+$/.test(b.textContent.trim())));
    }
  } finally {
    if (SR) window.SpeechRecognition = SR;
    if (WSR) window.webkitSpeechRecognition = WSR;
  }

  /* ---------- 10.8) ตรวจสอบไมโครโฟนในหน้าตั้งค่า ---------- */
  const setBtn = document.getElementById('btn-settings');
  if (setBtn) setBtn.click();
  await sleep(800);
  const miTest = findByText('🎤 ทดสอบ');
  ok('มีปุ่มตรวจสอบไมโครโฟนในหน้าตั้งค่า', !!miTest);
  if (miTest) {
    miTest.click();
    await sleep(900);
    const runBtn = findByText('เริ่มทดสอบ 3 วินาที');
    ok('เปิดแผงทดสอบไมค์ได้', !!runBtn);
    if (runBtn) {
      runBtn.click();
      await sleep(4500);
      ok('ทดสอบไมค์แล้วรายงานผลจริง',
        /ไมโครโฟนทำงาน|ไม่ได้เสียง/.test(document.body.textContent),
        findByText('ทดสอบอีกครั้ง') ? 'รันเสร็จ' : 'ยังไม่เสร็จ');
    }
    const closeBtn = findByText('ปิด');
    if (closeBtn) closeBtn.click();
    await sleep(400);
  }

  /* ---------- 10.9) ทางออก: สลับเป็นโหมดอัดเสียงได้เสมอ ---------- */
  location.hash = '#/learn';
  await sleep(400);
  location.hash = '#/speak';
  await sleep(1200);
  const switchBtn = findByText('ใช้โหมดอัดเสียงเทียบเสียง');
  ok('มีปุ่มสลับเป็นโหมดอัดเสียงเสมอ (ไม่ติดกับดัก)', !!switchBtn);
  if (switchBtn) {
    switchBtn.click();
    await sleep(1000);
    ok('สลับแล้วเห็นแผงอัดเสียงจริง', !!$('button[aria-label="อัดเสียง"]'));
  }
  /* ---------- 10.95) ตรวจจับ LINE in-app + ทางออกไปเบราว์เซอร์จริง ---------- */
  const obMod = await import('/js/openinbrowser.js');
  const spMod = await import('/js/speech.js');
  ok('ตรวจ LINE in-app browser ได้',
     /Line/.test(spMod.inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Line/13.6.0')), 
     spMod.inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Line/13.6.0'));
  ok('เบราว์เซอร์ปกติไม่ถูกมองว่า in-app',
     spMod.inAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/120.0') === '');
  ok('มีฟังก์ชันพาผู้ใช้ไปเปิดในเบราว์เซอร์จริง',
     typeof obMod.openInBrowser === 'function' && typeof obMod.copyText === 'function');
  const iw = document.getElementById('inapp-warning');
  ok('แถบเตือน in-app ซ่อนอยู่เมื่อเปิดในเบราว์เซอร์ปกติ', !!iw && iw.classList.contains('hidden'));
  /* ---------- 10.96) ข้อมูลวินิจฉัยไมโครโฟน (สำหรับแก้ปัญหาบนเครื่องจริง) ---------- */
  const recMod = await import('/js/recorder.js');
  ok('มีชุดวินิจฉัยไมโครโฟน', typeof recMod.micDiagnostics === 'function' && typeof recMod.micDiagnosticsReport === 'function');
  const diag = await recMod.micDiagnostics();
  ok('วินิจฉัยบอกสถานะความปลอดภัย/สิทธิ์/จำนวนไมค์ได้',
     typeof diag.secure === 'boolean' && typeof diag.permission === 'string' && typeof diag.inputs === 'number',
     'secure=' + diag.secure + ' perm=' + diag.permission + ' inputs=' + diag.inputs + ' mime=' + diag.mime);
  const rep = await recMod.micDiagnosticsReport();
  ok('สร้างข้อความวินิจฉัยให้คัดลอกส่งได้', typeof rep === 'string' && rep.includes('permission'), rep.slice(0, 60));
  const obm = await import('/js/openinbrowser.js');
  ok('มีฟังก์ชันแชร์ลิงก์ผ่านระบบมือถือ', typeof obm.shareUrl === 'function');
  /* ---------- 10.97) เลขเวอร์ชันท้ายแอป + ทดสอบระบบฟังเสียง ---------- */
  const verMod = await import('/js/version.js');
  const setBtn3 = document.getElementById('btn-settings');
  if (setBtn3) setBtn3.click();
  await sleep(800);
  ok('แสดงเลขเวอร์ชันในหน้าตั้งค่า', document.body.textContent.includes(verMod.VERSION), verMod.VERSION);
  ok('มีปุ่มล้างแคชสำหรับกรณีติดเวอร์ชันเก่า', !!findByText('↻ ล้างแคช'));
  const closeV = findByText('ปิด');
  if (closeV) closeV.click();
  await sleep(300);
  ok('ไม่เหลือเลขเวอร์ชันลอยทับเนื้อหาด้านล่าง', !document.querySelector('.app-version-slot'));
  ok('มีฟังก์ชันทวดระบบฟังเสียง', typeof spMod.sttSelfTest === 'function');
  const selfTest = await spMod.sttSelfTest(2500);
  ok('ทวดระบบฟังเสียงแล้วได้คำตอบ (ไม่ค้าง)', !!selfTest && typeof selfTest.ok === 'boolean', JSON.stringify(selfTest));
  /* ---------- 12.6) Kokoro TTS (เสียงหลักของแอป) ---------- */
  const audioMod = await import('/js/speech.js');
  await audioMod.loadAudioManifest();
  const mres = await fetch('/data/audio/manifest.json').catch(() => null);
  const kman = mres && mres.ok ? await mres.json() : {};
  const keyCount = Object.keys(kman).length;
  ok('มีไฟล์เสียง Kokoro พร้อมใช้ (อย่างน้อย 250 คีย์)', keyCount >= 250, keyCount + ' คีย์');
  const fUrl = audioMod.audioUrl('word:food-breakfast', 'female');
  const mUrl = audioMod.audioUrl('word:food-breakfast', 'male');
  ok('เสียงผู้หญิง (af_heart) ถูกเลือกเป็นค่าเริ่มต้น', !!fUrl && fUrl.indexOf('/f/') >= 0, fUrl || 'ไม่มี');
  ok('เสียงผู้ชาย (am_adam) ใช้ได้เมื่อเลือก', !!mUrl && mUrl.indexOf('/m/') >= 0, mUrl || 'ไม่มี');
  const dUrl = audioMod.audioUrl('word:food-breakfast');
  ok('ไม่ระบุเพศ = เสียงผู้หญิง (af_heart)', !!dUrl && dUrl.indexOf('/f/') >= 0);
  if (fUrl) {
    const r = await fetch(fUrl);
    const buf = r.ok ? await r.arrayBuffer() : null;
    ok('ไฟล์เสียง Kokoro โหลดได้จริง', !!buf && buf.byteLength > 1000, buf ? buf.byteLength + ' bytes' : 'โหลดไม่ได้');
  }
  const kmeta = await (await fetch('/data/audio/meta.json')).json();
  ok('meta ระบุ Kokoro af_heart / am_adam', kmeta.engine === 'kokoro-onnx'
     && kmeta.voices.f === 'af_heart' && kmeta.voices.m === 'am_adam',
     kmeta.engine + ' · ' + kmeta.voices.f + ' / ' + kmeta.voices.m);
  /* ---------- 11) ระบบภาพจริงจาก Wikimedia Commons ---------- */
  const imgMod = await import('/js/images.js');
  const probe = words.find((w) => w.word === 'receipt') || words[0];
  const photo = await imgMod.photoFor(probe, { force: true });
  ok('ดึงภาพจริงจาก Wikimedia Commons ได้ (CORS ผ่าน)', !!photo && !!photo.url, photo ? photo.title : 'ไม่พบภาพ');
  ok('ภาพที่ได้มีข้อมูลเครดิต/ไลเซนส์', !!photo && !!photo.artist && !!photo.license,
     photo ? photo.artist + ' / ' + photo.license : '-');
  const candidates = await imgMod.fetchCandidates(probe);
  ok('ตัวกรองภาพตัดภาพที่ไม่เหมาะออก', Array.isArray(candidates) && candidates.every((c) => !/\\b(map|logo|diagram|chart)\\b/i.test(c.title)),
     candidates.length + ' ภาพที่ผ่านการคัดเลือก');
  const other = words.find((w) => w.word === 'menu') || words[1];
  const photo2 = await imgMod.photoFor(other);
  ok('คำที่ภาพหายากก็ยังได้ภาพ (โหมดผ่อนปรน)', !!photo2 && !!photo2.url, photo2 ? photo2.title : 'ไม่พบภาพ');
  const photo3 = await imgMod.photoFor(other, { cycle: true });
  ok('เรียกภาพถัดไป (ปุ่มเปลี่ยนภาพ) ได้', !!photo3 && !!photo3.url, photo3 ? photo3.title.slice(0, 45) : 'ไม่พบภาพ');

  /* ---------- 12) ความทนทาน ---------- */
  location.hash = '#/unknown-route';
  await sleep(500);
  ok('เส้นทางที่ไม่รู้จักไม่ทำให้แอปพัง', !!$('#view').children.length && !document.body.textContent.includes('เกิดข้อผิดพลาดในการแสดงผล'));
  location.hash = '#/learn';
  await sleep(500);

  return { results: R, storage: store(), swControlled: !!navigator.serviceWorker.controller };
})()`;

/* ---------------- ตัวรัน ---------------- */
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('ไม่พบแท็บที่เปิดอยู่ของ Chrome');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('เชื่อมต่อ CDP ไม่ได้')); });
  const cdp = new CDP(ws);

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  // ใส่ตัวจำลอง Speech Recognition ก่อนสคริปต์ของหน้าเว็บทุกครั้งที่โหลด
  // เพื่อให้ทดสอบ "วงจรการพูด" ได้อย่างแน่นอน (headless ไม่มีไมโครโฟนจริง)
  // ตั้งข้อความที่ต้องการให้จำลองได้ที่ window.__fakeSpeech
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (function () {
        class FakeRecognition {
          constructor() { this.lang = 'en-US'; this.interimResults = true; this.continuous = false; this._l = {}; }
          addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
          start() {
            const text = window.__fakeSpeech || 'hello';
            setTimeout(() => {
              const alt = { transcript: text, confidence: 0.95 };
              const res = [alt]; res.isFinal = true;
              const results = [res];
              const ev = { resultIndex: 0, results };
              (this._l.result || []).forEach((f) => f(ev));
            }, 150);
            setTimeout(() => { (this._l.end || []).forEach((f) => f({})); }, 400);
          }
          stop() { (this._l.end || []).forEach((f) => f({})); }
          abort() { (this._l.end || []).forEach((f) => f({})); }
        }
        window.SpeechRecognition = FakeRecognition;
        window.webkitSpeechRecognition = FakeRecognition;
        window.__fakeSpeech = '';
      })();
    `,
  });

  await cdp.send('Page.navigate', { url: APP_URL });
  await sleep(2200);

  // ล้างข้อมูลเดิมใน localStorage เพื่อให้ผลการทดสอบเหมือนกันทุกครั้ง
  await cdp.eval('try { localStorage.clear(); } catch (e) {} "cleared"');
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(2600);

  const flags = [
    '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    // ไมโครโฟนจำลอง เพื่อทดสอบการบันทึกเสียงและวงจรการพูดได้จริงในโหมด headless
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${CDP_PORT}`,
  ];
  console.log('เริ่มทดสอบที่ ' + APP_URL);
  console.log('(ต้องเปิด Chrome ด้วย: chrome ' + flags.join(' ') + ' about:blank)\n');
  let out;
  try {
    out = await cdp.eval(PAGE_TEST);
  } catch (err) {
    console.error('การทดสอบล้มเหลวกลางทาง:', err.message);
    if (cdp.errors.length) console.error('ข้อผิดพลาดในหน้าเว็บ:\n  ' + cdp.errors.join('\n  '));
    process.exit(1);
  }

  const rows = out.results;
  const pass = rows.filter((r) => r.pass).length;
  for (const r of rows) {
    console.log(`${r.pass ? '  ผ่าน' : '  ตก '}  ${r.name}${r.extra ? '   [' + r.extra + ']' : ''}`);
  }
  console.log(`\nสรุป: ผ่าน ${pass}/${rows.length}`);

  if (cdp.errors.length) {
    console.log('\nข้อผิดพลาด JS ที่พบในหน้าเว็บ:');
    for (const e of cdp.errors) console.log('  - ' + e);
  } else {
    console.log('ไม่พบ JS error ระหว่างการทดสอบ');
  }
  console.log('service worker ควบคุมหน้าเว็บ: ' + (out.swControlled ? 'ใช่' : 'ยัง (ปกติในการรันครั้งแรก)'));

  /* ---------------- ทดสอบการใช้งานออฟไลน์ (PWA) ---------------- */
  console.log('\nทดสอบการใช้งานออฟไลน์…');
  await cdp.send('Network.enable');
  const swInfo = await cdp.eval(`(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    const keys = await caches.keys();
    const sizes = {};
    for (const k of keys) { const c = await caches.open(k); sizes[k] = (await c.keys()).length; }
    return { regs: regs.length, states: regs.map((r) => (r.active && r.active.state) || (r.installing && 'installing') || 'none'),
             controller: !!navigator.serviceWorker.controller, caches: sizes };
  })()`);
  console.log('  service worker:', JSON.stringify(swInfo));

  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.send('Page.reload', { ignoreCache: false });
  await sleep(3500);
  const offline = await cdp.eval(`(() => {
    const v = document.getElementById('view');
    return { text: v ? v.textContent.slice(0, 90) : '(ไม่มี #view)',
             cards: document.querySelectorAll('.cat-card').length,
             broken: document.body.textContent.includes('โหลดข้อมูลคำศัพท์ไม่สำเร็จ') || document.body.textContent.includes('เกิดข้อผิดพลาดในการแสดงผล') };
  })()`);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  const offlinePass = swInfo.regs > 0 && !offline.broken && offline.cards > 0;
  console.log(`  ${offlinePass ? 'ผ่าน' : 'ตก '}  เปิดแอปได้ขณะออฟไลน์ (service worker เสิร์ฟจากแคช)  [แคช ${offline.cards} หมวด · ${Object.keys(swInfo.caches).length} cache]`);
  if (!offlinePass) console.log('    ข้อความบนหน้าจอ: ' + offline.text);

  /* ---------------- ทดสอบโหมดพรีวิว LINE (LIFF) ---------------- */
  console.log('\nทดสอบโหมดพรีวิว LINE (LIFF)…');
  await cdp.send('Page.navigate', { url: APP_URL + '?preview=liff' });
  await sleep(2800);
  const liff = await cdp.eval(`(function () {
    const html = document.documentElement;
    const chip = document.querySelector('.liff-profile');
    const name = document.querySelector('.liff-name');
    // เปิดหน้าตั้งค่าเพื่อตรวจปุ่มแชร์
    const gear = document.getElementById('btn-settings');
    if (gear) gear.click();
    const sheet = document.getElementById('sheet-body');
    return {
      inLiffClass: html.classList.contains('in-liff'),
      previewClass: html.classList.contains('liff-preview'),
      chip: !!chip,
      name: name ? name.textContent : '',
      hasShare: !!(sheet && sheet.textContent.includes('แชร์ให้เพื่อนใน LINE')),
      bodyLineMode: document.body.classList.contains('line-mode'),
    };
  })()`);
  const liffPass = liff.inLiffClass && liff.chip && liff.hasShare;
  console.log(`  ${liffPass ? 'ผ่าน' : 'ตก '}  โหมดพรีวิว LINE ทำงาน (คลาส in-liff, ชื่อผู้ใช้, ปุ่มแชร์)  [${JSON.stringify(liff)}]`);

  ws.close();
  process.exit(rows.every((r) => r.pass) && cdp.errors.length === 0 && offlinePass && liffPass ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
