/**
 * recorder.js — บันทึกเสียงผู้ใช้ + เล่นย้อนหลัง + เก็บไว้ในเครื่อง (IndexedDB)
 *
 * ใช้ทำ 3 อย่าง
 *   1) ให้ผู้ใช้ "ฟังเสียงตัวเอง" เทียบกับเสียงต้นแบบ (A/B) — หัวใจของการฝึกออกเสียง
 *   2) เก็บคลิปไว้ฟังย้อนหลัง เพื่อเห็นพัฒนาการของตัวเอง
 *   3) เก็บเฉพาะในเครื่องผู้ใช้ (IndexedDB) ไม่มีการอัปโหลดขึ้นเซิร์ฟเวอร์
 *
 * หมายเหตุ: การบันทึกเสียงทำงานพร้อมกับ Speech Recognition ได้บน Chrome/Edge
 * แต่ถ้าเปิดพร้อมกันไม่สำเร็จ ระบบจะยังให้คะแนนได้ตามปกติ (เพียงไม่มีเสียงให้ฟังย้อนหลัง)
 */

const DB_NAME = 'picenglish-audio';
const DB_VERSION = 1;
const STORE = 'recordings';

export const QUOTA = { maxItems: 30, maxBytes: 20 * 1024 * 1024 }; // 30 คลิป หรือ 20 MB

let currentRec = null;
let currentChunks = [];
let currentStream = null;

export function recordingSupported() {
  return typeof navigator !== 'undefined'
    && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    && typeof window !== 'undefined' && !!window.MediaRecorder;
}

let lastMime = '';

/**
 * เลือก mimeType ที่เบราว์เซอร์รองรับจริง
 * iOS/Safari = audio/mp4 (AAC) เท่านั้น · Chrome/Android = webm/opus
 * ถ้าไม่มี isTypeSupported ให้เดา mp4 (iOS รุ่นเก่า)
 */
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const list = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];
  if (!MediaRecorder.isTypeSupported) return 'audio/mp4';
  for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

/** สร้าง MediaRecorder แบบทนทาน: ลดตัวเลือกทีละชั้นจนกว่าจะได้ (iOS ชอบปฏิเสธ bitrate) */
function createRecorder(stream, mime) {
  const attempts = mime
    ? [{ mimeType: mime, audioBitsPerSecond: 32000 }, { mimeType: mime }, undefined]
    : [undefined, { mimeType: 'audio/mp4' }];
  let lastErr = null;
  for (const opts of attempts) {
    try {
      return opts ? new MediaRecorder(stream, opts) : new MediaRecorder(stream);
    } catch (err) { lastErr = err; }
  }
  if (lastErr) throw lastErr;
  return new MediaRecorder(stream);
}

/**
 * เริ่มบันทึกเสียง
 * @returns {Promise<{stop: () => Promise<Blob|null>}|null>} null = เริ่มไม่ได้ (ไม่มีสิทธิ์/ไม่รองรับ)
 */
export async function startRecording(opts = {}) {
  if (!recordingSupported()) return null;
  if (currentRec && currentRec.state === 'recording') return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mime = pickMime();
    const rec = createRecorder(stream, mime);
    lastMime = rec.mimeType || mime || 'audio/mp4';
    currentChunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) currentChunks.push(e.data); };
    const finished = new Promise((resolve) => {
      rec.onstop = () => {
        if (stopLevelMeter) { try { stopLevelMeter(); } catch (e) { /* ignore */ } stopLevelMeter = null; }
        try { stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
        currentRec = null;
        currentStream = null;
        const chunks = currentChunks.slice();
        currentChunks = [];
        if (!chunks.length) return resolve(null);
        resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      };
    });
    rec.start(250);
    currentRec = rec;
    currentStream = stream;
    stopLevelMeter = attachLevelMeter(stream, opts.onLevel);
    return {
      stop: () => {
        // ต้องกันกรณี recorder ไม่อยู่ในสถานะ recording (ไม่งั้น onstop ไม่ยิง แล้ว await จะค้างตลอด)
        try {
          if (rec.state === 'inactive') return Promise.resolve(null);
          rec.stop();
        } catch (err) {
          console.warn('[recorder] หยุดบันทึกไม่สำเร็จ', err);
          return Promise.resolve(null);
        }
        // กันเหนียว: ถ้า onstop ไม่ยิงภายใน 2.5 วินาที ให้คืนค่าเป็น null แทนที่จะค้าง
        return Promise.race([
          finished,
          new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
        ]);
      },
    };
  } catch (err) {
    console.warn('[recorder] เริ่มบันทึกไม่สำเร็จ', err);
    return null;
  }
}

