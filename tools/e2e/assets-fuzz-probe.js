// s83 追批（aa7fb2b 后置补盖——fuzz 扩展批早于 /api/assets 落地）：三源聚合端点数据面污染韧性。
// 手法=自建自清：faucet 服务 fuzzassets（forge_meta/forge_table_info 极端行：超长/emoji/换行/乱时间戳/坏行/千行表）
// + artifacts 目录污染（ws 目录名畸形：空格/中文/超长/坏格式；成品文件名极端：仅扩展名/双扩展/超长/中文）。
// 活体桥全程只读 GET；写入走 node:sqlite 直写服务库（ia3-tinfo-probe 同款；须 vendored node v22——node:sqlite 退出期断言）。
// 清尾链（教训 #20/#15 实证）：db remove → 连跑 rawsql → 杀 goose faucet mcp 子进程 → 重启 faucet serve → 文件可删 → data/sqlite 快照比对。
// 实证注：faucet serve 启动期缓存服务注册表——db add 后须 restart serve 才进 REST（_table 404 实测），探针 setup/收尾各重启一次。
// 用法：node tools/e2e/assets-fuzz-probe.js [svc|fs|svcfs]（缺省 svcfs 两相位顺序）
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const FORGE = path.join(ROOT, 'forge');
const B = process.argv[3] || 'http://127.0.0.1:8790';
const PHASE = (process.argv[2] || 'svcfs').toLowerCase();
const FAUCET = path.join(FORGE, 'bin', 'faucet', 'faucet.exe');
const DATA_DIR = path.join(FORGE, 'data', 'faucet');
const SVC = 'fuzzassets';
const DB_FILE = path.join(FORGE, 'data', 'sqlite', 'fuzzassets.db');
const SQLITE_DIR = path.join(FORGE, 'data', 'sqlite');
const ART = path.join(FORGE, 'data', 'artifacts');
const FAKE_WS = 'ws-2026-091301fz';
const TS_META = Date.parse('2026-09-13T08:00:00Z');
const TS_TINFO = Date.parse('2026-09-13T09:00:00Z');
let pass = 0, fail = 0;
const ck = (n, ok, extra) => { console.log((ok ? 'PASS' : 'FAIL') + ': ' + n + (extra !== undefined && extra !== '' ? '  | ' + String(extra).slice(0, 220) : '')); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BPORT = parseInt((B.match(/:(\d+)/) || [])[1], 10) || 8790;
function getJson(p, timeoutMs) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const rq = http.get({ host: '127.0.0.1', port: BPORT, path: p, timeout: timeoutMs || 15000 }, r => {
            let b = ''; r.on('data', c => b += c);
            r.on('end', () => { try { resolve({ code: r.statusCode, j: JSON.parse(b), ms: Date.now() - t0 }); } catch (e) { reject(new Error('bad json: ' + b.slice(0, 120))); } });
        });
        rq.on('error', reject);
        rq.on('timeout', () => { rq.destroy(); reject(new Error('timeout ' + p)); });
    });
}
function faucet(args) { return execFileSync(FAUCET, args.concat(['--data-dir', DATA_DIR]), { timeout: 15000, windowsHide: true, encoding: 'utf8' }); }
function pcRestartFaucet() {
    const port = fs.readFileSync(path.join(FORGE, 'data', 'pc.port'), 'utf8').trim();
    const r = spawnSync(path.join(FORGE, 'bin', 'pc', 'process-compose.exe'), ['-p', port, 'process', 'restart', 'faucet'],
        { env: Object.assign({}, process.env, { PC_DISABLE_TUI: '1' }), timeout: 30000, windowsHide: true, stdio: 'ignore' });
    return r.status === 0;
}
function killFaucetMcpChildren() { // 教训 #15：goose agent 的 faucet mcp 子进程缓存服务库 sqlite 句柄
    try {
        return execFileSync('powershell', ['-NoProfile', '-Command',
            "Get-CimInstance Win32_Process | Where-Object {($_.Name -eq 'faucet.exe') -and ($_.CommandLine -match ' mcp ')} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }"],
            { timeout: 30000, windowsHide: true, encoding: 'utf8' }).trim();
    } catch { return ''; }
}
async function waitRest(count) { // serve 重启后等 REST 通道可见（poll 20s 预算）
    const key = fs.readFileSync(path.join(DATA_DIR, '.apikey'), 'utf8').trim();
    const port = parseInt(fs.readFileSync(path.join(FORGE, 'data', 'faucet.port'), 'utf8').trim(), 10);
    for (let i = 0; i < 25; i++) {
        const j = await new Promise(res => {
            const rq = http.get({ host: '127.0.0.1', port, path: '/api/v1/' + SVC + '/_table/parts?fields=id', headers: { 'X-API-Key': key }, timeout: 2000 }, r => {
                let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch { res(null); } });
            });
            rq.on('error', () => res(null)); rq.on('timeout', () => { rq.destroy(); res(null); });
        });
        if (j && j.meta && j.meta.count === count) return true;
        await sleep(800);
    }
    return false;
}
function svcItems(j) { return ((j || {}).items || []).filter(i => i.ref && i.ref.svc === SVC); }
function validShapeSorted(j) { // 污染不破全局：全清单统一模型形状 + ts 倒序 null 沉底 + faucet 在线（无 tblMiss）
    const items = (j || {}).items || [];
    const KINDS = { tbl: 1, file: 1, skill: 1 };
    const shape = items.every(i => i && KINDS[i.kind] && typeof i.name === 'string' &&
        (i.human === null || typeof i.human === 'string') && (i.ts === null || typeof i.ts === 'number') &&
        (i.srcSid === null || typeof i.srcSid === 'string') && (i.srcTitle === null || typeof i.srcTitle === 'string') &&
        i.ref && typeof i.ref === 'object');
    let sorted = true;
    for (let k = 1; k < items.length; k++) {
        const a = items[k - 1].ts, b = items[k].ts;
        if (a != null && b != null && a < b) sorted = false;
        if (a == null && b != null) sorted = false;
    }
    return shape && sorted && j.ok === true && j.tblMiss === undefined;
}
function openDb() { const { DatabaseSync } = require('node:sqlite'); return new DatabaseSync(DB_FILE); }
function rmFileWithEscalation() { // 删不掉→杀 mcp 子进程→仍删不掉→重启 serve（实证链）
    try { fs.rmSync(DB_FILE, { force: true }); } catch {}
    if (!fs.existsSync(DB_FILE)) return 1;
    killFaucetMcpChildren();
    try { fs.rmSync(DB_FILE, { force: true }); } catch {}
    if (!fs.existsSync(DB_FILE)) return 2;
    pcRestartFaucet();
    return sleep(2500).then(() => { try { fs.rmSync(DB_FILE, { force: true }); } catch {} return fs.existsSync(DB_FILE) ? 3 : 0; });
}

