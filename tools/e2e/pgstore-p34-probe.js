// s73 切片2（裁决 2026-09-06-pg-forge-backend §7-切片2）: P3-4 护栏方向探针——PG 较新行不得被导入覆盖。
// 方法：隔离环境（临时 FORGE_ROOT + 独立库 PF_PG_DB=forge_bridge_p34probe + 真 pg 端口），不碰 dev 栈共享数据。
// 断言链：①存量导入保真（种子 fz-b:1000 原样入库）②PG 行改较新后重启桥 → 对账收编：文件采纳 PG 较新值而非覆盖 PG
//        （P3-4）③重启幂等：无重复行 ④file 态写入的键（fz-c）随确立回迁入库。
// 结束清理：杀子进程树 → DROP 独立库 → 删临时根。端口被占直接红（护栏探针不静默让位）。
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const ROOT = path.resolve(__dirname, '..', '..', 'forge'); // 真树：借 node/vendor/pg 端口，不借其数据
const NODE = path.join(ROOT, 'bin', 'node-v22', 'node-v22.21.1-win-x64', 'node.exe');
const PROBE_PORT = Number(process.env.PF_PROBE_PORT || 18794);
const DB = 'forge_bridge_p34probe';
const NEWER_TS = 4102444800000; // 2100-01-01：恒大于任何现实 Date.now()
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return d; } };

