/**
 * check_imports.mjs — ตรวจว่า named import ทุกตัวมีอยู่จริงในไฟล์ต้นทาง
 * จับ typo ที่ตัว checker ปกติของเบราว์เซอร์จะฟ้องตอนรันเท่านั้น
 *
 * รัน:  node scripts/check_imports.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(JS_DIR);
const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

const EXPORT_RE = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g;
const EXPORT_LIST_RE = /export\s*\{([^}]+)\}/g;

function exportsOf(src) {
  const set = new Set();
  let m;
  EXPORT_RE.lastIndex = 0;
  while ((m = EXPORT_RE.exec(src)) !== null) set.add(m[1]);
  EXPORT_LIST_RE.lastIndex = 0;
  while ((m = EXPORT_LIST_RE.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) set.add(name);
    }
  }
  return set;
}

const IMPORT_RE = /import\s*(?:([A-Za-z0-9_$]+)\s*,\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;

let problems = 0;
let checked = 0;

for (const file of files) {
  const src = sources.get(file);
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const defaultName = m[1];
    const named = m[2];
    const spec = m[3];
    if (!spec.startsWith('.')) continue; // ข้ามโมดูลภายนอก
    const target = resolve(dirname(file), spec);
    if (!sources.has(target)) {
      console.error(`x ${rel(file)}: import จาก '${spec}' ไม่พบไฟล์`);
      problems++;
      continue;
    }
    const ex = exportsOf(sources.get(target));
    checked++;
    if (named) {
      for (const raw of named.split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        if (!ex.has(name)) {
          console.error(`x ${rel(file)}: '${name}' ไม่ถูก export จาก ${rel(target)}`);
          problems++;
        }
      }
    }
    if (defaultName && !/export\s+default/.test(sources.get(target))) {
      console.error(`x ${rel(file)}: import แบบ default แต่ ${rel(target)} ไม่มี export default`);
      problems++;
    }
  }
}

function rel(p) { return p.replace(ROOT + '\\', '').replace(ROOT + '/', ''); }

console.log(`ตรวจ import ${checked} จุด ใน ${files.length} ไฟล์`);
if (problems) {
  console.error(`\nพบปัญหา ${problems} จุด`);
  process.exit(1);
}
console.log('ไม่พบปัญหา');
