// PocketForge chat bridge v2: goose ACP (stdio JSON-RPC) <-> WebSocket browser client.
// Channel model: client `rpc` messages pass through to ACP; all ACP notifications
// broadcast to clients (tagged with sessionId). Plus convenience: session registry
// maps ws<->acp session for prompt routing. Zero deps (node built-ins).
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.FORGE_ROOT || path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8790);
// s50c: POST body 统一预算（照片/表格上传绰绰有余；防超大 body 撑爆内存）
const POST_MAX_BYTES = 50 * 1024 * 1024;
// s78-C1（research/24 §7）：POST body 读取助手——17 处累积样板收敛一处，s50c 防线逐字保留（累积超预算即断开）。
// 交付原始 Buffer：/api/upload 是二进制体，禁字符串往返；JSON.parse 留在各端点 try 内——坏 JSON 的报错文案逐端点不变。
function readJsonBody(req, res, cb) { // res 有意保留：17 处调用点为 (req,res,cb) 位置形态——中间实参非「多余尾部实参」，删参=cb 位灌入 res 致全部 POST 端点 end 时 TypeError 连接重置（s78c 全量红实锤后回滚）
    const chunks = [];
    let postBytes = 0; // s50c: 累积超预算即断开（content-length 可能缺省/分块）
    req.on('data', c => { postBytes += c.length; if (postBytes > POST_MAX_BYTES) { req.destroy(); return; } chunks.push(c); });
    req.on('end', () => cb(Buffer.concat(chunks)));
}
// s78-C1：JSON 200 响应助手——只替换「写头后紧跟 end」的成对现场；先写头再分支/多落点的现场保持原样（响应序不变形）
function json200(res, obj) { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
const GOOSE = path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe');
const PAGE = path.join(ROOT, 'conf', 'templates', 'chat.tpl.html');

function readSecrets(file) {
    const out = {};
    try {
        const raw = require('fs').readFileSync(file, 'utf8');
        for (const rawLine of raw.split('\n')) {
            const line = rawLine.trim();
            const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (m && m[2] !== '') out[m[1]] = m[2];
        }
    } catch {}
    return out;
}
const secrets = readSecrets(path.join(ROOT, 'data', 'secrets.env'));

// 真版本号（ADR-0009）：package.sh 打包时写入的 VERSION 是唯一真相源
const APP_VERSION = (() => { try { return require('fs').readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim() || 'dev'; } catch { return 'dev'; } })();

const MIME = { '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json','.csv':'text/csv; charset=utf-8' };

// ---- 制品版本管理（ADR-0007）：每会话一个工作区目录，isomorphic-git(MIT)，仓库在各自工作区内 ----
const ART_DIR = path.join(ROOT, 'data', 'artifacts');
const fsp = require('fs').promises;
const FSS = require('fs');

// 断电安全写：临时文件+rename，杜绝截断归零（审查 I7）
function atomicWrite(file, data) {
    const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
    FSS.writeFileSync(tmp, data);
    FSS.renameSync(tmp, file);
}

// 流式 sha256（离线升级校验用；大文件不整读进内存）
function sha256File(f) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        const s = FSS.createReadStream(f);
        s.on('data', c => h.update(c));
        s.on('end', () => resolve(h.digest('hex')));
        s.on('error', reject);
    });
}
// qa返工(P3-1): 上传分支错误人话化——fs 异常 message 携带绝对路径，直接回传即泄漏内部布局；err 换人话，type/code（若有）原样保留供诊断
function upErr(e, msg) { const o = { ok: false, err: msg }; const t = e && (e.type || e.code); if (t) o.type = t; return o; }

// v2→v3 一次性迁移：旧版散落文件 + 根级 .git → ws-imported/（历史保留）
(function migrateV3() {
    try {
        FSS.mkdirSync(ART_DIR, { recursive: true });
        const mark = path.join(ART_DIR, '.migrated-v3');
        if (FSS.existsSync(mark)) return;
        const entries = FSS.readdirSync(ART_DIR).filter(n => !n.startsWith('.') && !n.startsWith('ws-'));
        if (entries.length || FSS.existsSync(path.join(ART_DIR, '.git'))) {
            const dst = path.join(ART_DIR, 'ws-imported');
            FSS.mkdirSync(dst, { recursive: true });
            for (const n of entries) { try { FSS.renameSync(path.join(ART_DIR, n), path.join(dst, n)); } catch {} }
            try { if (FSS.existsSync(path.join(ART_DIR, '.git'))) FSS.renameSync(path.join(ART_DIR, '.git'), path.join(dst, '.git')); } catch {}
            console.log('migrated legacy artifacts ->', 'data/artifacts/ws-imported');
        }
        FSS.writeFileSync(mark, new Date().toISOString());
    } catch (e) { console.error('artifact migrate failed:', e.message); }
})();