function httpJson(p, path_, body) {
    return new Promise(res => {
        const s = net.connect(p, '127.0.0.1', () => {
            if (body === undefined) s.write('GET ' + path_ + ' HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n');
            else s.write('POST ' + path_ + ' HTTP/1.0\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body);
        });
        let b = '';
        s.on('data', d => b += d);
        s.on('error', () => res(null));
        s.on('close', () => {
            const m = b.match(/\r\n\r\n([\s\S]*)$/);
            if (!m) return res(null);
            try { res(JSON.parse(m[1])); } catch { res(m[1] || null); } // healthz 是纯文本 'ok'——非 JSON 也作真值
        });
        setTimeout(() => { s.destroy(); res(null); }, 4000);
    });
}

(async () => {
    // 端口占用=红（护栏探针不让位）
    await new Promise(res => { const s = net.connect(PROBE_PORT, '127.0.0.1', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); })
        .then(busy => { if (busy) { console.log('probe port ' + PROBE_PORT + ' busy'); process.exit(1); } });
    let port = 0; try { port = Number(fs.readFileSync(path.join(ROOT, 'data', 'pg.port'), 'utf8').trim()); } catch {}
    if (!port) { console.log('no pg.port'); process.exit(1); }
    const postgres = require(path.join(ROOT, 'bin', 'vendor', 'pgstore', 'node_modules', 'postgres'));

    // 临时根：pg 在场标记 + 种子归档文件 + junction（桥启动即 spawn goose ACP 并 require vendored postgres——
    // L623 acp=spawnAcp() 无 'error' 处理器，缺 goose 会 ENOENT 崩；故借真树 bin/goose、bin/vendor，数据仍隔离）。
    // conf 禁止整树 junction：GOOSE_PATH_ROOT=ROOT/conf/goose + 启动 pruneScheduled 会连到真树 sessions.db——
    // 探针桥与 dev 栈双 goose 并发同库（首跑 ws-fuzz 假红实证家族）。只拷两个静态 config yaml，goose 数据在 tmp 自生。
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-p34-'));
    const links = [];
    const link = (name, target) => { const p = path.join(tmp, name); fs.symlinkSync(target, p, 'junction'); links.push(p); };
    fs.mkdirSync(path.join(tmp, 'data', 'pg'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'data', 'pg', 'PG_VERSION'), '17\n');
    fs.writeFileSync(path.join(tmp, 'data', 'session-archive.json'), JSON.stringify({ _schema: 1, 'fz-b': 1000 }, null, 2));
    fs.mkdirSync(path.join(tmp, 'bin'), { recursive: true });
    link('bin/vendor', path.join(ROOT, 'bin', 'vendor'));
    link('bin/goose', path.join(ROOT, 'bin', 'goose'));
    const cfgDir = path.join(tmp, 'conf', 'goose', 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    for (const y of ['config.yaml', 'permission.yaml']) fs.copyFileSync(path.join(ROOT, 'conf', 'goose', 'config', y), path.join(cfgDir, y));

    const admin = postgres({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', max: 1, connect_timeout: 2 });
    const dropDb = async () => { for (let i = 0; i < 3; i++) { try { await admin.unsafe('DROP DATABASE IF EXISTS ' + DB); return true; } catch { await sleep(1000); } } return false; };
    let child = null;
    const killChild = () => { if (child && child.pid) { try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} } child = null; };
    const cleanup = async () => {
        killChild(); await sleep(800);
        await dropDb();
        for (const p of links) { try { fs.rmSync(p, { force: true }); } catch {} } // junction 只删链接不删真树
        for (let i = 0; i < 3; i++) { try { fs.rmSync(tmp, { recursive: true, force: true }); break; } catch { await sleep(500); } }
        try { await admin.end({ timeout: 1 }); } catch {}
    };
    process.on('exit', () => { killChild(); for (const p of links) { try { fs.rmSync(p, { force: true }); } catch {} } try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

    const spawnBridge = () => {
        child = spawn(NODE, [path.join(ROOT, 'bin', 'chat-bridge.js')], {
            env: { ...process.env, FORGE_ROOT: tmp, PORT: String(PROBE_PORT), PF_PG_PORT: String(port), PF_PG_DB: DB, NO_PROXY: '127.0.0.1,localhost' },
            stdio: 'ignore',
        });
    };
    const waitPg = async tag => { // 等探针桥进 pg 态（≤20s：写路径懒连）
        for (let i = 0; i < 80; i++) { const s = await httpJson(PROBE_PORT, '/api/stats'); if (s && s.pg === 'pg') return true; await sleep(250); }
        throw new Error(tag + ': probe bridge never reached pg mode');
    };

    let fail = '';
    try {
        await dropDb(); // 上轮残留自愈
        const sqlp = () => postgres({ host: '127.0.0.1', port, user: 'postgres', database: DB, max: 1, connect_timeout: 2 });

        // —— 第一生命周期：启动 → 归档 fz-a（触发懒连+确立+存量导入）——
        spawnBridge();
        for (let i = 0; i < 40; i++) { if (await httpJson(PROBE_PORT, '/healthz')) break; await sleep(250); }
        let r = await httpJson(PROBE_PORT, '/api/sessions/archive', JSON.stringify({ sid: 'fz-a', archived: true }));
        if (!r || !r.ok) throw new Error('archive fz-a failed');
        await waitPg('spawn1');
        let s1 = sqlp(), got = [];
        for (let i = 0; i < 20 && got.length < 2; i++) { got = [...await s1`SELECT sid, archived_at FROM forge_archive_index`]; if (got.length < 2) await sleep(500); }
        const bySid = Object.fromEntries(got.map(x => [x.sid, Number(x.archived_at)]));
        if (!(bySid['fz-a'] > 0)) throw new Error('import: fz-a missing in PG');
        if (bySid['fz-b'] !== 1000) throw new Error('import fidelity: fz-b=' + bySid['fz-b'] + ' != 1000'); // 断言①：存量导入保真
        await s1.end({ timeout: 1 });

        // —— 制造「PG 较新」：fz-a 业务时间戳拔高（模拟崩溃前 PG 已落新值/文件被旧备份还原）——
        let s2 = sqlp();
        await s2`UPDATE forge_archive_index SET archived_at = ${NEWER_TS}, updated_at = now() WHERE sid = 'fz-a'`;
        await s2.end({ timeout: 1 });
        killChild(); await sleep(800);

        // —— 第二生命周期：重启 → 归档 fz-c（触发懒连）→ 对账必须收编 PG 较新值，不得覆盖 ——
        spawnBridge();
        for (let i = 0; i < 40; i++) { if (await httpJson(PROBE_PORT, '/healthz')) break; await sleep(250); }
        r = await httpJson(PROBE_PORT, '/api/sessions/archive', JSON.stringify({ sid: 'fz-c', archived: true }));
        if (!r || !r.ok) throw new Error('archive fz-c failed');
        await waitPg('spawn2');
        const archFile = path.join(tmp, 'data', 'session-archive.json');
        let f = null;
        for (let i = 0; i < 24; i++) { f = readJson(archFile, null); if (f && f['fz-a'] === NEWER_TS) break; await sleep(500); }
        if (!f || f['fz-a'] !== NEWER_TS) throw new Error('P3-4 FAIL: file did not adopt newer PG row (fz-a=' + (f && f['fz-a']) + ')'); // 断言②：方向护栏
        if (f['fz-b'] !== 1000) throw new Error('seed key lost: fz-b=' + f['fz-b']);
        if (!(f['fz-c'] > 0)) throw new Error('file-mode write fz-c missing in file');
        let s3 = sqlp();
        for (let i = 0; i < 20; i++) { const n = [...await s3`SELECT count(*)::int n FROM forge_archive_index WHERE sid = 'fz-c'`][0].n; if (n === 1) break; await sleep(500); }
        const dup = [...await s3`SELECT sid, count(*)::int n FROM forge_archive_index GROUP BY sid HAVING count(*) > 1`];
        const rows = [...await s3`SELECT sid, archived_at FROM forge_archive_index`];
        await s3.end({ timeout: 1 });
        if (dup.length) throw new Error('duplicate rows after restart: ' + JSON.stringify(dup)); // 断言③：幂等
        const pg = Object.fromEntries(rows.map(x => [x.sid, Number(x.archived_at)]));
        if (pg['fz-c'] === undefined) throw new Error('file-mode write fz-c not backfilled to PG'); // 断言④：回迁
        if (pg['fz-a'] !== NEWER_TS) throw new Error('PG newer row was clobbered: fz-a=' + pg['fz-a']); // P3-4 PG 侧
        console.log('P3-4 PASS: newer PG row adopted (fz-a=' + NEWER_TS + '), seed kept, no dup, file-mode write backfilled');
        console.log('PROBE-OK');
    } catch (e) {
        fail = e.message;
        console.log('FAIL: ' + fail);
    } finally {
        await cleanup();
        setTimeout(() => process.exit(fail ? 1 : 0), 500);
    }
})();
