/**
 * lan-proxy.mjs — เชื่อม DSH Web GUI (127.0.0.1) ให้มือถือในวง Wi-Fi เดียวกันเข้าถึงได้
 *
 * ใช้เมื่อต้องการเปิดหน้าแชตบน iPhone/Android เพื่อ
 *   - พิมพ์ด้วยเสียง (ไมค์บนคีย์บอร์ด)
 *   - แนบรูปจากอัลบั้มได้ทันที (ไม่ต้องส่งเข้า LINE ก่อน)
 *
 * วิธีรัน:  node scripts/lan-proxy.mjs [listenPort] [targetPort]
 * หยุด:    ปิดหน้าต่าง/กด Ctrl+C (หรือให้ผู้ช่วย kill job)
 *
 * ⚠️ ไม่มีการยืนยันตัวตน — ใครอยู่ใน Wi-Fi เดียวกันก็เข้าถึงได้ ใช้ชั่วคราวแล้วปิด
 */
import net from 'node:net';

const LISTEN = Number(process.argv[2] || 64902);
const TARGET = Number(process.argv[3] || 64901);
const HOST = '127.0.0.1';

const server = net.createServer((client) => {
  const upstream = net.connect(TARGET, HOST);
  const cleanup = () => { try { client.destroy(); } catch (e) { /* ignore */ } try { upstream.destroy(); } catch (e) { /* ignore */ } };
  client.on('error', cleanup);
  upstream.on('error', cleanup);
  client.on('close', cleanup);
  upstream.on('close', cleanup);
  client.pipe(upstream);
  upstream.pipe(client);
  client.setNoDelay(true);
  upstream.setNoDelay(true);
});

server.listen(LISTEN, '0.0.0.0', () => {
  console.log(`[lan-proxy] http://0.0.0.0:${LISTEN} → ${HOST}:${TARGET}`);
});
server.on('error', (err) => {
  console.error('[lan-proxy] ผิดพลาด:', err.message);
  process.exit(1);
});
