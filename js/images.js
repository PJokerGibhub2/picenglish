/**
 * images.js — ดึงภาพถ่ายจริงจาก Wikimedia Commons (คลังฟรี ไม่ต้องใช้ API key)
 *
 * ลำดับการหาภาพ (คุณภาพจากมากไปน้อย):
 *   1) หมวดหมู่ Commons ที่กำหนดไว้ต่อคำ (word.commonsCategory) — ภาพตรงหัวข้อโดยโครงสร้าง
 *   2) ค้นด้วยข้อความจาก word.imageQuery — ครอบคลุมกว้างแต่ความแม่นยำต่ำกว่า
 *   3) ไม่มีภาพ → หน้าจอจะใช้อีโมจิแทน (ทำงานออฟไลน์ได้เสมอ)
 *
 * คำที่ตั้ง `"photo": false` ไว้จะข้ามการหาภาพทั้งหมด (ใช้กับคำนามธรรม/คำเกี่ยวกับอาการป่วย)
 * ผู้ใช้สามารถเปลี่ยนภาพเองได้ในแอปผ่านปุ่ม "เปลี่ยนภาพ" (บันทึกไว้ใน localStorage)
 */

const API = 'https://commons.wikimedia.org/w/api.php';
const CACHE_KEY = 'picenglish.photos.v1';

// ภาพที่ไม่เหมาะกับแอปเรียนภาษา: แผนที่/แผนภาพ/เอกสาร/ฉลาก ฯลฯ
const BAD_TITLE = /\b(map|maps|diagram|chart|graph|plot|logo|icon|sign|signage|symbol|coat of arms|flag|stamp|banknote|banknotes|poster|screenshot|drawing|sketch|plan|scheme|infographic|cover|album|book|page|comic|cartoon|clipart|silhouette|text|word|letter|alphabet|collage|montage|panorama)\b/i;

// ภาพที่อาจทำให้ผู้ใช้ไม่สบายใจ (แอปนี้ควรใช้ได้กับทุกวัย) — ตัดออกเด็ดขาด
const UNSAFE_TITLE = /\b(surgery|surgical|operation|wound|wounds|injury|injuries|blood|bloody|bleeding|gore|corpse|cadaver|autopsy|tumour|tumor|cancer|ulcer|pus|abscess|infection|disease|diseases|rash|lesion|sore|throat|tonsil|tonsils|mouth|tongue|teeth|gum|dental|dentist|x-?ray|radiograph|mri|ct scan|needle|injection|syringe|organ|organs|anatomy|anatomical|naked|nude|nudity|dead|death|funeral|vomit|urine|feces|stool|genital|penis|vagina|breast|buttock)\b/i;

// หมวดที่มักรวมภาพถ่ายคุณภาพดี
const GOOD_CATEGORY = /\b(featured pictures|quality images|photographs|photos|people)\b/i;
const GOOD_LICENSE = /^(cc0|cc-by|cc-by-sa|pd|public domain|no restrictions)/i;

let store = loadStore();
let failStreak = 0;
let blockedUntil = 0;   // หยุดชั่วคราวหลังล้มเหลวติดกันหลายครั้ง แล้วลองใหม่เอง (ไม่ปิดถาวร)
const COOLDOWN_MS = 20000;
const MAX_FAILS = 3;
const FETCH_TIMEOUT_MS = 12000;
const MIN_WIDTH = 400;

// รับเฉพาะภาพนิ่ง raster — ตัดไฟล์เสียง วิดีโอ PDF, SVG และ GIF (มักเป็นไอคอน/ภาพเคลื่อนไหว) ออก
const OK_MIME = /^image\/(jpeg|jpg|png|webp|tiff)$/i;

