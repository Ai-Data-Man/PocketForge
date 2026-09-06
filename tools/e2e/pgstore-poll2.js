// s73 切片2（裁决 2026-09-06-pg-forge-backend §7-切片2）: 无界增长族双表形状 + 存量幂等导入断言。
// 断言：pg 态确立后 forge_archive_index/forge_workspace_map 行数 == 文件业务键数（桥同款过滤器镜像——
// _schema 与坏形状键不迁，如 wsmap 里的 fuzz 残留 sid "a b/../c"）；无 _schema 污染行；schema_migrations=[1,2,3]。
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..', 'forge');
const B = process.argv[2] || 'http://127.0.0.1:8790';
const SID_RE = /^[\w\-]{1,128}$/;
const WS_RE = /^ws-[0-9]{4}-[0-9]{6}[a-z]*$/;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return d; } };

(async () => {
    // 1) 等活桥进 pg 态（file/off 超时=真回落，不当绿——切片1 pgstore-poll 同口径）
    let mode = '';
    for (let i = 0; i < 240; i++) {
        try { mode = (await (await fetch(B + '/api/stats')).json()).pg || ''; } catch {}
        if (mode === 'pg') break;
        await new Promise(r => setTimeout(r, 250));
    }
    if (mode !== 'pg') { console.log('bridge not in pg mode (mode=' + mode + ')'); process.exit(1); }

    const postgres = require(path.join(ROOT, 'bin', 'vendor', 'pgstore', 'node_modules', 'postgres'));
    let port = 0; try { port = Number(fs.readFileSync(path.join(ROOT, 'data', 'pg.port'), 'utf8').trim()); } catch {}
    if (!port) { console.log('no pg.port'); process.exit(1); }
    const sql = postgres({ host: '127.0.0.1', port, user: 'postgres', database: 'forge_bridge', max: 1, connect_timeout: 2 });
    const fail = async m => { console.log(m); try { await sql.end({ timeout: 1 }); } catch {} process.exit(1); };
    try {
        const archFile = readJson(path.join(ROOT, 'data', 'session-archive.json'), {});
        const wsFile = readJson(path.join(ROOT, 'data', 'workspace-map.json'), {});
        const sidOk = s => typeof s === 'string' && SID_RE.test(s) && s !== '_schema';
        const archN = Object.keys(archFile).filter(sidOk).length;
        const wsN = Object.keys(wsFile).filter(k => (WS_RE.test(k) || k === 'ws-imported') && sidOk((wsFile[k] || {}).sid)).length;

        // 对账/同步是确立后异步落地的：轮询至计数吻合（上限 15s），超时即失败
        let arch = [], ws = [];
        for (let i = 0; i < 30; i++) {
            arch = [...await sql`SELECT sid FROM forge_archive_index`];
            ws = [...await sql`SELECT ws FROM forge_workspace_map`];
            if (arch.length === archN && ws.length === wsN) break;
            await new Promise(r => setTimeout(r, 500));
        }
        const mig = [...await sql`SELECT version FROM schema_migrations ORDER BY version`].map(r => Number(r.version));
        await sql.end({ timeout: 1 });
        if (arch.length !== archN) { await fail('forge_archive_index rows ' + arch.length + ' != file business keys ' + archN); }
        if (ws.length !== wsN) { await fail('forge_workspace_map rows ' + ws.length + ' != file business keys ' + wsN); }
        if (arch.some(r => r.sid === '_schema') || ws.some(r => r.ws === '_schema')) { await fail('schema-key row leaked into PG'); }
        if (JSON.stringify(mig) !== JSON.stringify([1, 2, 3])) { await fail('schema_migrations = ' + JSON.stringify(mig)); }
        console.log('archive=' + arch.length + ' wsmap=' + ws.length + ' migrations=' + mig.join(','));
        process.exit(0);
    } catch (e) { console.log('query failed: ' + e.message); try { await sql.end({ timeout: 1 }); } catch {} process.exit(1); }
})();
