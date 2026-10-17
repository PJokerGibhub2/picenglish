/**
 * art.js — ภาพกราฟฟิกน่ารัก (SVG) ที่ดาวน์โหลดไว้ในเครื่อง
 *
 * ทำไมใช้ภาพกราฟฟิกแทนภาพถ่าย
 *   - ตรงความหมายกว่า และสื่อคำนามธรรมได้
 *   - ไฟล์เล็ก 2–4 KB → ใช้งานออฟไลน์ได้ 100% ไม่ต้องรอเน็ต
 *   - สไตล์สม่ำเสมอทั้งแอป
 *
 * แหล่งภาพ (ฟรี ใช้เชิงพาณิชย์ได้ ต้องให้เครดิต)
 *   OpenMoji — CC BY-SA 4.0 — https://openmoji.org
 *   Twemoji  — CC BY 4.0    — https://github.com/jdecked/twemoji
 *
 * สร้าง/อัปเดตภาพด้วย: python scripts/build_art.py
 */

const MANIFEST_URL = new URL('../data/art/manifest.json', import.meta.url);

let manifest = null;

export async function loadArtManifest() {
  if (manifest !== null) return manifest;
  try {
    const res = await fetch(MANIFEST_URL);
    manifest = res.ok ? await res.json() : {};
  } catch (err) {
    manifest = {};
  }
  return manifest;
}

/** ข้อมูลภาพกราฟฟิกของคำหนึ่งคำ (null ถ้าไม่มี) */
export function artFor(wordId) {
  if (!manifest || !manifest[wordId]) return null;
  const entry = manifest[wordId];
  return {
    url: new URL(entry.file, MANIFEST_URL).href,
    emoji: entry.emoji,
    source: entry.source,
    license: entry.license,
    credit: entry.credit,
  };
}

/** สร้าง <img> ของภาพกราฟฟิก (คืน null ถ้าไม่มีภาพ) */
export function artImgElement(wordId, className = 'art-img') {
  const art = artFor(wordId);
  if (!art || typeof document === 'undefined') return null;
  const img = document.createElement('img');
  img.src = art.url;
  img.alt = '';
  img.className = className;
  img.loading = 'lazy';
  img.decoding = 'async';
  return img;
}

/** เครดิตสำหรับแสดงในหน้าตั้งค่า */
export function artCredits() {
  if (!manifest) return [];
  const used = new Set();
  const out = [];
  for (const entry of Object.values(manifest)) {
    if (used.has(entry.source)) continue;
    used.add(entry.source);
    out.push({ source: entry.source, credit: entry.credit, license: entry.license });
  }
  return out;
}
