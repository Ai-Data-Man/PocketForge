// s106/C4 独立验证（红绿对照）：llmproxy 断开行两分标签——「首字节未到就关=客户端到点放弃（我方栈
// 5s 超时形状，真相=上游停摆）」vs「首字节已到后的断开=真客户端中断」。修前统一 "client aborted" 把
// 45 条 /models-5s 停掩成客户端行为（s106 取证 C4/K4：68=45 models-5s+8 旧格式+15 真中途断流）。
// 断言面：①红臂首字节未到也标 client aborted（修前形状）；②绿臂首字节未到标 client timeout 族；
// ③首字节已到两臂都保持 client aborted（真中断族零变化）；④正常收尾（writableEnded）不落断开行；
// ⑤消费面盘点：tools/e2e 与 forge/tmp 活探针零 'client aborted' 字面断言（随迁面=0，实证留档）。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const TPL = path.join(__dirname, '..', 'forge', 'conf', 'templates', 'chat-bridge.tpl.js');
const tpl = fs.readFileSync(TPL, 'utf8');
const BASE = process.env.S106_BASE || 'HEAD'; // 提交后复现红臂：S106_BASE=<修前 commit> node tmp/s106-g4-llmproxy-timeout-label.js
const head = cp.execSync('git show ' + BASE + ':forge/conf/templates/chat-bridge.tpl.js', { cwd: path.join(__dirname, '..'), maxBuffer: 32 * 1024 * 1024 }).toString();
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const grabClose = src => { const m = src.match(/res\.on\('close', \(\) => \{[^\n]*/); if (!m) throw new Error('close 语句锚提取失败'); return m[0]; };
const headStmt = grabClose(head), curStmt = grabClose(tpl);
console.log('HEAD: ' + headStmt.slice(0, 120));
console.log('CUR : ' + curStmt.slice(0, 120));

function fire(stmt, { tFirst, writableEnded, upStatus }) {
    let captured = null;
    const res = { writableEnded: !!writableEnded, on: (ev, fn) => { if (ev === 'close') fn(); } }; // 同步模拟 close 事件
    const up = { destroyed: 0, destroy() { this.destroyed++; } };
    const llmDone = (s, e) => { captured = { status: s, err: e }; };
    new Function('res', 'up', 'llmDone', 'tFirst', 'upStatus', stmt)(res, up, llmDone, tFirst, upStatus);
    return { captured, up };
}

// ① 红臂：首字节未到（models-5s 停摆形状）→ 修前被标 client aborted
let r = fire(headStmt, { tFirst: 0, upStatus: 0 });
ok(r.captured && r.captured.err === 'client aborted', '红臂 首字节未到也标 client aborted（上游停摆被掩盖的修前形状）: ' + (r.captured && r.captured.err));
// ② 绿臂：同形状 → client timeout 族
r = fire(curStmt, { tFirst: 0, upStatus: 0 });
ok(r.captured && r.captured.err === 'client timeout (no upstream first byte)', '绿臂 首字节未到标 client timeout（停摆真相可 grep）: ' + (r.captured && r.captured.err));
ok(r.captured.status === 0 && r.up.destroyed === 1, '绿臂 status:0 传递与上游掐流保持（up.destroy() 已调）');
// ③ 首字节已到（真中途断流族：如 09-30T17:50:12 deepseek 3356ms aborted）两臂一致
r = fire(headStmt, { tFirst: 1759000000000, upStatus: 200 });
const headMid = r.captured && r.captured.err;
r = fire(curStmt, { tFirst: 1759000000000, upStatus: 200 });
ok(headMid === 'client aborted' && r.captured.err === 'client aborted', '绿臂 首字节已到的中途断流保持 client aborted（15 条真中断族零变化）');
// ④ 正常收尾不落行
r = fire(curStmt, { tFirst: 1759000000000, upStatus: 200, writableEnded: true });
ok(r.captured === null, '绿臂 正常收尾（writableEnded）不触发断开行（先到先记语义保持）');

// ⑤ 消费面盘点：活探针零字面断言（红绿快照副本除外——它们是桥模板自身的历史拷贝非断言）
let assertFiles = [];
for (const dir of [path.join(__dirname, '..', 'tools', 'e2e'), path.join(__dirname, '..', 'forge', 'tmp')]) {
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.js')) continue;
        const t = fs.readFileSync(path.join(dir, f), 'utf8');
        if (t.indexOf('client aborted') >= 0) assertFiles.push(path.join(dir, f));
    }
}
const realAsserts = assertFiles.filter(f => /redsb-bridge|bridge-old|\.pre\.js|pre-bootstrap|prefix-qa|mut1|mut2/.test(f) === false);
ok(realAsserts.length === 0, '消费面盘点：活探针对 client aborted 零字面断言（随迁面=0；命中文件全为桥模板历史拷贝: ' + assertFiles.map(f => path.basename(f)).join(',') + '）');

console.log('RESULT g4: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
