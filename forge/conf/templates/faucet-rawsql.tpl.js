// PocketForge: enable raw_sql on all faucet services (ADR-0004 agent DDL channel)
// Runs with bundled node (>=22.5 has node:sqlite). Idempotent.
// s97/回归修复: 启动期与 faucet-provision 同条件并发写同一 faucet.db → SQLITE_BUSY 实录（pc.log errcode=5
// "database is locked"）；本进程 restart:'no' 无重试，永久 exit=1 → daily-backup depends_on 链整链 Skipped。
// 两层最小修（幂等语义不变，UPDATE 全表置 1）：busy_timeout=5000 锁上等待为主 + 3 次×1s 同步退避兜底
// （仅 ERR_SQLITE_ERROR errcode=5/6；sleepSync=forge-backup.tpl.js 同款）。
const { DatabaseSync } = require('node:sqlite');
const path = process.argv[2];
const db = new DatabaseSync(path);
db.exec('PRAGMA busy_timeout=5000');
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} }
for (let a = 1; ; a++) {
  try { db.exec("UPDATE services SET raw_sql_allowed = 1"); break; }
  catch (e) {
    if (e.code !== 'ERR_SQLITE_ERROR' || (e.errcode !== 5 && e.errcode !== 6) || a >= 3) throw e;
    console.error('faucet.db locked (attempt ' + a + '/3), retry in 1s: ' + e.errstr);
    sleepSync(1000);
  }
}
const n = db.prepare("SELECT count(*) c FROM services WHERE raw_sql_allowed = 1").get().c;
console.log('raw_sql enabled on', n, 'services');