function listSqliteDir() { // qa s97/P2-1：快照口径排除 sqlite 瞬态伴生文件（-journal/-wal/-shm，判据=文件名后缀；引擎生命周期文件非数据），防运行窗口内进出扰动比对
    return fs.readdirSync(SQLITE_DIR).filter(f => !/-journal$|-wal$|-shm$/.test(f)).sort().join(',');
}

async function phaseSvc() {
    // 幂等预清（教训 #9：中断遗留是常态）——残留服务/文件走同款句柄释放链
    let reg = false;
    try { reg = JSON.parse(faucet(['db', 'list', '--json'])).some(s => s && s.name === SVC); } catch {}
    if (reg || fs.existsSync(DB_FILE)) {
        if (reg) { try { faucet(['db', 'remove', SVC]); } catch {} }
        const r1 = await rmFileWithEscalation();
        if (fs.existsSync(DB_FILE)) { ck('svc-0 预清残留库文件（escalation=' + r1 + '）', false); return; }
    }
    // 快照在预清后（qa s83d T-1：先于预清会吞掉上轮崩溃残留→重跑假红；教训 #24）
    const snapshot = listSqliteDir();
    let db = null;
    try {
        // 建库：parts（2 行）+ bigrows（千行表——dbOverview 逐表 REST 计数通道的体量向量）
        db = openDb();
        db.exec('DROP TABLE IF EXISTS forge_meta');
        db.exec('DROP TABLE IF EXISTS forge_table_info');
        db.exec('DROP TABLE IF EXISTS parts');
        db.exec('DROP TABLE IF EXISTS bigrows');
        db.exec('CREATE TABLE parts (id INTEGER PRIMARY KEY, code TEXT, name TEXT)');
        db.exec('CREATE TABLE bigrows (id INTEGER PRIMARY KEY, v TEXT)');
        const p = db.prepare('INSERT INTO parts (id,code,name) VALUES (?,?,?)');
        p.run(1, 'P-001', 'fuzz part'); p.run(2, 'P-002', 'fuzz part 2');
        const b = db.prepare('INSERT INTO bigrows (id,v) VALUES (?,?)');
        db.exec('BEGIN');
        for (let i = 1; i <= 1000; i++) b.run(i, 'v' + i);
        db.exec('COMMIT');
        db.close(); db = null;
        faucet(['db', 'add', '--name', SVC, '--driver', 'sqlite', '--dsn', DB_FILE.replace(/\\/g, '/') + '?_raw_sql=1']);
        pcRestartFaucet(); // serve 注册表启动期缓存：不重启则 _table 404（实证）
        ck('svc-1 服务注册+serve 重启后进 REST 读通道', await waitRest(2));

        let r = await getJson('/api/assets', 20000);
        let it = svcItems(r.j);
        const by = Object.fromEntries(it.map(x => [x.ref.tbl, x]));
        ck('svc-2 三源清单收新服务：parts/bigrows 在列、forge_* 建账表不进', it.length === 2 && !!by.parts && !!by.bigrows, JSON.stringify(it.map(x => x.ref.tbl)));
        ck('svc-3 无账基线：human/ts/srcSid 全 null + 全局形状/排序不变量', by.parts.human === null && by.parts.ts === null && by.parts.srcSid === null && validShapeSorted(r.j));

        // 相位A：forge_meta 极端行（超长 desc/乱时间戳/坏 source）
        db = openDb();
        db.exec('CREATE TABLE forge_meta (description TEXT, created_at TEXT, source TEXT)');
        db.prepare('INSERT INTO forge_meta (description,created_at,source) VALUES (?,?,?)')
            .run('长'.repeat(500), '不是时间戳👾', 'ws-2026-091301FZ!!');
        db.close(); db = null;
        r = await getJson('/api/assets', 20000); it = svcItems(r.j);
        by.parts = it.find(x => x.ref.tbl === 'parts');
        ck('svc-4 meta 超长 desc 截 200（前缀一致）', by.parts.human === '长'.repeat(200), 'len=' + (by.parts.human || '').length);
        ck('svc-5 meta 乱时间戳→ts null + 坏 source→无回链（srcSid null）+ 排序不变量', by.parts.ts === null && by.parts.srcSid === null && validShapeSorted(r.j));

        // 相位B：emoji/换行/制表符 + 合法 ts 原样往返
        const META2 = '建账🎯说明\n第二行\t制表——人话字段';
        db = openDb();
        db.exec('DELETE FROM forge_meta');
        db.prepare('INSERT INTO forge_meta (description,created_at,source) VALUES (?,?,?)').run(META2, '2026-09-13T08:00:00Z', '');
        db.close(); db = null;
        r = await getJson('/api/assets', 20000);
        by.parts = svcItems(r.j).find(x => x.ref.tbl === 'parts');
        ck('svc-6 meta emoji/换行/制表符逐字节往返 + 合法 ts→epoch ms', by.parts.human === META2 && by.parts.ts === TS_META, JSON.stringify(by.parts));

        // 相位C：tinfo 与 forge_meta 冲突——表级赢（实现断言：human: t.desc || m.desc；ts: t.ts || m.ts）
        db = openDb();
        db.exec('CREATE TABLE forge_table_info (tbl TEXT, description TEXT, created_at TEXT)');
        const t = db.prepare('INSERT INTO forge_table_info (tbl,description,created_at) VALUES (?,?,?)');
        t.run(null, '无表名行→跳过', '2026-09-13T09:00:00Z');
        t.run('parts', null, '2026-09-13T09:00:00Z');
        t.run('parts', 'TINFO-表级优先🎯', '2026-09-13T09:00:00Z');
        db.close(); db = null;
        r = await getJson('/api/assets', 20000);
        by.parts = svcItems(r.j).find(x => x.ref.tbl === 'parts');
        const byBig = svcItems(r.j).find(x => x.ref.tbl === 'bigrows');
        ck('svc-7 tinfo 坏行（tbl/desc NULL）跳过+冲突时表级 desc/ts 赢过库级', by.parts.human === 'TINFO-表级优先🎯' && by.parts.ts === TS_TINFO, JSON.stringify(by.parts));
        ck('svc-8 无 tinfo 行的表仍回落 meta（desc+ts）', byBig.human === META2 && byBig.ts === TS_META, JSON.stringify(byBig));

        // 相位D：tinfo 超长截断 + 乱 ts 回落 meta ts
        db = openDb();
        db.exec('DELETE FROM forge_table_info');
        db.prepare('INSERT INTO forge_table_info (tbl,description,created_at) VALUES (?,?,?)').run('parts', '表'.repeat(250), 'garbage-date');
        db.close(); db = null;
        r = await getJson('/api/assets', 20000);
        by.parts = svcItems(r.j).find(x => x.ref.tbl === 'parts');
        ck('svc-9 tinfo 超长 desc 截 200 + 乱 ts→回落 meta ts', by.parts.human === '表'.repeat(200) && by.parts.ts === TS_META, 'len=' + (by.parts.human || '').length + ' ts=' + by.parts.ts);

        // 相位E：千行表体量——响应时限内 + 全局形状不变
        r = await getJson('/api/assets', 20000);
        const bigOk = svcItems(r.j).some(x => x.ref.tbl === 'bigrows') && r.ms < 10000 && validShapeSorted(r.j);
        ck('svc-10 千行表在列且 GET<10s（计数通道体量向量）+ 形状不变量', bigOk, 'ms=' + r.ms);

        // 相位F：forge_meta 前两行全坏（desc/ts null + 非法 source）→ 诚实降级
        db = openDb();
        db.exec('DELETE FROM forge_meta');
        db.prepare('INSERT INTO forge_meta (description,created_at,source) VALUES (?,?,?)').run(null, null, null);
        db.prepare('INSERT INTO forge_meta (description,created_at,source) VALUES (?,?,?)').run(null, null, '../../etc');
        db.exec('DELETE FROM forge_table_info');
        db.close(); db = null;
        r = await getJson('/api/assets', 20000);
        by.parts = svcItems(r.j).find(x => x.ref.tbl === 'parts');
        ck('svc-11 forge_meta 全坏行→meta=null 诚实降级（human/ts null 不编造）', by.parts.human === null && by.parts.ts === null && validShapeSorted(r.j), JSON.stringify(by.parts));

        // 相位G：删两张建账表——静默降级不炸
        db = openDb();
        db.exec('DROP TABLE forge_meta');
        db.exec('DROP TABLE forge_table_info');
        db.close(); db = null;
        r = await getJson('/api/assets', 20000);
        it = svcItems(r.j);
        ck('svc-12 删建账表降级：服务表仍在列、无账不炸、无 tblMiss', it.length === 2 && it.every(x => x.human === null && x.ts === null) && r.j.tblMiss === undefined, JSON.stringify(it.length));
    } catch (e) {
        ck('svc 相位意外异常', false, e.message);
    } finally {
        try { if (db) db.close(); } catch {}
        try { faucet(['db', 'remove', SVC]); } catch (e) { ck('svc-13 收尾摘服务', false, String(e.message).slice(0, 120)); }
        try { execFileSync(process.execPath, [path.join(FORGE, 'bin', 'faucet-rawsql.js'), path.join(DATA_DIR, 'faucet.db')], { timeout: 15000, windowsHide: true }); } catch {} // 删服务连启 rawsql（幂等）
        const esc = await rmFileWithEscalation(); // 杀 mcp 子进程→必要时重启 serve→删文件（教训 #20/#15 链）
        const gone = !fs.existsSync(DB_FILE);
        ck('svc-14 收尾文件级全清（data/sqlite 与建前快照一致；escalation=' + esc + '）', gone && listSqliteDir() === snapshot, fs.readdirSync(SQLITE_DIR).join(','));
        let r2 = null;
        try { r2 = await getJson('/api/assets', 20000); } catch (e) { ck('svc-15 收尾后端点存活', false, e.message); }
        if (r2) ck('svc-15 收尾后服务出清单+端点存活', svcItems(r2.j).length === 0 && r2.j.ok === true, 'residual=' + svcItems(r2.j).length);
    }
}

