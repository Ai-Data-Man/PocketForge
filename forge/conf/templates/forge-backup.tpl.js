// PocketForge backup: zip portable state into data/backups/, keep newest N.
// Sources: data/faucet data/sqlite data/js conf/goose/config + data/pg-dumps (s66: pg_dump 导出先行).
// Runs as pc-managed oneshot (e.g. daily via goose schedule or pc cron-like restart).
// Usage: node forge-backup.js <FORGE_ROOT> [keep=7]
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT = process.argv[2];
const KEEP = Number(process.argv[3] || 7);
const OUT_DIR = path.join(ROOT, 'data', 'backups');
const SOURCES = ['data/faucet', 'data/sqlite', 'data/js', 'conf/goose/config']
    .map(s => path.join(ROOT, s).replace(/\\/g, '/'))
    .filter(p => fs.existsSync(p)); // tolerate missing dirs (fresh install)

fs.mkdirSync(OUT_DIR, { recursive: true });

// s66 阶段二/ADR-0011 导出先行: 打包前 pg_dump(plain SQL, keep 3)。PG 不在场 = warn 一行，zip 照常产出。
// s73 切片1（裁决 2026-09-06-pg-forge-backend）: forge_bridge 库入每日备份链（防「备份链只护空库」）。
// 命名与轮换：postgres=pg-<ts>.sql、forge_bridge=pg-bridge-<ts>.sql，各自 keep 3；迁移留档 forge-bridge-pre-*.sql 归桥管，不在此轮换。
const pgPort = (() => { try { return fs.readFileSync(path.join(ROOT, 'data', 'pg.port'), 'utf8').trim(); } catch { return ''; } })();
const pgDumpExe = path.join(ROOT, 'bin', 'pg', 'bin', 'pg_dump.exe');
const dumpsDir = path.join(ROOT, 'data', 'pg-dumps');
// s92: 首启时序——备份与 PG/桥同时启动：①PG 尚未「开始接受连接」（recovery 窗口 ~0.1-3s）
// ②桥尚未建 forge_bridge。都是正常时序，等待优于跳过（备份链的价值=把 forge_bridge 备上）。
// 就绪判据=TCP 端口可连（pg-probe.js 同款语义）：**不得依赖 data/logs/pg.log 文件**——
// 实测受限令牌启动路径下该文件恒 0 字节（postgres 输出进 pc 日志缓冲/pc.log，F1 复盘 2026-09-15），
// 曾据此做就绪门导致门永不开 + 备份崩溃零产出（QA F1 阻断项）。
// 失败面：显式状态返回（'' 成功 / 非空=错误描述），耗尽窗口=信息级跳过且 exit 0，绝不抛异常。
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} }
// 同步等待端口打开（上限 waitMs）：复用同仓 bin/pg-probe.js（TCP 探活，FIN 半关零日志——s66/s67 先例）
function waitPgPort(waitMs) {
    const probe = path.join(ROOT, 'bin', 'pg-probe.js');
    const portFile = path.join(ROOT, 'data', 'pg.port');
    if (!fs.existsSync(probe)) return true; // 无探针文件=不设门（老包兼容）
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
        try {
            execFileSync(process.execPath, [probe, portFile], { stdio: 'pipe', timeout: 5000 });
            return true; // exit 0 = 端口可连
        } catch { sleepSync(1500); }
    }
    return false;
}
function pgDumpWithWait(db, dump, tries) {
    // 返回：'' = 成功；非空字符串 = 失败原因（不抛异常）
    if (!waitPgPort(30000)) return 'PG port not open within 30s';
    sleepSync(1500); // settle：端口监听 ≠ 接受连接（recovery 窗口实测 0.1-3s）——避开首个连接的瞬时拒绝
    const PgExe = path.join(ROOT, 'bin', 'pg', 'bin', 'psql.exe');
    // s93/F3: forge_bridge 由桥启动时创建（实测 +30s 左右）。盲试 pg_dump 每次失败都会让 postgres 记一条
    // FATAL（首启黑窗口刷 12 行假故障——QA 实测）。改为先用 psql 连 postgres 库**查库是否存在**
    // （该连接必然成功、零 FATAL），存在才 dump；窗口 20×2.5s=50s 覆盖桥建库。
    const dbKnown = db !== 'postgres' && fs.existsSync(PgExe);
    const maxTry = dbKnown ? 20 : tries;
    let lastMsg = '';
    for (let i = 0; i < maxTry; i++) {
        if (dbKnown) {
            let exists = false;
            try {
                const out = execFileSync(PgExe, ['-h', '127.0.0.1', '-p', pgPort, '-U', 'postgres', '-d', 'postgres', '-tAc',
                    `SELECT 1 FROM pg_database WHERE datname = '${db}'`], { stdio: 'pipe', timeout: 8000 }).toString().trim();
                exists = out === '1';
            } catch (e) {
                lastMsg = 'psql check failed: ' + ((e.stderr && e.stderr.toString().trim().split('\n')[0]) || e.message).slice(0, 120);
                sleepSync(2500);
                continue;
            }
            if (!exists) { lastMsg = 'db not created yet'; sleepSync(2500); continue; }
        }
        try {
            execFileSync(pgDumpExe, ['-h', '127.0.0.1', '-p', pgPort, '-U', 'postgres', '-d', db, '-Fp', '-f', dump], { stdio: 'pipe', timeout: 10000 });
            return '';
        } catch (e) {
            try { fs.unlinkSync(dump); } catch {} // best-effort: 中途断连/超时的残缺 sql 不随 zip 分发
            lastMsg = ((e.stderr && e.stderr.toString().trim().split('\n').pop()) || String(e.message).split('\n')[0]).trim();
            const transient = /not yet accepting connections|does not exist|the database system is starting up|server closed the connection|connection refused|starting up|terminating connection|recovery/i.test(lastMsg);
            if (!transient) return lastMsg;
            sleepSync(1500);
        }
    }
    return lastMsg || 'unknown';
}
if (pgPort && fs.existsSync(pgDumpExe)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.mkdirSync(dumpsDir, { recursive: true });
    for (const [db, name, rot] of [['postgres', `pg-${ts}.sql`, /^pg-\d.*\.sql$/], ['forge_bridge', `pg-bridge-${ts}.sql`, /^pg-bridge-.*\.sql$/]]) {
        const dump = path.join(dumpsDir, name);
        const err = pgDumpWithWait(db, dump, 12);
        if (!err && fs.existsSync(dump)) {
            const dumps = fs.readdirSync(dumpsDir).filter(f => rot.test(f)).sort();
            while (dumps.length > 3) fs.unlinkSync(path.join(dumpsDir, dumps.shift()));
            console.log(`pg_dump ok: ${name} (${(fs.statSync(dump).size / 1024).toFixed(0)}KB) kept=${dumps.length}`);
        } else {
            try { fs.unlinkSync(dump); } catch {}
            // fix(s100/pg-skip)/验收②分流：端口 30s 未开=非瞬态（pg 没起/Skipped 族，research/39 §4.3②）
            // →警告，不得再谎报「首启时序，正常」；psql/pg_dump 撞上的恢复期拒绝=真首启瞬态→信息级；
            // 其余=警告。三者都不中断备份链（exit 0）
            if (/not open within/i.test(err)) {
                console.warn(`pg_dump skipped: ${db} PG 端口 30s 未监听（非首启瞬态；pc 面板 pg 若为 Skipped 即未起，查 data/logs/open-when-ready.log），下次备份会带上`);
            } else if (!err || /does not exist|not yet accepting|starting up/i.test(err)) {
                console.log(`pg_dump skipped: ${db} 未就绪（首启时序，正常），下次备份会带上`);
            } else {
                console.warn(`pg_dump skipped: ${err}`);
            }
        }
    }
} else {
    console.warn('pg_dump skipped: PG not present (no bin/pg or data/pg.port)');
}
// 空 pg-dumps（首启 pg_dump 拒连 warn 后）不得入 SOURCES：PS5.1 Compress-Archive -Update
// 追加空目录会 exit 0 且删掉已生成 zip（s66 沙盒冷启实测，后续 statSync 必 ENOENT）。
if (fs.existsSync(dumpsDir) && fs.readdirSync(dumpsDir).some(f => /^pg-.*\.sql$/.test(f))) SOURCES.push(dumpsDir.replace(/\\/g, '/'));

if (SOURCES.length === 0) { console.log('nothing to back up'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.join(OUT_DIR, `forge-backup-${stamp}.zip`).replace(/\\/g, '/');

const first = SOURCES.shift();
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${first}' -DestinationPath '${out}' -Force"`, { stdio: 'pipe' });
for (const s of SOURCES) {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${s}' -DestinationPath '${out}' -Update"`, { stdio: 'pipe' });
}

// prune old (keep newest N)
const backups = fs.readdirSync(OUT_DIR).filter(f => f.startsWith('forge-backup-')).sort();
let removed = 0;
while (backups.length > KEEP) { fs.unlinkSync(path.join(OUT_DIR, backups.shift())); removed++; }

const size = fs.statSync(out).size;
console.log(`backup ok: ${path.basename(out)} (${(size/1024).toFixed(0)}KB) kept=${backups.length} pruned=${removed}`);