function loadStore() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; }
}
function persist() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
}
function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** เรียก Commons API พร้อมจัดการ timeout และการล้มเหลวซ้ำๆ */
async function apiGet(params) {
  if (Date.now() < blockedUntil) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}?${params.toString()}`, { mode: 'cors', signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    failStreak = 0;
    return data;
  } catch (err) {
    failStreak++;
    if (failStreak >= MAX_FAILS) {
      blockedUntil = Date.now() + COOLDOWN_MS;
      failStreak = 0;
      console.warn('[images] ค้นภาพล้มเหลวหลายครั้ง — พักการดึงภาพชั่วคราว 20 วินาที');
    } else {
      console.warn('[images] เรียก API ไม่สำเร็จ จะลองใหม่ภายหลัง', err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function scoreCandidate(info, queryTokens) {
  const title = stripHtml(info.title || '');
  const low = title.toLowerCase();
  let score = 0;

  const titleTokens = low.replace(/^file:/, '').replace(/\.[a-z0-9]+$/, '').split(/[^a-z0-9]+/).filter(Boolean);
  const overlap = queryTokens.filter((t) => titleTokens.includes(t)).length;
  score += overlap * 12;

  const extra = Math.max(0, titleTokens.length - queryTokens.length);
  score -= extra * 2.5;                                  // ชื่อสั้นกระชับมักเป็นภาพเดี่ยวๆ

  if (GOOD_LICENSE.test(info.license || '')) score += 6;
  if (info.width && info.height) {
    const ratio = info.width / info.height;
    if (ratio >= 1.1 && ratio <= 2.2) score += 7;         // แนวนอนพอดีกับการ์ด
    else if (ratio < 0.8) score -= 6;                     // ภาพตั้ง
  }
  if (/\b(19|20)\d{2}\b/.test(low)) score -= 8;           // มักเป็นภาพเหตุการณ์/เอกสารเก่า
  if (/\d/.test(low)) score -= 2;
  if (titleTokens.length > 9) score -= 6;
  if (/featured|quality/i.test(info.categories || '')) score += 8;
  if (GOOD_CATEGORY.test(info.categories || '')) score += 4;

  return score;
}

/** แปลงผลลัพธ์จาก API เป็นรายการภาพที่ผ่านการกรองและจัดอันดับ */
function buildCandidates(pages, queryTokens, relaxed = false) {
  const out = [];
  for (const page of Object.values(pages || {})) {
    const info = page.imageinfo && page.imageinfo[0];
    if (!info) continue;
    const title = page.title || '';
    if (UNSAFE_TITLE.test(title)) continue;               // ตัดออกทุกกรณี
    const mime = String(info.mime || '');
    if (mime && !OK_MIME.test(mime)) continue;            // กันไฟล์เสียง/วิดีโอ/SVG/PDF
    if (!mime && !/\.(jpe?g|png|webp|tiff?)$/i.test(title)) continue;
    const bad = BAD_TITLE.test(title);
    if (bad && !relaxed) continue;
    const meta = info.extmetadata || {};
    const url = info.thumburl || info.url;
    if (!url) continue;
    if (info.width && info.width < MIN_WIDTH) continue;

    const license = stripHtml(meta.LicenseShortName?.value) || 'ดูรายละเอียดที่หน้าภาพ';
    const categories = stripHtml(meta.Categories?.value);
    out.push({
      pageid: page.pageid,
      title,
      url,
      page: info.descriptionurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
      artist: stripHtml(meta.Artist?.value) || 'Wikimedia Commons',
      license,
      licenseUrl: meta.LicenseUrl?.value || '',
      width: info.thumbwidth || info.width,
      height: info.thumbheight || info.height,
      categories,
      score: scoreCandidate({ title, license, categories, width: info.width, height: info.height }, queryTokens)
        + (bad ? -25 : 0) + (relaxed ? -10 : 0),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** 1) ภาพจากหมวดหมู่ Commons — ตรงหัวข้อโดยโครงสร้าง */
async function fetchCategoryFiles(word) {
  const category = word.commonsCategory;
  if (!category) return [];
  const title = /^category:/i.test(category) ? category : `Category:${category}`;
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'categorymembers',
    gcmtitle: title,
    gcmtype: 'file',
    gcmlimit: '24',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '900',
  });
  const data = await apiGet(params);
  if (!data) return [];
  // ให้คะแนนพิเศษกับไฟล์ที่ชื่อมีคำเดียวกับคำศัพท์หรือคำค้น (มักเป็นภาพที่สื่อความหมายตรงกว่า)
  const tokens = [...new Set([
    ...category.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2),
    ...String(word.word || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2),
    ...String(word.imageQuery || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2),
  ])];
  return buildCandidates(data?.query?.pages, tokens).slice(0, 8);
}

/** 2) ค้นด้วยข้อความ */
async function fetchSearchFiles(word, limit = 12) {
  const query = (word.imageQuery || word.word || '').trim();
  if (!query) return [];
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '900',
  });
  const data = await apiGet(params);
  if (!data) return [];
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const strict = buildCandidates(data?.query?.pages, tokens, false).slice(0, 8);
  if (strict.length) return strict;
  // ผ่อนปรนเฉพาะเมื่อไม่เหลืออะไรเลย (ภาพเอกสาร/แผนที่ ยังดีกว่าไม่มีภาพ)
  return buildCandidates(data?.query?.pages, tokens, true).slice(0, 8);
}

async function resolveCandidates(word) {
  if (word.photo === false) return [];
  const fromCategory = await fetchCategoryFiles(word);
  if (fromCategory.length >= 2) return fromCategory;
  const fromSearch = await fetchSearchFiles(word);
  if (!fromCategory.length) return fromSearch;
  const seen = new Set(fromCategory.map((c) => c.pageid));
  return fromCategory.concat(fromSearch.filter((c) => !seen.has(c.pageid))).slice(0, 8);
}

/** รายการภาพที่เป็นไปได้ทั้งหมดของคำหนึ่ง (ใช้ทั้งตอนแสดงผลและตอนให้ผู้ใช้เลือกภาพ) */
export async function candidatesOf(word, opts = {}) {
  if (word.photo === false) return [];
  const rec = store[word.id];
  if (!opts.force && rec && Array.isArray(rec.candidates) && rec.candidates.length) return rec.candidates;
  const candidates = await resolveCandidates(word);
  if (candidates.length) {
    store[word.id] = { index: 0, candidates, ts: Date.now() };
    persist();
  }
  return candidates;
}

/** คงชื่อเดิมไว้ให้เรียกใช้ง่าย */
export async function fetchCandidates(word) {
  return candidatesOf(word, { force: true });
}

/**
 * ขอภาพสำหรับคำหนึ่งคำ
 * @param {object} word ข้อมูลคำศัพท์
 * @param {object} opts { force: ค้นใหม่, cycle: ไปภาพถัดไป }
 * @returns {Promise<object|null>}
 */
export async function photoFor(word, opts = {}) {
  if (word.photo === false) return null;
  const rec = store[word.id];
  if (!opts.force && rec && Array.isArray(rec.candidates) && rec.candidates.length) {
    if (opts.cycle) {
      rec.index = (rec.index + 1) % rec.candidates.length;
      rec.ts = Date.now();
      persist();
    }
    return rec.candidates[rec.index] || null;
  }
  const candidates = await candidatesOf(word, opts);
  return candidates[0] || null;
}

/** ให้ผู้ใช้เลือกภาพเอง (บันทึกถาวรใน localStorage) */
export async function setPhotoChoice(wordId, index) {
  const rec = store[wordId];
  if (!rec || !rec.candidates || !rec.candidates.length) return null;
  rec.index = Math.max(0, Math.min(rec.candidates.length - 1, index));
  rec.ts = Date.now();
  persist();
  return rec.candidates[rec.index];
}

export function forgetPhoto(wordId) {
  delete store[wordId];
  persist();
}

export function clearPhotoCache() {
  store = {};
  persist();
  caches.keys()
    .then((keys) => keys.filter((k) => k.startsWith('picenglish-photos')).forEach((k) => caches.delete(k)))
    .catch(() => {});
}

/**
 * อุ่นแคชภาพไว้ล่วงหน้าเพื่อให้ใช้ตอนออฟไลน์ได้
 * (service worker จะเก็บไฟล์ภาพให้เองเมื่อหน้าเว็บ fetch ผ่าน)
 * ใส่จังหวะห่างเล็กน้อยเพื่อไม่ให้ถูกจำกัดอัตราการเรียก API
 */
export async function preloadPhotos(words, onProgress) {
  let done = 0;
  const failed = [];
  for (const w of words) {
    try {
      const p = await photoFor(w);
      if (p) {
        await fetch(p.url, { mode: 'cors', cache: 'force-cache' });
        done++;
      } else {
        failed.push(w.word);
      }
    } catch (err) {
      failed.push(w.word);
    }
    onProgress && onProgress(done, failed.length, words.length, w.word);
    await new Promise((r) => setTimeout(r, 180));
  }
  return { done, failed };
}

/** true = กำลังพักการดึงภาพชั่วคราว (จะลองใหม่เองภายหลัง) */
export function photoDisabled() { return Date.now() < blockedUntil; }