let stopLevelMeter = null;

/** วัดระดับเสียงสด (0..1) เพื่อให้ผู้ใช้เห็นว่าแอป "ได้ยิน" จริง */
function attachLevelMeter(stream, onLevel) {
  if (!onLevel) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.72;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf = 0;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      try { onLevel(Math.min(1, rms * 3.2)); } catch (e) { /* ignore */ }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); try { ctx.close(); } catch (e) { /* ignore */ } };
  } catch (err) {
    console.warn('[recorder] วัดระดับเสียงไม่ได้', err);
    return null;
  }
}

/** ข้อมูลของคลิปล่าสุด (ใช้แสดงผล/วินิจฉัย) */
export function lastRecordingInfo() { return { mime: lastMime }; }

/**
 * ทดสอบไมโครโฟน: อัด N มิลลิวินาที แล้วรายงานว่าได้เสียงจริงหรือไม่
 * ใช้ในหน้าตั้งค่า เพื่อวินิจฉัยบนเครื่องจริง (เช่น iPhone)
 */
export async function testMicrophone(ms = 3000, onLevel = null) {
  const info = { ok: false, mime: '', bytes: 0, durationMs: 0, peak: 0, error: '' };
  if (!recordingSupported()) { info.error = 'unsupported'; return info; }
  let peak = 0;
  const handle = await startRecording({
    onLevel: (l) => { peak = Math.max(peak, l); if (onLevel) onLevel(l); },
  });
  if (!handle) { info.error = 'permission'; return info; }
  info.mime = lastMime;
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, ms));
  const blob = await handle.stop();
  info.durationMs = Date.now() - t0;
  info.peak = peak;
  if (blob && blob.size > 0) { info.ok = true; info.bytes = blob.size; info.mime = blob.type || lastMime; }
  else info.error = 'no-audio';
  return info;
}

export function isRecording() {
  return !!currentRec && currentRec.state === 'recording';
}

export function abortRecording() {
  try { if (currentRec && currentRec.state === 'recording') currentRec.stop(); } catch (e) { /* ignore */ }
}

/* ---------------- เล่นเสียงที่บันทึกไว้ ---------------- */

let currentAudio = null;

export function stopPlayback() {
  if (currentAudio) {
    try { currentAudio.pause(); } catch (e) { /* ignore */ }
    currentAudio = null;
  }
}

export function playBlob(blob, rate = 1) {
  return new Promise((resolve) => {
    if (!blob) return resolve();
    stopPlayback();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.playbackRate = Math.max(0.5, Math.min(2, rate));
    a.preservesPitch = true;
    currentAudio = a;
    const done = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === a) currentAudio = null;
      resolve();
    };
    a.addEventListener('ended', done);
    a.addEventListener('error', done);
    a.play().catch(done);
  });
}

/* ---------------- IndexedDB (เก็บไว้ในเครื่องเท่านั้น) ---------------- */

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('ไม่รองรับ IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    try { out = fn(store); } catch (err) { reject(err); return; }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/**
 * บันทึกคลิปเสียงไว้ในเครื่อง
 * @param {object} rec { kind, refId, blob, seconds, label, selfRating }
 */
export async function saveRecording(rec) {
  try {
    const db = await openDb();
    const id = `${rec.kind}-${rec.refId || 'x'}-${Date.now()}`;
    const item = {
      id,
      kind: rec.kind || 'speak',
      refId: rec.refId || '',
      label: rec.label || '',
      seconds: Math.max(0, Math.round(rec.seconds || 0)),
      mime: rec.blob.type || 'audio/webm',
      size: rec.blob.size,
      createdAt: Date.now(),
      selfRating: rec.selfRating || 0,
      blob: rec.blob,
    };
    await tx(db, 'readwrite', (s) => s.put(item));
    db.close();
    await enforceQuota();
    return id;
  } catch (err) {
    console.warn('[recorder] บันทึกคลิปไม่สำเร็จ', err);
    return null;
  }
}

export async function listRecordings(kind) {
  try {
    const db = await openDb();
    const all = await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const list = kind ? all.filter((r) => r.kind === kind) : all;
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    return [];
  }
}

export async function deleteRecording(id) {
  try {
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.delete(id));
    db.close();
    return true;
  } catch (err) {
    return false;
  }
}

