// IA-3（裁决 docs/verdicts/2026-09-07-ia-root-cure.md §6-d 主控修正版）: db/overview 表说明读链黑盒断言。
// forge_table_info 是各应用库内的普通表（tbl/description/created_at），agent 用已有 faucet 工具写，桥经 _table 通道读。
// 造数（含坏值行）→ desc 带出 + 超长截断 + 坏值跳过 → 删表降级 desc=null 不炸。造数即清，失败也兜底清理。
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..', 'forge');
const B = process.argv[2] || 'http://127.0.0.1:8790';
const GOOD_DESC = '零件主数据：代码、名称、数量——给库存查询用';

(async () => {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(ROOT, 'data', 'sqlite', 'plm.db')); // e2e 专用库（e2e-chat.sh 同款 fixture）
    const setup = () => {
        db.exec('DROP TABLE IF EXISTS forge_table_info');
        db.exec('CREATE TABLE forge_table_info (tbl TEXT PRIMARY KEY, description TEXT, created_at TEXT)');
        const ins = db.prepare('INSERT INTO forge_table_info (tbl, description, created_at) VALUES (?,?,?)');
        ins.run('parts', GOOD_DESC, '2026-09-07');                       // 正常行
        ins.run('parts_e2e', '长'.repeat(250), '2026-09-07');            // 超长 → 桥截断 200
        ins.run('forge_table_info', null, '2026-09-07');                 // 坏值：desc 非字符串 → 行跳过
        ins.run(null, '没有表名 → 跳过', '2026-09-07');                   // 坏值：tbl 缺失 → 行跳过
    };
    const teardown = () => db.exec('DROP TABLE IF EXISTS forge_table_info');
    const finish = (code, msg) => { try { db.close(); } catch {} console.log(msg); process.exit(code); }; // 不 close 直接 exit：Windows libuv 句柄断言崩溃（node:sqlite 实验特性）
    const overview = async () => (await (await fetch(B + '/api/db/overview')).json());
    try {
        setup();
        let d = await overview();
        if (d.ok !== true) throw new Error('overview not ok');
        const plm = d.services.find(s => s.service === 'plm');
        if (!plm) throw new Error('plm service missing');
        for (const s of d.services) for (const t of s.tables)
            if (!(t.desc === null || typeof t.desc === 'string')) throw new Error('desc type violation: ' + JSON.stringify(t));
        const byName = Object.fromEntries(plm.tables.map(t => [t.name, t]));
        if (byName.parts.desc !== GOOD_DESC) throw new Error('parts desc not carried: ' + JSON.stringify(byName.parts.desc));
        if (!byName.parts_e2e.desc || byName.parts_e2e.desc.length !== 200) throw new Error('overlong desc not truncated to 200: len=' + (byName.parts_e2e.desc || '').length);
        if (byName.forge_table_info.desc !== null) throw new Error('null-desc row not skipped: ' + JSON.stringify(byName.forge_table_info.desc));
        // s94 F-7: 纯日期串 created_at='2026-09-07' 按本地零点解析——修前 ES 规范 date-only 走 UTC 零点，
        // 东八区显示恒 08:00（ia1 实锤）；new Date(y,m-1,d) 即本地零点 epoch
        const localMidnight = new Date(2026, 9 - 1, 7).getTime();
        if (byName.parts.ts !== localMidnight) throw new Error('pure-date ts not local-midnight: got ' + byName.parts.ts + ' want ' + localMidnight + ' (delta=' + (byName.parts.ts - localMidnight) + 'ms)');
        teardown();
        d = await overview(); // 降级：库里没有 forge_table_info → desc=null 不炸
        if (d.ok !== true) throw new Error('overview not ok after drop');
        const plm2 = d.services.find(s => s.service === 'plm');
        if (!plm2 || !plm2.tables.length) throw new Error('plm tables missing after drop');
        if (plm2.tables.some(t => t.name === 'forge_table_info')) throw new Error('dropped table still listed');
        for (const s of d.services) for (const t of s.tables)
            if (t.desc !== null) throw new Error('desc should be null for all tables after drop: ' + JSON.stringify(t));
        finish(0, 'db overview desc carry/skip/truncate/drop-degrade ok');
    } catch (e) {
        try { teardown(); } catch {} // 清理残留
        finish(1, 'FAIL: ' + e.message);
    }
})();
