// s73 切片2（裁决 2026-09-06-pg-forge-backend §7-切片2）: 归档索引 PG 写入/删除生命周期黑盒断言。
// 归档 POST → forge_archive_index 出现该 sid 行（archived_at>0）；取消归档 → 行删除（隐私删除传播预演）。
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..', 'forge');
const B = process.argv[2] || 'http://127.0.0.1:8790';

(async () => {
    const sid = 'fuzz-s73b-arch-' + Date.now();
    const postgres = require(path.join(ROOT, 'bin', 'vendor', 'pgstore', 'node_modules', 'postgres'));
    let port = 0; try { port = Number(fs.readFileSync(path.join(ROOT, 'data', 'pg.port'), 'utf8').trim()); } catch {}
    if (!port) { console.log('no pg.port'); process.exit(1); }
    const sql = postgres({ host: '127.0.0.1', port, user: 'postgres', database: 'forge_bridge', max: 1, connect_timeout: 2 });
    const post = async archived => {
        const r = await fetch(B + '/api/sessions/archive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sid, archived }) });
        const j = await r.json();
        if (!j.ok) throw new Error('archive POST archived=' + archived + ' failed: ' + JSON.stringify(j));
    };
    const row = async () => [...await sql`SELECT archived_at FROM forge_archive_index WHERE sid = ${sid}`];
    try {
        await post(true); // 归档 → 行出现（pg 队列异步落地，轮询 ≤10s）
        let rows = [];
        for (let i = 0; i < 20 && rows.length === 0; i++) { rows = await row(); if (!rows.length) await new Promise(r => setTimeout(r, 500)); }
        if (rows.length !== 1 || !(Number(rows[0].archived_at) > 0)) { throw new Error('PG row missing after archive: n=' + rows.length); }
        await post(false); // 取消归档 → 行删除
        for (let i = 0; i < 20 && rows.length > 0; i++) { rows = await row(); if (rows.length) await new Promise(r => setTimeout(r, 500)); }
        if (rows.length !== 0) { throw new Error('PG row survived unarchive'); }
        await sql.end({ timeout: 1 });
        console.log('archive row lifecycle ok (' + sid.slice(0, 24) + '…)');
        process.exit(0);
    } catch (e) {
        console.log('FAIL: ' + e.message);
        try { await post(false); } catch {} // 清理残留
        try { await sql.end({ timeout: 1 }); } catch {}
        process.exit(1);
    }
})();