async function phaseFs() {
    const badDirs = ['ws 0913 fuzz', '工作区测试', 'ws-0913-' + 'x'.repeat(180)];
    const W = path.join(ART, FAKE_WS);
    // 幂等预清 + 真名碰撞守卫（撞真工作区=选名失败，宁可红）
    for (const d of badDirs.concat([FAKE_WS])) { try { fs.rmSync(path.join(ART, d), { recursive: true, force: true }); } catch {} }
    try { const m = JSON.parse(fs.readFileSync(path.join(FORGE, 'data', 'workspace-map.json'), 'utf8')); if (m && m[FAKE_WS]) { ck('fs-0 假区 id 未撞真工作区', false, FAKE_WS); return; } } catch {}
    try {
        for (const d of badDirs) {
            fs.mkdirSync(path.join(ART, d), { recursive: true });
            fs.writeFileSync(path.join(ART, d, 'inside.xlsx'), 'x');
        }
        fs.mkdirSync(W, { recursive: true });
        fs.writeFileSync(path.join(W, '.xlsx'), 'dot-only');            // 仅扩展名+点前缀
        fs.writeFileSync(path.join(W, 'a.tar.xlsx'), 'double');         // 双扩展（白名单看尾）
        fs.writeFileSync(path.join(W, '报'.repeat(60) + '.xlsx'), 'cn-long');
        fs.writeFileSync(path.join(W, 'y'.repeat(230) + '.csv'), 'ascii-long');
        fs.writeFileSync(path.join(W, 'noext'), 'x');
        fs.writeFileSync(path.join(W, 'e.exe'), 'x');
        fs.writeFileSync(path.join(W, '端.xlsx'), 'x');
        fs.mkdirSync(path.join(W, 'd.xlsx'), { recursive: true });      // 目录带白名单扩展
        fs.writeFileSync(path.join(W, 'd.xlsx', 'inner.xlsx'), 'x');

        const r = await getJson('/api/assets', 20000);
        const files = ((r.j || {}).items || []).filter(i => i.kind === 'file' && i.ref && i.ref.ws === FAKE_WS);
        const fromBad = ((r.j || {}).items || []).filter(i => i.kind === 'file' && badDirs.indexOf(i.ref && i.ref.ws) >= 0);
        ck('fs-1 畸形 ws 目录零泄漏（空格/中文/超长/坏格式——目录内文件也不出现）', fromBad.length === 0, JSON.stringify(fromBad.length));
        const names = files.map(x => x.name).sort();
        const expect = ['a.tar.xlsx', '端.xlsx', '报'.repeat(60) + '.xlsx', 'y'.repeat(230) + '.csv'].sort();
        ck('fs-2 白名单边界：仅扩展名/点前缀、无扩展名、非白名单、目录——全排除', names.length === expect.length && names.every((n, i) => n === expect[i]) && names.indexOf('.xlsx') < 0 && names.indexOf('noext') < 0 && names.indexOf('e.exe') < 0 && names.indexOf('inner.xlsx') < 0, JSON.stringify(names));
        ck('fs-3 极端成品名在列且逐字节往返（双扩展/中文/超长 ASCII）', files.every(x => x.name === x.ref.path) && names.some(n => n === 'a.tar.xlsx') && names.some(n => n === '端.xlsx'), JSON.stringify(files.map(x => x.name.length)));
        ck('fs-4 形状：ts=mtime 数字、srcSid null（不在 ws-map）、human null + 全局不变量', files.length === 4 && files.every(x => typeof x.ts === 'number' && x.srcSid === null && x.srcTitle === null && x.human === null) && validShapeSorted(r.j), 'n=' + files.length);
    } catch (e) {
        ck('fs 相位意外异常', false, e.message);
    } finally {
        for (const d of badDirs.concat([FAKE_WS])) { try { fs.rmSync(path.join(ART, d), { recursive: true, force: true }); } catch {} }
        ck('fs-5 清理：自建目录全删', badDirs.concat([FAKE_WS]).every(d => !fs.existsSync(path.join(ART, d))));
    }
}

(async () => {
    if (PHASE.indexOf('svc') === 0 || PHASE === 'svcfs') await phaseSvc();
    if (PHASE === 'fs' || PHASE === 'svcfs') await phaseFs();
    console.log('assets-fuzz-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