// 会话库护栏：调度任务会话只留最新 20 条（s14 教训：daily-mem cron 误配 */2 刷出 1700+ 条，把真实对话挤出列表）
(function pruneScheduled() {
    try {
        const dbf = path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db');
        if (!FSS.existsSync(dbf)) return;
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(dbf);
        db.prepare("DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE session_type='scheduled' AND id NOT IN (SELECT id FROM sessions WHERE session_type='scheduled' ORDER BY created_at DESC LIMIT 20))").run();
        db.prepare("DELETE FROM sessions WHERE session_type='scheduled' AND id NOT IN (SELECT id FROM sessions WHERE session_type='scheduled' ORDER BY created_at DESC LIMIT 20)").run();
        // s30: 空壳 acp 会话修剪——无任何消息且存在超过 1 天的「New Chat」（探针/误开双击的残留），不进妻子列表
        const empty = db.prepare("DELETE FROM sessions WHERE session_type='acp' AND name='New Chat' AND created_at < datetime('now','-1 day') AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id = sessions.id)").run();
        if (empty.changes > 0) console.log('pruned', empty.changes, 'empty acp sessions');
        db.close();
    } catch (e) { console.error('prune scheduled failed:', e.message); }
})();
// s50e: strip UTF-8 BOM——记事本默认带 BOM 保存，不剥则 JSON.parse 抛错、配置"消失"
function readJson(f, dft) { try { return JSON.parse(FSS.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return dft; } }
// ---- P31-③ 匿名本地使用统计 v1：仅写本地 data/stats/usage-YYYYMMDD.json，无外传、无 UI ----
// permissionCards.timeout：前端 60s 超时兜底同样发 acp_reply（s71 G2 起为 reject_once），桥内按「回包距 shown ≥60s」判超时计 timeout（s75 口径修正）；存量旧文件按旧口径累计（denied 含超时拒绝），读侧不回改
// artifactsGenerated v1 恒 0：gen-xlsx 走 goose 扩展不经过桥，无侵入的工作区 diff 扫描代价大，先只占位
const STATS_DIR = path.join(ROOT, 'data', 'stats');
const S26_ERR_RE = /Ran into this error|Server error|rate limit|timed? out|ECONN|fetch failed|could not connect|network error/i; // 与前端 endStream(s26) 同款上游故障正则
const stats = { date: '', sessionsCreated: 0, messages: 0, errors: 0, errorsByType: { upstream: 0, websocket: 0, other: 0, upstreamByKind: { unauthorized: 0, rate: 0, timeout: 0, server: 0 } }, permissionCards: { shown: 0, approved: 0, denied: 0, timeout: 0 }, artifactsGenerated: 0, updated: '' };
function classifyUpstream(txt) { // s50e: 上游错误细分（401=Key 没配好，429=限流，超时，其余=服务端）；取第一个命中
    const s = String(txt || '');
    if (/401|api key|unauthorized/i.test(s)) return 'unauthorized';
    if (/rate limit|429/i.test(s)) return 'rate';
    if (/timed out|timeout/i.test(s)) return 'timeout';
    return 'server';
}
const permKinds = new Map(); // request_permission callId -> {m: optionId->kind, t: shown 时间戳}，供 acp_reply 分类+超时判定
const turnText = new Map();  // sessionId -> 当轮 agent 文本累计（s26 流内报错检测用）
const busySids = new Set();  // sessionId -> 有在飞 prompt/流式未收尾（主线5 rollback_rewrite 的 busy 门，桥侧权威）
function statsDay() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function statsFlush() {
    try {
        FSS.mkdirSync(STATS_DIR, { recursive: true });
        stats.updated = new Date().toISOString();
        atomicWrite(path.join(STATS_DIR, 'usage-' + stats.date.replace(/-/g, '') + '.json'), JSON.stringify(stats, null, 2));
    } catch {}
}
function statsBump(key) {
    try {
        const today = statsDay();
        if (stats.date !== today) { // 跨天：计数器归零、写新文件
            stats.date = today;
            stats.sessionsCreated = 0; stats.messages = 0; stats.errors = 0;
            stats.errorsByType = { upstream: 0, websocket: 0, other: 0, upstreamByKind: { unauthorized: 0, rate: 0, timeout: 0, server: 0 } };
            stats.permissionCards = { shown: 0, approved: 0, denied: 0, timeout: 0 };
            stats.artifactsGenerated = 0;
        }
        const seg = key.split('.'); const last = seg.pop();
        let o = stats; for (const s of seg) o = o[s];
        o[last] = (o[last] || 0) + 1;
        if (seg[0] === 'errorsByType') stats.errors++;
        statsFlushDebounced();
    } catch {}
}
// 响应性#7：statsBump 在 WS 消息路径上，原同步 writeFileSync+renameSync 磁盘抖动会冻住首帧——
// 改 2s 防抖合并 + fs.promises 异步写（统计非关键数据，丢一次 bump 可接受；内存计数即时、文件最终一致）
let statsFlushT = null;
function statsFlushDebounced() {
    if (statsFlushT) return;
    statsFlushT = setTimeout(() => {
        statsFlushT = null;
        stats.updated = new Date().toISOString();
        const file = path.join(STATS_DIR, 'usage-' + stats.date.replace(/-/g, '') + '.json');
        const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
        fsp.mkdir(STATS_DIR, { recursive: true })
            .then(() => fsp.writeFile(tmp, JSON.stringify(stats, null, 2)))
            .then(() => fsp.rename(tmp, file))
            .catch(() => { try { fsp.unlink(tmp).catch(() => {}); } catch {} });
        pgUsageFlush(); // 存储层落点：pg 态双写 forge_bridge；file/off 态纯文件（现状）并 lazy 触发首连
    }, 2000);
    if (statsFlushT.unref) statsFlushT.unref();
}
(function statsRestore() { // 桥重启恢复当天计数；当天尚无文件则先落一个初始文件
    try {
        stats.date = statsDay();
        const f = path.join(STATS_DIR, 'usage-' + stats.date.replace(/-/g, '') + '.json');
        const saved = readJson(f, null);
        if (saved && saved.date === stats.date) {
            for (const k of ['sessionsCreated', 'messages', 'errors', 'errorsByType', 'permissionCards', 'artifactsGenerated']) {
                if (saved[k] !== undefined) stats[k] = saved[k];
            }
            if (!stats.errorsByType.upstreamByKind) stats.errorsByType.upstreamByKind = { unauthorized: 0, rate: 0, timeout: 0, server: 0 }; // s50e: 旧格式当天文件补默认
            stats.updated = saved.updated || '';
        } else statsFlush();
    } catch {}
})();

// ---- 桥状态存储层（裁决 2026-09-06-pg-forge-backend §4）：桥内唯一 PG 触点 ----
// 模式机 off→connecting→pg|file：pg=写 forge_bridge+文件镜像双写（回落无缝）；file=纯文件（与切片前逐位一致，永久支持态）；
// off=树内无 PG（不探测、无人话）。lazy：首个防抖 flush 触发首连 + 30s 后台重探（unref）；connect_timeout 2s（research/10 实测语义）。
// 硬线：桥启动绝不等待 PG（pc 编排零 depends_on 不变）；连接/迁移/写入错误全部 catch 降级，绝不抛进主流程。
// PF_PG_PORT：测试专用端口覆盖（fuzz 假端口路径，不真停 pg）。
const PG_PORT_FILE = path.join(ROOT, 'data', 'pg.port');
// PF_PG_DB：测试专用库名隔离（fuzz P3-4 探针用独立库+独立 FORGE_ROOT，不碰共享数据；沿 PF_PG_PORT 先例）。产品路径恒 forge_bridge。
const PG_DB_NAME = /^forge_[a-z0-9_]{1,50}$/.test(process.env.PF_PG_DB || '') ? process.env.PF_PG_DB : 'forge_bridge';
const PG_DUMPS_DIR = path.join(ROOT, 'data', 'pg-dumps');
const PG_DUMP_EXE = path.join(ROOT, 'bin', 'pg', 'bin', 'pg_dump.exe');
// 代码侧 MIGRATIONS 注册表（phase-2 §5）：forward-only、事务包裹、apply 前 pg_dump 留档；库版本新于代码=拒写
const PG_MIGRATIONS = [
    { v: 1, name: 'usage_daily', sql: 'CREATE TABLE IF NOT EXISTS usage_daily (date text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())' },
    // s73 切片2（裁决 2026-09-06-pg-forge-backend §7-切片2）: 无界增长族两表——自然键主键，业务时间戳列 + 行级 updated_at（P3-4 对账的方向依据）
    { v: 2, name: 'forge_archive_index', sql: 'CREATE TABLE IF NOT EXISTS forge_archive_index (sid text PRIMARY KEY, archived_at bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())' },
    { v: 3, name: 'forge_workspace_map', sql: 'CREATE TABLE IF NOT EXISTS forge_workspace_map (ws text PRIMARY KEY, sid text NOT NULL, bound_at bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())' },
];
const pgStore = { mode: 'off', sql: null, blocked: false };
function pgPort() {
    const p = Number(process.env.PF_PG_PORT) || 0;
    if (p > 0) return p;
    try { const v = Number(FSS.readFileSync(PG_PORT_FILE, 'utf8').trim()); return v > 0 ? v : 0; } catch { return 0; }
}
function pgExpected() { try { return FSS.statSync(path.join(ROOT, 'data', 'pg', 'PG_VERSION')).isFile(); } catch { return false; } }
const PG_WARN = '数据库存储：';
function pgWarn(text) { // 维护唯一一条 PG 人话（text=null 撤除；「正在用/没连上」两态，裁决 §7 切片1）
    for (let i = stateWarnings.length - 1; i >= 0; i--) if (stateWarnings[i].indexOf(PG_WARN) === 0) stateWarnings.splice(i, 1);
    if (text) stateWarnings.push(text);
}
function pgClose() {
    const s = pgStore.sql; pgStore.sql = null;
    if (s) { try { s.end({ timeout: 1 }).catch(() => {}); } catch {} }
}
function pgDowngrade(warn) { // 任何失败→file 态（现状行为），30s 重探自愈
    pgStore.mode = 'file';
    pgClose();
    pgWarn(warn);
    console.warn(warn);
}
function pgErrWarn(e) { // 失败原因人话化（不泄漏连接串/内部路径）
    const msg = String((e && e.message) || e || '');
    if (/DB_VERSION_NEWER/.test(msg)) return PG_WARN + '数据库由更新版本创建，为防数据损坏已用本地文件保存';
    if (/PG_DUMP_FAILED/.test(msg)) return PG_WARN + '没做成数据库备份，暂不改动数据库，已用本地文件保存，稍后自动重试';
    if (/MIGRATE_FAILED/.test(msg)) return PG_WARN + '数据库表结构不对，已用本地文件保存，稍后自动重试';
    const code = String((e && e.code) || '');
    if (code === 'ECONNREFUSED' || /CONNECT_TIMEOUT|ETIMEDOUT|ECONNRESET|Connection terminated/i.test(msg)) return PG_WARN + '没连上数据库，已用本地文件保存，恢复后自动切回';
    return PG_WARN + '数据库暂时用不了，已用本地文件保存，稍后自动重试';
}
function pgDumpBefore() { // 导出先行：迁移 apply 前 pg_dump forge_bridge 到 data/pg-dumps（keep 3，与每日备份同目录同轮换语义）
    return new Promise(resolve => {
        const port = pgPort();
        if (!port || !FSS.existsSync(PG_DUMP_EXE)) return resolve(false);
        let file = '';
        try {
            FSS.mkdirSync(PG_DUMPS_DIR, { recursive: true });
            file = path.join(PG_DUMPS_DIR, 'forge-bridge-pre-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.sql');
            require('child_process').execFile(PG_DUMP_EXE, ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'forge_bridge', '-Fp', '-f', file], { timeout: 10000, windowsHide: true }, err => {
                if (err) { try { FSS.unlinkSync(file); } catch {} return resolve(false); } // 残缺 dump 不留
                try {
                    const olds = FSS.readdirSync(PG_DUMPS_DIR).filter(f => /^forge-bridge-pre-.*\.sql$/.test(f)).sort();
                    while (olds.length > 3) FSS.unlinkSync(path.join(PG_DUMPS_DIR, olds.shift()));
                } catch {}
                resolve(true);
            });
        } catch { resolve(false); }
    });
}
async function pgMigrate(sql, freshDb) { // schema_migrations 注册表（version,name,applied_at）+ 有序幂等 apply
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const rows = [...await sql`SELECT version FROM schema_migrations ORDER BY version`];
    const dbMax = rows.length ? Number(rows[rows.length - 1].version) : 0;
    if (dbMax > PG_MIGRATIONS.length) { pgStore.blocked = true; throw new Error('DB_VERSION_NEWER'); } // 倒挂：拒写且不再重试
    const applied = new Set(rows.map(r => Number(r.version)));
    if (!PG_MIGRATIONS.some(m => !applied.has(m.v))) return;
    if (!freshDb && !(await pgDumpBefore())) throw new Error('PG_DUMP_FAILED'); // 导出先行失败=本次不 apply
    for (const m of PG_MIGRATIONS) {
        if (applied.has(m.v)) continue;
        try {
            await sql.begin(async t => {
                await t.unsafe(m.sql);
                await t`INSERT INTO schema_migrations (version, name) VALUES (${m.v}, ${m.name}) ON CONFLICT (version) DO NOTHING`;
            });
        } catch (e) { throw new Error('MIGRATE_FAILED: ' + ((e && e.message) || e)); }
    }
}
function pgUsageWrite() { // pg 态写路径：日聚合一行 UPSERT（payload=stats 全对象，贴现有形状）
    const sql = pgStore.sql;
    if (!sql || pgStore.mode !== 'pg' || !stats.date) return;
    // 注意：参数须传对象——postgres.js 对 ::jsonb 显式转型的字符串会再包一层引号（双编码，实测）；对象直传由驱动自动 JSON 化
    sql`INSERT INTO usage_daily (date, payload) VALUES (${stats.date}, ${stats}) ON CONFLICT (date) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`
        .catch(e => { console.warn('pg usage write failed:', (e && e.message) || e); pgDowngrade(pgErrWarn(e)); });
}
function pgUsageBackfill() { // pg 态确立后台一次：当日内存与 PG 逐计数器取大者合并 + 存量文件幂等导入
    // P3-4 实修（s73 切片2，qa 强制）：当日行不再无条件 DO UPDATE——崩溃前 PG 已落、文件未落的计数会被旧内存冲掉。
    // 当日计数日内单调（跨天归零由 statsBump 管），取大者合并使两侧都不回退：PG 较新→收编，内存较新（防抖未落）→保留。
    const sql = pgStore.sql;
    if (!sql) return;
    (async () => {
        try {
            const today = [...await sql`SELECT payload FROM usage_daily WHERE date = ${stats.date}`];
            const p = (today.length && today[0].payload && typeof today[0].payload === 'object') ? today[0].payload : null;
            if (p) {
                const mx = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
                stats.sessionsCreated = mx(stats.sessionsCreated, p.sessionsCreated);
                stats.messages = mx(stats.messages, p.messages);
                stats.errors = mx(stats.errors, p.errors);
                stats.artifactsGenerated = mx(stats.artifactsGenerated, p.artifactsGenerated);
                for (const k of ['upstream', 'websocket', 'other']) stats.errorsByType[k] = mx(stats.errorsByType[k], (p.errorsByType || {})[k]);
                for (const k of ['unauthorized', 'rate', 'timeout', 'server']) stats.errorsByType.upstreamByKind[k] = mx(stats.errorsByType.upstreamByKind[k], ((p.errorsByType || {}).upstreamByKind || {})[k]);
                for (const k of ['shown', 'approved', 'denied', 'timeout']) stats.permissionCards[k] = mx(stats.permissionCards[k], (p.permissionCards || {})[k]);
                console.log('pg usage backfill: max-merged today row (P3-4)');
            }
            await sql`INSERT INTO usage_daily (date, payload) VALUES (${stats.date}, ${stats}) ON CONFLICT (date) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
            let n = 0;
            for (const f of FSS.readdirSync(STATS_DIR).filter(f => /^usage-\d{8}\.json$/.test(f)).sort()) {
                const j = readJson(path.join(STATS_DIR, f), null);
                if (!j || typeof j.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(j.date)) continue;
                await sql`INSERT INTO usage_daily (date, payload) VALUES (${j.date}, ${j}) ON CONFLICT (date) DO NOTHING`; // 幂等：已入库日期绝不回退
                n++;
            }
            console.log('pg usage backfill ok (' + n + ' files)');
        } catch (e) { console.warn('pg usage backfill failed:', (e && e.message) || e); }
    })();
}
function pgUsageFlush() { // statsFlushDebounced 的存储层落点：pg=双写 forge_bridge；file/off=纯文件（现状）并 lazy 触发首连
    if (pgStore.mode === 'pg') return pgUsageWrite();
    if (pgStore.mode === 'off' && pgExpected()) pgTryConnect(); // lazy：首次写用时连（file 态重试只走 30s 重探，不随 flush 加压）
}

// ---- PG 切片2（裁决 2026-09-06-pg-forge-backend §7-切片2）：无界增长族迁 PG——会话归档索引+工作区映射 ----
// 读写口径（任务取舍，见汇报）：读=文件不变（write-through 下文件恒新鲜，读路径永不碰 PG）；写=文件先行（唯一真相）
// + pg 态整表同步 PG（权威备份位；读写全切换挂切片 3）。file/off 态=纯文件，行为与切片前逐位一致。
// P3-4 护栏（qa 强制）：导入/回迁绝不无条件覆盖 PG 较新行——
//   双方都有该键：比业务时间戳（归档 archived_at / 映射 bound_at），PG 较新→文件收编，文件较新→回迁 PG；
//   仅 PG 有该键：文件 mtime ≥ 行 updated_at → 文件态期间已删，PG 行随之删（§4 整体 upsert 方向）；PG 较新（文件被旧备份还原等）→收编。
// 并发安全：收编只叠加键且仅当文件现值仍较旧（用户并发写不丢不回退）；整表同步在执行时重读文件（永远同步当下真相）。
const pgStateQ = { arch: Promise.resolve(), wsmap: Promise.resolve() }; // 每表一条串行队列：对账先于其后任何用户同步
function pgStateFileRows(kind, rawIn) { // 文件对象 → {自然键: {ts, val}}（过滤 _schema 等非业务键；坏形状行跳过不迁）
    let raw = rawIn;
    if (raw === undefined) raw = readJson(kind === 'arch' ? ARCH_FILE : WSMAP_FILE, {});
    const out = {};
    for (const k of Object.keys(raw || {})) {
        if (kind === 'arch') {
            if (k === '_schema' || !sidValid(k)) continue; // 注意 '_schema' 恰好匹配 sidValid，须显式排除
            const ts = Number(raw[k]);
            if (ts > 0) out[k] = { ts, val: ts };
        } else {
            if (!wsValidId(k)) continue; // _schema 等元键天然不匹配 ws-* 形状
            const v = raw[k] || {};
            if (!sidValid(v.sid)) continue;
            const ts = Number(v.boundAt);
            out[k] = { ts: ts > 0 ? ts : 0, val: { sid: v.sid, boundAt: ts > 0 ? ts : 0 } };
        }
    }
    return out;
}
function pgStateSyncNow(kind) { // 整表同步：PG 表=当前文件（全量替换、事务包裹、幂等；执行时取 pgStore.sql 与文件最新态）
    const sql = pgStore.sql;
    if (!sql || pgStore.mode !== 'pg') return Promise.resolve();
    const rows = pgStateFileRows(kind);
    const keys = Object.keys(rows);
    return sql.begin(async t => {
        if (kind === 'arch') {
            await t`DELETE FROM forge_archive_index`;
            for (const sid of keys) await t`INSERT INTO forge_archive_index (sid, archived_at) VALUES (${sid}, ${rows[sid].ts})`;
        } else {
            await t`DELETE FROM forge_workspace_map`;
            for (const ws of keys) await t`INSERT INTO forge_workspace_map (ws, sid, bound_at) VALUES (${ws}, ${rows[ws].val.sid}, ${rows[ws].val.boundAt})`;
        }
    });
}
function pgStateSync(kind) { // 双写漏斗挂点（writeArch/writeWsMap）：pg=排队整表同步；off=懒触发首连（与 usage 同一 lazy 策略）；file/connecting=纯文件
    if (pgStore.mode === 'pg') {
        pgStateQ[kind] = pgStateQ[kind].then(() => pgStateSyncNow(kind)).catch(e => {
            console.warn('pg ' + kind + ' sync failed:', (e && e.message) || e);
            pgDowngrade(pgErrWarn(e)); // 同步失败=PG 异常→回落文件（文件是真相，无损；30s 重探自愈后由对账补齐）
        });
    } else if (pgStore.mode === 'off' && pgExpected()) pgTryConnect();
}
function pgStateReconcile(kind) { // pg 态确立后台一次（入队，先于其后任何用户同步）：存量幂等导入+P3-4 对账
    pgStateQ[kind] = pgStateQ[kind].then(async () => {
        const sql = pgStore.sql;
        if (!sql || pgStore.mode !== 'pg') return;
        const file = kind === 'arch' ? ARCH_FILE : WSMAP_FILE;
        const rows = pgStateFileRows(kind);
        let fileMs = 0; try { fileMs = FSS.statSync(file).mtimeMs; } catch {}
        const pgRows = kind === 'arch'
            ? [...await sql`SELECT sid, archived_at, updated_at FROM forge_archive_index`]
            : [...await sql`SELECT ws, sid, bound_at, updated_at FROM forge_workspace_map`];
        const key = kind === 'arch' ? 'sid' : 'ws';
        const adopted = []; // [自然键, 收编行]——PG 较新者不回退，写回文件
        for (const r of pgRows) {
            const k = r[key];
            const ts = Number(kind === 'arch' ? r.archived_at : r.bound_at) || 0;
            const f = rows[k];
            const val = kind === 'arch' ? ts : { sid: r.sid, boundAt: ts };
            if (f) { if (ts > f.ts) adopted.push([k, { ts, val }]); } // 双方都有：文件较新→下方全量同步回迁；PG 较新→收编
            else if (fileMs < new Date(r.updated_at).getTime()) adopted.push([k, { ts, val }]); // 仅 PG 有且 PG 较新→收编（P3-4）；文件较新=已删→全量同步自会删该行
        }
        if (adopted.length) { // 收编写回文件：只叠加/仅当现值仍较旧才覆盖（并发用户写不丢）；绕过双写漏斗——本就在 PG 队列内，随后全量同步把同一状态写回 PG（幂等）
            const cur = readJson(file, {});
            for (const [k, a] of adopted) {
                const cv = cur[k];
                const curTs = kind === 'arch' ? Number(cv) : Number(cv && cv.boundAt);
                if (!(curTs > a.ts)) cur[k] = a.val;
            }
            try { FSS.mkdirSync(path.dirname(file), { recursive: true }); atomicWrite(file, JSON.stringify(cur, null, 2)); } catch {}
        }
        console.log('pg ' + kind + ' reconcile: file=' + Object.keys(rows).length + ' pg=' + pgRows.length + ' adopted=' + adopted.length);
        await pgStateSyncNow(kind); // 全量对齐 PG=文件：仅文件有的行在此导入（存量幂等导入；对账确定性=幂等，重跑零变化）
    }).catch(e => { console.warn('pg ' + kind + ' reconcile failed:', (e && e.message) || e); });
}
function pgTryConnect() {
    const port = pgPort();
    if (!port) return pgDowngrade(PG_WARN + '没找到数据库端口，已用本地文件保存');
    pgStore.mode = 'connecting';
    (async () => {
        let boot = null;
        try {
            const postgres = require(path.join(ROOT, 'bin', 'vendor', 'pgstore', 'node_modules', 'postgres')); // 3.4.9 vendored 零依赖（research/10 VERIFIED-RUN）
            boot = postgres({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', max: 1, connect_timeout: 2 });
            const have = [...await boot`SELECT 1 FROM pg_database WHERE datname = ${PG_DB_NAME}`];
            let fresh = false;
            if (!have.length) { await boot.unsafe('CREATE DATABASE ' + PG_DB_NAME); fresh = true; } // doctrine：每应用一库 forge_<app>（PG_DB_NAME 已白名单校验）
            await boot.end({ timeout: 1 }); boot = null;
            const sql = postgres({ host: '127.0.0.1', port, user: 'postgres', database: PG_DB_NAME, max: 1, connect_timeout: 2 });
            await sql`SELECT 1`; // postgres.js lazy 建连：首查询才真连
            await pgMigrate(sql, fresh);
            pgStore.sql = sql; pgStore.mode = 'pg';
            pgWarn(PG_WARN + '正在用 PostgreSQL');
            console.log('pg store ready: ' + PG_DB_NAME + ' on 127.0.0.1:' + port);
            pgUsageBackfill();
            pgStateReconcile('arch');
            pgStateReconcile('wsmap');
        } catch (e) {
            if (boot) { try { await boot.end({ timeout: 1 }); } catch {} }
            pgDowngrade(pgErrWarn(e));
        }
    })().catch(() => { pgDowngrade(pgErrWarn(null)); });
}
// 30s 后台重探（unref；pg 态空转，file 态自愈重连；树内无 PG 时 off 态恒静默）
setInterval(() => {
    if (pgStore.blocked || pgStore.sql || pgStore.mode === 'connecting' || !pgExpected()) return;
    pgTryConnect();
}, 30000).unref();
// ---- 状态 schema 迁移管线（ADR-0009）：自描述 _schema + 顺序幂等步骤 + 迁移前留档 ----
// qa返工(P2-2): 第二源内置默认（62c7e54 市场文案已承诺双源）——首启生成即双源；迁移步骤与 okSrc 共用同一定义（单一真相源，置于 STATE_SCHEMAS 之前避开 TDZ）
const BAOYU_SKILLS = { repo: 'JimLiu/baoyu-skills', branch: 'main', subdir: 'skills' };
const SKILL_REPO_RE = /^[\w.\-]+\/[\w.\-]+$/, SKILL_BRANCH_RE = /^[\w.\-/]+$/; // 源串拼进 GitHub URL，与目录名白名单同门（原 readSkillSources 内联正则上提）
const stateWarnings = [];
const STATE_SCHEMAS = {
    'workspace-map.json': { latest: 1, steps: {} },
    'session-archive.json': { latest: 1, steps: {} },
    'prompts.json': { latest: 1, steps: {} }, // 用户五主线批2-主线1: 手工收藏制提示词库（裁决 2026-09-08-user-five-lines-batch2 §2.2）
    '.forge': { latest: 1, steps: {} },
    // s70 切片B: manifest v2 = 条目补 source{repo,branch}（存量默认 anthropics/skills；步骤内用字面量——迁移 IIFE 跑在下方 REMOTE_SKILLS 初始化之前，引用常量会 TDZ）
    'cache/skills/manifest.json': {
        latest: 2,
        steps: { 2: m => { if (m && Array.isArray(m.skills)) for (const s of m.skills) if (s && !s.source) s.source = { repo: 'anthropics/skills', branch: 'main' }; return m; } },
    },
    'skills/origin.json': { latest: 1, steps: {} }, // s70 切片A: 技能来源标记（.agents/skills/<dir>/origin.json，下方随 .forge 先例逐目录迁移）
    // s70 切片B: 技能市场源配置（缺失时由 readSkillSources 首启生成内置默认）。
    // qa返工(P2-2): latest 2 = 存量升级补第二源 baoyu——仅当文件当前无此条目且至少一条合法源（坏配置不追加、条目原样，走回落容错）；
    // 幂等：升至 _schema:2 后重启早退。边界：无法区分「从未有过/用户已删」，升级会补回一次，用户再删不复活
    'config/skill-sources.json': {
        latest: 2,
        steps: {
            2: j => {
                if (!j || !Array.isArray(j.sources)) return j;
                const ok = s => s && typeof s.repo === 'string' && SKILL_REPO_RE.test(s.repo) && typeof s.branch === 'string' && SKILL_BRANCH_RE.test(s.branch) && (s.subdir === undefined || subdirSafe(s.subdir));
                if (!j.sources.some(ok)) return j;
                if (!j.sources.some(s => s && s.repo === BAOYU_SKILLS.repo)) j.sources.push({ ...BAOYU_SKILLS, enabled: true });
                return j;
            },
        },
    },
    'config/mcp-catalog.json': { latest: 1, steps: {} }, // s70 切片C: MCP 目录配置（缺失时由 readMcpCatalog 首启生成内置默认）
};
function migrateJsonAt(f, key) {
    const meta = STATE_SCHEMAS[key];
    if (!meta) return;
    let j = readJson(f, undefined); if (j === undefined) return; // let: 迁移步骤返回新对象需重绑（s70 切片B 首个实步骤函数实锤，const 为潜伏缺陷）
    let v = (typeof j._schema === 'number') ? j._schema : 0;
    if (v > meta.latest) { stateWarnings.push(key + ' 由更新版本创建(schema ' + v + ' > ' + meta.latest + ')，已保持原样'); return; }
    if (v === meta.latest) return;
    try { FSS.copyFileSync(f, f + '.pre-migration-' + Date.now()); } catch {}
    while (v < meta.latest) { v++; const step = meta.steps[v]; if (step) j = step(j); }
    try { j._schema = meta.latest; atomicWrite(f, JSON.stringify(j, null, 2)); } catch {}
}
(function migrateAllState() {
    for (const rel of Object.keys(STATE_SCHEMAS)) migrateJsonAt(path.join(ROOT, 'data', rel), rel);
    try {
        for (const ent of FSS.readdirSync(ART_DIR, { withFileTypes: true })) {
            if (ent.isDirectory()) migrateJsonAt(path.join(ART_DIR, ent.name, '.forge'), '.forge');
        }
    } catch {}
    try { // s70: 技能来源标记逐目录迁移（同 .forge 先例）
        for (const ent of FSS.readdirSync(path.join(ROOT, '.agents', 'skills'), { withFileTypes: true })) {
            if (ent.isDirectory()) migrateJsonAt(path.join(ROOT, '.agents', 'skills', ent.name, 'origin.json'), 'skills/origin.json');
        }
    } catch {}
})();

// 清掉旧约定残留的空 uploads/ 目录（P29b：上传位置由用户定，默认根目录）
(function pruneEmptyUploads() {
    try {
        for (const ent of FSS.readdirSync(ART_DIR, { withFileTypes: true })) {
            if (!ent.isDirectory() || !wsValidId(ent.name)) continue;
            const u = path.join(ART_DIR, ent.name, 'uploads');
            try { if (FSS.existsSync(u) && FSS.readdirSync(u).length === 0) FSS.rmdirSync(u); } catch {}
        }
    } catch {}
})();

function wsValidId(id) { return /^ws-[0-9]{4}-[0-9]{6}[a-z]*$/.test(String(id || '')) || String(id || '') === 'ws-imported'; }
// s34: sid 白名单——goose 原生 sid 形如 20260827_26；放行字母数字/_/-，杜绝任意串进 workspace-map
function sidValid(sid) { return typeof sid === 'string' && /^[\w\-]{1,128}$/.test(sid); }
// s37: Windows 保留设备名（con/nul/aux/com1-9/lpt1-9…）——建成文件后资源管理器/cmd 均无法删除
const WIN_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9]|com¹|com²|com³|lpt¹|lpt²|lpt³)$/i;
function fileNameSafe(name) {
    if (WIN_RESERVED_RE.test(String(name).replace(/\.[^.]*$/, ''))) return false;
    return true;
}
function wsDir(id) { return path.join(ART_DIR, id); }
function wsNewId() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    let id = 'ws-' + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    while (FSS.existsSync(wsDir(id))) id += 'x';
    return id;
}
const WSMAP_FILE = path.join(ROOT, 'data', 'workspace-map.json');
function readWsMap() { return readJson(WSMAP_FILE, {}); }
function writeWsMap(m) { FSS.mkdirSync(path.dirname(WSMAP_FILE), { recursive: true }); atomicWrite(WSMAP_FILE, JSON.stringify(m, null, 2)); pgStateSync('wsmap'); } // s73 切片2: 文件先行 + pg 态整表同步镜像

// ---- 工作区元数据(.forge,ADR-0008):附件身份等语义信息与存放路径解耦 ----
function forgeFile(ws) { return path.join(wsDir(ws), '.forge'); }
function readForgeMeta(ws) { return readJson(forgeFile(ws), {}); }
function writeForgeMeta(ws, meta) { try { atomicWrite(forgeFile(ws), JSON.stringify(meta, null, 2)); } catch {} }

// ---- 会话归档(data/session-archive.json):纯 UI 生命周期态 ----
const ARCH_FILE = path.join(ROOT, 'data', 'session-archive.json');
function readArch() { return readJson(ARCH_FILE, {}); }
function writeArch(m) { FSS.mkdirSync(path.dirname(ARCH_FILE), { recursive: true }); atomicWrite(ARCH_FILE, JSON.stringify(m, null, 2)); pgStateSync('arch'); } // s73 切片2: 文件先行 + pg 态整表同步镜像
function wsState(id, map, arch, sid, files, meta) {
    if (!sid) return 'orphan';
    if (arch[sid]) return 'archived';
    // 空工作区+零消息会话 = 噪音（页面调试/废弃会话残留），归「未关联」，默认视图不出现
    const mc = meta.msgCount.get(sid) || 0;
    if (files === 0 && mc === 0) return 'orphan';
    return 'active';
}
// 每次列举时读一次会话库：拿到标题(命名=会话名)与消息数(活跃判定)
function sessionMeta() {
    const meta = { bySid: new Map(), msgCount: new Map() };
    try {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db'));
        for (const r of db.prepare('SELECT id, name FROM sessions').all()) meta.bySid.set(r.id, r.name || null);
        for (const r of db.prepare('SELECT session_id, count(*) c FROM messages GROUP BY session_id').all()) meta.msgCount.set(r.session_id, Number(r.c) || 0);
        db.close();
    } catch {}
    return meta;
}

let _git = null;
function ig() {
    if (!_git) _git = require(path.join(ROOT, 'bin', 'vendor', 'artifact-vcs', 'node_modules', 'isomorphic-git'));
    return _git;
}
function vcsRepoReady(root) {
    try { FSS.statSync(path.join(root, '.git')); return true; } catch { return false; }
}
async function vcsEnsureRepo(root) {
    if (!(await vcsRepoReady(root))) await ig().init({ fs: fsp, dir: root, defaultBranch: 'main' });
}
function vcsSafeRel(p) {
    const rel = String(p || '').split(String.fromCharCode(92)).join('/');
    if (!rel || rel.includes('..') || rel.includes(':') || rel.startsWith('/')) return null;
    return rel;
}
async function vcsSnapshot(root, rel, msg) {
    await vcsEnsureRepo(root);
    await ig().add({ fs: fsp, dir: root, filepath: rel });
    return ig().commit({ fs: fsp, dir: root, message: msg || ('更新 ' + rel), author: { name: '小forge', email: 'forge@local' } });
}
async function vcsLog(root, rel) {
    if (!(await vcsRepoReady(root))) return [];
    try {
        const logs = await ig().log({ fs: fsp, dir: root, filepath: rel });
        return logs.map(l => ({ oid: l.oid.slice(0, 10), msg: String(l.commit.message || '').trim().split('\n')[0], ts: l.commit.author.timestamp }));
    } catch { return []; }
}
async function vcsFullOid(root, oid) {
    if (String(oid).length === 40) return oid;
    return ig().expandOid({ fs: fsp, dir: root, oid });
}
function vcsTime(ts) {
    const d = new Date(ts * 1000), p = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// ---- provider profiles (data/providers.json v2): [{name,host,key,models[],active}] ----
const PROV_FILE = path.join(ROOT, 'data', 'providers.json');
function providersFrom(list) { // v1->v2 迁移+形状兜底（纯函数核：同步/异步读共用同一真相，裁决 provider-health-probe S1）
    if (!Array.isArray(list)) return []; // B4: 合法 JSON 但非数组（如 {}）——for..of 会崩整份报告，兜底空表
    // v1->v2 迁移：model(单值) -> models(数组)
    for (const p of list) {
        if (!Array.isArray(p.models)) p.models = p.model ? [p.model] : [];
        delete p.model;
    }
    return list;
}
function readProviders() { return providersFrom(readJson(PROV_FILE, [])); }
async function readProvidersAsync() { // 探测路径禁同步 IO（research/09 #7）——异步读同一文件同一解析
    try { return providersFrom(JSON.parse((await fsp.readFile(PROV_FILE, 'utf8')).replace(/^\uFEFF/, ''))); }
    catch { return []; }
}
function writeProviders(list) { atomicWrite(PROV_FILE, JSON.stringify(list, null, 2)); };
function activeProvider() {
    const list = readProviders();
    return list.find(p => p.active) || null;
}

// ---- 裁决 2026-09-12-provider-health-probe S1/S2: provider 直连健康探测 ----
// 单次 GET {host}/models（零 token）；只读信号——不写 upstream 计数、不触发任何自动动作（s50e 边界原样有效）。
// 状态机：down / down+key(401/403) / stale-model(200 且当前模型名∉活列表，事故二形态) / ok；未配置不探（key-guide 独占，s51d）。
const HEALTH_TTL = 30 * 60 * 1000; // 内存缓存 TTL；零持久化（重启即重探）；providers save/activate/跨档 switch 后失效
const healthCache = { at: 0, state: null, kind: null, proxy: false };
let healthBusy = false, healthFailT = null, healthPend = false;
async function healthTargets() { // 同源铁律：与 spawnAcp env 链（active 档→secrets→process.env 三级回落）逐位同读法，防「探 A 用 B」
    const act = (await readProvidersAsync()).find(p => p.active) || null;
    return {
        host: ((act && act.host) || secrets.FORGE_AGENT_HOST || process.env.OPENAI_HOST || '').replace(/\/$/, ''),
        key: (act && act.key) || secrets.FORGE_AGENT_API_KEY || process.env.OPENAI_API_KEY || '',
        model: (act && act.models && act.models[0]) || secrets.GOOSE_MODEL_NAME || '', // 与 :610 回落链同款（主控拍板：无死名字面量）
    };
}
function healthFrame() {
    if (!healthCache.state) return null;
    const f = { sys: 'health', state: healthCache.state };
    if (healthCache.kind) f.kind = healthCache.kind;
    if (healthCache.proxy) f.proxy = true;
    return f;
}
async function probeProviderHealth(reply) { // qa s78b P1-1: reply=触发方 ws——态不变也要必答（hello 过期重探/turn 失败复检的客户端不再零健康帧）；广播仍只在态变化时全员发
    if (healthBusy) { healthPend = true; return; } // 在飞合并：忙期来电记一笔，收尾补探——save 失效不被在飞旧探吞掉（修复后最长 30min 不刷新的竞态）
    healthBusy = true;
    try {
        const t = await healthTargets();
        if (!t.host || !t.model) { healthCache.state = null; healthCache.kind = null; healthCache.at = Date.now(); return; } // 未配置不探
        const probe = new Promise(resolve => {
            let settled = false;
            const done = (state, kind) => { if (!settled) { settled = true; resolve({ state, kind: kind || null }); } };
            try {
                const u = new URL(t.host + '/models'); // 照 list_models 按协议切 http/https
                const rq = require(u.protocol === 'https:' ? 'https' : 'http').get(u, { headers: { Authorization: 'Bearer ' + t.key }, timeout: 8000 }, res => {
                    let b = '';
                    res.on('data', c => b += c);
                    res.on('end', () => {
                        if (res.statusCode === 401 || res.statusCode === 403) return done('down', 'key');
                        if (res.statusCode !== 200) return done('down');
                        try {
                            const j = JSON.parse(b);
                            const names = (j.data || j.models || []).map(m => m.id || m.name || String(m));
                            done(t.model && !names.includes(t.model) ? 'stale-model' : 'ok');
                        } catch { done('down'); }
                    });
                    res.on('error', () => done('down'));
                });
                rq.on('error', () => done('down'));
                rq.on('timeout', () => { rq.destroy(); done('down'); }); // 8s 超时按 down（比 test_model 30s 更紧，快速判死快速恢复）
            } catch { done('down'); } // 坏 host（URL 解析失败）同 down
        });
        const [r, pr] = await Promise.all([probe, reportSysProxy()]); // ProxyEnable 注册表只读并行（s64 A1 复用；事故一形态诚实提示，不装作能探代理路径）
        const prev = healthFrame();
        healthCache.state = r.state; healthCache.kind = r.kind;
        healthCache.proxy = !!(pr && pr.enabled);
        healthCache.at = Date.now();
        const now = healthFrame();
        if (JSON.stringify(prev) !== JSON.stringify(now)) for (const ws of allClients) ws.send(now || { sys: 'health', state: null }); // 态变化才广播（s77 delete 广播同款）
        else if (reply && reply.alive && now) reply.send(now); // qa s78b P1-1: 态不变也必答触发方——隔夜首开（TTL 必过期）链路持续坏时告警条不再缺失（裁决 §6 主指标）
    } finally { healthBusy = false; if (healthPend) { healthPend = false; probeProviderHealth(); } } // pend 补探不带 reply（QA 裁定）
}
function healthFailDebounce(reply) { // S2-2: turn 失败（S26 命中）后 60s 防抖合并复检——真实失败是最强探测信号，零额外成本
    if (healthFailT) return;
    healthFailT = setTimeout(() => { healthFailT = null; probeProviderHealth(reply); }, 60000);
    if (healthFailT.unref) healthFailT.unref();
}
setTimeout(probeProviderHealth, 90 * 1000).unref(); // S2-3: 桥启动 90s 一次（避开冷启资源竞争，兼作护航自检基线）；无周期心跳——裁决 §4 明确裁掉项

let acp = null;
let acpBuf = '';
let nextId = 1;
const waiting = new Map();
const allClients = new Set();
const sessionClients = new Map();
const wsSession = new WeakMap();
function bindWs(ws, sid) { // s78 P2-B 同族①: 重绑必摘旧会话成员籍——同一 ws 挂进多个 sid 的广播集 = 跨会话串台
    const old = wsSession.get(ws);
    if (old && old !== sid) { const s = sessionClients.get(old); if (s) s.delete(ws); }
    wsSession.set(ws, sid);
    if (!sessionClients.has(sid)) sessionClients.set(sid, new Set());
    sessionClients.get(sid).add(ws);
}
const explainCache = new Map(); // explain_tool 解释缓存：键=sha1(title+'\n'+output切片)，LRU 上限 200 条（2026-09-06 提速）
const optimizeCache = new Map(); // optimize_prompt 缓存：键=sha1(model+\0+text+\0+context)（裁决 batch2 §4.2-2 全载荷进键），LRU 上限 200 条

function spawnAcp() {
    const act = activeProvider();
    const env = {
        ...process.env,
        GOOSE_PATH_ROOT: path.join(ROOT, 'conf', 'goose'),
        GOOSE_DISABLE_KEYRING: '1',
        GOOSE_TELEMETRY_ENABLED: 'false',
        // s71(G1): 不注入 GOOSE_MODE——回落 config.yaml 的 smart_approve（env 会压 config，base.rs get_param），
        // permission.yaml 的 ask_before/never_allow 自此真实生效（auto 分支根本不查询）
        GOOSE_PROVIDER: 'openai',
        // 末级回落链到此为止（主控拍板 2026-09-12：不再硬编码任何模型名——死名回落是两次事故的共同放大器；
        // 空则 goose 用其自身默认，空态暴露交健康告警条，裁决 provider-health-probe S3）
        GOOSE_MODEL: (act && act.models && act.models[0]) || secrets.GOOSE_MODEL_NAME || '',
        OPENAI_API_KEY: (act && act.key) || secrets.FORGE_AGENT_API_KEY || process.env.OPENAI_API_KEY,
        OPENAI_HOST: (act && act.host) || secrets.FORGE_AGENT_HOST || process.env.OPENAI_HOST,
        OPENAI_BASE_PATH: 'chat/completions',
    };
    // s71(G1): env 会压 config（base.rs get_param 先读 env）——显式剥离父环境可能携带的 GOOSE_MODE
    // （pc yaml/启动器残留），确保回落 config.yaml 的 smart_approve，permission.yaml 真实生效
    delete env.GOOSE_MODE;
    const child = spawn(GOOSE, ['acp'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => onAcpData(chunk));
    child.stderr.on('data', d => process.stderr.write('[acp] ' + d));
    child.on('exit', c => {
        console.log('acp exited', c);
        if (child === acp) process.exit(1);
    });
    return child;
}
acp = spawnAcp();

function onAcpData(chunk) {
    acpBuf += chunk.toString('utf8');
    let idx;
    while ((idx = acpBuf.indexOf('\n')) !== -1) {
        const line = acpBuf.slice(0, idx).trim();
        acpBuf = acpBuf.slice(idx + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && waiting.has(msg.id)) {
            const w = waiting.get(msg.id); waiting.delete(msg.id);
            // research/18 断点①: error 帧此前一律 resolve(整帧)——session/prompt 被 goose 守卫拒绝时也当成功收尾，
            // 前端收到假 stop reason=end「秒回空、零报错」。带 reject 的调用方（prompt/initialize）改走 reject；
            // 只有 resolve 的调用方（session/new 的 B1 分支、switch_model，自解整帧 error）维持原语义
            if (msg.error !== undefined && w.reject) { w.reject(msg.error); continue; }
            if (w.resolve) { w.resolve(msg.result !== undefined ? msg.result : msg); }
            else if (w.ws && w.ws.alive) {
                // I8: 带回客户端关联 id
                const out = { rpc: msg };
                if (w.__cid !== undefined) out.rpc.__cid = w.__cid;
                w.ws.send(out);
            }
            continue;
        }
        if (msg.method) {
            const sid = msg.params && msg.params.sessionId;
            // P31-③: 权限卡出现即计，并记录 optionId->kind 供 acp_reply 归类
            if (msg.method === 'session/request_permission') {
                statsBump('permissionCards.shown');
                try {
                    const m = new Map();
                    for (const o of ((msg.params && msg.params.options) || [])) m.set(o.optionId, o.kind);
                    permKinds.set(msg.id, { m, t: Date.now() });
                    if (permKinds.size > 200) permKinds.clear();
                } catch {}
            }
            // P31-③: s26 流内报错检测——累计 agent 文本，turn 结束(stop)时套用前端同款正则
            try {
                const upd = msg.params && msg.params.update;
                if (upd && upd.sessionUpdate === 'agent_message_chunk' && upd.content && upd.content.text) {
                    const acc = (turnText.get(sid) || '') + upd.content.text;
                    turnText.set(sid, acc.length > 262144 ? acc.slice(-131072) : acc);
                } else if (msg.method === 'stop') {
                    const txt = turnText.get(sid) || '';
                    turnText.delete(sid);
                    busySids.delete(sid); // 主线5：防御性收口（ACP 模式 goose 从不发 stop，见 sendTurn 注释；发了也不许漏登记）
                    if (S26_ERR_RE.test(txt)) { statsBump('errorsByType.upstream'); statsBump('errorsByType.upstreamByKind.' + classifyUpstream(txt)); }
                }
            } catch {}
            const set = sid ? sessionClients.get(sid) : null;
            const obj = { agent: msg };
            if (set && set.size) for (const ws of set) ws.send(obj);
            else if (!sid || msg.method === 'session/request_permission') for (const ws of allClients) ws.send(obj); // s78 P2-B 同族②: 带 sid 的事件只发该会话订阅者，无订阅者即丢弃——不再全员广播（跨会话串台）；qa s78b P2-1 豁免: permission 卡必带 sid 且一次性通知（session/load 不重放），刷新窗口无订阅者丢弃=turn 挂死，回归全员广播
        }
    }
}

// ---- research/18 断点①：prompt 错误帧人话化 + 首轮单次救援 ----
// 场景：删掉当天最新会话后 goose 按 当日_MAX(库内序号)+1 发号（session_manager.rs:1591），删行致序号回退复用
// 已 close 的 sid，session/prompt 被 closed_session_ids 守卫以 error 帧拒绝（Z1 三次活体复现）。底线=reject 走
// 人话错误（不再秒回空僵尸）；救援=首轮 prompt 撞 Session-not-found 时新建会话重放一次（模式同 subscribe(null)/
// switch_model 既有的 session/new+rebind+subscribed 消费点）。
const SESSION_NF_RE = /session\s*not\s*found/i;
// qa s76 P3-2: 成因中立——同一文案也用于 provider 切换/acp 慢等非删除成因的救援失败，不能点名「删除对话」
const TURN_LOST_TEXT = '这一轮没能完成，可能是刚才的会话出了点异常，或者线路一时不稳。请再发一次试试，还不行就点左侧「＋ 新对话」重新开始。';
const wsFirstPrompt = new WeakMap(); // ws→当前绑定是否还没发过 prompt（仅首轮救援；中轮 sid 丢失不静默迁移，避免无声丢上下文）
// s78 P1-A 代际守卫：ws 上在飞 session/new 的代际标记（新发起覆盖旧的；subscribe(具体 sid)/unsubscribe 接管即清除）。
// 回调到达时标记不匹配 = 该 ws 已被后续操作接管（典型：页面加载 subscribe(null) 在飞 ~2s 期间用户点进既有对话）→
// 丢弃迟到的绑定，孤儿会话 fire-and-forget close 回收（delete_session :3284 同款先例）——否则 wsSession 被翻绑到
// 新空会话，用户消息静默落错处零报错（qa s78-qa-report P1-A，复现 tmp/s78-qa-race.js）。
const wsPendingNew = new WeakMap();
function staleNewSession(ws, reqId, res) {
    if (wsPendingNew.get(ws) === reqId) return false;
    if (res && res.sessionId) {
        try { acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'session/close', params: { sessionId: res.sessionId } }) + '\n'); } catch {}
        console.log('stale session/new discarded, orphan closed:', res.sessionId);
    }
    return true;
}
// qa s76 P3-3: 双客户端绑同一死 sid 且都在首轮→各自救援→两个重复新会话。会话级 Set 去重：救援触发即记，
// 已记的 sid 不再建新会话、走人话错误。无 TTL/清理——桥重启即清，且重启同时杀 acp（全部 goose sid 作废），跨重启去重无意义。
const rescuedSids = new Set();
const SID_RESCUED_TEXT = '这个对话的通道已失效，自动恢复也已经尝试过了。点左侧「＋ 新对话」重新开始，把想做的事再说一遍就行。';
// s76 遗留⑦（文案家族）：非 NF 的 turn 失败三档人话——措辞缩写自前端错误卡（chat.tpl endStream :977/:980，s25/s50e 既有裁决）；
// reject 路径没有消息操作条，故不提「取回修改」；桥端只一句话提示，换线按钮等完整交互仍属前端 endStream 路径
const TURN_KEY_TEXT = '这家服务商的 Key 没配上或不对。到 ⚙️ 设置 → 服务商档案，填好 Key 再发一次。';
const TURN_DOWN_TEXT = '看起来是大模型服务商那边暂时不通（不是你的操作问题）。等一两分钟再发一次；老不行就换个模型（点上面的模型名字）。';
const TURN_RETRY_TEXT = '这一轮没完成，请再发一次试试。';
function sendTurn(ws, sid, text, allowRescue) {
    const id = nextId++;
    busySids.add(sid); // 主线5：turn 在飞登记（resolve/reject/write 失败三路都收）
    waiting.set(id, { ws, resolve: () => {
        busySids.delete(sid);
        // s50e 修复：goose 上游故障以 agent_message_chunk 文本随正常 turn 结束返回（session/prompt 正常 resolve，非 reject），
        // 故在 turn 结束处对当轮累计文本跑 s26 正则（:349 的 stop 通知分支 goose ACP 模式从不发，为死代码）
        const txt = turnText.get(sid) || '';
        turnText.delete(sid);
        if (S26_ERR_RE.test(txt)) { statsBump('errorsByType.upstream'); statsBump('errorsByType.upstreamByKind.' + classifyUpstream(txt)); healthFailDebounce(ws); }
        ws.send({ agent: { method: 'stop', params: { sessionId: sid, reason: 'end' } } });
    }, reject: (e) => {
        busySids.delete(sid);
        // P31-③: turn 失败按 s26 正则归类上游故障
        // goose 的 JSON-RPC error：message=错误类（如 Resource not found），具体原因在 data（如 Session not found: <sid>）——拼接后供匹配
        const etxt = String((e && e.message) || e) + ' ' + String((e && e.data) || '');
        if (S26_ERR_RE.test(etxt)) { statsBump('errorsByType.upstream'); statsBump('errorsByType.upstreamByKind.' + classifyUpstream(etxt)); healthFailDebounce(ws); }
        else statsBump('errorsByType.other');
        if (allowRescue && SESSION_NF_RE.test(etxt)) {
            if (rescuedSids.has(sid)) { ws.send({ sys: 'error', text: SID_RESCUED_TEXT }); return; } // P3-3 去重命中
            rescuedSids.add(sid); // 触发即记不回滚：sid 已死，救援成败与否重试都只会再撞同一守卫
            console.log('session/prompt rejected by goose, single rescue:', etxt);
            try { rescueSession(ws, text); return; } catch (er) { console.error('rescue failed:', er); }
        }
        if (SESSION_NF_RE.test(etxt)) { ws.send({ sys: 'error', text: TURN_LOST_TEXT }); return; }
        // s76 遗留⑦: 非 NF 失败不再透英文内部错误（原 'turn failed: '+原文），按上方统计同款归类给人话：unauthorized→Key 指引（S26 正则不含 401，归类门须先于 S26 门）；
        // S26 命中（rate/timeout/server）→服务商暂时不通；其余→通用重发。null 守卫在上方 etxt 构造处（qa s76 P2-A：畸形 error:null 帧曾在此 TypeError 打死桥，reject 回调在无 try 的 onAcpData 栈）
        ws.send({ sys: 'error', text: classifyUpstream(etxt) === 'unauthorized' ? TURN_KEY_TEXT : S26_ERR_RE.test(etxt) ? TURN_DOWN_TEXT : TURN_RETRY_TEXT });
    } });
    // reject 回调可能来自 onAcpData 栈（不在 handleClient try 内），acp 写失败必须就地接住
    try {
        acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'session/prompt', params: { sessionId: sid, prompt: [{ type: 'text', text }] } }) + '\n');
    } catch (e) { waiting.delete(id); busySids.delete(sid); ws.send({ sys: 'error', text: '服务忙不过来（对话引擎没响应），稍等几秒再发一次。' }); }
}
function rescueSession(ws, text) {
    const rid = nextId++;
    const fail = () => ws.send({ sys: 'error', text: TURN_LOST_TEXT });
    const timer = setTimeout(() => { if (waiting.delete(rid)) fail(); }, 30000); // 救援 30s 不到=人话收场，不留新僵尸
    wsPendingNew.set(ws, rid); // s78 P1-A: 救援窗口内用户点了别的会话 → 迟到的救援绑定同样丢弃
    waiting.set(rid, { ws, resolve: (res) => {
        clearTimeout(timer);
        if (!(res && res.sessionId)) return fail();
        statsBump('sessionsCreated');
        if (staleNewSession(ws, rid, res)) return; // s78 P1-A 代际守卫
        if (!ws.alive) return; // qa s76 P3-4: 救援窗口内客户端已断开（drop 已清各表）——不再回挂死连接/续发重放（rpc 直通 alive 门同款）
        bindWs(ws, res.sessionId);
        // 前端 subscribed 处理器会更新 sessionId/currentSid（与 hotRestart 后 rebind 同款），用户表现为「继续聊」
        ws.send({ sys: 'subscribed', sessionId: res.sessionId, newSession: true, modes: res.modes || [], configOptions: res.configOptions || [] });
        sendTurn(ws, res.sessionId, text, false); // 单次守卫：重放不救援
    }, reject: () => { clearTimeout(timer); fail(); } });
    try {
        acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method: 'session/new', params: { cwd: ROOT, mcpServers: [] } }) + '\n');
    } catch (e) { clearTimeout(timer); waiting.delete(rid); fail(); }
}

async function init() {
    acpBuf = '';
    const res = await new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { ws: null, resolve, reject });
        acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } } }) + '\n');
        setTimeout(() => reject(new Error('initialize timeout')), 20000);
    });
    acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n');
    console.log('ACP initialized:', res.agentInfo && res.agentInfo.name, '| provider:', (activeProvider() || {}).name || 'secrets.env', '| model:', env0Model());
    acpCaps = res;
}
function env0Model() {
    const act = activeProvider();
    return (act && act.models && act.models[0]) || secrets.GOOSE_MODEL_NAME || '';
}
let acpCaps = null;
init().catch(e => { console.error('init failed', e); process.exit(1); });

// ---- 热重启：切换 provider 档案后重建 acp 子进程（保留会话 DB，客户端 reconnect 后 session/load 恢复） ----
async function hotRestartProvider() {
    const oldChild = acp;
    try { oldChild.removeAllListeners('exit'); oldChild.kill(); } catch {}
    // M6(审查s15): 清 waiting 前先 reject 在途请求，否则前端 spinner 永挂
    for (const [, w] of waiting) { if (w.reject) { try { w.reject(new Error('provider switching')); } catch {} } }
    waiting.clear();
    busySids.clear(); // 主线5：acp 已换新进程，在飞 turn 全部作废
    sessionClients.clear();
    rescuedSids.clear(); // qa s76 P3-A: 热重启同样杀 acp（全部旧 sid 作废），去重集合必须随行清，否则热重启前的死 sid 被拦在救援外
    acp = spawnAcp();
    await init();
    for (const ws of allClients) ws.send({ sys: 'provider_switched', provider: (activeProvider() || {}).name, model: env0Model() });
}

function fetchBufJson(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        require('https').get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'user-agent': 'PocketForge-Updater', accept: 'application/vnd.github+json' }, timeout: 8000 }, res => {
            let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        }).on('error', reject).on('timeout', function(){ this.destroy(); reject(new Error('超时')); });
    });
}
function cmpVer(a, b) {
    const pa = String(a).split('.'), pb = String(b).split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0;
        if (x !== y) return x - y;
    }
    return 0;
}
// s45: 远程技能源——anthropics/skills（开源样例库，agentskills.io 同规范）
// s70 切片B（裁决 S2）: 源配置化——本常量降级为内置默认；加源=编辑 data/config/skill-sources.json（源管理无 UI，裁决否决项4）
const REMOTE_SKILLS = { repo: 'anthropics/skills', branch: 'main', subdir: 'skills' };
const SKILL_SOURCES_FILE = path.join(ROOT, 'data', 'config', 'skill-sources.json');
// B2: subdir 白名单——path-safe（charset 禁 : \ →盘符/反斜杠形态、禁前后导斜杠、禁 .. 任意级穿越）；空串由调用方回落默认
function subdirSafe(p) { return typeof p === 'string' && p.indexOf('..') < 0 && p[0] !== '/' && p[p.length - 1] !== '/' && /^[\w.\-/]*$/.test(p); }
// s72: 源校验器上提共用（原 readSkillSources 内联 okSrc）——市场配置端点写侧同门复验，防两处校验漂移
function okSkillSrc(s) {
    return s && typeof s.repo === 'string' && SKILL_REPO_RE.test(s.repo)
        && typeof s.branch === 'string' && SKILL_BRANCH_RE.test(s.branch)
        && (s.subdir === undefined || subdirSafe(s.subdir));
}
function readSkillSources() {
    // 首启不存在→生成内置默认；坏 JSON/无有效条目→warn 回落内置默认（不炸、不改写用户文件）；enabled 缺省视为 true
    // qa返工(P2-2): 首启生成即双源
    const dft = () => [
        { repo: REMOTE_SKILLS.repo, branch: REMOTE_SKILLS.branch, subdir: REMOTE_SKILLS.subdir, enabled: true },
        { ...BAOYU_SKILLS, enabled: true },
    ];
    const warnOnce = msg => { if (!stateWarnings.includes(msg)) stateWarnings.push(msg); console.warn(msg); };
    let raw = null;
    try { raw = FSS.readFileSync(SKILL_SOURCES_FILE, 'utf8'); } catch {
        try { FSS.mkdirSync(path.dirname(SKILL_SOURCES_FILE), { recursive: true }); atomicWrite(SKILL_SOURCES_FILE, JSON.stringify({ _schema: STATE_SCHEMAS['config/skill-sources.json'].latest, sources: dft() }, null, 2)); } catch {} // s73: stamp 跟 registry latest（f6ec76a 漏改致首启 1/二启迁移空转+残备份）
        return dft();
    }
    let j = null; try { j = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch {}
    if (!j || (j._schema !== 1 && j._schema !== 2) || !Array.isArray(j.sources)) { warnOnce('skill-sources.json 无法解析（应为 _schema:1/2 + sources 数组），已回落内置默认源'); return dft(); } // P2-2: 迁移升至 _schema:2，读侧同步收
    // repo=owner/repo 形、branch/subdir 无 URL 元字符——源串拼进 GitHub URL，与目录名白名单同门（正则上提共用，见 SKILL_REPO_RE）
    const valid = j.sources.filter(okSkillSrc);
    if (!valid.length) { warnOnce('skill-sources.json 没有有效源（条目缺 repo/branch 或 subdir 非法），已回落内置默认源'); return dft(); }
    // qa返工(P3-3): 解析成功先清旧配置类警告（文件修复后同进程自愈）；部分无效时下方跳过警告会重新入列
    for (let i = stateWarnings.length - 1; i >= 0; i--) if (stateWarnings[i].indexOf('skill-sources.json') === 0) stateWarnings.splice(i, 1);
    if (valid.length < j.sources.length) warnOnce('skill-sources.json 跳过 ' + (j.sources.length - valid.length) + ' 条无效源');
    return valid.map(s => ({ repo: s.repo, branch: s.branch, subdir: s.subdir || REMOTE_SKILLS.subdir, enabled: s.enabled !== false }));
}
function ghFetch(p) {
    // GitHub API/raw 统一走代理（现场代理 127.0.0.1:7890；可用 data/proxy.env 覆盖）
    let proxy = 'http://127.0.0.1:7890';
    try { proxy = FSS.readFileSync(path.join(ROOT, 'data', 'proxy.env'), 'utf8').trim() || proxy; } catch {}
    // s50c: 异步 execFile（原 execFileSync 会冻住整个桥的事件循环）——照 faucetCli 的 Promise 模式
    return new Promise((resolve, reject) => {
        const { execFile } = require('child_process');
        execFile('curl', ['-sL', '-m', '30', '-x', proxy, p], { maxBuffer: 32 * 1024 * 1024, encoding: 'buffer', windowsHide: true }, (e, stdout) => e ? reject(e) : resolve(stdout));
    });
}
function ghJson(p) { return ghFetch(p).then(out => JSON.parse(out.toString('utf8'))).catch(() => null); }
function ghText(p) { return ghFetch(p).then(out => out.toString('utf8')); }
function parseSkillMeta(raw, fallbackName) {
    const name = raw.match(/^name:\s*(.+)$/m);
    const dm = raw.match(/^description:\s*(.*)$/m);
    let desc = dm ? dm[1].trim() : '';
    if (/^[>|][+-]?\s*$/.test(desc)) {
        // yaml 多行块（> | |-）：抓后续缩进行拼接
        const lines = raw.split(/\r?\n/);
        const start = lines.findIndex(l => /^description:/.test(l));
        const parts = [];
        for (let i = start + 1; i < lines.length; i++) {
            if (/^\s+\S/.test(lines[i])) parts.push(lines[i].trim());
            else if (lines[i].trim() === '') continue;
            else break;
        }
        desc = parts.join(' ');
    }
    desc = desc.replace(/^['"]|['"]$/g, '');
    return {
        name: name ? name[1].trim().replace(/^['"]|['"]$/g, '') : fallbackName,
        description: desc || '(无说明)',
        body: raw.length > 4000 ? raw.slice(0, 4000) : raw,
    };
}
// s56: 技能市场缓存优先管道：sync（拉源→写缓存→异步补中文）→ GET 秒回缓存 → 安装/预览走本地缓存
const SKILL_CACHE = path.join(ROOT, 'data', 'cache', 'skills');
function readSkillManifest() { return readJson(path.join(SKILL_CACHE, 'manifest.json'), null); }
function writeSkillManifest(m) { FSS.mkdirSync(SKILL_CACHE, { recursive: true }); atomicWrite(path.join(SKILL_CACHE, 'manifest.json'), JSON.stringify(m, null, 2)); }
let skillSyncBusy = false, skillSyncDirty = false; // 后台重拉/翻译防抖标志；dirty=busy 期间又来了 sync 请求（qa P2-2：收尾补跑一轮，不丢）
// qa P2-3: sync 收尾统一写/清「失败源」人话警告——repo 短名+固定话术（不泄内部路径/上游错误）；成功轮自动清旧条目（同进程自愈，同 readSkillSources P3-3 门）
function warnSkillFetchFailures(failed) {
    for (let i = stateWarnings.length - 1; i >= 0; i--) if (/^技能源 .+ 拉取失败/.test(stateWarnings[i])) stateWarnings.splice(i, 1);
    for (const repo of failed) { const msg = '技能源 ' + repo + ' 拉取失败：可能是地址写错了或网络不通（好的源不受影响，下轮自动重试）'; if (!stateWarnings.includes(msg)) stateWarnings.push(msg); }
}
async function fetchAllRemoteSkills(failedOut) {
    // s70 切片B: 遍历 enabled 源合并清单（源顺序=配置顺序）；同名 dir 先到保留、后到跳过（留痕一行）
    // 条目带 source{repo,branch}（源身份，切片A origin.json 同构）；qa P2-3: 单源失败降级=跳过该源+收集清单（原整轮 throw，一个坏源毒化全部）；
    // 全部源都失败才保留整轮失败语义（疑似断网非配置问题，沿用旧缓存静默）
    const skills = [];
    const enabled = readSkillSources().filter(s => s.enabled);
    let okSrc = 0;
    for (const src of enabled) {
        const listing = await ghJson('https://api.github.com/repos/' + src.repo + '/contents/' + src.subdir + '?ref=' + src.branch);
        if (!Array.isArray(listing)) { if (failedOut) failedOut.push(src.repo); continue; }
        for (const e of listing.filter(x => x.type === 'dir')) {
            // qa-P2: 上游 GitHub 返回的目录名与用户输入同门——白名单外跳过（防源被攻破写出缓存树之外）
            if (!/^[\w\-]{1,64}$/.test(e.name) || !fileNameSafe(e.name)) continue;
            if (skills.some(s => s.dir === e.name)) { console.log('skill source dup skip:', e.name, '(先到保留, 后到源 ' + src.repo + ')'); continue; }
            let meta = { name: e.name, description: '(远程技能)' };
            try { meta = parseSkillMeta(await ghText('https://raw.githubusercontent.com/' + src.repo + '/' + src.branch + '/' + src.subdir + '/' + e.name + '/SKILL.md'), e.name); } catch {}
            const body = meta.body; delete meta.body;
            const ddir = path.join(SKILL_CACHE, e.name);
            FSS.mkdirSync(ddir, { recursive: true });
            atomicWrite(path.join(ddir, 'SKILL.md'), body);
            skills.push({ dir: e.name, name: meta.name, description: meta.description, desc_zh: null, source: { repo: src.repo, branch: src.branch, subdir: src.subdir } });
        }
        okSrc++;
    }
    if (enabled.length && !okSrc) throw new Error('技能源全部不可达');
    return skills;
}
function mergeSkillManifest(oldM, skills) {
    // 条目 diff：新增补入；旧有新无保留；同 dir 覆盖 name/description（desc_zh 沿用旧翻译），body 文件已在 fetch 时覆盖
    const prev = new Map((oldM && Array.isArray(oldM.skills) ? oldM.skills : []).map(s => [s.dir, s]));
    for (const s of skills) {
        const o = prev.get(s.dir);
        if (o) { s.desc_zh = o.desc_zh !== undefined ? o.desc_zh : null; if (!s.description || s.description === '(无说明)') s.description = o.description; }
    }
    return { _schema: 2, fetched_at: new Date().toISOString(), translating: false, skills };
}
async function translateSkillManifest(manifest) {
    // 异步惰性中文补齐：≤30 条/请求，一次批量直调；失败不重试不阻塞（下次 sync 再补）
    const act = activeProvider();
    const host = ((act && act.host) || secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
    const key = (act && act.key) || secrets.FORGE_AGENT_API_KEY || '';
    const model = (act && act.models && act.models[0]) || secrets.GOOSE_MODEL_NAME || '';
    const pending = manifest.skills.filter(s => !s.desc_zh);
    if (!pending.length || !host || !model) { manifest.translating = false; writeSkillManifest(manifest); return; }
    manifest.translating = true; writeSkillManifest(manifest);
    try {
        // 实测（s56）：批量 19 条全量说明 >60s 超时；截断到 150 字符 + 拆 10 条/请求串行补，单批约 30-57s
        let left = pending.slice();
        while (left.length) {
            const batch = left.splice(0, 10).map(s => ({ dir: s.dir, text: s.description.slice(0, 150) }));
            const body = JSON.stringify({ model, max_tokens: 4096, messages: [
                { role: 'system', content: '把每条技能说明翻译成小白能懂的中文大白话。只返回 JSON 数组，每项 {"dir":"...","zh":"..."}，不额外解释。' },
                { role: 'user', content: JSON.stringify(batch) },
            ]});
            const txt = await new Promise((resolve, reject) => {
                const u = new URL(host + '/chat/completions');
                const reqMod = require(u.protocol === 'https:' ? 'https' : 'http');
                const rq = reqMod.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, timeout: 60000 }, r2 => {
                    let b = ''; r2.on('data', c => b += c);
                    r2.on('end', () => {
                        try { const j = JSON.parse(b.replace(/data:\s*\[DONE\][\s\S]*$/, '').trim()); const c0 = j.choices && j.choices[0]; const m0 = c0 && c0.message; resolve(String((m0 && (m0.content || m0.reasoning_content)) || '')); }
                        catch (e) { reject(e); }
                    });
                });
                rq.on('error', reject);
                rq.on('timeout', () => { rq.destroy(); reject(new Error('翻译超时')); });
                rq.write(body); rq.end();
            });
            const arr = JSON.parse((txt.match(/\[[\s\S]*\]/) || [txt])[0]);
            const byDir = new Map(arr.map(x => [String(x.dir), String(x.zh || '')]));
            for (const s of pending) { const zh = byDir.get(s.dir); if (zh) s.desc_zh = zh.slice(0, 500); }
            writeSkillManifest(manifest); // 每批落盘，中途重启不丢已完成部分
        }
    } catch {}
    manifest.translating = false;
    writeSkillManifest(manifest);
}
async function syncRemoteSkills() {
    if (skillSyncBusy) { skillSyncDirty = true; return; } // qa P2-2: busy 期间来的请求置脏即返回（原直接丢，源变更撞在途 sync 会静默丢失）
    skillSyncBusy = true;
    const failed = []; // qa P2-3: 失败源清单，收尾写 stateWarnings
    try {
        const merged = mergeSkillManifest(readSkillManifest(), await fetchAllRemoteSkills(failed));
        writeSkillManifest(merged);
        await translateSkillManifest(merged).catch(() => {});
        // 补翻完成（或失败）后盖 fetched_at：下次 GET 走 fresh 路径，不再重复触发重拉
        merged.fetched_at = new Date().toISOString();
        writeSkillManifest(merged);
    } catch {} // 拉取失败静默保留旧缓存（全部源失败=疑似断网，下次窗口再试）
    warnSkillFetchFailures(failed); // 收尾统一写（含坏源被跳过的半程成功轮）；成功轮清旧条目
    skillSyncBusy = false;
    if (skillSyncDirty) { skillSyncDirty = false; syncRemoteSkills(); } // qa P2-2: 补跑一轮；第二轮运行中再来的真请求会重新置脏（不活锁）
}
function skillCacheFresh(m) { return m && Array.isArray(m.skills) && m.fetched_at && (Date.now() - Date.parse(m.fetched_at)) < 24 * 3600 * 1000; }
// s59: 定时预热（用户主线：agent/基础设施预取数据预先翻译，用户零等待）——启动即后台 sync 一次，此后每 24h 主动重拉。
// 触发在桥、执行是管道调用（非 agent）：确定性爬取+纯文本翻译不需要 agent loop（s56 裁决）。失败静默，下次窗口再试。
(function skillWarmup() {
    setTimeout(() => { syncRemoteSkills(); setInterval(syncRemoteSkills, 24 * 3600 * 1000); }, 15 * 1000).unref();
})();
// qa-P3: translating 崩溃残留自愈——标记超 10 分钟视为孤儿（桥重启于翻译中），当 false 读
function translatingNow(m) { return !!m.translating && (Date.now() - Date.parse(m.fetched_at)) < 10 * 60 * 1000; }
async function listRemoteSkills(installedSet, res) {
    const m = readSkillManifest();
    if (skillCacheFresh(m)) {
        json200(res, { ok: true, fetched_at: m.fetched_at, translating: translatingNow(m), skills: m.skills.map(s => ({ ...s, remote: true, installed: installedSet.has(s.dir) })) });
        return;
    }
    if (m) { // 缓存过期：立即回旧缓存，后台重拉
        json200(res, { ok: true, fetched_at: m.fetched_at, translating: true, skills: m.skills.map(s => ({ ...s, remote: true, installed: installedSet.has(s.dir) })) });
        syncRemoteSkills();
        return;
    }    try { // 首次无缓存：同步拉一次
        const failed = [];
        const merged = mergeSkillManifest(null, await fetchAllRemoteSkills(failed));
        warnSkillFetchFailures(failed); // qa P2-3: 首拉路径同门（坏源跳过、警告照写）
        writeSkillManifest(merged);
        translateSkillManifest(merged).catch(() => {});
        json200(res, { ok: true, fetched_at: merged.fetched_at, translating: merged.translating, skills: merged.skills.map(s => ({ ...s, remote: true, installed: installedSet.has(s.dir) })) });
    } catch (e) {
        json200(res, { ok: false, err: '技能源拉取失败: ' + e.message });
    }
}
// s70 切片A（裁决 S1）: 技能来源标记——origin.json { _schema:1, source: market|local|self, repo, branch, installed_at }
function originOf(dir) {
    // 容错：坏 JSON/缺字段/未知 source → null（按本机技能处理，不炸）
    try {
        const o = JSON.parse(FSS.readFileSync(path.join(dir, 'origin.json'), 'utf8'));
        if (o && (o.source === 'market' || o.source === 'local' || o.source === 'self')) return o;
    } catch {}
    return null;
}
function writeSkillOrigin(dst, source, repo, branch, subdir) {
    // qa返工(P3-1): 写失败不再静默吞掉——抛错随原子安装回滚并报安装失败，不假成功
    // B2: subdir 可选（本地 skills-repo/旧调用不带 → JSON.stringify 省键；缺 subdir 键的存量 origin.json 照常解析）
    FSS.mkdirSync(dst, { recursive: true });
    atomicWrite(path.join(dst, 'origin.json'), JSON.stringify({ _schema: 1, source, repo, branch, subdir, installed_at: new Date().toISOString() }, null, 2));
}
function skillInstallBlocked(dst) {
    // 同名冲突语义：已装且（无标记或 self）→ 拒绝（防静默覆盖本机/自沉淀技能）；market/local → 覆盖=更新语义放行
    if (!FSS.existsSync(path.join(dst, 'SKILL.md'))) return null; // 与卸载同门：SKILL.md 才算「已装」
    const o = originOf(dst);
    if (o && o.source !== 'self') return null;
    return '这个名字小 forge 自己在用，先换个技能名再装。';
}
// qa返工(P2-2): 覆盖=更新先装到 dst.tmp，全部成功后旧版→.bak→tmp 换名→删 bak；任一步失败清 tmp（必要时还原 .bak）再抛错——失败时旧版完好。
// 换名后 dst 为全新目录，无 cpSync 合并残留（qa-P3-3 随之消除）。调用方 name 已过白名单+保留名过滤，.tmp/.bak 后缀不产生新保留名。
async function installAtomic(dst, stage) {
    const tmp = dst + '.tmp', bak = dst + '.bak';
    try { FSS.rmSync(tmp, { recursive: true, force: true }); } catch {}
    try {
        await stage(tmp); // 在临时目录装好（含 origin.json），失败即抛
    } catch (e) {
        try { FSS.rmSync(tmp, { recursive: true, force: true }); } catch {}
        throw e;
    }
    try { FSS.rmSync(bak, { recursive: true, force: true }); } catch {} // 清上次中断残留（此时旧版已在 dst）
    let bakDone = false;
    if (FSS.existsSync(dst)) { FSS.renameSync(dst, bak); bakDone = true; }
    try {
        FSS.renameSync(tmp, dst);
    } catch (e) {
        if (bakDone) { try { FSS.renameSync(bak, dst); } catch {} }
        throw e;
    }
    if (bakDone) { try { FSS.rmSync(bak, { recursive: true, force: true }); } catch {} }
}
async function installRemoteSkill(dirName, res) {
    const dst = path.join(ROOT, '.agents', 'skills', dirName);
    const blocked = skillInstallBlocked(dst);
    if (blocked) {
        json200(res, { ok: false, err: blocked });
        return;
    }
    // s70 切片B: 安装来源随 manifest 条目 source（缓存树不带标记）；条目缺失回落内置默认
    const m = readSkillManifest();
    const ent = m && Array.isArray(m.skills) ? m.skills.find(s => s.dir === dirName) : null;
    const ms = (ent && ent.source && typeof ent.source.repo === 'string' && typeof ent.source.branch === 'string') ? ent.source : REMOTE_SKILLS;
    // B2: source 记录 subdir 用加键形态（research/13 §3.1，非 repo/subdir 复合形态）；旧 manifest/origin 缺 subdir 键照常解析（切片A originOf 容错一致）→当前配置该源→内置默认
    const src = { repo: ms.repo, branch: ms.branch, subdir: subdirSafe(ms.subdir) && ms.subdir ? ms.subdir : (readSkillSources().filter(s => s.enabled).find(s => s.repo === ms.repo && s.branch === ms.branch) || REMOTE_SKILLS).subdir };
    const finish = () => {
        json200(res, { ok: true });
    };
    // s56: 优先从本地缓存复制（出网面收敛到 sync 一处）；qa返工(P2-2): 原子安装，失败旧版完好
    try {
        if (FSS.existsSync(path.join(SKILL_CACHE, dirName, 'SKILL.md'))) {
            await installAtomic(dst, async tmp => {
                FSS.cpSync(path.join(SKILL_CACHE, dirName), tmp, { recursive: true });
                writeSkillOrigin(tmp, 'market', src.repo, src.branch, src.subdir);
            });
            finish();
            return;
        }
    } catch (e) {
        json200(res, { ok: false, err: '安装失败: ' + e.message });
        return;
    }
    // 缓存缺该目录：递归拉取 <subdir>/<dir> 全部文件（GitHub contents API；子目录递归），拉完写缓存；subdir 已随 source 解析（B2）
    const subdir = src.subdir;
    async function walkApi(relPath, destDir) {
        const items = await ghJson('https://api.github.com/repos/' + src.repo + '/contents/' + subdir + '/' + relPath + '?ref=' + src.branch);
        if (!Array.isArray(items)) throw new Error('技能目录拉取失败: ' + relPath);
        for (const it of items) {
            // qa-P2: 上游文件/子目录名过同一白名单（递归写盘面与用户输入同门）
            if (!/^[\w\-\.]{1,64}$/.test(it.name) || !fileNameSafe(it.name)) continue;
            const rel = relPath ? relPath + '/' + it.name : it.name; // qa返工(P3-2): 原式 subdir+'/'+relPath==='' 恒假（优先级），根目录文件曾拼出 subdir/ 前缀
            if (it.type === 'dir') {
                await walkApi(rel, path.join(destDir, it.name));
            } else {
                FSS.mkdirSync(destDir, { recursive: true });
                FSS.writeFileSync(path.join(destDir, it.name), await ghFetch(it.download_url || ('https://raw.githubusercontent.com/' + src.repo + '/' + src.branch + '/' + subdir + '/' + rel)));
            }
        }
    }
    try {
        await installAtomic(dst, async tmp => {
            await walkApi(dirName, tmp);
            // 顺手把整个技能目录写进缓存（缓存树不带来源标记，纯复制即可）；缓存写失败不挡安装
            try { FSS.cpSync(tmp, path.join(SKILL_CACHE, dirName), { recursive: true }); } catch {}
            writeSkillOrigin(tmp, 'market', src.repo, src.branch, src.subdir);
        });
        finish();
    } catch (e) {
        json200(res, { ok: false, err: '安装失败: ' + e.message });
    }
}

// s46: MCP 市场（精选目录，npm vendored；安装=vendor 安装+写 config.yaml extensions，重启生效）
// s70 切片C（裁决 S3）: 目录配置化——本常量降级为内置默认；加目录项=编辑 data/config/mcp-catalog.json（零桥代码 diff）。
// 新目录项准入=人工四条闸门（①许可证白名单②goose 实装真调③npm 可达有维护方④MCP SDK 大版本护栏），每入一枚留 journal 选型——
// JSON 无注释，清单落档 docs/verdicts/2026-09-05-marketplace-ecosystem.md 切片C 与 docs/research/13。
const MCP_CATALOG = [
    { id: 'sequential-thinking', name: '深度思考', desc: '复杂任务先拆步骤再动手，提升多步推理质量', pkg: '@modelcontextprotocol/server-sequential-thinking', entry: 'node_modules/@modelcontextprotocol/server-sequential-thinking/dist/index.js', license: 'MIT' },
    { id: 'memory-graph', name: '关系图谱记忆', desc: '实体关系图谱（人物/设备台账类结构化记忆），与内置长期记忆互补', pkg: '@modelcontextprotocol/server-memory', entry: 'node_modules/@modelcontextprotocol/server-memory/dist/index.js', license: 'MIT' },
    // s54: fetch（Backlog「MCP 商店最小形态」收尾项）——轻量网页抓取转文本，不开浏览器即可读网页
    { id: 'fetch', name: '网页抓取', desc: '把网页内容抓下来转成文字（不开浏览器，轻量快速），适合读文章、取表格数据', pkg: 'fetch-mcp', entry: 'node_modules/fetch-mcp/cli.js', license: 'MIT' },
];
const MCP_CATALOG_FILE = path.join(ROOT, 'data', 'config', 'mcp-catalog.json');
// s72: 目录条目校验器上提共用（原 readMcpCatalog 内联 okItem）——市场配置端点写侧同门复验
// id/pkg/entry 白名单同门：id 进扩展 id+vendor 目录+YAML 键，entry 进 config.yaml 单引号串（禁引号/反斜杠），pkg 进 npm 参数
// qa返工(P3-4): id/pkg/entry 首字符禁 '-'（npm 参数/正则形态防混淆）
function okMcpItem(m) {
    return m && typeof m.id === 'string' && m.id[0] !== '-' && /^[\w\-]{1,64}$/.test(m.id)
        && ['name', 'desc', 'license'].every(k => typeof m[k] === 'string' && m[k])
        && typeof m.pkg === 'string' && m.pkg[0] !== '-' && /^[@\w.\-/]+$/.test(m.pkg)
        && typeof m.entry === 'string' && m.entry[0] !== '-' && /^[@\w.\-/]+$/.test(m.entry); // @ 容 @scope 包路径（同 pkg）
}
function readMcpCatalog() {
    // 首启不存在→由内置默认生成；坏 JSON/缺 _schema/缺字段/条目非法/id 重复→warn 回落内置默认（不炸、不改写用户文件）
    const dft = () => MCP_CATALOG.map(x => ({ ...x }));
    if (!FSS.existsSync(MCP_CATALOG_FILE)) {
        try { FSS.mkdirSync(path.dirname(MCP_CATALOG_FILE), { recursive: true }); atomicWrite(MCP_CATALOG_FILE, JSON.stringify({ _schema: 1, catalog: dft() }, null, 2)); } catch {}
        return dft();
    }
    const j = readJson(MCP_CATALOG_FILE, null);
    if (j && j._schema === 1 && Array.isArray(j.catalog) && j.catalog.length && j.catalog.every(okMcpItem)
        && new Set(j.catalog.map(x => x.id)).size === j.catalog.length) {
        for (let i = stateWarnings.length - 1; i >= 0; i--) if (stateWarnings[i].indexOf('mcp-catalog.json') === 0) stateWarnings.splice(i, 1); // qa返工(P3-3): 解析成功清旧警告
        return j.catalog;
    }
    const warnOnce = msg => { if (!stateWarnings.includes(msg)) stateWarnings.push(msg); console.warn(msg); };
    warnOnce('mcp-catalog.json 无法解析（应为 _schema:1 + catalog 数组且条目字段齐全），已回落内置 MCP 目录');
    return dft();
}
const mcpInstallState = Object.create(null); // qa返工(P3-4): 无原型——id 含 __proto__/constructor 等时写状态不落原型链
function mcpExtensionId(id) { return 'mcp-' + id; }
function mcpInstalled(id) {
    try {
        const raw = FSS.readFileSync(path.join(ROOT, 'conf', 'goose', 'config', 'config.yaml'), 'utf8');
        return new RegExp('^ {2}' + mcpExtensionId(id) + ':', 'm').test(raw);
    } catch { return false; }
}
function mcpWriteExtension(id, entry) {
    // config.yaml extensions 块尾部追加（幂等：已存在不重复写）
    const CFG = path.join(ROOT, 'conf', 'goose', 'config', 'config.yaml');
    let raw = FSS.readFileSync(CFG, 'utf8');
    if (new RegExp('^ {2}' + mcpExtensionId(id) + ':', 'm').test(raw)) return;
    const vendorRel = 'bin/vendor/mcp-' + id;
    const block = '\n' +
        '  ' + mcpExtensionId(id) + ':\n' +
        '    type: stdio\n' +
        '    name: ' + mcpExtensionId(id) + '\n' +
        '    enabled: true\n' +
        "    cmd: '" + (ROOT.split(String.fromCharCode(92)).join('/')) + "/bin/node-v22/node-v22.21.1-win-x64/node.exe'\n" +
        "    args: ['" + (ROOT.split(String.fromCharCode(92)).join('/')) + '/' + vendorRel + '/' + entry + "']\n" +
        '    timeout: 300\n';
    atomicWrite(CFG, raw.replace(/\n*$/, '\n') + block);
}
// s57: 读 mcp-* 块的 enabled（无块视为 true；商店列表显示已启用/已停用）
// s67: 收敛到 readExtState 的 extensions: 门禁单一扫描（qa-s57 P2 块界语义保留）。B2/C 批移交缺陷：
// S-B 在 extensions: 前加 GOOSE_*/CONTEXT_FILE_NAMES 顶格键后，原文件头扫描遇首个顶格键即 break → 恒 true
function mcpEnabled(id) {
    return readExtState()[mcpExtensionId(id)] !== false;
}
// s57: 行级删除 `  mcp-<id>:` 块（到下一个同缩进键或文件尾）；卸载 MCP 用
function mcpRemoveExtension(id) {
    const CFG = path.join(ROOT, 'conf', 'goose', 'config', 'config.yaml');
    const lines = FSS.readFileSync(CFG, 'utf8').split('\n');
    const out = [];
    let skip = false, found = false;
    for (const line of lines) {
        if (/^ {2}[A-Za-z0-9_\-]+:\s*$/.test(line)) {
            if (new RegExp('^ {2}' + mcpExtensionId(id) + ':\\s*$').test(line)) { skip = true; found = true; continue; }
            skip = false;
        }
        if (!skip) out.push(line);
    }
    if (!found) throw new Error('配置里没找到该扩展');
    atomicWrite(CFG, out.join('\n').replace(/\n*$/, '\n'));
}
// s17 A: 读 config.yaml extensions 块各扩展 enabled（/api/extensions 与 s64 报告共用；
// 结构级只取 enabled 行——mcp 块内 env/cmd 等任何值不会进入返回值）
function readExtState() {
    try {
        const raw = FSS.readFileSync(path.join(ROOT, 'conf', 'goose', 'config', 'config.yaml'), 'utf8');
        const out = {};
        let inExts = false, cur = null;
        for (const line of raw.split(/\r?\n/)) {
            if (/^extensions:\s*$/.test(line)) { inExts = true; continue; }
            if (!inExts) continue;
            if (/^[^\s#]/.test(line)) break; // 下一顶级键（qa P3-2：# 豁免顶格注释行，与 mcpEnabled 同语法，防两函数对含注释 config 结论分叉）
            const extM = line.match(/^ {2}([A-Za-z0-9_\-]+):\s*$/);
            if (extM) { cur = extM[1]; out[cur] = true; continue; }
            if (cur) {
                const enM = line.match(/^ {4}enabled:\s*(true|false)/);
                if (enM) out[cur] = enM[1] === 'true';
            }
        }
        return out;
    } catch { return {}; }
}

// ---- s72: 市场源与 MCP 目录配置入口（GET/POST /api/config/market；用户 2026-09-06 点名推翻裁决否决项4「源管理无 UI」）----
// GET = 两文件当前有效视图（走 readSkillSources/readMcpCatalog 原路：坏 JSON 仍容错回落、不改写用户文件）；
// POST = 在有效视图上施加变更 → 同门校验器全量复验 → 原子写（落 latest _schema，防下次迁移复活已删源）。
// 写侧以「有效视图」为基准：坏配置本就被读取器整体忽略/过滤，首次 UI 变更把它顺带写成干净清单——读侧永不写用户文件的语义不变。
function marketView() {
    return {
        ok: true,
        skillSources: readSkillSources(),
        mcpCatalog: readMcpCatalog().map(x => ({ ...x, installed: mcpInstalled(x.id), enabled: mcpEnabled(x.id) })), // installed/enabled 为计算字段（同 mcpstore GET），文件内容原样保留
    };
}
function marketMutate(b) {
    const bad = err => ({ ok: false, err });
    try {
        const op = b.op;
        if (op === 'skill-add' || op === 'skill-remove' || op === 'skill-toggle') {
            const list = readSkillSources().map(s => ({ ...s }));
            const repo = typeof b.repo === 'string' ? b.repo.trim() : '';
            const branch = typeof b.branch === 'string' ? b.branch.trim() : '';
            const same = s => s.repo === repo && s.branch === branch;
            if (op === 'skill-add') {
                // 写侧比读取器更紧：RE 本身容 '..'（读取器容错面历史形态，改动牵动回落语义），
                // 但 UI 写入面禁 '..'（repo/branch 拼进 GitHub URL，存进用户配置文件不能带穿越形态）
                if (!SKILL_REPO_RE.test(repo) || repo.indexOf('..') >= 0) return bad('仓库名需形如「用户名/仓库名」，例如 anthropics/skills');
                if (!SKILL_BRANCH_RE.test(branch) || !branch || branch.indexOf('..') >= 0) return bad('分支名只能用字母数字和 ._-/，例如 main');
                if (branch.length > 64) return bad('分支名太长了（最多 64 个字符）'); // qa P3-3: 写侧收紧 {1,64}（读取器容错不动，存量长配置仍可读）
                const subdir = typeof b.subdir === 'string' ? b.subdir.trim() : '';
                if (subdir && !subdirSafe(subdir)) return bad('子目录不合法：不能以 / 开头或结尾，不能包含 .. 或盘符');
                if (list.some(same)) return bad('这个源已经在列表里（同仓库同分支不重复添加）');
                list.push({ repo, branch, subdir: subdir || REMOTE_SKILLS.subdir, enabled: true });
            } else {
                const i = list.findIndex(same);
                if (i < 0) return bad('源列表里没有这个源，请刷新后重试');
                if (op === 'skill-toggle') {
                    if (typeof b.enabled !== 'boolean') return bad('参数不合法');
                    list[i].enabled = b.enabled;
                } else {
                    if (list.length <= 1) return bad('至少要保留一个技能源');
                    list.splice(i, 1);
                }
            }
            if (!list.some(s => okSkillSrc(s) && s.enabled !== false)) return bad('至少要保留一个启用中的技能源'); // 全停用会让市场清单被清空（fetchAllRemoteSkills 零源），同门拒绝
            atomicWrite(SKILL_SOURCES_FILE, JSON.stringify({ _schema: STATE_SCHEMAS['config/skill-sources.json'].latest, sources: list }, null, 2));
            syncRemoteSkills(); // 即刻生效：后台重拉市场清单（skillSyncBusy 防重入；失败静默保留旧缓存）
            return marketView();
        }
        if (op === 'mcp-add' || op === 'mcp-remove') {
            const list = readMcpCatalog().map(x => ({ ...x }));
            if (op === 'mcp-add') {
                const item = {
                    id: typeof b.id === 'string' ? b.id.trim() : '',
                    name: typeof b.name === 'string' ? b.name.trim() : '',
                    desc: typeof b.desc === 'string' ? b.desc.trim() : '',
                    pkg: typeof b.pkg === 'string' ? b.pkg.trim() : '',
                    entry: typeof b.entry === 'string' ? b.entry.trim() : '',
                    license: typeof b.license === 'string' ? b.license.trim() : '',
                };
                if (!okMcpItem(item)) return bad('条目不合法：标识需 1-64 位字母数字或 -（且不以 - 开头），名称/说明/许可证/包名/入口都要填，包名与入口只含 @ 字母数字 . - /');
                if (list.some(x => x.id === item.id)) return bad('目录里已有这个标识，换一个');
                list.push(item);
            } else {
                const id = typeof b.id === 'string' ? b.id : '';
                const i = list.findIndex(x => x.id === id);
                if (i < 0) return bad('目录里没有这个条目，请刷新后重试');
                if ((mcpInstallState[id] || {}).stage === 'installing') return bad('这个插件正在安装，等装完再删');
                if (mcpInstalled(id)) return bad('这个插件已安装，先在上方卸载，再从目录删除'); // 孤儿规则：目录删了已装项，config.yaml 块与 vendor 目录会成孤儿
                if (list.length <= 1) return bad('目录至少要保留一个条目'); // 读取器把空 catalog 视为坏配置回落内置默认，写空无意义
                list.splice(i, 1);
            }
            if (!list.length || !list.every(okMcpItem) || new Set(list.map(x => x.id)).size !== list.length) return bad('变更后的目录不合法，已拒绝');
            atomicWrite(MCP_CATALOG_FILE, JSON.stringify({ _schema: STATE_SCHEMAS['config/mcp-catalog.json'].latest, catalog: list }, null, 2));
            return marketView();
        }
        return bad('未知操作');
    } catch (e) {
        const o = { ok: false, err: '保存失败（配置文件可能被占用），请重试' };
        if (e && e.code) o.type = e.code; // upErr 同门：人话+错误码，不带路径
        return o;
    }
}

// ---- s50b: 库里有什么（GET /api/db/overview）——faucet CLI 发现实 + REST 数行数；端点不收任何用户参数 ----
const FAUCET_EXE = path.join(ROOT, 'bin', 'faucet', 'faucet.exe');
const DB_NAME_RE = /^[A-Za-z0-9_\-]+$/; // 服务/表名白名单：来自 faucet 输出，拼 CLI 参数/REST 路径前强制过一遍
function faucetCli(args) {
    return new Promise(resolve => {
        const { execFile } = require('child_process');
        execFile(FAUCET_EXE, args.concat(['--data-dir', path.join(ROOT, 'data', 'faucet')]),
            { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
            (e, stdout) => resolve(e ? null : String(stdout || '')));
    });
}
// s78-C2（research/24 §7）：faucet REST GET 三胞胎（行数/表说明/样例）合并——同构管线（http.get+超时+静默 null），仅 path 与解析不同
function faucetGet(path, port, key, parse) {
    return new Promise(resolve => {
        let rq;
        try {
            rq = require('http').get({ hostname: '127.0.0.1', port, path, headers: { 'X-API-Key': key }, timeout: 4000 }, r => {
                let b = '';
                r.on('data', c => b += c);
                r.on('end', () => { try { resolve(parse(b)); } catch { resolve(null); } });
            });
            rq.on('error', () => resolve(null));
            rq.on('timeout', () => { rq.destroy(); resolve(null); });
        } catch { resolve(null); }
    });
}
// IA-3（裁决 2026-09-07-ia-root-cure §6-d，主控修正版）：表说明唯一真相源=各应用库自带的 forge_table_info 表
// （tbl, description, created_at），由 agent 建表时用已有 faucet 工具写入；桥经 _table 通道只读。
// agent 写的数据按不可信输入处理：缺 tbl 的行跳过、desc 非字符串跳过、超长截断 200 字符。
const TINFO_TBL = 'forge_table_info'; // s78-C2：读管线并入 faucetGet（上方），tinfo 行硬化解析闭包移至 dbOverview 调用点
async function dbOverview() {
    let list;
    try { list = JSON.parse(await faucetCli(['db', 'list', '--json']) || 'x'); } catch { return { ok: false }; }
    if (!Array.isArray(list)) return { ok: false };
    let port = 0, key = '';
    try { port = parseInt(FSS.readFileSync(path.join(ROOT, 'data', 'faucet.port'), 'utf8').trim(), 10) || 0; } catch {}
    try { key = FSS.readFileSync(path.join(ROOT, 'data', 'faucet', '.apikey'), 'utf8').trim(); } catch {}
    const services = [];
    let n = 0, truncated = 0;
    for (const s of list) {
        const svc = (s && s.name) || '';
        if (!DB_NAME_RE.test(svc)) continue;
        const entry = { service: svc, tables: [] };
        services.push(entry);
        let names = [];
        try { names = ((JSON.parse(await faucetCli(['db', 'schema', svc]) || 'x') || {}).tables || []).map(t => (t && t.name) || '').filter(x => DB_NAME_RE.test(x)); } catch {}
        for (const nm of names) {
            if (n >= 50) { truncated++; continue; }
            entry.tables.push({ name: nm, rows: null, desc: null }); n++;
        }
    }
    if (port && key) {
        const jobs = [];
        for (const en of services) {
            for (const t of en.tables) jobs.push(faucetGet('/api/v1/' + en.service + '/_table/' + t.name + '?fields=id', port, key, b => { const j = JSON.parse(b); return j.meta && typeof j.meta.count === 'number' ? j.meta.count : null; }).then(c => { t.rows = c; }));
            jobs.push(faucetGet('/api/v1/' + en.service + '/_table/' + TINFO_TBL + '?max_results=200', port, key, b => {
                const rows = JSON.parse(b).resource;
                if (!Array.isArray(rows)) return null; // 表不存在/读不到 → 无说明，静默降级
                const m = new Map();
                for (const row of rows) {
                    if (!row || typeof row !== 'object') continue;
                    if (typeof row.tbl !== 'string' || typeof row.description !== 'string') continue;
                    m.set(row.tbl, row.description.length > 200 ? row.description.slice(0, 200) : row.description);
                }
                return m.size ? m : null;
            }).then(m => { if (m) for (const t of en.tables) { const d = m.get(t.name); if (d !== undefined) t.desc = d; } })); // IA-3：与行数取数同轮并发，每库一次请求
        }
        await Promise.all(jobs);
    }
    const out = { ok: true, services };
    if (truncated) out.truncated = truncated;
    return out;
}

// ---- s51: 单表结构+样例（GET /api/db/_schema?svc=&tbl=）——小白点表名看「里面装了什么」 ----
function faucetSchema(svc) {
    return faucetCli(['db', 'schema', svc]).then(out => {
        try { return ((JSON.parse(out || 'x') || {}).tables) || null; } catch { return null; }
    });
}
async function dbTableSchema(svc, tbl) {
    if (!DB_NAME_RE.test(svc) || !DB_NAME_RE.test(tbl)) return { ok: false, err: '表名不对，没有这张表。' };
    const tables = await faucetSchema(svc);
    if (!tables) return { ok: false, err: '数据库没在跑或没有这个库，看不了表结构。' };
    const def = tables.find(t => t && t.name === tbl);
    if (!def) return { ok: false, err: '库里没有叫「' + tbl.slice(0, 64) + '」的表。' };
    const columns = (def.columns || []).map(c => ({
        name: (c && c.name) || '',
        raw_type: (c && c.db_type) || '',
        pk: !!(c && c.is_primary_key),
    }));
    let port = 0, key = '';
    try { port = parseInt(FSS.readFileSync(path.join(ROOT, 'data', 'faucet.port'), 'utf8').trim(), 10) || 0; } catch {}
    try { key = FSS.readFileSync(path.join(ROOT, 'data', 'faucet', '.apikey'), 'utf8').trim(); } catch {}
    let samples = null;
    if (port && key) samples = await faucetGet('/api/v1/' + svc + '/_table/' + tbl + '?max_results=3', port, key, b => (JSON.parse(b).resource) || []);
    return { ok: true, columns, samples: Array.isArray(samples) ? samples : null };
}

// ---- GET /api/report：本地诊断报告（小白发给帮忙的人看）----
// 隐私黑名单（硬约束）：secrets.env、conf/goose/config/memory/、会话消息正文——绝不读取。
// 写盘前兜底：含 sk- 形态 key 或 GH_TOKEN 的行整行替换为 <已脱敏>（providers.json 明文 key 已实证存在）。
const REPORTS_DIR = path.join(ROOT, 'data', 'reports');
const REPORT_MAX_BYTES = 256 * 1024; // s64 C: 报告体积硬顶（写盘前截断预算）＝reportTail 定位读预算，单一常量两处引用
function reportSanitize(text) {
    // S2: 黑名单扩充——sk-/ghp_/gho_/github_pat_/AIza…/glpat-/xox[bap]-/GH_TOKEN，命中整行 <已脱敏>
    return String(text).split('\n').map(l => (/\bsk-[A-Za-z0-9][A-Za-z0-9_\-]{3,}|ghp_|gho_|github_pat_|AIza[\w\-]{10,}|glpat\-|xox[bap]\-|GH_TOKEN/i.test(l) ? '<已脱敏>' : l)).join('\n');
}
function reportTail(file, want, skipRe) { // 从尾往前取 want 行，跳过 skipRe 命中行（healthz 噪音），攒够即止
    try {
        // B3: pc.log 无轮转——超 256KB 只定位读尾部 256KB（起点半行丢弃），避免长跑后整读造成内存尖峰+事件循环阻塞
        const MAX = REPORT_MAX_BYTES;
        const st = FSS.statSync(file);
        let all;
        if (st.size > MAX) {
            const fd = FSS.openSync(file, 'r');
            try {
                const buf = Buffer.alloc(MAX);
                FSS.readSync(fd, buf, 0, MAX, st.size - MAX);
                all = buf.toString('utf8').split('\n');
                all[0] = ''; // 起点前被截断的半行不作数
            } finally { FSS.closeSync(fd); }
        } else all = FSS.readFileSync(file, 'utf8').split('\n');
        const out = [];
        for (let i = all.length - 1; i >= 0 && out.length < want; i--) {
            const l = all[i].replace(/\r$/, '');
            if (skipRe && skipRe.test(l)) continue;
            out.push(l);
        }
        return out.reverse();
    } catch { return []; }
}
function reportReadPort(name) {
    try {
        const p = parseInt(FSS.readFileSync(path.join(ROOT, 'data', name), 'utf8').trim(), 10);
        return Number.isFinite(p) && p > 0 ? p : null;
    } catch { return null; }
}
function reportProbe(port) {
    return new Promise(resolve => {
        try {
            const s = require('net').connect({ host: '127.0.0.1', port, timeout: 1500 });
            s.on('connect', () => { s.destroy(); resolve(true); });
            s.on('error', () => resolve(false));
            s.on('timeout', () => { s.destroy(); resolve(false); });
        } catch { resolve(false); }
    });
}
function reportOsVer() {
    // cmd /c ver 在中文 Windows 输出 GBK：取 buffer 按 gbk 解（full-icu），失败回落 utf8
    return new Promise(resolve => {
        try {
            require('child_process').execFile('cmd', ['/c', 'ver'], { timeout: 3000, windowsHide: true, encoding: 'buffer' }, (e, out) => {
                if (e) return resolve('未取到');
                let s = '';
                try { s = new TextDecoder('gbk').decode(out); } catch { s = out.toString('utf8'); }
                resolve(String(s || '').replace(/\uFFFD/g, '').trim() || '未取到');
            });
        } catch { resolve('未取到'); }
    });
}
// ---- s64 A1: 系统代理状态（注册表只读；零污染禁的是写不禁读；失败回落 null → 报告显示 未取到）----
function reportSysProxy() {
    return new Promise(resolve => {
        try {
            require('child_process').execFile('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], { timeout: 3000, windowsHide: true }, (e, out) => {
                if (e) return resolve(null);
                const s = String(out || '');
                const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(s);
                const svM = s.match(/ProxyServer\s+REG_SZ\s+(\S+)/i);
                resolve({ enabled, server: enabled && svM ? svM[1].slice(0, 120) : '' });
            });
        } catch { resolve(null); }
    });
}
// ---- s64 A2: 数据盘剩余空间（fs.statfsSync 取 forge 所在盘；node 22.21 有此 API；失败回落 null）----
function reportDiskFree() {
    try {
        const s = FSS.statfsSync(ROOT);
        const free = Number(s.bavail) * Number(s.bsize);
        return Number.isFinite(free) && free >= 0 ? free : null;
    } catch { return null; }
}
function reportFmtBytes(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
}
// ---- s64 A3: data 膨胀点体积（白名单路径；只报字节合计+文件数，绝不列文件名——ws-* 目录名派生自会话名）----
const REPORT_BLOAT_TARGETS = [
    ['会话库', ['conf', 'goose', 'data', 'sessions']],
    ['工作区', ['data', 'artifacts']],
    ['备份', ['data', 'backups']],
];
function reportDirSize(dir, deadline) { // 迭代遍历防深递归；symlink/junction 跳过防环（工作区引入即 junction）；超预算抛错
    let bytes = 0, files = 0;
    const stack = [dir];
    while (stack.length) {
        if (Date.now() > deadline) throw new Error('统计超时');
        const d = stack.pop();
        let ents;
        try { ents = FSS.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const ent of ents) {
            if (ent.isSymbolicLink()) continue;
            const full = path.join(d, ent.name);
            if (ent.isDirectory()) stack.push(full);
            else if (ent.isFile()) { try { const s = FSS.statSync(full); bytes += s.size; files++; } catch {} }
        }
    }
    return { bytes, files };
}
function reportBloat() { // 全部目标共享 2s 预算；超时项显示 统计超时
    const deadline = Date.now() + 2000;
    return REPORT_BLOAT_TARGETS.map(([label, seg]) => {
        try {
            const r = reportDirSize(path.join(ROOT, ...seg), deadline);
            return label + ' ' + reportFmtBytes(r.bytes) + '（' + r.files + ' 个文件）';
        } catch { return label + ' 统计超时'; }
    }).join('｜');
}
// ---- s64 A4: 定时任务两个数字（只数总数+paused 数；id/title/cron 绝不读取）----
function reportScheduleCounts() {
    const arr = readJson(path.join(ROOT, 'conf', 'goose', 'data', 'schedule.json'), null);
    if (!Array.isArray(arr)) return null;
    return { total: arr.length, paused: arr.filter(x => x && x.paused === true).length };
}
// ---- s64 A5: MCP 清单（复用 readExtState——结构级只取 enabled，mcp 块 env/cmd 任何值进不来；只渲染名称+启停）----
function reportMcpList() {
    const st = readExtState();
    const ks = Object.keys(st).filter(k => k.indexOf('mcp-') === 0);
    if (!ks.length) return '无';
    return ks.map(k => {
        const c = readMcpCatalog().find(m => mcpExtensionId(m.id) === k); // qa返工(P2-1): 目录随配置（配置删条目后报告回落显示扩展 id）
        return (c ? c.name : k) + '（' + (st[k] ? '开' : '停用') + '）';
    }).join('｜');
}
// ---- s64 A6: 已安装技能数量（一个数字，名称绝不入报告）----
function reportSkillCount() {
    try {
        const d = path.join(ROOT, '.agents', 'skills');
        return FSS.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory() && FSS.existsSync(path.join(d, e.name, 'SKILL.md'))).length;
    } catch { return null; }
}
// ---- s64 A7/B: 7 天错误聚合 + 规则式初步诊断（查表，只说不做，绝不自动执行修复）----
// >>> s64 规则区标记（纯函数：输入采集信号对象，输出 null 或文案；探针按标记提取单测）
const REPORT_RULE_TEXTS = {
    r1: '数据库服务没起来。建议：双击桌面的『停止数字员工』，再双击『启动数字员工』，然后重试刚才的事。还不行，就把这份报告发给帮你的人。',
    r2: '数字员工还没有配『钥匙』。建议：看聊天窗口顶部的引导条，点它去配。还不行，就把这份报告发给帮你的人。',
    r3: '最近有『钥匙失效』的记录。建议：到设置里把模型钥匙重新配一遍。还不行，就把这份报告发给帮你的人。',
    r4: '启动端口被别的程序占了。建议：重启电脑后再双击启动；还不行就把这份报告发给帮你的人。',
    r5: '电脑开着代理，最近也有连不上网的记录，可能有关。建议：把这份报告发给帮你的人判断，先不要自己改代理设置。',
    none: '没发现明显的毛病，请把『请补充说明』填好一起发。',
};
function reportRuleR1(sig) { return sig.faucetAlive === false ? REPORT_RULE_TEXTS.r1 : null; }
function reportRuleR2(sig) { return sig.provHasKey ? null : REPORT_RULE_TEXTS.r2; }
function reportRuleR3(sig) { return sig.unauthorized > 0 ? REPORT_RULE_TEXTS.r3 : null; }
function reportRuleR4(sig) { return sig.logHasEaddrinuse ? REPORT_RULE_TEXTS.r4 : null; }
function reportRuleR5(sig) { return (sig.proxyOn && sig.upstreamTotal > 0 && !(sig.unauthorized > 0)) ? REPORT_RULE_TEXTS.r5 : null; } // R3 去重：钥匙失效已报则不重复触发
// <<< s64 规则区标记结束
function reportErrLine(a) { // A7 人话汇总一行
    if (!(a.upstream > 0)) return '最近 7 天：没有连不上模型的记录';
    const names = { unauthorized: '钥匙失效', rate: '限流', timeout: '超时', server: '服务端错误' };
    const det = Object.keys(names).filter(k => a.kind[k] > 0).map(k => names[k] + ' ' + a.kind[k] + ' 次').join('、');
    return '最近 7 天：连不上模型 ' + a.upstream + ' 次（' + det + '）';
}
async function buildReport() {
    const p2 = n => String(n).padStart(2, '0');
    const now = new Date();
    // 环境采集（并行，全部只读）
    const pcPort = reportReadPort('pc.port'), faucetPort = reportReadPort('faucet.port');
    const [osVer, pcAlive, faucetAlive, sysProxy] = await Promise.all([
        reportOsVer(),
        pcPort ? reportProbe(pcPort) : Promise.resolve(null),
        faucetPort ? reportProbe(faucetPort) : Promise.resolve(null),
        reportSysProxy(),
    ]);
    let upd = '无（data/updates/status.json 不存在）';
    try { upd = FSS.readFileSync(path.join(ROOT, 'data', 'updates', 'status.json'), 'utf8').trim() || upd; } catch {}
    let usageFiles = [];
    try { usageFiles = FSS.readdirSync(STATS_DIR).filter(n => /^usage-\d{8}\.json$/.test(n)).sort().slice(-7); } catch {}
    // s64: 统计原文一次读入（嵌报告+聚合两用，截断重渲染不重复读盘）；A7 只累加 upstreamByKind 四键
    const statsRaw = usageFiles.map(f => {
        let raw = '(读不到)';
        try { raw = FSS.readFileSync(path.join(STATS_DIR, f), 'utf8').trim(); } catch {}
        return [f, raw];
    });
    const errAgg = { upstream: 0, kind: { unauthorized: 0, rate: 0, timeout: 0, server: 0 } };
    for (const [, raw] of statsRaw) {
        let j = null; try { j = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch {}
        const k = ((j && j.errorsByType) || {}).upstreamByKind || {};
        for (const key of Object.keys(errAgg.kind)) errAgg.kind[key] += Number(k[key]) || 0;
    }
    errAgg.upstream = errAgg.kind.unauthorized + errAgg.kind.rate + errAgg.kind.timeout + errAgg.kind.server;
    // providers 脱敏：key/apiKey 一律替换，其余字段保留（provHasKey 是 R2 信号，先于脱敏取）
    const provsRaw = readProviders();
    const provHasKey = provsRaw.some(pr => (pr.key !== undefined && pr.key !== '') || (pr.apiKey !== undefined && pr.apiKey !== ''));
    const provs = provsRaw.map(pr => {
        const q = { ...pr };
        if (q.key !== undefined) q.key = pr.key ? '<已配置>' : '<未配置>';
        if (q.apiKey !== undefined) q.apiKey = pr.apiKey ? '<已配置>' : '<未配置>';
        return q;
    });
    // 会话元数据：只读 sessions 表（计数+最近一条），绝不读 messages 正文
    let sessLine = '未取到（会话库不可读）';
    try {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db'));
        const total = db.prepare('SELECT count(*) c FROM sessions').get().c;
        const q = db.prepare('SELECT count(*) c FROM sessions WHERE id = ?');
        let archN = 0;
        for (const sid of Object.keys(readArch())) archN += q.get(sid).c;
        const last = db.prepare('SELECT name, provider_name, model_config_json, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 1').get();
        db.close();
        let model = '';
        try { model = JSON.parse((last && last.model_config_json) || '{}').model_name || ''; } catch {}
        sessLine = '总会话 ' + total + '｜归档 ' + archN + '｜活跃 ' + (total - archN) +
            '；最近会话：名称「' + ((last && last.name) || '未命名') + '」｜模型 ' + (model || '未知') +
            '｜接口 ' + ((last && last.provider_name) || '未知') + '｜最后活动 ' + ((last && last.updated_at) || '未知');
    } catch {}
    const pcTail = reportTail(path.join(ROOT, 'data', 'logs', 'pc.log'), 300, /healthz/);
    const bakTail = reportTail(path.join(ROOT, 'data', 'logs', 'backup.log'), 30, null);
    const alive = v => v === null ? '未探测' : (v ? '存活' : '未响应');
    // s64: 头部短行采集（A1-A6，全只读）
    const diskFree = reportDiskFree();
    const bloatLine = reportBloat();
    const sched = reportScheduleCounts();
    const mcpLine = reportMcpList();
    const skillN = reportSkillCount();
    // s64 B: 规则式初步诊断（查表输出，先于日志节组装——R4 信号来自 pcTail）
    const sig = {
        faucetAlive,
        provHasKey,
        unauthorized: errAgg.kind.unauthorized,
        upstreamTotal: errAgg.upstream,
        logHasEaddrinuse: pcTail.some(l => l.indexOf('EADDRINUSE') >= 0),
        proxyOn: !!(sysProxy && sysProxy.enabled),
    };
    const diag = [reportRuleR1(sig), reportRuleR2(sig), reportRuleR3(sig), reportRuleR4(sig), reportRuleR5(sig)].filter(Boolean);
    const proxyLine = sysProxy === null ? '未取到' : (sysProxy.enabled ? '开启' + (sysProxy.server ? '（' + sysProxy.server + '）' : '') : '关闭');
    let head = '# PocketForge 诊断报告\n\n';
    head += '- 生成时间：' + now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()) + ' ' + p2(now.getHours()) + ':' + p2(now.getMinutes()) + ':' + p2(now.getSeconds()) + '\n';
    head += '- 版本（VERSION 文件）：' + APP_VERSION + '\n';
    head += '- 升级状态：' + upd + '\n';
    head += '- 提示：这份报告里可能带少量聊天痕迹（比如日志里的一句话），发给别人之前可以自己翻一遍，不放心就先删改再发。\n\n';
    head += '## 小forge自己看到的毛病\n\n';
    head += (diag.length ? diag.map(d => '- ' + d).join('\n') : REPORT_RULE_TEXTS.none) + '\n\n';
    head += '## 快速判断\n\n- ' + reportErrLine(errAgg) + '\n\n';
    head += '## 环境\n\n';
    head += '- 操作系统：' + osVer + '\n- Node：' + process.version + '\n';
    head += '- 系统代理：' + proxyLine + '｜NO_PROXY：' + String(process.env.NO_PROXY || '未设置').slice(0, 120) + '\n';
    head += '- 数据盘剩余空间：' + (diskFree === null ? '未取到' : reportFmtBytes(diskFree)) + '\n';
    head += '- 膨胀点体积：' + bloatLine + '\n';
    head += '- 定时任务：' + (sched === null ? '未取到' : sched.total + ' 个（暂停 ' + sched.paused + ' 个）') + '\n';
    head += '- MCP 扩展：' + mcpLine + '\n';
    head += '- 已安装技能：' + (skillN === null ? '未取到' : skillN + ' 个') + '\n';
    head += '- 进程：\n  - chat-bridge（本服务，端口 ' + PORT + '）：运行中\n';
    head += '  - pc（进程管理器，端口 ' + (pcPort || '未知') + '）：' + alive(pcAlive) + '\n';
    head += '  - faucet（数据库服务，端口 ' + (faucetPort || '未知') + '）：' + alive(faucetAlive) + '\n\n';
    // 可截节（渲染函数按行数出内容；n<全长时末尾加（已截断））
    const secLog = n => '## 日志（pc.log 尾部 ' + n + ' 行，已过滤 faucet healthz 探活噪音）\n\n```\n' + pcTail.slice(0, n).join('\n') + (n < pcTail.length ? '\n（已截断）' : '') + '\n```\n\n';
    const secBak = n => bakTail.length
        ? '## 备份日志（backup.log 尾部 ' + (n ? n + ' 行' : '无') + '）\n\n```\n' + bakTail.slice(0, n).join('\n') + (n < bakTail.length ? '\n（已截断）' : '') + '\n```\n\n'
        : '## 备份日志（backup.log 尾部无）\n\n无\n\n';
    const secStats = n => {
        const fs2 = n ? statsRaw.slice(-n) : []; // 最新优先保留
        let s = '## 使用统计（最近 ' + fs2.length + ' 天，data/stats 原文）\n\n';
        for (const [f, raw] of fs2) s += '### ' + f + '\n\n```json\n' + raw + '\n```\n\n';
        if (!fs2.length) s += '无\n\n';
        if (n < statsRaw.length) s += '（已截断）\n\n';
        return s;
    };
    const tailMd = '## 模型接口配置（key 已脱敏）\n\n```json\n' + JSON.stringify(provs, null, 2) + '\n```\n\n' +
        '## 会话概况（只含元数据，不含聊天内容）\n\n' + sessLine + '\n\n' +
        '---\n\n## 请补充说明（填好再发出去）\n\n1. 什么时候出的问题：\n2. 当时做了什么操作：\n3. 期望的结果是什么：\n\n' +
        '## GitHub issue 模板（复制即贴）\n\n标题：问题：\n\n正文：\n- 环境：（把本报告「环境」一节粘贴在这里）\n- 复现步骤：\n  1.\n  2.\n- 实际结果：\n- 期望结果：\n';
    // s64 C: 体积硬顶（写盘前）——按节截断 pc.log→backup.log→统计 JSON；毛病/快速判断/环境与结构化短行绝不截
    // 例外（qa P3-1）：head/tail 段（providers JSON/status.json 原文/会话概况行）自身超限时写盘可超 REPORT_MAX_BYTES——依赖上游字段有界（qa 沙箱实证 473KB 角落，产品路径不可达），不做运行时钳制
    let nLog = pcTail.length, nBak = bakTail.length, nStats = statsRaw.length;
    const render = () => head + secLog(nLog) + secBak(nBak) + secStats(nStats) + tailMd;
    while (Buffer.byteLength(render()) > REPORT_MAX_BYTES) {
        if (nLog > 0) nLog = Math.floor(nLog / 2);
        else if (nBak > 0) nBak = Math.floor(nBak / 2);
        else if (nStats > 1) nStats = Math.floor(nStats / 2);
        else break;
    }
    const md = render();
    // 落盘（原子写）+ 返回绝对路径
    FSS.mkdirSync(REPORTS_DIR, { recursive: true });
    const stamp = '' + now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + '-' + p2(now.getHours()) + p2(now.getMinutes());
    const file = path.join(REPORTS_DIR, 'report-' + stamp + '.md');
    atomicWrite(file, reportSanitize(md));
    console.log('report generated:', file);
    return { ok: true, path: file };
}

// s75：桥端升级前自备份（s69 遗留①/s73 阻断实证的机制化兜底）。
// 存量升级由旧版 runner 执行（运行中不换代码），PROTECTED 保全只对「由新版 runner 执行的
// 升级」生效——v0.9.8/9 存量路径实测 config.yaml/custom_providers/memory 被删重建。桥是
// 触发升级时机器上正在跑的代码，由它在 spawn runner 前同步快照用户态配置，不依赖 runner 版本。
// 落点 data/backups/pre-upgrade-<ts>/（package.sh 已排除，不进升级包）；keep 3 与 pg-dumps/
// forge-backup 轮换同语义。失败面与 PROTECTED 家族一致：磁盘满等失败只 warn 进 /api/update/
// status 的 warnings，升级照常——备份是兜底不是闸门（runner 侧「写入失败不得让升级失败」同款）。
function preUpgradeBackup(pkg) {
    function countFiles(d) { let n = 0; for (const ent of FSS.readdirSync(d, { withFileTypes: true })) { if (ent.isDirectory()) n += countFiles(path.join(d, ent.name)); else if (ent.isFile()) n++; } return n; }
    const bdir = path.join(ROOT, 'data', 'backups');
    try {
        // stateWarnings 是内存态：失败族警告必须由下一次评估清除（含幂等复用路径），否则残留到桥重启
        for (let i = stateWarnings.length - 1; i >= 0; i--) if (stateWarnings[i].indexOf('升级前自动备份失败') === 0) stateWarnings.splice(i, 1);
        FSS.mkdirSync(bdir, { recursive: true }); // 全新机器可能尚无该目录（首次每日备份前），缺失≠备份失败
        // 幂等：同一包（名字+字节或下载地址）重复触发不堆积——最新一份 manifest 记的就是它则复用
        const olds = FSS.readdirSync(bdir).filter(n => /^pre-upgrade-/.test(n)).sort();
        if (olds.length) {
            const man = readJson(path.join(bdir, olds[olds.length - 1], 'manifest.json'), null);
            if (man && man.pkg === pkg) { console.log('pre-upgrade backup: same pkg, reuse ' + olds[olds.length - 1]); return; }
        }
        const name = 'pre-upgrade-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const dst = path.join(bdir, name);
        const items = {};
        for (const rel of ['conf/goose/config', 'data/config']) { // s73 丢失清单全体 + data/config（skill-sources/mcp-catalog）
            const src = path.join(ROOT, rel.split('/').join(path.sep));
            let n = 0;
            if (FSS.existsSync(src)) { FSS.cpSync(src, path.join(dst, rel.split('/').join(path.sep)), { recursive: true, force: true }); n = countFiles(src); }
            items[rel] = n;
        }
        FSS.writeFileSync(path.join(dst, 'manifest.json'), JSON.stringify({ pkg, from: APP_VERSION, ts: Date.now(), items }, null, 2));
        FSS.writeFileSync(path.join(dst, '恢复说明.txt'),
            '这是升级前的自动备份（PocketForge 生成，最多保留 3 份，旧的会被清掉）。\r\n' +
            '来源版本：' + APP_VERSION + '\r\n' +
            '备份内容：conf 下的 config = 模型服务商、能力开关、长期记忆、权限规则、配方；data 下的 config = 技能源与 MCP 商店设置。\r\n' +
            '什么时候用：升级后发现「它能什么」开关、服务商、记忆或技能源丢了，就按下面步骤放回。\r\n' +
            '恢复步骤：\r\n' +
            '  1. 运行「停止数字员工.cmd」完全退出\r\n' +
            '  2. 把本文件夹里 conf 下的 config 文件夹，整个复制到安装目录的 conf\\goose\\ 下覆盖\r\n' +
            '  3. 把本文件夹里 data 下的 config 文件夹，整个复制到安装目录的 data\\ 下覆盖\r\n' +
            '  4. 双击「启动数字员工.cmd」\r\n');
        const all = FSS.readdirSync(bdir).filter(n => /^pre-upgrade-/.test(n)).sort();
        while (all.length > 3) FSS.rmSync(path.join(bdir, all.shift()), { recursive: true, force: true });
        console.log('pre-upgrade backup: ' + name + ' ' + JSON.stringify(items));
    } catch (e) {
        const msg = '升级前自动备份失败（升级会继续）：' + (e.message || e) + '。如需保险，请先手动复制 conf\\goose\\config 文件夹';
        if (!stateWarnings.includes(msg)) stateWarnings.push(msg);
        console.warn(msg);
    }
}

// C5（research/24 §7）：/api/update/upload 整段自 handleHttp 平移顶层——豁免段语义零触碰（s68 预检豁免 + PK 魔数 + .part 唯一化，见段内注释）
function handleUpdateUpload(req, res, url) {
    // 离线升级：小白把下载好的 zip 和 .sha256 都从弹窗选进来（单文件逐个传）。
    // v0.9.10（裁决 docs/verdicts/2026-09-05-offline-upgrade-sha.md c 方案，s69 遗留⑨）：
    // 桥端自算自验——zip 收完做字节数对账+PK 魔数预检（先落 .part，任何失败即清理，不留垃圾暂存，
    // 关闭旧 upload 不校验内容留垃圾问题）；.sha256 收完对暂存 zip 实算哈希比对，一致才落位
    // <zip>.sha256——update-runner 的 verifySha 原样消费，runner 零改动。UI 上传控件下批。
    const qs = new URL(req.url, 'http://x').searchParams;
    const fname = (qs.get('name') || ('PocketForge-manual-' + Date.now() + '.zip')).replace(/[\/:*?"<>|]/g, '_');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    const UPD_DIR = path.join(ROOT, 'data', 'updates');
    if (/\.sha256$/.test(fname)) {
        // 校验文件：小文本（sha256sum 产物百来字节），缓冲后解析比对
        if (!/^PocketForge-[\w.-]+\.zip\.sha256$/.test(fname)) { res.end(JSON.stringify({ ok: false, err: '校验文件名需形如 PocketForge-*.zip.sha256' })); return; }
        const chunks = []; let bytes = 0;
        req.on('data', c => { bytes += c.length; if (bytes <= 65536) chunks.push(c); });
        req.on('end', () => {
            const raw = Buffer.concat(chunks);
            if (bytes > 65536) { res.end(JSON.stringify({ ok: false, err: '校验文件过大（应为 sha256sum 生成的百来字节文本）' })); return; }
            const expect = ((raw.toString('utf8').match(/^([0-9a-fA-F]{64})/) || [])[1] || '').toLowerCase();
            if (!expect) { res.end(JSON.stringify({ ok: false, err: '校验文件格式不对（应为 sha256sum 生成的校验文件）' })); return; }
            const zname = fname.slice(0, -'.sha256'.length);
            const zpath = path.join(UPD_DIR, zname);
            if (!FSS.existsSync(zpath)) { res.end(JSON.stringify({ ok: false, err: '请先上传安装包 ' + zname })); return; }
            sha256File(zpath).then(actual => {
                if (actual !== expect) { res.end(JSON.stringify({ ok: false, err: '校验不一致：安装包和校验文件不配套，请重新下载这两个文件' })); return; }
                FSS.writeFileSync(path.join(UPD_DIR, fname), raw);
                console.log('update upload verified:', zname);
                res.end(JSON.stringify({ ok: true, name: fname, verified: true }));
            }).catch(e => res.end(JSON.stringify(upErr(e, '校验读取失败（安装包可能正被占用），请重试'))));
        });
        return;
    }
    if (!/^PocketForge-[\w.-]+\.zip$/.test(fname)) { res.end(JSON.stringify({ ok: false, err: '文件名需形如 PocketForge-*.zip' })); return; }
    FSS.mkdirSync(UPD_DIR, { recursive: true });
    const declared = parseInt(req.headers['content-length'] || '0', 10) || 0;
    // qa返工(P3-3): .part 唯一化——wx 独占创建防同名并发上传互踩；撞车换随机名重试一次，两败即拒（不留半开句柄）
    let tmpPath = '', ws2 = null;
    for (let i = 0; i < 2 && !ws2; i++) {
        const p = path.join(UPD_DIR, fname + '.' + process.pid.toString(36) + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.part');
        try { const fd = FSS.openSync(p, 'wx'); ws2 = FSS.createWriteStream(p, { fd }); tmpPath = p; } catch {}
    }
    if (!ws2) { res.end(JSON.stringify({ ok: false, err: '上传太频繁，请稍后再试' })); return; }
    let got = 0, doneResp = false, reqEnded = false, failed = false;
    const fail = (err) => {
        if (doneResp) return;
        doneResp = true; failed = true;
        try { ws2.destroy(); } catch {}
        res.end(JSON.stringify(typeof err === 'string' ? { ok: false, err } : err)); // P3-1: 对象形态=upErr() 产物（人话+type），直接透传
    };
    req.on('data', c => { got += c.length; });
    req.on('end', () => { reqEnded = true; });
    req.on('error', () => fail('上传中断'));
    // Node≥16：body 完整读完也发 close（早于 finish）——只有「没读完就断」才算中断
    req.on('close', () => { if (!reqEnded) fail('上传中断'); });
    ws2.on('error', e => fail(upErr(e, '安装包保存失败（磁盘可能已满或被占用），请重试')));
    // 失败清理放在流 close（fd 释放）之后——Windows 上删已打开文件不可靠
    ws2.on('close', () => { if (failed) { try { FSS.rmSync(tmpPath, { force: true }); } catch {} } });
    req.pipe(ws2);
    ws2.on('finish', () => {
        if (doneResp) return;
        // 字节数对账：实收与声明不一致（截断/中断）→ 拒+清理
        if (declared && got !== declared) { fail('传输不完整（应收 ' + declared + ' 字节，实收 ' + got + '），请重新上传'); return; }
        try {
            const fd = FSS.openSync(tmpPath, 'r');
            const head = Buffer.alloc(4); FSS.readSync(fd, head, 0, 4, 0); FSS.closeSync(fd);
            if (head.toString('latin1') !== 'PK\x03\x04') { fail('这不是有效的安装包（文件已损坏），请重新下载'); return; }
            FSS.renameSync(tmpPath, path.join(UPD_DIR, fname));
            doneResp = true;
            console.log('update upload staged:', fname, got, 'bytes');
            res.end(JSON.stringify({ ok: true, name: fname, bytes: got }));
        } catch (e) { fail(upErr(e, '安装包落位失败（文件可能被占用），请重试')); }
    });
}

// C5（research/24 §7）：/api/schedules 整段自 handleHttp 平移顶层（含 schedToggle/readTitle/driftOf/readIfOk 四嵌套函数一并平移；
// sched-drift-probe 锚点=函数签名+尾部 catch 字面量，不锚缩进/行号）
function handleSchedules(req, res, url) {
    // s32: 定时任务只读列表+删除（ADR-0010 复议：写入走 agent 自然语言→goose schedule add，
    // UI 不暴露 cron；删除经 goose CLI 处理 store 清理，不手改 schedule.json）。
    const SCHED = path.join(ROOT, 'conf', 'goose', 'data', 'schedule.json');
    function readTitle(source) {
        try {
            const m = FSS.readFileSync(source, 'utf8').match(/^title:\s*(.+)$/m);
            return m ? m[1].trim() : null;
        } catch { return null; }
    }
    // s55: 暂停/恢复——短命 `goose acp --enable-scheduler` 发 ACP custom request（改内存+persist 落盘）。
    // 进程即用即弃，不与 cron 守护共存；运行中 pause 会报 "Cannot pause running schedule"，原样回传。
    // 落盘后须重启 goose-scheduler 守护重载（守护 sync 只增删 id 不读 paused）；重启失败降级 warn 不欺骗。
    function schedToggle(id, op, res) {
        const { spawn, execFile } = require('child_process');
        const child = spawn(GOOSE, ['acp', '--enable-scheduler'], {
            env: { ...process.env, GOOSE_PATH_ROOT: path.join(ROOT, 'conf', 'goose'), GOOSE_DISABLE_KEYRING: '1', NO_PROXY: (process.env.NO_PROXY || '127.0.0.1,localhost') },
            stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
        });
        const done = (payload, code) => {
            if (res.writableEnded) return; // qa-P1: 25s 超时先回包后，pc restart(30s) 迟到回调再写已结束响应会抛 uncaughtException
            try { child.kill(); } catch {}
            res.writeHead(code || 200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(payload));
        };
        let buf = '', errOut = '';
        child.stdout.on('data', d => {
            buf += d.toString('utf8');
            let i;
            while ((i = buf.indexOf('\n')) !== -1) {
                const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
                if (!line) continue;
                let m; try { m = JSON.parse(line); } catch { continue; }
                if (m.id === undefined || (m.result === undefined && m.error === undefined)) continue;
                if (m.id === 1) { // initialize 回包 → 发 initialized + custom request
                    try {
                        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n');
                        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: '_goose/unstable/schedules/' + (op === 'resume' ? 'unpause' : 'pause'), params: { scheduleId: id } }) + '\n');
                    } catch (e) { done({ ok: false, err: '暂停操作失败' }); }
                } else if (m.id === 2) {
                    if (m.error) {
                        const msg = String((m.error.data && (typeof m.error.data === 'string' ? m.error.data : m.error.data.message)) || m.error.message || '');
                        done({ ok: false, err: msg.includes('running schedule') ? '任务正在运行，等它跑完再暂停' : (msg.slice(0, 200) || '操作失败') });
                    } else {
                        // 落盘成功 → 重启守护重载盘面值；失败降级 warn（ok 仍 true）
                        let pcPort = '8099';
                        try { pcPort = FSS.readFileSync(path.join(ROOT, 'data', 'pc.port'), 'utf8').trim() || pcPort; } catch {}
                        execFile(path.join(ROOT, 'bin', 'pc', 'process-compose.exe'),
                            ['-p', pcPort, 'process', 'restart', 'goose-scheduler'],
                            { timeout: 30000, windowsHide: true }, (e) => {
                                done(e ? { ok: true, warn: '任务已' + (op === 'resume' ? '恢复' : '暂停') + '，但后台调度器重启失败，下次到点可能仍会' + (op === 'resume' ? '跳过' : '执行') } : { ok: true });
                            });
                    }
                }
            }
        });
        child.stderr.on('data', d => { errOut += d; if (errOut.length > 4000) errOut = errOut.slice(-2000); });
        child.on('error', () => done({ ok: false, err: '暂停服务启动失败' }));
        child.on('close', () => { if (!res.writableEnded) done({ ok: false, err: '暂停服务异常退出' }); });
        try {
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } } }) + '\n');
        } catch (e) { done({ ok: false, err: '暂停服务启动失败' }); }
        setTimeout(() => { if (!res.writableEnded) done({ ok: false, err: '操作超时，请重试' }); }, 25000).unref();
    }
    if (req.method === 'GET') {
        let list = [];
        try { list = JSON.parse(FSS.readFileSync(SCHED, 'utf8')); } catch {}
        // s75: 源配方↔注册副本只读对账（裁决 docs/verdicts/2026-09-07-scheduler-drift-guard.md S1）。
        // 触发读的是注册副本，改源配方不传导；副本文件名=schedule id ≠ 源配方名，basename 落空后按
        // title 唯一匹配兜底；内容不等=drift。base_dir 缺失/无匹配/多匹配/源被删 → 静默 false（宁漏报不误报）。
        function readIfOk(p) { try { return FSS.readFileSync(p, 'utf8'); } catch { return null; } }
        function driftOf(j) {
            try {
                if (!j || typeof j.source !== 'string' || typeof j.recipe_base_dir !== 'string') return false;
                const copy = readIfOk(j.source);
                if (copy === null) return false; // 副本是任务活体，读不到不算漂移
                const baseDir = j.recipe_base_dir.replace(/^\\\\\?\\/, '');
                let src = readIfOk(path.join(baseDir, path.basename(j.source)));
                if (src === null) { // basename 必失败是实态（副本名=id）→ title 兜底
                    const t = readTitle(j.source);
                    if (!t) return false;
                    const hits = FSS.readdirSync(baseDir).filter(f => readTitle(path.join(baseDir, f)) === t);
                    if (hits.length !== 1) return false; // 0=源已删 >1=同名歧义
                    src = readIfOk(path.join(baseDir, hits[0]));
                    if (src === null) return false;
                }
                return src !== copy;
            } catch { return false; }
        }
        json200(res, list.map(j => ({
            id: j.id, cron: j.cron, paused: !!j.paused,
            title: readTitle(j.source) || j.id,
            lastRun: j.last_run || null,
            drift: driftOf(j),
        })));
    } else if (req.method === 'POST') {
        // 删除经 goose CLI（比手改 json 安全：会同步清 store 里的 recipe）
        // op=pause/resume 经短命 `goose acp --enable-scheduler` 子进程发 ACP custom request
        // （_goose/unstable/schedules/pause|unpause）：桥自己的 acp 没开 scheduler（method_not_found），
        // CLI 无 pause 子命令，手改 schedule.json 会被守护回滚——唯一落盘路径就是这条（s55 实证）。
        readJsonBody(req, res, raw => {
            let id = '', op = '';
            try { const b = JSON.parse(raw.toString('utf8')); if (typeof b.id !== 'string' || (b.op !== undefined && typeof b.op !== 'string')) throw 0; id = b.id; op = b.op || ''; } catch {} // s58 修正：op 缺省=删除（UI 删除按钮不传 op），只拒非字符串的 op
            // fuzz 发现：String([v])==='v'，数组/原始值会被静默字符串化绕过类型面——只收 string
            if (!/^[\w\-\.]{1,64}$/.test(id) || (op && !['pause', 'resume'].includes(op))) {
                json200(res, { ok: false, err: '参数不合法' }); return;
            }
            if (op) return schedToggle(id, op, res);
            const { spawn, execFile } = require('child_process');
            const p = spawn(GOOSE, ['schedule', 'remove', '--schedule-id', id], {
                env: { ...process.env, GOOSE_PATH_ROOT: path.join(ROOT, 'conf', 'goose'), GOOSE_DISABLE_KEYRING: '1', NO_PROXY: (process.env.NO_PROXY || '127.0.0.1,localhost') },
            });
            let out = '';
            p.stdout.on('data', c => out += c);
            p.stderr.on('data', c => out += c);
            p.on('close', code => {
                if (code !== 0) { json200(res, { ok: false, out: out.slice(0, 300) }); return; }
                // s58: 删除同款守护盲区——守护内存条目不随盘清，重启重载（失败降级 warn 不欺骗）
                let pcPort = '8099';
                try { pcPort = FSS.readFileSync(path.join(ROOT, 'data', 'pc.port'), 'utf8').trim() || pcPort; } catch {}
                execFile(path.join(ROOT, 'bin', 'pc', 'process-compose.exe'),
                    ['-p', pcPort, 'process', 'restart', 'goose-scheduler'],
                    { timeout: 30000, windowsHide: true }, (e) => {
                        if (res.writableEnded) return;
                        json200(res, e ? { ok: true, warn: '已删除，但后台调度器重启失败，任务可能仍会执行一次' } : { ok: true, out: out.slice(0, 300) });
                    });
            });
        });
    } else { res.writeHead(405); res.end(); }
}

// C5（research/24 §7）：/api/skillstore 整段自 handleHttp 平移顶层
function handleSkillstore(req, res, url) {
    // s42: 技能商店（本地优先）。可装技能放 skills-repo/<name>/SKILL.md；
    // 安装 = 整目录复制到 .agents/skills/<name>/（纯文本复制，无执行面）。
    const REPO = path.join(ROOT, 'skills-repo');
    const INSTALLED = path.join(ROOT, '.agents', 'skills');
    function readSkillMeta(dir) {
        try {
            const raw = FSS.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
            return { dir: path.basename(dir), ...parseSkillMeta(raw, path.basename(dir)) };
        } catch { return null; }
    }
    if (req.method === 'GET') {
        const qp = new URL(req.url, 'http://x').searchParams;
        const isRemote = qp.get('remote') === '1';
        // s56: 预览走缓存原文（dir 白名单 + 保留设备名过滤；不存在回落 err 人话）
        const preview = qp.get('preview');
        if (preview !== null) {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            if (!/^[\w\-]{1,64}$/.test(preview) || !fileNameSafe(preview)) { res.end(JSON.stringify({ ok: false, err: '参数不合法' })); return; }
            try {
                const body = FSS.readFileSync(path.join(SKILL_CACHE, preview, 'SKILL.md'), 'utf8');
                res.end(JSON.stringify({ ok: true, body: body.slice(0, 4000) }));
            } catch { res.end(JSON.stringify({ ok: false, err: '内容还没缓存，安装后可见' })); }
            return;
        }
        const installedSet = new Set();
        try { for (const e of FSS.readdirSync(INSTALLED, { withFileTypes: true })) if (e.isDirectory()) installedSet.add(e.name); } catch {}
        // s45: 远程技能源（anthropics/skills，开源；经代理访问 GitHub API）
        if (isRemote) {
            listRemoteSkills(installedSet, res);
            return;
        }
        const out = [];
        try {
            for (const ent of FSS.readdirSync(REPO, { withFileTypes: true })) {
                if (!ent.isDirectory()) continue;
                const meta = readSkillMeta(path.join(REPO, ent.name));
                if (!meta) continue;
                out.push({ ...meta, dir: ent.name, installed: installedSet.has(ent.name) });
            }
        } catch {}
        json200(res, out);
    } else if (req.method === 'POST') {
        readJsonBody(req, res, async raw => {
            try {
                const b = JSON.parse(raw.toString('utf8'));
                // s50h(FIND-3): 白名单外再过保留设备名（con 等），remote 与本地复制两分支同门
                if (typeof b.name !== 'string' || !/^[\w\-]{1,64}$/.test(b.name) || !fileNameSafe(b.name)) throw new Error('参数不合法');
                // s57: op=uninstall 删 .agents/skills/<dir>（白名单与安装同门）
                if (b.op === 'uninstall') {
                    const dst = path.join(INSTALLED, b.name);
                    if (!FSS.existsSync(path.join(dst, 'SKILL.md'))) throw new Error('没有安装这个技能，不用卸载');
                    FSS.rmSync(dst, { recursive: true, force: true });
                    json200(res, { ok: true, note: '已卸载' });
                    return;
                }
                if (b.remote) { installRemoteSkill(b.name, res); return; }
                const src = path.join(REPO, b.name);
                const dst = path.join(INSTALLED, b.name);
                if (!FSS.existsSync(path.join(src, 'SKILL.md'))) throw new Error('商店里没有这个技能');
                const blocked = skillInstallBlocked(dst); // s70: 同名冲突保护（本地精选目录安装同门）
                if (blocked) throw new Error(blocked);
                // qa返工(P2-2): 本地复制同门原子安装——写 origin 失败（P3-1）随整体回滚，不假成功
                await installAtomic(dst, async tmp => {
                    FSS.cpSync(src, tmp, { recursive: true });
                    writeSkillOrigin(tmp, 'local', 'skills-repo', '');
                });
                json200(res, { ok: true });
            } catch (e) {
                json200(res, { ok: false, err: e.message });
            }
        });
    } else { res.writeHead(405); res.end(); }
}

async function handleHttp(req, res) {
    const url = (req.url || '/').split('?')[0];
    // R2-C1b(审查s17): WS 层有 Origin 校验，HTTP 层没有——恶意网页可跨站 POST
    // （删记忆/关扩展/删工作区/触发升级）。非本源 Origin 的写请求一律拒绝；
    // 无 Origin = 同源导航/curl/Edge --app 页面，放行。
    const origin = req.headers.origin || '';
    if (origin && origin !== 'http://127.0.0.1:' + PORT && req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, err: '跨站请求被拒绝' }));
        return;
    }
    // s50c: POST 预检——声明超预算的直接 413，不收 body（防内存被撑爆）
    // s68 豁免 /api/update/upload：离线升级包 300MB+，端点本身 req.pipe 落盘零内存积压，
    //     预检不豁免 = 设置面板离线升级通道对任何版本永远 413（v0.9.8→v0.9.9 演练实锤）。
    if (req.method === 'POST') {
        const cl = parseInt(req.headers['content-length'] || '0', 10) || 0;
        if (cl > POST_MAX_BYTES && !url.startsWith('/api/update/upload')) {
            res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, err: '文件太大（上限 50MB）' }));
            req.destroy();
            return;
        }
    }
    if (url === '/' ) {
        const html = require('fs').readFileSync(PAGE, 'utf8').replace('__FORGE_ROOT__', ROOT.split(String.fromCharCode(92)).join('/'));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache, no-store, must-revalidate' });
        res.end(html);
    } else if (url === '/healthz') { res.writeHead(200); res.end('ok'); }
    else if (url === '/api/skills') {
        // scan .agents/skills/*/SKILL.md (project) + conf/goose/config/skills (global-ish)
        const out = [];
        const dirs = [path.join(ROOT, '.agents', 'skills')];
        for (const d of dirs) {
            try {
                for (const ent of require('fs').readdirSync(d, { withFileTypes: true })) {
                    if (!ent.isDirectory()) continue;
                    const f = path.join(d, ent.name, 'SKILL.md');
                    try {
                        const raw = require('fs').readFileSync(f, 'utf8');
                        const nl = String.fromCharCode(10);
                        const lines = raw.split(nl);
                        let meta = {}; const bodyLines = [];
                        let inFm = false, fmDone = false, fmMulti = null;
                        for (const line of lines) {
                            if (!fmDone && line.trim() === '---') { if (inFm) { fmDone = true; continue; } inFm = true; continue; }
                            if (inFm && !fmDone) {
                                const mm = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
                                if (mm) {
                                    if (mm[2] === '|' || mm[2] === '>') { fmMulti = mm[1]; continue; }
                                    meta[mm[1]] = mm[2];
                                } else if (fmMulti && /^\s+\S/.test(line)) {
                                    meta[fmMulti] = (meta[fmMulti] ? meta[fmMulti] + ' ' : '') + line.trim();
                                } else { fmMulti = null; }
                            } else if (fmDone) bodyLines.push(line);
                        }
                        const body = bodyLines.join(nl).trim();
                        const o = originOf(path.join(d, ent.name)); // s70: 来源标记（无/坏 → null=本机随包）
                        out.push({ name: ent.name, description: (meta.description || '').replace(/^['\"]|['\"]$/g, ''), body: body.slice(0, 4000), path: f, origin: o ? { source: o.source, repo: o.repo || '' } : null });
                    } catch {}
                }
            } catch {}
        }
        json200(res, out);
    }
    else if (url.startsWith('/vendor/')) {
        const name = decodeURIComponent(url.slice('/vendor/'.length));
        if (name.includes('..')) { res.writeHead(400); res.end(); return; }
        const f = path.join(ROOT, 'conf', 'web-assets', 'vendor', name);
        require('fs').readFile(f, (e, buf) => {
            if (e) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'max-age=86400' });
            res.end(buf);
        });
    }
    else if (url.startsWith('/preview/')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(require('fs').readFileSync(path.join(ROOT, 'conf', 'web-assets', 'preview.html')));
    }
    else if (url === '/api/update/status') {
        let staged = [];
        try {
            staged = FSS.readdirSync(path.join(ROOT, 'data', 'updates')).filter(n => /^PocketForge-.+\.zip$/.test(n) && !n.endsWith('.sha256'));
        } catch {}
        const status = readJson(path.join(ROOT, 'data', 'updates', 'status.json'), null);
        json200(res, { ok: true, version: APP_VERSION, warnings: stateWarnings, staged, status });
    }
    else if (url === '/api/update/check') {
        // 对比本地 VERSION 与 GitHub 最新 release；失败时仍可走离线通道
        const cfg = readJson(path.join(ROOT, 'data', 'update.json'), {});
        let staged = [];
        try { staged = FSS.readdirSync(path.join(ROOT, 'data', 'updates')).filter(n => /^PocketForge-.+\.zip$/.test(n)); } catch {}
        if (!cfg.repo) return json200(res, { ok: false, err: '未配置升级源', current: APP_VERSION, staged });
        fetchBufJson('https://api.github.com/repos/' + cfg.repo + '/releases/latest').then(rel => {
            const zipA = (rel.assets || []).find(a => /^PocketForge-.+\.zip$/.test(a.name));
            const out = { ok: true, current: APP_VERSION, latest: String(rel.tag_name || '').replace(/^v/, ''), staged };
            if (zipA) out.asset = { name: zipA.name, url: zipA.browser_download_url };
            out.hasNew = !!(out.asset && cmpVer(out.latest, out.current) > 0);
            json200(res, out);
        }).catch(e => {
            json200(res, { ok: false, err: '查询升级源失败：' + e.message + '（可用离线升级）', current: APP_VERSION, staged });
        });
    }
    else if (url.startsWith('/api/update/upload') && req.method === 'POST') { handleUpdateUpload(req, res, url); }
    else if (url === '/api/update/start' && req.method === 'POST') {
        readJsonBody(req, res, raw => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(raw.toString('utf8'));
                const runnerArgs = ['--root', ROOT];
                if (b.staged) {
                    if (!/^PocketForge-[\w.-]+\.zip$/.test(b.staged) || !FSS.existsSync(path.join(ROOT, 'data', 'updates', b.staged))) throw new Error('离线包不存在');
                    runnerArgs.push('--staged', b.staged);
                } else if (b.url) {
                    const cfg = readJson(path.join(ROOT, 'data', 'update.json'), {});
                    if (!cfg.repo || !String(b.url).startsWith('https://github.com/' + cfg.repo + '/releases/download/')) throw new Error('下载地址不在配置的升级源内');
                    runnerArgs.push('--url', String(b.url));
                } else throw new Error('缺少升级包');
                // s75: 升级前自备份——spawn 前同步完成，保证先于 runner 的任何文件改动；同包幂等
                preUpgradeBackup(b.staged ? 'zip:' + b.staged + ':' + FSS.statSync(path.join(ROOT, 'data', 'updates', b.staged)).size : 'url:' + b.url);
                FSS.mkdirSync(path.join(ROOT, 'data', 'updates'), { recursive: true });
                FSS.writeFileSync(path.join(ROOT, 'data', 'updates', 'status.json'), JSON.stringify({ stage: 'starting', ok: false, msg: '升级器启动中…', ts: Date.now() }));
                spawn(process.execPath, [path.join(ROOT, 'bin', 'update-runner.js'), ...runnerArgs], { detached: true, stdio: 'ignore' }).unref();
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/link') {
        // 外部目录接入：NTFS junction（无需管理员权限），链进 <工作区>/<label>
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        try {
            if (!wsValidId(ws)) throw new Error('缺工作区');
            const target = (qs.get('target') || '').trim();
            let label = (qs.get('label') || '').replace(/[\\/:*?"<>|.\s]/g, '-').slice(0, 40);
            if (!label) label = 'link-' + Date.now();
            if (!/^[a-zA-Z]:[\\/]/.test(target)) throw new Error('请填完整路径，比如 C:\\Users\\你\\Desktop\\报表');
            let st; try { st = FSS.statSync(target); } catch { throw new Error('找不到这个文件夹，检查一下路径'); }
            if (!st.isDirectory()) throw new Error('这是一个文件，请填文件夹的路径');
            // I2(审查s15): 防环——目标不得是 artifacts 本身或其上级（否则遍历成环）
            const tReal = FSS.realpathSync(target);
            const aReal = FSS.realpathSync(ART_DIR);
            if (tReal === aReal || aReal.startsWith(tReal + path.sep)) throw new Error('这个文件夹包含工作区本身，不能链接进来');
            const dest = path.join(wsDir(ws), label);
            if (FSS.existsSync(dest)) throw new Error('这个工作区里已经有叫「' + label + '」的文件夹了，换个名字或先删掉旧的');
            FSS.symlinkSync(target, dest, 'junction');
            console.log('linked external dir:', target, '->', ws + '/' + label);
            res.end(JSON.stringify({ ok: true, name: label }));
        } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
    }
    else if (url === '/api/vcs/log') {
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        const rel = vcsSafeRel(qs.get('file'));
        if (!wsValidId(ws) || !rel) { res.writeHead(400); res.end(); return; }
        const versions = (await vcsLog(wsDir(ws), rel)).map(v => ({ oid: v.oid, msg: v.msg, time: vcsTime(v.ts), ts: v.ts }));
        json200(res, { ok: true, versions });
    }
    else if (url === '/api/vcs/blob') {
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        const rel = vcsSafeRel(qs.get('file'));
        const oid = (qs.get('oid') || '').replace(/[^0-9a-f]/g, '');
        if (!wsValidId(ws) || !rel || !oid) { res.writeHead(400); res.end(); return; }
        try {
            const b = await ig().readBlob({ fs: fsp, dir: wsDir(ws), oid: await vcsFullOid(wsDir(ws), oid), filepath: rel });
            const ext = path.extname(rel).toLowerCase();
            res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
            res.end(Buffer.from(b.blob));
        } catch { res.writeHead(404); res.end(); }
    }
    else if (url === '/api/vcs/restore' && req.method === 'POST') {
        readJsonBody(req, res, async raw => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const body = JSON.parse(raw.toString('utf8'));
                const ws = body.ws || '';
                const rel = vcsSafeRel(body.file);
                const oid = String(body.oid || '').replace(/[^0-9a-f]/g, '');
                if (!wsValidId(ws) || !rel || !oid) throw new Error('参数不完整');
                const root = wsDir(ws);
                const full = path.join(root, rel.split('/').join(path.sep));
                // I4(审查s15): 已删除的文件也能恢复——数据在 git 对象库里，不要求工作树存在该文件
                FSS.mkdirSync(path.dirname(full), { recursive: true });
                try { await vcsSnapshot(root, rel, '恢复前自动保存当前版'); } catch {}
                const b = await ig().readBlob({ fs: fsp, dir: root, oid: await vcsFullOid(root, oid), filepath: rel });
                await fsp.writeFile(full, Buffer.from(b.blob));
                await vcsSnapshot(root, rel, '已恢复到 ' + oid.slice(0, 6) + ' 那一版');
                console.log('restored:', ws + '/' + rel, '->', oid);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url.startsWith('/open/')) {
        // 用系统默认程序打开本地文件（PowerShell Start-Process）
        const name = decodeURIComponent(url.slice('/open/'.length));
        // I5(审查s15): 黑名单保留（防御纵深）——拒绝引号/cmd 元字符/换行
        // s50h(FIND-1): fileNameSafe 不拒 '.'（归一化后变空串）——点号/隐藏名显式拒，防 spawn 打开 artifacts 目录本身
        if (!name || name.startsWith('.') || !fileNameSafe(name) || name.includes('..') || ['"', "'", '%', '^', '&', '|', '<', '>', '!', '\n', '\r'].some(ch => name.includes(ch))) { res.writeHead(400); res.end(JSON.stringify({ok:false, err:'bad name'})); return; }
        const f = path.join(ROOT, 'data', 'artifacts', name);
        if (!require('fs').existsSync(f)) { res.writeHead(404); res.end(JSON.stringify({ok:false, err:'not found'})); return; }
        // s50c: 路径经 base64 进 PowerShell 再解码（照 copy_artifact 先例），彻底消除 shell 解释层；
        // 不用 detached——VERIFIED-RUN 2026-08-29：detached+stdio:ignore 下 Start-Process 静默失败打不开文件
        const b64 = Buffer.from(f, 'utf8').toString('base64');
        require('child_process').spawn('powershell', ['-NoProfile', '-Command', '$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("' + b64 + '"));Start-Process -FilePath $p'], { stdio: 'ignore', windowsHide: true }).unref();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ok:true}));
    }
    else if (url.startsWith('/artifact/')) {
        // 制品服务：/artifact/<文件名> -> data/artifacts/<文件名>（禁止路径穿越）
        const name = decodeURIComponent(url.slice('/artifact/'.length)).split(String.fromCharCode(92)).join('/');
        if (name.includes('..') || name.includes(':')) { res.writeHead(400); res.end(); return; }
        const f = path.join(ROOT, 'data', 'artifacts', name.split('/').join(path.sep));
        require('fs').readFile(f, (e, buf) => {
            if (e) { res.writeHead(404); res.end(); return; }
const ext = path.extname(f).toLowerCase();
            const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
            // R2-C1: html/svg 内联打开=同源脚本，穿透 Origin 白名单外带 key——强制下载
            if (['.html', '.htm', '.svg', '.xml'].includes(ext)) {
                headers['content-disposition'] = "attachment; filename*=UTF-8''" + encodeURIComponent(path.basename(f));
            }
            res.writeHead(200, headers);
            res.end(buf);
        });
    }
    else if (url === '/api/workspaces') {
        // 全局工作区视角：所有工作区 + 元信息 + 生命周期状态（active/archived/orphan）
        const map = readWsMap();
        const arch = readArch();
        const meta = sessionMeta();
        const out = [];
        try {
            for (const ent of FSS.readdirSync(ART_DIR, { withFileTypes: true })) {
                if (!ent.isDirectory() || ent.name.startsWith('.') || !wsValidId(ent.name)) continue;
                let files = 0, bytes = 0, mtime = 0;
                // I2(审查s15): lstat 跳过 junction + 节点预算——链接外部大目录不再全盘扫描
                (function walk(d, b) {
                    try {
                        for (const f of FSS.readdirSync(d)) {
                            if (f === '.git' || f === '.forge') continue;
                            const full = path.join(d, f);
                            const st = FSS.lstatSync(full);
                            if (st.isSymbolicLink()) continue;
                            if (st.isDirectory()) { if (--b.n > 0) walk(full, b); }
                            else { files++; bytes += st.size; if (st.mtimeMs > mtime) mtime = st.mtimeMs; }
                        }
                    } catch {}
                })(path.join(ART_DIR, ent.name), { n: 2000 });
                const sid = (map[ent.name] || {}).sid || null;
                const title = sid ? meta.bySid.get(sid) || null : null;
                const state = wsState(ent.name, map, arch, sid, files, meta);
                out.push({ id: ent.name, files, bytes, mtime, sid, title, state });
            }
        } catch {}
        out.sort((a, b) => b.mtime - a.mtime);
        json200(res, out);
    }
    else if (url === '/api/search') {
        // s21: 聊天记录搜索（只读 sessions.db）。LIKE 匹配 content_json；
        // 当前量级（千条）毫秒级，量级上来再考虑 FTS5。
        const qs = new URL(req.url, 'http://x').searchParams;
        const q = (qs.get('q') || '').trim();
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        if (q.length < 2) { res.end(JSON.stringify({ ok: true, hits: [] })); return; }
        try {
            const { DatabaseSync } = require('node:sqlite');
            const db = new DatabaseSync(path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db'));
            const rows = db.prepare(
                "SELECT m.session_id AS sid, s.name AS title, m.role, m.content_json AS cj, m.timestamp AS ts " +
                "FROM messages m LEFT JOIN sessions s ON s.id = m.session_id " +
                "WHERE m.content_json LIKE ? ESCAPE '\\' " +
                "ORDER BY m.id DESC LIMIT 40"
            ).all('%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%');
            db.close();
            const hits = rows.map(r => {
                let text = '';
                try {
                    const arr = JSON.parse(r.cj);
                    // 拼所有可读文本；thinking 块也纳入（toolRequest/Response 无正文）
                    for (const c of arr) {
                        if (!c || typeof c !== 'object') continue;
                        if (c.type === 'text' || c.type === 'thinking') text += (c.text || c.thinking || '') + ' ';
                        else if (c.type === 'toolRequest' && c.toolCall) { try { text += JSON.stringify(c.toolCall).slice(0, 200) + ' '; } catch {} }
                    }
                } catch {}
                const i = text.indexOf(q);
                const frag = i >= 0 ? text.slice(Math.max(0, i - 40), i + q.length + 80).replace(/\s+/g, ' ') : text.replace(/\s+/g, ' ').slice(0, 100);
                return { sid: r.sid, title: r.title || '未命名', role: r.role, ts: r.ts, frag };
            });
            res.end(JSON.stringify({ ok: true, hits }));
        } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message, hits: [] })); }
    }
    else if (url === '/api/schedules') { handleSchedules(req, res, url); }
    else if (url === '/api/mcpstore') {
        // s46: MCP 市场最小形态——精选目录（npm vendored），安装=后台 npm i + 写 extensions，重启生效
        // s70 切片C: 目录读 data/config/mcp-catalog.json（每请求读取→改 JSON 零重启生效）；坏配置回落内置默认
        if (req.method === 'GET') {
            json200(res, readMcpCatalog().map(m => ({
                id: m.id, name: m.name, desc: m.desc, license: m.license,
                installed: mcpInstalled(m.id),
                enabled: mcpEnabled(m.id),
                install: mcpInstallState[m.id] || null,
            })));
        } else if (req.method === 'POST') {
            readJsonBody(req, res, raw => {
                let id = '', op = '';
                try { const b = JSON.parse(raw.toString('utf8')); if (typeof b.id !== 'string') throw 0; id = b.id; op = b.op === 'uninstall' ? 'uninstall' : ''; } catch {}
                const item = readMcpCatalog().find(m => m.id === id);
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                // s57: op=uninstall 删 config.yaml 块 + vendor 目录（停用走 /api/extensions，这里是删）
                if (op === 'uninstall') {
                    if ((mcpInstallState[id] || {}).stage === 'installing') { res.end(JSON.stringify({ ok: false, err: '正在安装，等装完再卸' })); return; }
                    // qa返工(P2-1): 只以 config.yaml 实存块判定「已装」——目录删条目后已装项不成孤儿（item 不参与卸载，vendor 目录名由 id 派生）
                    if (!mcpInstalled(id)) { res.end(JSON.stringify({ ok: false, err: '没有安装这个 MCP，不用卸载' })); return; }
                    try {
                        mcpRemoveExtension(id);
                        delete mcpInstallState[id];
                        FSS.rmSync(path.join(ROOT, 'bin', 'vendor', 'mcp-' + id), { recursive: true, force: true });
                        res.end(JSON.stringify({ ok: true, note: '已卸载' }));
                    } catch (e) { res.end(JSON.stringify({ ok: false, err: '卸载失败: ' + e.message })); }
                    return;
                }
                if (!item) { res.end(JSON.stringify({ ok: false, err: '目录里没有这个 MCP' })); return; }
                if (mcpInstalled(id)) { res.end(JSON.stringify({ ok: true, already: true })); return; }
                if (mcpInstallState[id] && mcpInstallState[id].stage === 'installing') { res.end(JSON.stringify({ ok: true, started: true })); return; }
                mcpInstallState[id] = { stage: 'installing', msg: '正在下载安装（约 1 分钟）…' };
                res.end(JSON.stringify({ ok: true, started: true }));
                // 后台安装：npm i 到 bin/vendor/mcp-<id>/，完成后写 extensions
                // s46: .cmd 必须走 shell（execFile 直接跑 .cmd 会 EINVAL，且异常未捕获会杀桥）
                const vdir = path.join(ROOT, 'bin', 'vendor', 'mcp-' + id);
                FSS.mkdirSync(vdir, { recursive: true });
                try {
                    const { execFile } = require('child_process');
                    // s75(v0.9.11台账): 树内 npm 优先——目标机零权限 PATH 未必有 npm；桥跑在树内 node 上（execPath 同目录即自带 npm），存在即用绝对路径，否则回落裸名走 PATH。win32 走 shell，绝对路径自裹引号防路径空格。
                    const npmBare = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                    const npmTree = path.join(path.dirname(process.execPath), npmBare);
                    const npm = FSS.existsSync(npmTree) ? (process.platform === 'win32' ? '"' + npmTree + '"' : npmTree) : npmBare;
                    const child = execFile(npm, ['install', '--omit=dev', item.pkg], { cwd: vdir, timeout: 300000, shell: process.platform === 'win32', env: { ...process.env, HTTP_PROXY: process.env.HTTP_PROXY || 'http://127.0.0.1:7890', HTTPS_PROXY: process.env.HTTPS_PROXY || 'http://127.0.0.1:7890' }, maxBuffer: 16 * 1024 * 1024 }, (err) => {
                        if (err) { mcpInstallState[id] = { stage: 'error', msg: '安装失败：' + (err.message || '').slice(0, 200) }; return; }
                        try { mcpWriteExtension(id, item.entry); mcpInstallState[id] = { stage: 'done', msg: '安装完成，重启数字员工后生效' }; }
                        catch (e2) { mcpInstallState[id] = { stage: 'error', msg: '写入配置失败：' + e2.message }; }
                    });
                    child.on('error', () => {});
                } catch (e3) { mcpInstallState[id] = { stage: 'error', msg: '安装启动失败：' + e3.message }; }
            });
        } else { res.writeHead(405); res.end(); }
    }
    else if (url === '/api/config/market') {
        // s72: 市场源与 MCP 目录管理（技术用户配置面）。GET=当前有效视图；POST=变更操作（同门校验+原子写）。
        // 鉴权同门：非 GET 跨站 Origin 由 handleHttp 顶部统一 403；POST 尺寸走 POST_MAX_BYTES 双层（预检+累积）。
        if (req.method === 'GET') {
            json200(res, marketView());
        } else if (req.method === 'POST') {
            readJsonBody(req, res, raw => {
                let b = null;
                try { b = JSON.parse(raw.toString('utf8')); } catch {}
                json200(res, marketMutate(b && typeof b === 'object' && !Array.isArray(b) ? b : {}));
            });
        } else { res.writeHead(405); res.end(); }
    }
    else if (url === '/api/skillstore') { handleSkillstore(req, res, url); }
    else if (url === '/api/extensions') {
        // 小白能力开关（s17 A）：改 conf/goose/config/config.yaml 各扩展 enabled。
        // bootstrap 幂等重写会保留用户开关值（配套改动见 bootstrap.ps1 / ADR-0010）。
        const CFG = path.join(ROOT, 'conf', 'goose', 'config', 'config.yaml');
        // 对小白隐藏 chatrecall（纯增强，关掉无收益）；只暴露有感知差异的扩展
        const LABELS = {
            'faucet-db': { name: '数据库', desc: '存数据、查数据的本事（保留它基本功能都在）' },
            'browser': { name: '浏览器自动化', desc: '让它能打开网页帮你抓表格、看内网系统' },
            'memory': { name: '长期记忆', desc: '记住您的偏好和常用做法（可在下方「记住的事」里查看删除）' },
            'chatrecall': { name: '会话回忆', desc: '能翻自己以前聊过的内容' },
        };
        if (req.method === 'GET') {
            const st = readExtState();
            const rows = Object.keys(LABELS).map(k => ({
                id: k, name: LABELS[k].name, desc: LABELS[k].desc,
                enabled: st[k] !== false,
                visible: k !== 'chatrecall',
                builtin: !(k in st),
            }));
            // s57: 已装 MCP 动态并入（能力开关面板盲区修复）——mcpEnabled 返回 true 时算「开着」
            // qa返工(P2-1): 目录读配置（readMcpCatalog），增删条目零重启生效
            for (const m of readMcpCatalog()) {
                if (!mcpInstalled(m.id)) continue;
                rows.push({ id: mcpExtensionId(m.id), name: m.name, desc: m.desc, enabled: mcpEnabled(m.id), visible: true, builtin: false });
            }
            json200(res, rows); // qa s78b P3-1: 成对「写头后紧跟 end」现场补转（C1 收敛遗漏）
        } else if (req.method === 'POST') {
            readJsonBody(req, res, body => { // 参数名避开下方 try 块内的 let raw（TDZ 撞名）
                try {
                    const b = JSON.parse(body.toString('utf8'));
                    // s57: id 合法面 = 内置 LABELS ∪ 已装 MCP（mcp-*）；enabled 行级替换两态同门
                    // qa返工(P2-1): 目录删条目后已装项仍可停用——id 以 mcp- 开头且 config.yaml 实存同名块也放行
                    const dyn = readMcpCatalog().some(m => mcpInstalled(m.id) && mcpExtensionId(m.id) === b.id)
                        || (typeof b.id === 'string' && /^mcp-[\w\-]{1,64}$/.test(b.id) && readExtState()[b.id] !== undefined);
                    if (!(b.id in LABELS) && !dyn) throw new Error('参数不合法');
                    if (typeof b.enabled !== 'boolean') throw new Error('参数不合法');
                    let raw = FSS.readFileSync(CFG, 'utf8');
                    let inExts = false, cur = null, done = false;
                    raw = raw.split('\n').map(line => {
                        if (/^extensions:\s*$/.test(line)) { inExts = true; return line; }
                        if (!inExts) return line;
                        if (/^[^\s]/.test(line)) { inExts = false; return line; }
                        const extM = line.match(/^ {2}([A-Za-z0-9_\-]+):\s*$/);
                        if (extM) { cur = extM[1]; return line; }
                        if (cur === b.id && /^ {4}enabled:/.test(line)) { done = true; return line.replace(/enabled:.*/, 'enabled: ' + b.enabled); }
                        return line;
                    }).join('\n');
                    if (!done) throw new Error('配置里没找到该扩展开关');
                    atomicWrite(CFG, raw);
                    json200(res, { ok: true, note: '重启数字员工后生效' });
                } catch (e) {
                    json200(res, { ok: false, err: e.message });
                }
            });
        } else { res.writeHead(405); res.end(); }
    }
    else if (url === '/api/memory') {
        // 小白记忆管理（s17）：直接读 conf/goose/config/memory/*.txt（junction 另一侧）。
        // 格式（VERIFIED-RUN 2026-08-27）：# tags 行可选 + 内容行，空行分段；
        // MCP retrieve 同样按空行分条（含\n\n的 data 存进去也切成多条），语义一致。
        // 只读+删，不提供写入口：agent 自动记；人工代写易造成脏数据。
        const MEM_DIR = path.join(ROOT, 'conf', 'goose', 'config', 'memory');
        function parseMem(raw) {
            const out = [];
            for (const seg of raw.split(/\n\s*\n/)) {
                const lines = seg.split('\n').map(s => s.replace(/\r$/, '')).filter(s => s.trim() !== '');
                if (!lines.length) continue;
                let tags = [];
                if (lines[0].startsWith('# ')) { tags = lines[0].slice(2).split(',').map(t => t.trim()).filter(Boolean); lines.shift(); }
                if (!lines.length) continue;
                out.push({ text: lines.join('\n'), tags });
            }
            return out;
        }
        function serializeMem(items) {
            return items.map(it => (it.tags && it.tags.length ? '# ' + it.tags.join(',') + '\n' : '') + it.text).join('\n\n') + '\n';
        }
        if (req.method === 'GET') {
            const out = [];
            try {
                for (const ent of FSS.readdirSync(MEM_DIR, { withFileTypes: true })) {
                    if (!ent.isFile() || !ent.name.endsWith('.txt')) continue;
                    let items = [];
                    try { items = parseMem(FSS.readFileSync(path.join(MEM_DIR, ent.name), 'utf8')); } catch {}
                    if (!items.length) continue; // forget_all 后的空文件不渲染空分类
                    out.push({ category: ent.name.slice(0, -4), items });
                }
            } catch {}
            json200(res, out);
        } else if (req.method === 'POST') {
            readJsonBody(req, res, raw => {
                try {
                    const b = JSON.parse(raw.toString('utf8'));
                    if (typeof b.category !== 'string' || !/^[A-Za-z0-9_\-]{1,64}$/.test(b.category)) throw new Error('分类名不合法');
                    const cat = b.category;
                    const f = path.join(MEM_DIR, cat + '.txt');
                    if (!FSS.existsSync(f)) throw new Error('没有这个分类的记忆');
                    if (b.op === 'forget_all') {
                        atomicWrite(f, '');
                    } else if (b.op === 'forget_one') {
                        // 以全文精确匹配删除该条（同一文本多条时删第一条）
                        const items = parseMem(FSS.readFileSync(f, 'utf8'));
                        const i = items.findIndex(it => it.text === b.text);
                        if (i < 0) throw new Error('没找到这条记录');
                        items.splice(i, 1);
                        atomicWrite(f, serializeMem(items));
                    } else throw new Error('未知操作');
                    json200(res, { ok: true });
                } catch (e) {
                    json200(res, { ok: false, err: e.message });
                }
            });
        } else { res.writeHead(405); res.end(); }
    }
    else if (url === '/api/prompts') {
        // 用户五主线批2-主线1（裁决 2026-09-08-user-five-lines-batch2 §2.2）：手工收藏制提示词库 data/prompts.json。
        // op 风格对齐 /api/memory；GET 全量（量级小，前端过滤+分页，skills 先例）；跨站 Origin 拒绝与 POST 预算由 handleHttp 顶部全局门自动覆盖。
        const PROMPTS_FILE = path.join(ROOT, 'data', 'prompts.json');
        function pfName(b) { // name 缺省=body 首行前 20 字（R4 兜底=结构性事实，不编造）
            if (typeof b.name === 'string' && b.name.trim()) return b.name.trim();
            const l = String(b.body).split('\n')[0].trim();
            return (l || String(b.body).trim()).slice(0, 20);
        }
        function readPrompts() { const j = readJson(PROMPTS_FILE, {}); return Array.isArray(j.prompts) ? j.prompts : []; }
        function writePrompts(list) { FSS.mkdirSync(path.dirname(PROMPTS_FILE), { recursive: true }); atomicWrite(PROMPTS_FILE, JSON.stringify({ _schema: 1, prompts: list }, null, 2)); }
        if (req.method === 'GET') {
            const list = readPrompts().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))); // updated_at 倒序（ISO 串字典序）
            json200(res, list);
        } else if (req.method === 'POST') {
            readJsonBody(req, res, raw => {
                try {
                    const b = JSON.parse(raw.toString('utf8'));
                    const list = readPrompts();
                    if (b.op === 'add') {
                        if (typeof b.body !== 'string' || !b.body.trim()) throw new Error('提示词内容不能为空');
                        const now = new Date().toISOString();
                        list.push({ id: crypto.randomUUID(), name: pfName(b), body: b.body, created_at: now, updated_at: now });
                        writePrompts(list);
                    } else if (b.op === 'update') {
                        const it = list.find(p => p.id === b.id);
                        if (!it) throw new Error('没有这条提示词');
                        if (typeof b.body !== 'string' || !b.body.trim()) throw new Error('提示词内容不能为空');
                        it.name = pfName(b); it.body = b.body; it.updated_at = new Date().toISOString(); // add/update 刷 updated_at；name 缺省同 add 一条规则
                        writePrompts(list);
                    } else if (b.op === 'delete') {
                        const i = list.findIndex(p => p.id === b.id);
                        if (i < 0) throw new Error('没有这条提示词');
                        list.splice(i, 1);
                        writePrompts(list);
                    } else throw new Error('未知操作');
                    json200(res, { ok: true });
                } catch (e) {
                    json200(res, { ok: false, err: e.message });
                }
            });
        } else { res.writeHead(405); res.end(); }
    }
    else if (url === '/api/stats') {
        // P31-③: 当日匿名使用统计（只读；Origin 校验走 handleHttp 顶部全局规则，与 /api/memory 等同级）
        // pg 字段=存储层模式机现态（off/connecting/pg/file），人话两态由 stateWarnings 承载；payload 文件形状不变
        json200(res, { ...stats, pg: pgStore.mode });
    }
    else if (url === '/api/report') {
        // 只读诊断报告（GET）：采集→脱敏→atomicWrite 到 data/reports/；失败回人话错误
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        // S1: 本端点有写盘+弹资源管理器副作用，GET 不豁免 Origin 门（顶部全局门只拦非 GET）；
        // 再要求自定义头 X-PF-Report: 1——img/no-cors 发不出自定义头，跨域 fetch 带自定义头先挂预检（OPTIONS）被 Origin 门拦
        if (origin && origin !== 'http://127.0.0.1:' + PORT) {
            res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, err: '跨站请求被拒绝' }));
            return;
        }
        if (req.headers['x-pf-report'] !== '1') {
            res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, err: '缺少报告请求标识' }));
            return;
        }
        try {
            const out = await buildReport();
            // pm 裁决：生成后自动弹资源管理器并选中报告文件（explorer 失败仅静默降级，ok:true 与 path 不受影响）
            try {
                spawn('explorer.exe', ['/select,' + out.path], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
            } catch {}
            json200(res, out);
        } catch (e) {
            json200(res, { ok: false, error: '报告生成失败：' + String((e && e.message) || e) });
        }
    }
    else if (url === '/api/db/overview') {
        // s50b: 数据库总览（只读；Origin 校验走 handleHttp 顶部全局规则）；仅 GET
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        dbOverview().then(out => res.end(JSON.stringify(out))).catch(() => res.end(JSON.stringify({ ok: false })));
    }
    else if (url === '/api/db/_schema') {
        // s51: 单表结构+样例（只读 GET；参数白名单校验在 dbTableSchema 内）
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const qp = new URL('http://x' + req.url).searchParams;
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        dbTableSchema(qp.get('svc') || '', qp.get('tbl') || '')
            .then(out => res.end(JSON.stringify(out)))
            .catch(() => res.end(JSON.stringify({ ok: false, err: '取不了表结构，稍后再试。' })));
    }
    else if (url === '/api/sessions/archive') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        if (req.method === 'POST') {
            readJsonBody(req, res, raw => {
                try {
                    const b = JSON.parse(raw.toString('utf8'));
                    if (!b.sid) throw new Error('缺 sid');
                    const arch = readArch();
                    if (b.archived) arch[b.sid] = Date.now(); else delete arch[b.sid];
                    writeArch(arch);
                    res.end(JSON.stringify({ ok: true }));
                } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
            });
        } else {
            res.end(JSON.stringify({ ok: true, arch: readArch() }));
        }
    }
    else if (url === '/api/ws/tree') {
        // 工作区真目录树：dir/file/link 三型；附件身份来自 .forge（与路径解耦）
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        if (!wsValidId(ws)) { res.writeHead(400); res.end(); return; }
        const att = new Set(readForgeMeta(ws).attachments || []);
        const budget = { n: 400 };
        function build(d, prefix) {
            const out = [];
            let ents = [];
            try { ents = FSS.readdirSync(d, { withFileTypes: true }); } catch {}
            for (const ent of ents) {
                if (ent.name.startsWith('.') || ent.name.startsWith('_')) continue;
                if (budget.n-- <= 0) break;
                const rel = (prefix ? prefix + '/' : '') + ent.name;
                const full = path.join(d, ent.name);
                let st; try { st = FSS.lstatSync(full); } catch { continue; }
                if (st.isSymbolicLink()) {
                    let tgt = ''; try { tgt = FSS.readlinkSync(full); } catch {}
                    const node = { name: ent.name, path: rel, type: 'link', target: tgt };
                    try { if (FSS.statSync(full).isDirectory()) node.children = build(full, rel); } catch {}
                    out.push(node);
                }
                else if (st.isDirectory()) out.push({ name: ent.name, path: rel, type: 'dir', children: build(full, rel) });
                else out.push({ name: ent.name, path: rel, type: 'file', size: st.size, mtime: st.mtimeMs, att: att.has(rel) });
            }
            out.sort((a, b) => ((a.type === 'file') - (b.type === 'file')) || a.name.localeCompare(b.name, 'zh'));
            return out;
        }
        json200(res, { ok: true, root: { name: ws, path: '', type: 'dir', children: build(wsDir(ws), '') }, attachments: [...att] });
    }
    else if (url === '/api/ws/link' && req.method === 'POST') {
        // 把另一个工作区以 junction 形式引入当前工作区（相对引用语义，物理为绝对路径）
        readJsonBody(req, res, raw => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(raw.toString('utf8'));
                if (!wsValidId(b.ws) || !FSS.existsSync(wsDir(b.ws))) throw new Error('当前工作区不存在');
                if (!wsValidId(b.target) || !FSS.existsSync(wsDir(b.target))) throw new Error('目标工作区不存在');
                if (b.target === b.ws) throw new Error('不能把工作区引进它自己');
                let label = String(b.label || '').replace(/[\\/:*?"<>|.\s]/g, '-').slice(0, 40);
                if (!label) label = b.target;
                const dest = path.join(wsDir(b.ws), label);
                if (FSS.existsSync(dest)) throw new Error('已存在同名「' + label + '」，换个名字');
                const tReal = FSS.realpathSync(wsDir(b.target));
                const wReal = FSS.realpathSync(wsDir(b.ws));
                if (wReal === tReal || wReal.startsWith(tReal + path.sep)) throw new Error('不能把工作区引进它的内部（会成环）');
                FSS.symlinkSync(tReal, dest, 'junction');
                console.log('ws link:', b.ws + '/' + label, '->', b.target);
                res.end(JSON.stringify({ ok: true, name: label }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/ws/unlink' && req.method === 'POST') {
        readJsonBody(req, res, raw => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(raw.toString('utf8'));
                const rel = vcsSafeRel(b.path);
                if (!wsValidId(b.ws) || !rel || rel.includes('/')) throw new Error('参数不完整');
                const dest = path.join(wsDir(b.ws), rel.split('/').join(path.sep));
                const st = FSS.lstatSync(dest);
                if (!st.isSymbolicLink()) throw new Error('那不是一个链接');
                FSS.rmSync(dest);
                console.log('ws unlink:', b.ws + '/' + rel);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/ws/delete' && req.method === 'POST') {
        // 删除整个工作区：仅孤儿或绑定归档会话的区允许；被任何活跃区链接引用时拒绝
        readJsonBody(req, res, async raw => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(raw.toString('utf8'));
                if (!wsValidId(b.ws)) throw new Error('参数不完整');
                const map = readWsMap(), arch = readArch();
                const curSid = b.sid || null; // HTTP 端无 ws 句柄,当前会话 sid 由客户端带上
                const bsid = (map[b.ws] || {}).sid || null;
                if (bsid && curSid && bsid === curSid) throw new Error('这是当前对话正在用的工作区，不能删');
                const tReal = FSS.realpathSync(wsDir(b.ws));
                for (const ent of FSS.readdirSync(ART_DIR, { withFileTypes: true })) {
                    if (!ent.isDirectory() || !wsValidId(ent.name) || ent.name === b.ws) continue;
                    for (const ch of FSS.readdirSync(path.join(ART_DIR, ent.name), { withFileTypes: true })) {
                        if (!ch.isSymbolicLink()) continue;
                        try {
                            const lp = FSS.readlinkSync(path.join(ART_DIR, ent.name, ch.name));
                            if (FSS.realpathSync(lp) === tReal) throw new Error('正被活跃工作区「' + ent.name + '」引用，先在那里取消引入');
                        } catch (e2) { if (String(e2.message).includes('引用')) throw e2; }
                    }
                }
                FSS.rmSync(wsDir(b.ws), { recursive: true, force: true });
                delete map[b.ws]; writeWsMap(map);
                console.log('ws deleted:', b.ws);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/fs/new' && req.method === 'POST') {
        // 轻量文件管理：新建文件/目录（IDE 能力的最小集）
        readJsonBody(req, res, raw => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(raw.toString('utf8'));
                const rel = vcsSafeRel(b.path);
                if (!wsValidId(b.ws) || !rel) throw new Error('参数不完整');
                if (/^(?:[^/]*\/)?\./.test(rel.split('/').pop())) throw new Error('名字不能以点开头');
                // s37: Windows 保留设备名（con/nul/aux/com1-9/lpt1-9 等）——建出来将无法用常规方式删除
                const baseName = rel.split('/').pop().replace(/\.[^.]*$/, '');
                if (!fileNameSafe(baseName)) throw new Error('这个名字是 Windows 保留的，换一个吧');
                const full = path.join(wsDir(b.ws), rel.split('/').join(path.sep));
                if (FSS.existsSync(full)) throw new Error('已经存在同名文件或文件夹');
                if (b.type === 'dir') FSS.mkdirSync(full, { recursive: true });
                else { FSS.mkdirSync(path.dirname(full), { recursive: true }); FSS.writeFileSync(full, ''); }
                console.log('fs new:', b.type, b.ws + '/' + rel);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/fs/rename' && req.method === 'POST') {
        readJsonBody(req, res, async raw => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(raw.toString('utf8'));
                const rel = vcsSafeRel(b.path);
                const name = String(b.name || '').trim();
                if (!wsValidId(b.ws) || !rel || !name) throw new Error('参数不完整');
                if (/[\\/:*?"<>|]/.test(name) || name.startsWith('.') || name.startsWith('_')) throw new Error('名字含非法字符');
                if (!fileNameSafe(name)) throw new Error('这个名字是 Windows 保留的，换一个吧');
                const root = wsDir(b.ws);
                const full = path.join(root, rel.split('/').join(path.sep));
                if (!FSS.existsSync(full)) throw new Error('原文件不存在');
                if (FSS.lstatSync(full).isSymbolicLink()) throw new Error('链接请在「浏览全部」里管理');
                const nrel = rel.split('/').slice(0, -1).concat(name).join('/');
                const nfull = path.join(root, nrel.split('/').join(path.sep));
                if (FSS.existsSync(nfull)) throw new Error('已存在同名');
                try { await vcsSnapshot(root, rel, '重命名前自动保存'); } catch {}
                FSS.renameSync(full, nfull);
                try { await ig().remove({ fs: fsp, dir: root, filepath: rel }); await vcsSnapshot(root, nrel, '重命名：' + rel.slice(rel.lastIndexOf('/') + 1) + ' → ' + name); } catch {}
                // 附件元数据跟随改名
                const meta = readForgeMeta(b.ws);
                if (meta.attachments && meta.attachments.includes(rel)) meta.attachments = meta.attachments.map(p => p === rel ? nrel : p);
                writeForgeMeta(b.ws, meta);
                res.end(JSON.stringify({ ok: true, path: nrel }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/fs/delete' && req.method === 'POST') {
        readJsonBody(req, res, async raw => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(raw.toString('utf8'));
                const rel = vcsSafeRel(b.path);
                if (!wsValidId(b.ws) || !rel) throw new Error('参数不完整');
                const root = wsDir(b.ws);
                const full = path.join(root, rel.split('/').join(path.sep));
                const st = FSS.lstatSync(full);
                if (!st.isSymbolicLink() && st.isFile()) { try { await vcsSnapshot(root, rel, '删除前自动保存'); } catch {} }
                // I3(审查s15): 目录删除前对其内文件逐个快照(上限80)，否则整棵消失无副本
                if (!st.isSymbolicLink() && st.isDirectory()) {
                    const files = [];
                    (function w2(d, b) {
                        let ents; try { ents = FSS.readdirSync(d); } catch { return; }
                        for (const f of ents) {
                            if (files.length >= 80 || b.n <= 0) return;
                            if (f === '.git' || f === '.forge' || f.startsWith('.')) continue;
                            const fp = path.join(d, f);
                            let s2; try { s2 = FSS.lstatSync(fp); } catch { continue; }
                            if (s2.isDirectory()) w2(fp, { n: --b.n });
                            else if (s2.isFile()) files.push(fp);
                        }
                    })(full, { n: 80 });
                    for (const fp of files) {
                        const r2 = path.relative(root, fp).split(path.sep).join('/');
                        try { await vcsSnapshot(root, r2, '删除文件夹前自动保存'); } catch {}
                    }
                }
                FSS.rmSync(full, { recursive: true, force: true });
                const meta = readForgeMeta(b.ws);
                if (meta.attachments) { meta.attachments = meta.attachments.filter(p => p !== rel && !p.startsWith(rel + '/')); writeForgeMeta(b.ws, meta); }
                console.log('fs delete:', b.ws + '/' + rel);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/ws/new') {
        const qs = new URL(req.url, 'http://x').searchParams;
        const sid = qs.get('sid') || '';
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        if (!sidValid(sid)) { res.end(JSON.stringify({ ok: false, err: '缺 sid' })); return; }
        const map = readWsMap();
        const mine = Object.keys(map).find(w => map[w].sid === sid && FSS.existsSync(wsDir(w)));
        if (mine) { res.end(JSON.stringify({ ok: true, ws: mine, existed: true })); return; }
        const id = wsNewId();
        FSS.mkdirSync(wsDir(id), { recursive: true });
        map[id] = { sid, boundAt: Date.now() };
        writeWsMap(map);
        console.log('workspace created:', id, '<->', sid.slice(0, 8));
        res.end(JSON.stringify({ ok: true, ws: id }));
    }
    else if (url === '/api/artifacts') {
        // 某个工作区的文件列表（递归，跳过 .git）
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        if (!wsValidId(ws)) { res.writeHead(400); res.end(); return; }
        function listDir(d, prefix, b) {
            let out = [];
            try {
                for (const f of FSS.readdirSync(d)) {
                    if (f.startsWith('.') || f.startsWith('_')) continue;
                    b.n--; // R2-I1: 预算要真的递减，否则形同虚设
                    if (b.n <= 0) return out;
                    const full = path.join(d, f);
                    let st; try { st = FSS.lstatSync(full); } catch { continue; }
                    // I2(审查s15): 跳过 junction，预算封顶
                    const pfx = prefix ? prefix + '/' : '';
                    if (st.isSymbolicLink()) { out.push({ name: pfx + f + '/', dir: true }); continue; }
                    if (st.isDirectory()) {
                        // 目录本身也作为条目返回（@ 可引用文件夹），尾部斜杠标记
                        out.push({ name: pfx + f + '/', dir: true });
                        out.push.apply(out, listDir(full, pfx + f, b));
                    }
                    else out.push({ name: pfx + f, size: st.size });
                }
            } catch {}
            return out;
        }
        json200(res, listDir(wsDir(ws), '', { n: 500 }));
    }
    else if (url.startsWith('/api/upload') && req.method === 'POST') {
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        if (!wsValidId(ws)) { res.writeHead(400); res.end(JSON.stringify({ ok: false, err: '缺工作区' })); return; }
        // 落点由用户在树上选中的目录决定（dir 缺省=根），身份只记进 .forge
        let dir = vcsSafeRel(qs.get('dir') || '');
        if (dir === null) dir = '';
        const fname = (qs.get('name') || ('upload-' + Date.now())).replace(/[\\/:*?"<>|]/g, '_');
        if (!fileNameSafe(fname)) { res.writeHead(400); res.end(JSON.stringify({ ok: false, err: '名字是 Windows 保留的，换一个吧' })); return; }
        readJsonBody(req, res, raw => {
            try {
                const tdir = path.join(wsDir(ws), dir.split('/').join(path.sep));
                FSS.mkdirSync(tdir, { recursive: true });
                let finalName = fname;
                const extM = fname.match(/(\.[^.]+)$/);
                const base = extM ? fname.slice(0, fname.length - extM[1].length) : fname;
                const ext = extM ? extM[1] : '';
                let n = 1;
                while (FSS.existsSync(path.join(tdir, finalName))) { finalName = base + '-v' + (++n) + ext; }
                FSS.writeFileSync(path.join(tdir, finalName), raw);
                const meta = readForgeMeta(ws);
                meta.attachments = meta.attachments || [];
                const rp = (dir ? dir + '/' : '') + finalName;
                if (!meta.attachments.includes(rp)) { meta.attachments.push(rp); if (meta.attachments.length > 1000) meta.attachments = meta.attachments.slice(-1000); }
                writeForgeMeta(ws, meta);
                console.log('uploaded:', ws + '/' + rp);
                json200(res, { ok: true, name: rp });
            } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else { res.writeHead(404); res.end(); }
}
// 任何路由异常都不许挂死连接：统一回 500 JSON
const server = http.createServer((req, res) => Promise.resolve(handleHttp(req, res)).catch(e => {
    console.error('http error', req.url, e.message);
    try { res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, err: String(e.message || e) })); } catch {}
}));

server.on('upgrade', (req, socket) => {
    // C1(审查s15): 任意网页可连本机WS(CSWSH)——只接受本页面origin，否则API key可经test_model外带
    const origin = req.headers.origin || '';
    if (origin !== 'http://127.0.0.1:' + PORT) return socket.destroy();
    const key = req.headers['sec-websocket-key'];
    if (!key) return socket.destroy();
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);
    const ws = { socket, send: obj => writeFrame(socket, obj), alive: true };
    allClients.add(ws);
    let buf = Buffer.alloc(0);
    socket.on('data', d => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
            const op = buf[0] & 0x0f;
            const masked = (buf[1] & 0x80) !== 0;
            let len = buf[1] & 0x7f, off = 2;
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            const maskKey = masked ? buf.slice(off, off + 4) : null;
            if (masked) off += 4;
            if (buf.length < off + len) return;
            let payload = buf.slice(off, off + len);
            if (maskKey) payload = Buffer.from(payload.map((b, i) => b ^ maskKey[i % 4]));
            buf = buf.slice(off + len);
            if (op === 0x1) {
                let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch { continue; }
                handleClient(ws, msg);
            } else if (op === 0x8) { drop(ws); socket.destroy(); }
            else if (op === 0x9) writeRaw(socket, 0x8a, payload);
        }
    });
    socket.on('error', () => { statsBump('errorsByType.websocket'); drop(ws); }); // P31-③: 仅异常断连计数（页面刷新等正常 close 不算错误）
    socket.on('close', () => drop(ws));
    ws.send({ sys: 'hello', version: 2, app: APP_VERSION, caps: acpCaps ? { modes: true } : {} });
    // S2-1 页面打开触发：缓存未过期直接发缓存态（打开就知道），过期才后台探（最坏一天 20 次打开 ≤20 个免费 GET）
    if (Date.now() - healthCache.at < HEALTH_TTL) { const hf = healthFrame(); if (hf) ws.send(hf); }
    else probeProviderHealth(ws);
});
function drop(ws) {
    ws.alive = false;
    allClients.delete(ws);
    for (const set of sessionClients.values()) set.delete(ws);
}
function writeRaw(socket, op, payload, cb) {
    const len = payload.length;
    let header;
    if (len < 126) header = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | op; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | op; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    socket.write(Buffer.concat([header, payload]), cb);
}
function writeFrame(socket, obj, cb) { try { writeRaw(socket, 0x1, Buffer.from(JSON.stringify(obj), 'utf8'), cb); } catch (e) { if (cb) { try { cb(e); } catch {} } } } // s62: 可选 flush 回调——同步 write 抛错时也必须回调，否则依赖回调的 destroy 永不触发

// ---- 主线5：撤回重写（历史手术，B 型截断；补篇裁决 2026-09-08 §2 七步协议）----
const TOMB_DIR = path.join(ROOT, 'data', 'rewrite-tombstones');
const TOMB_COLS = 'id,message_id,session_id,role,content_json,created_timestamp,timestamp,tokens,metadata_json'; // messages 全 9 列（补篇 §2-4 列举 7 列+表实有 timestamp/tokens）
function rollbackBoundary(db, sid, messageId) {
    if (messageId !== undefined && messageId !== null && messageId !== '') {
        return db.prepare('SELECT id, created_timestamp FROM messages WHERE session_id = ? AND message_id = ?').get(sid, String(messageId)) || null;
    }
    // 缺省边界=该 sid 最后一行 user 可见正文行（research/21 surgery.js lastUserRow 同款语义：同秒的 turn-context
    // 行 id 更大，直接取「最后一行 user」会以 turn-context 为边界漏删正文、留孤儿行——G2 谓词要求边界取正文行）
    const rows = db.prepare("SELECT id, created_timestamp, content_json, metadata_json FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_timestamp DESC, id DESC").all(sid);
    for (const r of rows) {
        let c; try { c = JSON.parse(r.content_json); } catch { continue; }
        if (!Array.isArray(c) || !c.some(b => b && b.type === 'text')) continue;
        let meta = {}; try { meta = r.metadata_json ? JSON.parse(r.metadata_json) : {}; } catch {}
        if (meta.userVisible === false) continue;
        return r;
    }
    return null;
}
function writeTombstone(sid, rows) {
    // 每次手术独立文件（atomicWrite 非 append），每 sid keep-3（对齐 pre-upgrade 备份先例）；无 UI，恢复=tools/rollback-restore.js 修复路径
    FSS.mkdirSync(TOMB_DIR, { recursive: true });
    const re = new RegExp('^' + sid + '-(\\d+)\\.jsonl$'); // sid 已过 sidValid 白名单（[\w\-]），入正则安全
    let seq = 1;
    for (const f of FSS.readdirSync(TOMB_DIR)) {
        const m = f.match(re);
        if (m && Number(m[1]) >= seq) seq = Number(m[1]) + 1;
    }
    atomicWrite(path.join(TOMB_DIR, sid + '-' + seq + '.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    const all = FSS.readdirSync(TOMB_DIR).map(f => f.match(re)).filter(Boolean).sort((a, b) => Number(a[1]) - Number(b[1]));
    while (all.length > 3) FSS.unlinkSync(path.join(TOMB_DIR, all.shift()[0]));
    return seq;
}
async function rollbackRewrite(ws, msg) {
    const fail = t => { try { ws.send({ sys: 'rollback_done', ok: false, sessionId: wsSession.get(ws), text: t }); } catch {} }; // 带 sid：前端失败恢复=重跑 openSession（close 过的 sid 由 load 复活，G6）
    try {
        const sid = wsSession.get(ws); // 只信 wsSession 绑定（对齐 prompt s50h(FIND-4)，不收前端自报 sid）
        if (!sid || (msg.sessionId != null && msg.sessionId !== sid)) return fail('这场对话已经不在了（可能刚重启过）。点左侧列表重新打开这个对话，再试一次撤回。');
        if (busySids.has(sid)) return fail('这一轮还在进行中，等它做完再撤回。'); // 步1 busy 门（桥侧权威，双客户端场景前端门不可信）
        // 步2 session/close：回收 Agent，防内存态经 compaction replace_conversation 复活已删内容（research/21 G6）；失败即中止，不降级裸做
        const closed = await new Promise(resolve => {
            const id = nextId++;
            const timer = setTimeout(() => { if (waiting.delete(id)) resolve(false); }, 15000);
            if (timer.unref) timer.unref();
            waiting.set(id, { ws: null, resolve: () => { clearTimeout(timer); resolve(true); }, reject: () => { clearTimeout(timer); resolve(false); } });
            try { acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'session/close', params: { sessionId: sid } }) + '\n'); }
            catch { clearTimeout(timer); waiting.delete(id); resolve(false); }
        });
        if (!closed) return fail('没能正常收起这场对话，这次先不动它。稍等几秒再试一次。');
        // 步3-6 手术事务（delete_session s75 同表裸 SQL 先例；谓词=goose truncate_conversation_from_message 同款 (created_timestamp,id)>=边界，research/21 G2）
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db'));
        let removed = 0;
        try {
            db.exec('PRAGMA busy_timeout=30000'); // WAL 下与 goose 写者的锁竞争兜底（对齐 goose 侧 busy_timeout 30s）
            db.exec('BEGIN IMMEDIATE');
            const b = rollbackBoundary(db, sid, msg.messageId);
            if (!b) { db.exec('ROLLBACK'); return fail('没找到要撤回的那条消息（可能已经撤回过，或对话刚更新过）。刷新对话后再试。'); } // 不猜边界
            const rows = db.prepare('SELECT ' + TOMB_COLS + ' FROM messages WHERE session_id = ? AND (created_timestamp > ? OR (created_timestamp = ? AND id >= ?)) ORDER BY id').all(sid, b.created_timestamp, b.created_timestamp, b.id);
            if (!rows.length) { db.exec('ROLLBACK'); return fail('这条消息之后没有可撤回的内容了。'); }
            try { writeTombstone(sid, rows); } // 步4 tombstone 先写（fail closed：DELETE 的前置条件）
            catch (e) { db.exec('ROLLBACK'); console.error('tombstone write failed:', e.message); return fail('备份没写成，这次撤回取消了（对话内容没动）。稍后再试。'); }
            const r = db.prepare('DELETE FROM messages WHERE session_id = ? AND (created_timestamp > ? OR (created_timestamp = ? AND id >= ?))').run(sid, b.created_timestamp, b.created_timestamp, b.id);
            if (r.changes !== rows.length) { db.exec('ROLLBACK'); return fail('对话正在被改动，这次撤回取消了（内容没动）。请再试一次。'); } // 步5 对账防并发插行错删
            removed = r.changes;
            db.exec('COMMIT'); // 步6：边界写死——usage 累计列/归档索引/workspace-map/extension_data/制品零触碰（补篇 §4）
        } finally { try { db.close(); } catch {} }
        try { ws.send({ sys: 'rollback_done', ok: true, sessionId: sid, removed }); } catch {}
        const subs = sessionClients.get(sid); // 步6 后半：向所有订阅该 sid 的客户端广播刷新（含请求者，其回执先到→预填，本帧后到→重绘；多客户端最终一致）
        if (subs) for (const c of subs) if (c.alive) c.send({ sys: 'session_rolled_back', sessionId: sid });
        console.log('rollback_rewrite', sid, 'boundary:', String(msg.messageId || '(last-user)'), 'removed:', removed);
    } catch (e) {
        console.error('rollback_rewrite failed:', e.message);
        fail('撤回没做成（对话内容没动）。稍后再试，老不行就重启小 forge。');
    }
}

// C3（research/24 §7）：explain_tool/optimize_prompt 两处同构 SSE 直调闭包合并（audit :3335 自注释「克隆骨架」实锤）。
// 单次 chat/completions 直调：SSE 解析 + reasoning_effort:'none' 400 降级重试 + finish=length 空文预算阶梯
// （800→1600，s78 P2-A）+ over 先置位防旧响应 end 抢答。→Promise<text>：正文（空串=空回，人话由调用方出，不入缓存）；
// reject 带 e.kind（upstream=上游 error 载荷 / parse=非 SSE 响应解析失败 / net=网络或构造异常 / timeout），措辞差异留在调用方。
function llmStreamOnce({ host, key, model, maxTokens, sysP, um, onDelta }) {
    return new Promise((resolve, reject) => {
        let retriedLen = false; // s78 P2-A: finish=length 且空文 → 同载荷重试一次（预算翻倍），最多一次
        let settled = false; // 对应原 replied 门：终局（回包/报错）后迟到的 end/error 不再重试或回包
        const ok = t => { if (!settled) { settled = true; resolve(t); } };
        const die = (kind, msg) => { if (!settled) { settled = true; const e = new Error(msg || kind); e.kind = kind; reject(e); } };
        const fire = (useRE, maxTok) => {
            let rq;
            try {
                const u = new URL(host + '/chat/completions');
                const reqMod = require(u.protocol === 'https:' ? 'https' : 'http');
                // s78 P2-A: 300→800——deepseek 间歇无视 reasoning_effort:'none' 隐形推理，300 预算被推理耗尽后 finish=length、content 空（qa 直连实证 7/10 空）；
                // 兜底=finish() 里 length+空文自动重试一次（预算 1600）
                const bodyObj = { model, max_tokens: maxTok, stream: true, messages: [
                    { role: 'system', content: sysP },
                    { role: 'user', content: um }
                ]};
                if (useRE) bodyObj.reasoning_effort = 'none';
                const body = JSON.stringify(bodyObj);
                let sse = false, buf = '', full = '', over = false, finRsn = null;
                const finish = () => {
                    if (over) return; over = true;
                    if (settled) return;
                    let t = full;
                    if (!sse) { // 上游不理 stream:true 回了普通 JSON——按旧逻辑整体解析
                        try { const j = JSON.parse(buf.replace(/data:\s*\[DONE\][\s\S]*$/, '').trim());
                            if (j && j.error) { const em = (j.error && typeof j.error.message === 'string') ? j.error.message : String(j.error); return die('upstream', em.slice(0, 150)); } // qa P3-6: 错误响应不再误报「它没说出什么来」
                            const c0 = j.choices && j.choices[0]; const m0 = c0 && c0.message; t = (m0 && (m0.content || m0.reasoning_content)) || ''; if (c0 && c0.finish_reason) finRsn = c0.finish_reason; }
                        catch { return die('parse'); }
                    }
                    if (t) ok(t);
                    else if (finRsn === 'length' && !retriedLen) { retriedLen = true; fire(useRE, 1600); } // s78 P2-A: 隐形推理吃光预算被截断——同载荷重试一次（模型非确定性，qa 直连 run#2/#3 证明重试有效）
                    else ok(''); // 空回：正文为空，人话由调用方出（不入缓存）
                };
                rq = reqMod.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, timeout: 30000 }, res => {
                    if (res.statusCode === 400 && useRE) { over = true; res.resume(); fire(false, maxTok); return; } // 中转不认 reasoning_effort → 去掉重试一次；over 先置位防旧响应 end 抢答
                    sse = String(res.headers['content-type'] || '').includes('text/event-stream');
                    res.on('data', c => {
                        if (over) return;
                        buf += c;
                        if (!sse) return;
                        let i;
                        while ((i = buf.indexOf('\n')) >= 0) {
                            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
                            if (!line.startsWith('data:')) continue;
                            const p = line.slice(5).trim();
                            if (p === '[DONE]') { finish(); return; }
                            // s78 P2-A: 只累计 d.content；d.reasoning_content 有意忽略——推理段不算正文，防把隐形推理当正文文本
                            try { const j = JSON.parse(p); const c0 = j.choices && j.choices[0]; const d = c0 && c0.delta; if (c0 && c0.finish_reason) finRsn = c0.finish_reason; if (d && d.content) { full += d.content; onDelta(d.content); } } catch {}
                        }
                    });
                    res.on('end', finish);
                    res.on('error', finish);
                });
                rq.on('error', e => { over = true; die('net', e.message); });
                rq.on('timeout', () => { rq.destroy(); die('timeout'); });
                rq.write(body); rq.end();
            } catch (e) { die('net', e.message); }
        };
        fire(true, maxTokens);
    });
}

function handleClient(ws, msg) {
    try {
        if (msg.sys === 'ping') return ws.send({ sys: 'pong' });

        // generic passthrough: {type:'rpc', method, params} -> ACP request; response routed back to this ws
        if (msg.type === 'rpc') {
            // I8(审查s15): 回显客户端关联 id，前端按 id 结算而不是 FIFO 猜
            const cid = msg.params && msg.params.__cid;
            const params = Object.assign({}, msg.params || {});
            delete params.__cid;
            const id = nextId++;
            waiting.set(id, { ws, __cid: cid });
            acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: msg.method, params }) + '\n');
            return;
        }

        if (msg.type === 'subscribe') {
            // start or attach to a session; msg.sessionId null = new session
            // s50h(FIND-2): 显式给了 sid 就必须过白名单（null/缺省=新会话语义不拒），杜绝任意串进 sessionClients
            if (msg.sessionId !== undefined && msg.sessionId !== null && !sidValid(String(msg.sessionId))) return ws.send({ sys: 'error', text: '会话标识不对，请从左侧列表重新选择对话。' });
            if (msg.sessionId) {
                wsPendingNew.delete(ws); // s78 P1-A: 具体 sid 接管——在飞的 session/new 回调到达即判过期丢弃
                wsFirstPrompt.set(ws, true); // research/18 断点①: 每次绑定（重）开允许首轮救援
                bindWs(ws, msg.sessionId);
                ws.send({ sys: 'subscribed', sessionId: msg.sessionId, modes: [], configOptions: [] });
            } else {
                const id = nextId++;
                wsPendingNew.set(ws, id); // s78 P1-A 代际守卫：登记本次发起，回调到达时校验
                waiting.set(id, { ws: null, resolve: (res) => {
                    if (staleNewSession(ws, id, res)) return; // s78 P1-A: 迟到的 session/new——ws 已被后续 subscribe 接管，丢弃绑定（孤儿已 close）
                    wsPendingNew.delete(ws);
                    if (res && res.sessionId) {
                        statsBump('sessionsCreated'); // P31-③
                        wsFirstPrompt.set(ws, true); // research/18 断点①: 新绑定首轮允许救援
                        bindWs(ws, res.sessionId);
                        ws.send({ sys: 'subscribed', sessionId: res.sessionId, newSession: true, modes: res.modes || [], configOptions: res.configOptions || [] });
                        // s26: 新对话沿用顶栏当前模型——session/new 默认回落 env 首模型（STATE 开放问题#4）
                        if (msg.model) {
                            const mid = nextId++;
                            acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mid, method: 'session/set_config_option', params: { sessionId: res.sessionId, configId: 'model', value: msg.model } }) + '\n');
                        }
                    } else {
                        // B1: session/new 失败——resolve 收到的是整条 error 帧；无此分支前端等不到 subscribed，pendingQueue 永久搁浅
                        const why = (res && res.error && (res.error.message || res.error)) || '原因未知';
                        ws.send({ sys: 'error', text: '开新对话没成功：' + String(why) });
                    }
                }});
                acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'session/new', params: { cwd: ROOT, mcpServers: [] } }) + '\n');
            }
            return;
        }

        if (msg.type === 'unsubscribe') {
            wsPendingNew.delete(ws); // s78 P1-A: 主动退订=接管，在飞的 session/new 不再回绑
            const sid = wsSession.get(ws);
            if (sid) { const set = sessionClients.get(sid); if (set) set.delete(ws); wsSession.delete(ws); }
            return;
        }

        if (msg.type === 'prompt') {
            // s50h(FIND-4): 只信 wsSession 绑定——删掉 msg.sessionId 回退（未订阅 sid 会拿到 goose 空 turn 假成功）；text 非空 + 256KB 上限（与 :348 turnText 截断同量级）
            const sid = wsSession.get(ws);
            if (!sid || (msg.sessionId != null && msg.sessionId !== sid)) return ws.send({ sys: 'error', text: '这场对话已经不在了（可能刚重启过）。点左侧「＋ 新对话」重新开始，把想做的事再说一遍就行。' });
            if (typeof msg.text !== 'string' || !msg.text.trim()) return ws.send({ sys: 'error', text: '想让我做的事不能是空的。' });
            if (msg.text.length > 262144) return ws.send({ sys: 'error', text: '这条消息太长了，拆成几条发吧。' });
            statsBump('messages'); // P31-③: 用户发出 prompt 计数（agent 回复不计）
            const firstTurn = wsFirstPrompt.get(ws) !== false;
            wsFirstPrompt.set(ws, false);
            sendTurn(ws, sid, msg.text, firstTurn); // research/18 断点①: 错误帧→reject 人话/首轮单次救援（sendTurn）
            return;
        }

        if (msg.type === 'cancel') {
            const sid = wsSession.get(ws);
            if (sid) acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: sid } }) + '\n');
            return;
        }

        if (msg.type === 'rollback_rewrite') {
            // 主线5：七步协议详见 rollbackRewrite（自捕获 async，全部失败路径回 rollback_done{ok:false} 人话）
            rollbackRewrite(ws, msg);
            return;
        }

        if (msg.type === 'delete_session') {
            // s75(research/17): 硬删 sessions.db 记录（messages + sessions 行）；同时发 ACP session/close
            // 让 goose 卸载 Agent——否则每会话 ~7 个 extension 进程滞留到 acp 退出。栈外已验证 close 回收成立，
            // 且对已不存在的 sid 重发 close 也返回空 result（无 error）
            try {
                const { DatabaseSync } = require('node:sqlite');
                const db = new DatabaseSync(path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db'));
                const m = db.prepare('DELETE FROM messages WHERE session_id = ?').run(msg.sessionId);
                const r = db.prepare('DELETE FROM sessions WHERE id = ?').run(msg.sessionId);
                db.close();
                // fire-and-forget：id 不注册 waiting（响应落进 onAcpData 未匹配分支被静默忽略），写失败不阻断删除
                try { acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'session/close', params: { sessionId: msg.sessionId } }) + '\n'); } catch {}
                // I1(审查s15): 会话删了就解除其工作区绑定，否则区卡在 active 态永远无法清理
                const wsm = readWsMap();
                let unbound = false;
                for (const k of Object.keys(wsm)) if (wsm[k].sid === msg.sessionId) { delete wsm[k]; unbound = true; }
                if (unbound) writeWsMap(wsm);
                // s73 切片2: 硬删会话同步清归档索引行（裁决 §7-切片2「为切片4隐私红线预演同款机制」；
                // 此前归档后被硬删的会话在索引里留死键——前端列表不可见但文件/PG 长存）
                const arch = readArch();
                if (arch[msg.sessionId] !== undefined) { delete arch[msg.sessionId]; writeArch(arch); }
                // C2: 回执先发再断订阅者——请求者自己也在 subs 里，先 destroy 后 send 回执必被吞
                // s62: 请求者 socket 改为回执 flush 回调里 destroy——同 tick destroy 会丢弃尚未冲刷到内核的写队列，小概率丢回执
                writeFrame(ws.socket, { sys: 'session_deleted', sessionId: msg.sessionId, ok: r.changes > 0 }, () => { try { ws.socket.destroy(); } catch {} });
                // s62/P3: 挂死对端不读时 flush 回调永不触发——5s 兜底 destroy，socket 不滞留 allClients 到进程级；
                // 正常路径回调已 destroy 后此 timer 再触发是幂等的（二次 destroy 不抛，'close' 只发一次→drop 只清一次）
                setTimeout(() => { try { ws.socket.destroy(); } catch {} }, 5000).unref();
                // s50c: 清空该会话的订阅者（还连着的 WS 直接断开），不留空 Set 残留；请求者已在回执回调里断开，此处跳过
                const subs = sessionClients.get(msg.sessionId);
                if (subs) {
                    sessionClients.delete(msg.sessionId);
                    for (const c of subs) { if (c !== ws) { try { c.socket.destroy(); } catch {} } }
                }
                console.log('session deleted', msg.sessionId, 'messages:', m.changes, 'row:', r.changes, 'unbound:', unbound);
            } catch (e) { ws.send({ sys: 'error', text: '删除失败: ' + e.message }); }
            return;
        }

        if (msg.type === 'copy_artifact') {
            const rel = String(msg.name || '').split('/').join(path.sep);
            const f = path.join(ROOT, 'data', 'artifacts', rel);
            if (rel.includes('..') || !require('fs').existsSync(f)) return ws.send({ sys: 'error', text: '文件不存在' });
            // I5(审查s15): 路径经 base64 进 PowerShell 再解码，引号/反引号无法逃逸
            const b64 = Buffer.from(f, 'utf8').toString('base64');
            // s50c: 与 /open/ 同根因——detached+stdio:ignore 下 Set-Clipboard 静默失败（VERIFIED-RUN 2026-08-29）
            require('child_process').spawn('powershell', ['-NoProfile', '-Command', '$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("' + b64 + '"));Set-Clipboard -LiteralPath $p'], { stdio: 'ignore', windowsHide: true }).unref();
            ws.send({ sys: 'copied', name: msg.name });
            return;
        }

        if (msg.type === 'explain_tool') {
            // 用当前会话的模型直调一次 chat completion，向小白解释这次工具调用；不进会话历史
            // 2026-09-06 提速：reasoning_effort:'none'（9Router 按模型能力钳制，不识别的中转 400 则去掉重试一次）
            // + sha1 LRU 缓存 + stream:true SSE 增量转发（tool_explanation_delta 只转发 content，思考期静默）
            const act = activeProvider();
            const host = ((act && act.host) || secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
            const key = (act && act.key) || secrets.FORGE_AGENT_API_KEY || '';
            const model = msg.model || (act && act.models && act.models[0]) || secrets.GOOSE_MODEL_NAME || '';
            const reply = t => ws.send({ sys: 'tool_explanation', id: msg.id, text: String(t).slice(0, 500), done: true });
            if (!host || !model) return reply('现在连不上模型，等连接好了再试。');
            const t0 = String(msg.title || '').split('\n')[0].slice(0, 80);
            const o0 = String(msg.output || '').slice(-600); // qa F1: 尾截与前端同向（裁决 batch2 §5.2.2），>600 直发载荷不再取头而谎称「只含最后600字」
            // r19 喂料扩容：rawInput 原文（R2）、status+exit_code（R3）、toolName（R5）——缓存键须含全部字段，否则旧键碰撞喂不出新料
            const i0 = String(msg.rawInput || '').slice(0, 1200);
            const stt = msg.status === 'failed' ? '失败' : msg.status === 'completed' ? '成功' : '';
            const ec = (typeof msg.exitCode === 'number' && isFinite(msg.exitCode)) ? msg.exitCode : '';
            const ck = crypto.createHash('sha1').update([model, t0, o0, i0, stt, ec, String(msg.toolName || '')].join('\u0000')).digest('hex'); // qa P3-2: \0 分隔防跨字段拼接碰撞（\n join 时 (x,A\nB)=(x\nA,B) 同键）；s78 P3-A: 键补 model——换模型后不吃旧模型的解释（optimizeCache 同款）
            if (explainCache.has(ck)) { const t = explainCache.get(ck); explainCache.delete(ck); explainCache.set(ck, t); return reply(t); }
            const delta = t => ws.send({ sys: 'tool_explanation_delta', id: msg.id, text: String(t) });
            // 裁决 batch2 §5.2.3 sysP 重写：受众=会用电脑但不懂 AI 内部机制的好奇者（删三禁令）；必答三问+点名真实对象；
            // 术语=准确名词+括号内嵌解释；禁编造（缺信息明说未提供）；失败（执行状态失败/退出码非0）走四段式；2-4 句禁电报腔；乱码按上下文推断
            const sysP = '你在向会用电脑、但还不了解 AI 内部机制的读者，解释助手在完成任务时执行的一步操作（一次工具调用，tool call，指让 AI 使用某个具体功能）。用 2-4 句连贯的中文陈述句（约 60-150 字）讲清三件事：①做了什么动作、对什么对象——点名信息里的真实名称，工具名、文件名、命令开头几个词、网址、表名，有什么点什么；②结果如何——成功还是失败，加上关键返回值，比如版本号、行数、报错原因；③这一步对整个任务意味着什么——一句话即可，讲不出就直说看不出来，不要硬编。技术名词可以用，但要写准确，并在后面用括号跟一句解释，例如：执行了一条命令（command，让电脑做具体事的指令）。输出写成一段连贯的话，不要电报式短语、编号或标题，不要堆砌比喻。信息里没有的就直说「未提供」，不要猜，更不要编造系统里不存在的类比或对象；「该步骤没有返回文字输出」只说明没拿到输出，不能据此断定结果是空的，也不能当作成功或失败的证据。如果执行状态是「失败」或退出码不是 0，按四段回答：先说清这一步失败了；再引用报错里的真实关键词，说明错在哪；然后给出最可能的原因或下一步；最后说明需不需要用户做什么。信息里可能混有因编码问题产生的乱码，按上下文推断含义即可，不要照抄乱码。';
            // r19 R4：空输出改无歧义措辞（旧「(空)」让模型把没喂当返回空→捏造）；截断显式标注；R6：GBK 乱码提示按上下文推断
            let um = '这一步叫：' + t0;
            if (msg.toolName) um += '\n工具名：' + String(msg.toolName).slice(0, 80);
            if (stt || ec !== '') um += '\n执行状态：' + (stt || '未知') + (ec !== '' ? '（退出码 ' + ec + '）' : '');
            if (i0) um += '\n输入参数（原文）：' + i0;
            um += '\n结果摘要' + (msg.trunc ? '（只含最后600字，更早内容已被截去）' : '') + '：' + (o0 ? o0 : '（该步骤没有返回文字输出）');
            if (/[\uFFFD]/.test(o0)) um += '\n注意：上面的输出可能因编码问题含乱码，请按上下文推断其含义，不要照抄乱码。';
            if (process.env.PF_EXPLAIN_DEBUG) console.log('[explain_tool debug] id=' + msg.id + ' user msg fed:\n' + um);
            // C3（research/24 §7）：SSE 直调骨架收敛至 llmStreamOnce；缓存/空回人话/错误措辞留差异体
            llmStreamOnce({ host, key, model, maxTokens: 800, sysP, um, onDelta: delta }).then(t => {
                if (t) { explainCache.set(ck, t); while (explainCache.size > 200) explainCache.delete(explainCache.keys().next().value); reply(t); }
                else reply('它没说出什么来，再点一次试试'); // 空回人话不入缓存（explain-retry-probe E4）
            }).catch(e => {
                if (e.kind === 'parse') return reply('解释失败（服务返回异常）');
                if (e.kind === 'timeout') return reply('解释超时了');
                reply('解释失败: ' + e.message); // upstream（上游 error 载荷）/net 同款前缀
            });
            return;
        }

        if (msg.type === 'optimize_prompt') {
            // 主线3（裁决 batch2 §4.2-2）：单次直调当前会话模型、流式、reasoning_effort:'none' 400 降级、
            // 30s 超时、sha1 全载荷缓存（text+context 都进键，\0 分隔）、不进会话历史。结果不进 goose 会话，只回请求方
            // （C3 research/24 §7：原「克隆 explain_tool 骨架」已并入 llmStreamOnce 共用助手）
            const act = activeProvider();
            const host = ((act && act.host) || secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
            const key = (act && act.key) || secrets.FORGE_AGENT_API_KEY || '';
            const model = msg.model || (act && act.models && act.models[0]) || secrets.GOOSE_MODEL_NAME || '';
            const reply = (t, err) => ws.send({ sys: 'optimize_result', id: msg.id, text: String(t).slice(0, 4000), err: !!err, done: true });
            if (!host || !model) return reply('现在连不上模型，等连接好了再试。', true);
            const p0 = String(msg.text || '');
            const cx0 = String(msg.context || '');
            const ck = crypto.createHash('sha1').update([model, p0, cx0].join('\u0000')).digest('hex'); // 缓存键=全载荷（model+text+context），\0 分隔（P3-2 同款）
            if (optimizeCache.has(ck)) { const t = optimizeCache.get(ck); optimizeCache.delete(ck); optimizeCache.set(ck, t); return reply(t); }
            const delta = t => ws.send({ sys: 'optimize_delta', id: msg.id, text: String(t) }); // 前端只用作「首字已到」信号撤 12s 兜底，不渲染中间态
            // 裁决 §4.2-3：五条固定变换+硬禁令（不得新增用户未提出的任务目标/假设/背景）+双段式输出+语言跟随原文+保留原意不追求华丽
            const sysP = '你是提示词优化器，把用户的提示词改写成模型更容易消化的形态。只做五类变换：①消歧——含糊的表述改清楚：指代不明就补出具体对象，笼统的动词换成具体动作；②补输出格式——原文没说结果要什么形态时补上（表格、清单、分段、文件等，按任务选最自然的）；③补长度与受众约束——原文没提篇幅和写给谁看时补上；④收窄范围——任务范围宽得没法一次完成时收窄；⑤去口语冗余——删口头废话，不删有效信息。硬禁令：不得新增用户未提出的任务目标、假设或背景；对话上下文只用来理解意图，优化稿里不得出现原文与上下文都没有的新事实；不得建议覆盖或删除用户原文件，修改类操作必须先征得用户确认。保留原意，不追求华丽。输出恰好两段、不写别的：<optimized>改写后的完整提示词</optimized><changes>逐条列出做了什么修改，一行一条</changes>语言跟随原文（中文进中文出）。';
            const um = '待优化的提示词原文：\n' + p0 + '\n\n当前对话上下文（仅供理解意图，不是优化对象）：\n' + cx0;
            // C3（research/24 §7）：SSE 直调骨架收敛至 llmStreamOnce；缓存/空回人话/错误措辞留差异体
            llmStreamOnce({ host, key, model, maxTokens: 800, sysP, um, onDelta: delta }).then(t => {
                if (t) { optimizeCache.set(ck, t); while (optimizeCache.size > 200) optimizeCache.delete(optimizeCache.keys().next().value); reply(t); }
                else reply('模型没说出什么来，再点一次 ✨ 试试。', true); // 空回人话不入缓存
            }).catch(e => {
                if (e.kind === 'parse') return reply('优化失败（服务返回异常），稍后再试一次。', true);
                if (e.kind === 'timeout') return reply('优化超时了，稍后再试一次。', true);
                reply('优化失败: ' + e.message, true); // upstream/net 同款前缀
            });
            return;
        }

        if (msg.type === 'acp_reply') {
            // P31-③: 权限卡选择分类（kind 由 shown 时的映射还原）。超时兜底与手动点击的消息形态一致（chat.tpl 同走 settle），
            // 唯一可区分信号=到达时间：前端 done 闸门保证手动回包距 shown <60s、超时兜底 ≥60s——据此计 timeout，不再混入 denied（s75）
            try {
                const ke = permKinds.get(msg.callId); permKinds.delete(msg.callId);
                const kind = ke && ke.m.get(msg.option);
                if (ke && Date.now() - ke.t >= 60000) statsBump('permissionCards.timeout');
                else if (kind === 'allow_once' || kind === 'allow_always') statsBump('permissionCards.approved');
                else if (kind === 'reject_once' || kind === 'reject_always') statsBump('permissionCards.denied');
            } catch {}
            acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.callId, result: { outcome: { outcome: 'selected', optionId: msg.option } } }) + '\n');
            return;
        }

        if (msg.type === 'list_models') {
            // fetch {host}/models with key; host from secrets or msg.override
            const host = (msg.host || secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
            const key = msg.key || secrets.FORGE_AGENT_API_KEY || '';
            if (!host) return ws.send({ sys: 'error', text: '未配置接口地址' });
            const u = new URL(host + '/models'); // s78: 照 test_model 写法按协议切 http/https，https 端点不再硬编码失败
            const reqMod = require(u.protocol === 'https:' ? 'https' : 'http');
            reqMod.get(u, { headers: { Authorization: 'Bearer ' + key } }, res => {
                let b = '';
                res.on('data', c => b += c);
                res.on('end', () => {
                    try { const j = JSON.parse(b); ws.send({ sys: 'models', models: (j.data || j.models || []).map(m => m.id || m.name || String(m)) }); }
                    catch { ws.send({ sys: 'error', text: 'models 响应解析失败 (HTTP ' + res.statusCode + ')' }); }
                });
            }).on('error', e => ws.send({ sys: 'error', text: '连接失败: ' + e.message }));
            return;
        }

        if (msg.type === 'test_model') {
            const host = (msg.host || secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
            const key = msg.key || secrets.FORGE_AGENT_API_KEY || '';
            const model = msg.model || secrets.GOOSE_MODEL_NAME || '';
            const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'reply with exactly: ok' }], max_tokens: 512 });
            const u = new URL(host + '/chat/completions');
            const reqMod = require(u.protocol === 'https:' ? 'https' : 'http');
            const req = reqMod.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, timeout: 30000 }, res => {
                let b = '';
                res.on('data', c => b += c);
                res.on('end', () => {
                    let txt = '';
                    try { const clean = b.replace(/data:\s*\[DONE\][\s\S]*$/, '').trim(); const j = JSON.parse(clean); const c = j.choices && j.choices[0]; const m = c && c.message; txt = (m && (m.content || m.reasoning_content)) || (c && c.text) || ('HTTP ' + res.statusCode + ' OK'); } catch { txt = b.slice(0, 80); }
                    ws.send({ sys: 'test_result', ok: res.statusCode === 200, http: res.statusCode, reply: String(txt).slice(0, 60), model });
                });
            });
            req.on('error', e => ws.send({ sys: 'test_result', ok: false, http: 0, reply: e.message.slice(0, 80), model }));
            req.on('timeout', () => { req.destroy(); ws.send({ sys: 'test_result', ok: false, http: 0, reply: '30s 超时', model }); });
            req.write(body); req.end();
            return;
        }

        if (msg.type === 'providers') {
            let list = readProviders();
            let needRestart = false;
            if (msg.save) {
                if (msg.activate !== undefined) {
                    const was = (list.find(p => p.active) || {}).name;
                    for (const pr of list) pr.active = pr.name === msg.activate;
                    needRestart = was !== msg.activate;
                }
                if (msg.add) {
                    const ex = list.find(p => p.name === msg.add.name);
                    // s78: add 未带 key 时保留已存档案 key——重复添加不得覆写既有凭据
                    if (ex) { if (!msg.add.key) msg.add.key = ex.key; Object.assign(ex, msg.add); } else list.push(msg.add);
                    if (list.length === 1) list[0].active = true;
                }
                if (msg.remove) {
                    list = list.filter(pr => pr.name !== msg.remove);
                    if (!list.find(p => p.active) && list[0]) { list[0].active = true; needRestart = true; }
                }
                if (msg.update) {
                    const ex = list.find(p => p.name === msg.update.name);
                    if (ex) {
                        const patch = { ...msg.update };
                        if (!patch.key) delete patch.key;   // key 留空 = 沿用原值（UI 脱敏不回传）
                        Object.assign(ex, patch);
                        needRestart = !!ex.active;
                    }
                }
                writeProviders(list);
                healthCache.at = 0; probeProviderHealth(); // §S1 缓存失效：save/activate/改模型即后台重探（换档对齐；面板修复→告警条即消的 GUI 闭环）
            }
            const act = list.find(p => p.active);
            if (act) {
                const sf = path.join(ROOT, 'data', 'secrets.env');
                const lines = require('fs').readFileSync(sf, 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
                // s78 自愈: NUL 前缀行 trim 不除、键名正则匹配不到 → 旧过滤下永久存活；回写只保留 KEY=VALUE 形状行
                const keep = lines.filter(l => /^[A-Za-z_][A-Za-z0-9_]*=/.test(l.trim()) && !/^(GOOSE_MODEL_NAME|FORGE_AGENT_HOST|FORGE_AGENT_API_KEY)=/.test(l.trim()));
                keep.push('GOOSE_MODEL_NAME=' + (act.models && act.models[0] || ''));
                keep.push('FORGE_AGENT_HOST=' + (act.host || ''));
                keep.push('FORGE_AGENT_API_KEY=' + (act.key || ''));
                atomicWrite(sf, keep.join(String.fromCharCode(10)) + String.fromCharCode(10));
            }
            ws.send({ sys: 'providers', list: list.map(pr => ({ name: pr.name, host: pr.host, models: pr.models || [], active: !!pr.active, hasKey: !!pr.key })) });
            if (needRestart) hotRestartProvider().catch(e => console.error('hot restart failed', e));
            return;
        }

        if (msg.type === 'switch_model') {
            // {model} — 可选池内切换：同供应商走 set_config_option，跨供应商热重启 acp
            const list = readProviders();
            const target = list.find(p => (p.models || []).includes(msg.model));
            if (!target) return ws.send({ sys: 'error', text: '该模型不在可选池：' + msg.model });
            if (target.active) {
                const doSet = (sessionId) => {
                    const id = nextId++;
                    acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'session/set_config_option', params: { sessionId, configId: 'model', value: msg.model } }) + '\n');
                    waiting.set(id, { ws, resolve: (res) => {
                        if (res && res.configOptions) ws.send({ sys: 'model_switched', model: msg.model, provider: target.name });
                        else ws.send({ sys: 'error', text: '切换失败，试试重开对话' });
                    }});
                };
                const sid = wsSession.get(ws);
                if (sid) { doSet(sid); }
                else {
                    // 无活动会话（桥重启丢状态/新窗口）：自动开新会话再切，用户无感
                    const nid = nextId++;
                    wsPendingNew.set(ws, nid); // s78 P1-A 代际守卫同款：此 session/new 与页面加载在飞的 subscribe(null) 互相接管
                    waiting.set(nid, { ws, resolve: (res) => {
                        if (staleNewSession(ws, nid, res)) return;
                        wsPendingNew.delete(ws);
                        if (res && res.sessionId) {
                            statsBump('sessionsCreated'); // P31-③
                            wsFirstPrompt.set(ws, true); // research/18 断点①: 新绑定首轮允许救援
                            bindWs(ws, res.sessionId);
                            ws.send({ sys: 'subscribed', sessionId: res.sessionId, modes: res.modes || [], configOptions: res.configOptions || [] });
                            doSet(res.sessionId);
                        } else ws.send({ sys: 'error', text: '开新对话失败，稍后再试' });
                    }});
                    acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: nid, method: 'session/new', params: { cwd: ROOT, mcpServers: [] } }) + '\n');
                }
            } else {
                for (const pr of list) pr.active = pr.name === target.name;
                writeProviders(list);
                healthCache.at = 0; probeProviderHealth(); // 跨档 switch=换档，同 §S1 失效语义
                ws.send({ sys: 'provider_switching', to: target.name, model: msg.model });
                hotRestartProvider().then(() => {
                    ws.send({ sys: 'model_switched', model: msg.model, provider: target.name, restarted: true });
                }).catch(e => ws.send({ sys: 'error', text: '切换供应商失败: ' + e.message }));
            }
            return;
        }

        if (msg.type === 'save_config') {
            // persist model/host/key into data/secrets.env (idempotent rewrite of known keys)
            try {
                const f = path.join(ROOT, 'data', 'secrets.env');
                const lines = require('fs').readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'));
                // s78 自愈: NUL 前缀行 trim 不除、旧过滤匹配不到 → 永久存活；回写只保留 KEY=VALUE 形状行
                const keep = lines.filter(l => /^[A-Za-z_][A-Za-z0-9_]*=/.test(l.trim()) && !/^(GOOSE_MODEL_NAME|FORGE_AGENT_HOST|FORGE_AGENT_API_KEY)=/.test(l.trim()));
                const c = msg.config || {};
                if (c.model) keep.push('GOOSE_MODEL_NAME=' + c.model);
                if (c.host) keep.push('FORGE_AGENT_HOST=' + c.host);
                if (c.key) keep.push('FORGE_AGENT_API_KEY=' + c.key);
                atomicWrite(f, keep.join('\n') + '\n');
                console.log('config saved (takes effect after restart):', c.model || '', c.host || '');
                ws.send({ sys: 'saved_config' });
            } catch (e) { ws.send({ sys: 'error', text: '保存失败: ' + e.message }); }
            return;
        }
    } catch (e) {
        ws.send({ sys: 'error', text: String(e.message || e) });
    }
}

server.on('error', e => {
    // s27: 端口被占（STATE #2）——分清"已在运行"与"被别的程序占用"，给小白能懂的提示
    if (e && e.code === 'EADDRINUSE') {
        const probe = require('http').get('http://127.0.0.1:' + PORT + '/api/update/status', res => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.log('[PocketForge] 聊天窗口需要的 ' + PORT + ' 端口被其他程序占用了。请重启电脑后再试；仍不行找懂电脑的人看一眼。');
                    process.exit(1);
                }
                let ver = '';
                try { ver = (JSON.parse(b) || {}).version || ''; } catch {}
                console.log('[PocketForge] 数字员工已经在运行了' + (ver ? '（版本 ' + ver + '）' : '') + '。直接使用聊天窗口即可，不用重复启动。');
                process.exit(0);
            });
        });
        probe.setTimeout(3000, () => { probe.destroy(new Error('probe timeout')); });
        probe.on('error', () => {
            console.log('[PocketForge] 聊天窗口需要的 ' + PORT + ' 端口被其他程序占用了。请重启电脑后再试；仍不行找懂电脑的人看一眼。');
            process.exit(1);
        });
    } else {
        console.error('bridge error:', e && e.message);
        process.exit(1);
    }
});
server.listen(PORT, '127.0.0.1', () => console.log('chat bridge v2 on http://127.0.0.1:' + PORT));
