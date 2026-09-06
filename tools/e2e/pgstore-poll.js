// s73 切片1: 活桥 pg 态确立 + forge_bridge.usage_daily 有行（vendored postgres.js 直查，兼作 vendor require 可用证据）
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', 'forge');
const B = process.argv[2] || 'http://127.0.0.1:8790';

(async () => {
    // 1) 等活桥进 pg 态（冷启后首 tick ≤30s + 余量；file/off 态超过 60s=真回落，不算失败——本断言只证 pg 态下链路成立）
    let mode = '';
    for (let i = 0; i < 240; i++) {
        try { mode = (await (await fetch(B + '/api/stats')).json()).pg || ''; } catch {}
        if (mode === 'pg') break;
        await new Promise(r => setTimeout(r, 250));
    }
    if (mode !== 'pg') { console.log('bridge not in pg mode (mode=' + mode + ') — PG 态链路断言跳过不当绿'); process.exit(1); }

    // 2) vendored 客户端直查 forge_bridge
    const postgres = require(path.join(ROOT, 'bin', 'vendor', 'pgstore', 'node_modules', 'postgres'));
    let port = 0; try { port = Number(require('fs').readFileSync(path.join(ROOT, 'data', 'pg.port'), 'utf8').trim()); } catch {}
    if (!port) { console.log('no pg.port'); process.exit(1); }
    const sql = postgres({ host: '127.0.0.1', port, user: 'postgres', database: 'forge_bridge', max: 1, connect_timeout: 2 });
    try {
        const rows = [...await sql`SELECT count(*)::int n, count(*) FILTER (WHERE jsonb_typeof(payload) <> 'object') bad FROM usage_daily`];
        await sql.end({ timeout: 1 });
        if (!rows[0] || rows[0].n < 1) { console.log('usage_daily empty'); process.exit(1); }
        if (rows[0].bad > 0) { console.log('double-encoded payload rows: ' + rows[0].bad); process.exit(1); }
        console.log('usage_daily rows=' + rows[0].n + ' all proper jsonb');
        process.exit(0);
    } catch (e) { console.log('query failed: ' + e.message); try { await sql.end({ timeout: 1 }); } catch {} process.exit(1); }
})();
