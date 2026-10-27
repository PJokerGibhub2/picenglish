import { readdir, stat, copyFile, mkdir, utimes } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v2 = resolve(here, '..');
const source = resolve(v2, '..', 'data');
const target = join(v2, 'data');
let added = 0;
let changed = 0;
let skipped = 0;

async function syncFile(from, to, { keepExisting = false } = {}) {
  let src;
  try { src = await stat(from); } catch { skipped++; return; }
  let dst = null;
  try { dst = await stat(to); } catch { /* new file */ }
  if (dst && keepExisting) { skipped++; return; }
  await mkdir(dirname(to), { recursive: true });
  if (!dst) { await copyFile(from, to); await utimes(to, src.atime, src.mtime); added++; return; }
  if (dst.size !== src.size || Math.trunc(dst.mtimeMs) !== Math.trunc(src.mtimeMs)) {
    await copyFile(from, to);
    await utimes(to, src.atime, src.mtime);
    changed++;
  } else skipped++;
}

for (const name of ['words.json', 'categories.json', 'dialogues.json', 'listening.json', 'chunks.json', 'placement.json']) {
  await syncFile(join(source, name), join(target, name));
}

for (const name of ['manifest.json', 'meta.json']) {
  await syncFile(join(source, 'audio', name), join(target, 'audio', name));
}

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const from = join(dir, entry.name);
    if (entry.isDirectory()) await walk(from);
    else await syncFile(from, join(target, 'audio', from.slice(join(source, 'audio').length + 1)), { keepExisting: true });
  }
}
await walk(join(source, 'audio'));
console.log(`Sync data เสร็จ: ไฟล์ใหม่ ${added} · เปลี่ยน ${changed} · ข้าม ${skipped} (ไม่มีการลบไฟล์)`);
