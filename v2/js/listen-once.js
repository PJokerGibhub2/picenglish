/** ฟังเสียงหนึ่งครั้ง พร้อมบันทึกเสียงไว้ฟังเทียบเมื่อเบราว์เซอร์รองรับ */

import { createRecognizer, stopSpeaking } from './speech.js';
import { startRecording } from './recorder.js';
import * as store from './store.js';

let activeRecognizer = null;
let cancelActive = null;

export function stopListeningOnce() {
  const recognizer = activeRecognizer;
  if (recognizer) {
    try { recognizer.abort(); } catch (e) { /* ignore */ }
  }
  if (cancelActive) cancelActive();
  activeRecognizer = null;
}

export function listenOnce(hooks = {}) {
  return new Promise((resolve) => {
    stopSpeaking();
    let recHandle = null;
    let settled = false;
    const done = async (said, err) => {
      if (settled) return;
      settled = true;
      activeRecognizer = null;
      cancelActive = null;
      let blob = null;
      if (recHandle) {
        await new Promise((r) => setTimeout(r, 180));
        try { blob = await recHandle.stop(); } catch (e) { /* ignore */ }
        recHandle = null;
      }
      resolve({ said: said || '', blob: blob && blob.size > 200 ? blob : null, err: err || null });
    };
    cancelActive = () => done('', 'aborted');
    (async () => {
      const safeConcurrent = !/Android/i.test(navigator.userAgent || '');
      if (store.settings().recordVoice !== false && safeConcurrent) {
        try { recHandle = await startRecording(); } catch (e) { recHandle = null; }
      }
      if (settled) {
        if (recHandle) { try { await recHandle.stop(); } catch (e) { /* ignore */ } }
        return;
      }
      const recognizer = createRecognizer({
        lang: 'en-US',
        interim: true,
        onResult: ({ final, interim, done: finished }) => {
          hooks.onInterim && hooks.onInterim(final || interim || '');
          if (finished) done(final || interim, null);
        },
        onError: (err) => done('', err),
        onEnd: () => {},
      });
      if (!recognizer) return done('', 'unsupported');
      activeRecognizer = recognizer;
      try {
        recognizer.start();
        hooks.onStart && hooks.onStart();
      } catch (err) { done('', 'start-failed'); }
    })();
  });
}
