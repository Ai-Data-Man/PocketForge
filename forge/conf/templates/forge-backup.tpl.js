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
// s92: 首启时序——备份与 PG/桥同时启动：①PG 尚未「开始接受连接」②桥尚未建 forge_bridge。
// 两者都是正常时序，等一会儿再来即可（备份链的价值恰在于把 forge_bridge 备上，故等待优于跳过）。
// 等待上限 ~40s（首启实测 PG ready <15s、桥建库 <25s）；仍不可用则按信息级跳过，绝不污染启动日志。
// 就绪门（零副作用）：先等 postgres 自己写下「ready to accept connections」再发第一个连接——
// 裸连接撞「尚未接受连接」会让 postgres 每次拒绝都记一条 FATAL（用户可见的假故障，E6 实测）。
function pgLogReady() {
    try {
        const t = fs.readFileSync(path.join(ROOT, 'data', 'logs', 'pg.log'), 'utf8');
        return /ready to accept connections/.test(t);
    } catch { return false; }
}
function pgDumpWithWait(db, dump, tries) {
    let lastMsg = '';
    for (let i = 0; i < tries; i++) {
        if (!pgLogReady()) {
            try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500); } catch {}
            continue;
        }
        try {
            execFileSync(pgDumpExe, ['-h', '127.0.0.1', '-p', pgPort, '-U', 'postgres', '-d', db, '-Fp', '-f', dump], { stdio: 'pipe', timeout: 10000 });
            return '';
        } catch (e) {
            try { fs.unlinkSync(dump); } catch {} // best-effort: 中途断连/超时的残缺 sql 不随 zip 分发
            lastMsg = ((e.stderr && e.stderr.toString().trim().split('\n').pop()) || String(e.message).split('\n')[0]).trim();
            const transient = /not yet accepting connections|does not exist|the database system is starting up|server closed the connection|connection refused|starting up|terminating connection/i.test(lastMsg);
            if (!transient) return lastMsg;
            // 同步睡眠（本脚本是 oneshot 同步流程；Atomics.wait 零子进程、零依赖）
            try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500); } catch {}
        }
    }
    return lastMsg;
}
if (pgPort && fs.existsSync(pgDumpExe)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.mkdirSync(dumpsDir, { recursive: true });
    for (const [db, name, rot] of [['postgres', `pg-${ts}.sql`, /^pg-\d.*\.sql$/], ['forge_bridge', `pg-bridge-${ts}.sql`, /^pg-bridge-.*\.sql$/]]) {
        const dump = path.join(dumpsDir, name);
        const err = pgDumpWithWait(db, dump, 12);
        if (!err) {
            const dumps = fs.readdirSync(dumpsDir).filter(f => rot.test(f)).sort();
            while (dumps.length > 3) fs.unlinkSync(path.join(dumpsDir, dumps.shift()));
            console.log(`pg_dump ok: ${name} (${(fs.statSync(dump).size / 1024).toFixed(0)}KB) kept=${dumps.length}`);
        } else if (/does not exist|not yet accepting connections|starting up/i.test(err)) {
            // 等待窗口内 PG/桥仍未就绪（如 PG 被禁用、桥首次建库更慢）：信息级，下次备份会带上。
            console.log(`pg_dump skipped: ${db} 未就绪（首启时序，正常），下次备份会带上`);
        } else {
            console.warn(`pg_dump skipped: ${err}`);
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
