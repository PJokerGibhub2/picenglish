/**
 * openinbrowser.js — พาผู้ใช้ออกจากเบราว์เซอร์ในแอป (LINE / Facebook / IG)
 *
 * ทำไมต้องมี: LINE บล็อกไมโครโฟนใน in-app browser ทั้ง iOS และ Android
 * ดังนั้น "ฝึกพูด" จะใช้ไม่ได้เลยถ้าเปิดจาก LINE
 *
 * ลำดับการพยายาม:
 *  1) LIFF: liff.openWindow({ external: true })  ← วิธีเป็นทางการของ LINE (แม่นสุด)
 *  2) Android: intent:// (เปิด Chrome ตรง ๆ)
 *  3) iOS: x-safari-https:// (เปิด Safari)
 *  4) ถ้าไม่ได้จริง ๆ: คัดลอกลิงก์ + บอกวิธีวางในเบราว์เซอร์
 */

import { h, toast } from './ui.js';
import { inAppBrowser } from './speech.js';

/** คัดลอกข้อความ (รองรับทั้ง clipboard API และวิธีเก่า) */
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* ตกไปวิธีเก่า */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

/**
 * พยายามเปิดลิงก์ในเบราว์เซอร์จริง
 * @returns {'liff'|'intent'|'x-safari'|'copy'|'newtab'}
 */
export function openInBrowser(url = location.href) {
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  const clean = String(url).replace(/^https?:\/\//, '');
  const scheme = /^https:/i.test(url) ? 'https' : 'http';

  // 1) LIFF — วิธีที่ LINE แนะนำ (ถ้าโหลด SDK ไว้)
  try {
    if (window.liff && typeof window.liff.openWindow === 'function' && window.liff.isInClient && window.liff.isInClient()) {
      window.liff.openWindow({ url, external: true });
      return 'liff';
    }
  } catch (e) { /* ไปวิธีถัดไป */ }

  // 2) Android → เปิด Chrome ตรง ๆ
  if (isAndroid) {
    try {
      location.href = 'intent://' + clean + '#Intent;scheme=' + scheme + ';package=com.android.chrome;end';
      return 'intent';
    } catch (e) { /* ไปวิธีถัดไป */ }
  }

  // 3) iOS → เปิด Safari
  if (isIOS) {
    try {
      location.href = 'x-safari-' + url;
      return 'x-safari';
    } catch (e) { /* ไปวิธีถัดไป */ }
  }

  // 4) เปิดแท็บใหม่ (ถ้าเบราว์เซอร์อนุญาต) แล้วคัดลอกให้ด้วย
  try {
    const w = window.open(url, '_blank');
    if (w) return 'newtab';
  } catch (e) { /* ignore */ }
  copyText(url);
  return 'copy';
}

/** แชร์ลิงก์ผ่านระบบของมือถือ → ผู้ใช้เลือกเองว่าจะเปิดด้วยแอปหรือเบราว์เซอร์ใด */
export async function shareUrl(url = location.href, title = 'PicEnglish') {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return 'share';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'abort';
  }
  const ok = await copyText(url);
  return ok ? 'copy' : 'fail';
}
/** แถบเตือน + ปุ่มพาออกไปเปิดในเบราว์เซอร์ (คืนค่า null ถ้าไม่ได้อยู่ใน in-app) */
export function inAppBanner(opts = {}) {
  const app = inAppBrowser();
  if (!app) return null;
  const { compact = false } = opts;

  const openBtn = h('button', {
    class: 'btn btn-primary btn-sm', type: 'button',
    onclick: async () => {
      const how = openInBrowser();
      if (how === 'copy') {
        toast('คัดลอกลิงก์แล้ว — วางใน Chrome/Safari', 'ok');
      } else if (how === 'intent' || how === 'x-safari') {
        toast('กำลังเปิดในเบราว์เซอร์…');
        // ถ้าไม่ไปจริง ให้คัดลอกลิงก์ให้แทน
        setTimeout(() => { copyText(location.href); }, 1500);
      } else if (how === 'newtab') {
        toast('เปิดแท็บใหม่แล้ว');
      }
    },
  }, '🌐 เปิดในเบราว์เซอร์');

  const copyBtn = h('button', {
    class: 'btn btn-ghost btn-sm', type: 'button',
    onclick: async () => {
      const ok = await copyText(location.href);
      toast(ok ? 'คัดลอกลิงก์แล้ว — เปิด Chrome/Safari แล้ววาง' : 'คัดลอกไม่สำเร็จ', ok ? 'ok' : 'err');
    },
  }, '📋 คัดลอกลิงก์');

  const shareBtn = h('button', {
    class: 'btn btn-ghost btn-sm', type: 'button',
    onclick: async () => {
      const how = await shareUrl();
      if (how === 'copy') toast('คัดลอกลิงก์แล้ว — เปิดเบราว์เซอร์แล้ววาง', 'ok');
      else if (how === 'fail') toast('คัดลอกไม่สำเร็จ — กดจุดสามจุดแล้วเลือก เปิดในเบราว์เซอร์', 'err');
    },
  }, '📤 แชร์ไปเปิดเอง');

  return h('div', { class: 'card inapp', role: 'alert', style: compact ? { padding: '12px 14px' } : {} },
    h('div', { class: 'bold', style: { fontSize: '.92rem' }, text: '⚠️ คุณเปิดจาก ' + app + ' — ไมโครโฟนจะถูกบล็อก' }),
    h('div', { class: 'tiny', style: { marginTop: '4px', color: 'var(--text-soft)', lineHeight: '1.55' },
      text: 'LINE ไม่ให้เว็บในแอปใช้ไมค์ (ทั้ง iPhone และ Android) — กดปุ่มล่างเพื่อเปิดในเบราว์เซอร์จริง แล้วค่อยกดไมค์' }),
    h('div', { class: 'row row-wrap', style: { gap: '8px', marginTop: '10px' } }, shareBtn, copyBtn, openBtn));
}
