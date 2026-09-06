// s73 切片2（裁决 2026-09-06-pg-forge-backend §7-切片2）: 工作区映射 PG 写入/删除生命周期黑盒断言。
// /api/ws/new → forge_workspace_map 出现 (ws,sid) 行；/api/ws/delete → 行删除。结束后无目录/行残留。
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..', 'forge');
const B = process.argv[2] || 'http://127.0.0.1:8790';

(async () => {
    const sid = 'fuzz-s73b-ws-' + Date.now();
    const postgres = require(path.join(ROOT, 'bin', 'vendor', 'pgstore', 'node_modules', 'postgres'));
    let port = 0; try { port = Number(fs.readFileSync(path.join(ROOT, 'data', 'pg.port'), 'utf8').trim()); } catch {}
    if (!port) { console.log('no pg.port'); process.exit(1); }
    const sql = postgres({ host: '127.0.0.1', port, user: 'postgres', database: 'forge_bridge', max: 1, connect_timeout: 2 });
    const row = async ws => [...await sql`SELECT sid, bound_at FROM forge_workspace_map WHERE ws = ${ws}`];
    let ws = '';
    try {
        const j = await (await fetch(B + '/api/ws/new?sid=' + encodeURIComponent(sid))).json();
        if (!j.ok || !j.ws) throw new Error('ws/new failed: ' + JSON.stringify(j));
        ws = j.ws;
        let rows = []; // pg 队列异步落地，轮询 ≤10s
        for (let i = 0; i < 20 && rows.length === 0; i++) { rows = await row(ws); if (!rows.length) await new Promise(r => setTimeout(r, 500)); }
        if (rows.length !== 1 || rows[0].sid !== sid || !(Number(rows[0].bound_at) > 0)) throw new Error('PG row missing/bad after ws/new: ' + JSON.stringify(rows));
        const d = await (await fetch(B + '/api/ws/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ws }) })).json();
        if (!d.ok) throw new Error('ws/delete failed: ' + JSON.stringify(d));
        for (let i = 0; i < 20 && rows.length > 0; i++) { rows = await row(ws); if (rows.length) await new Promise(r => setTimeout(r, 500)); }
        if (rows.length !== 0) throw new Error('PG row survived ws/delete');
        await sql.end({ timeout: 1 });
        console.log('wsmap row lifecycle ok (' + ws + ')');
        process.exit(0);
    } catch (e) {
        console.log('FAIL: ' + e.message);
        try { if (ws) await fetch(B + '/api/ws/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ws }) }); } catch {}
        try { await sql.end({ timeout: 1 }); } catch {}
        process.exit(1);
    }
})();