export async function clearRecordings() {
  try {
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.clear());
    db.close();
    return true;
  } catch (err) {
    return false;
  }
}

export async function recordingsUsage() {
  const list = await listRecordings();
  return {
    count: list.length,
    bytes: list.reduce((n, r) => n + (r.size || 0), 0),
    items: list,
  };
}

/** ลบคลิปเก่าสุดเมื่อเกินโควตา (ค่าเริ่มต้น 30 คลิป / 20 MB) */
/** อัปเดตข้อมูลคลิปที่มีอยู่แล้ว (เช่น เพิ่มคะแนนตัวเองภายหลัง) */
export async function updateRecording(id, patch = {}) {
  try {
    const db = await openDb();
    const item = await new Promise((res, rej) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    if (!item) { db.close(); return false; }
    if (patch.selfRating !== undefined) item.selfRating = patch.selfRating;
    if (patch.seconds !== undefined) item.seconds = patch.seconds;
    if (patch.label !== undefined) item.label = patch.label;
    await tx(db, 'readwrite', (s) => s.put(item));
    db.close();
    return true;
  } catch (err) {
    console.warn('[recorder] อัปเดตคลิปไม่สำเร็จ', err);
    return false;
  }
}
export async function enforceQuota(quota = QUOTA) {
  try {
    const list = await listRecordings();          // เรียงใหม่ → เก่า
    let count = list.length;
    let bytes = list.reduce((n, r) => n + (r.size || 0), 0);
    const oldest = list.slice().reverse();        // เก่าสุดก่อน
    for (const r of oldest) {
      if (count <= quota.maxItems && bytes <= quota.maxBytes) break;
      await deleteRecording(r.id);
      count -= 1;
      bytes -= (r.size || 0);
    }
    return { count, bytes };
  } catch (err) {
    return null;
  }
}
/**
 * เก็บข้อมูลวินิจฉัยไมโครโฟนของเครื่องจริง
 * ใช้เพื่อรู้ว่าปัญหาคือ "ไม่ปลอดภัย / ไม่มี API / ไม่ได้อนุญาต / ไม่มีอุปกรณ์"
 */
export async function micDiagnostics() {
  const out = {
    secure: false, hasMediaDevices: false, hasRecorder: false,
    permission: 'unknown', inputs: 0, mime: '', platform: '',
  };
  try {
    out.secure = !!window.isSecureContext;
    out.hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    out.hasRecorder = typeof MediaRecorder !== 'undefined';
    out.platform = (navigator.userAgent || '').slice(0, 120);
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const p = await navigator.permissions.query({ name: 'microphone' });
        out.permission = p.state;
      }
    } catch (e) { out.permission = 'unsupported'; }
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      out.inputs = devs.filter((d) => d.kind === 'audioinput').length;
    } catch (e) { /* ignore */ }
    out.mime = pickMime();
  } catch (e) { /* ignore */ }
  return out;
}

/** สรุปเป็นข้อความสั้น ๆ ให้ผู้ใช้คัดลอกส่งให้ผู้พัฒนาได้ */
export async function micDiagnosticsReport() {
  const d = await micDiagnostics();
  return [
    'PicEnglish mic check',
    'secure=' + d.secure,
    'mediaDevices=' + d.hasMediaDevices,
    'MediaRecorder=' + d.hasRecorder,
    'permission=' + d.permission,
    'audioInputs=' + d.inputs,
    'mime=' + (d.mime || 'none'),
    'ua=' + d.platform,
  ].join(' | ');
}