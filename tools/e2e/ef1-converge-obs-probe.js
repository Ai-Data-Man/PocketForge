// s108 返工（qa P2-3）：spawnForgeConverge 零观察面——stdio ignore 且无 exit 监听，wrapper 门拒 rc=4 拒发 update 时
// events 无行、保存面板回执照常「成功」。修=exit 错码时一行 providers_converge_failed（正常路零噪音）。
// 手法同 rescue-guard/uiarm：从 chat-bridge.tpl.js 原文锚点提取 spawnForgeConverge 进 vm 桩沙盒，零网络零进程。
// 红绿：PF_TPL 指向改前模板必红（O1 无 exit 监听/O2 rc=4 无行）。
'use strict';
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.env.PF_TPL || __dirname + '/../../forge/conf/templates/chat-bridge.tpl.js', 'utf8');
const start = src.indexOf('function spawnForgeConverge');
const end = src.indexOf('\n}', start);
if (start < 0 || end < 0) { console.log('FAIL: extraction anchors not found'); process.exit(1); }
const fnSrc = src.slice(start, end + 2);

let pass = 0, fail = 0;
const ck = (n, ok) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n); ok ? pass++ : fail++; };

function makeSandbox() { // 每臂独立沙盒：child on() 登记表 + evJson 行记录器
    const handlers = {}, evLines = [];
    const child = { pid: 4242, on(ev, fn) { handlers[ev] = fn; return this; } };
    const ctx = {
        process: { env: {} }, // ComSpec 回落 cmd.exe（真值不进断言面）
        path: { join: () => 'X:/bin/pc/forge-register.cmd' },
        FSS: { existsSync: () => true },
        require: () => ({ spawn: () => child }), // 桩 child_process：不真 spawn，只登记监听
        evJson: o => evLines.push(o),
        console: { log() {} },
        setTimeout: () => ({ unref() {} }), // 30s 树杀兜底定时器桩（不真跑）
        ROOT: 'X:/PF-ROOT',
    };
    vm.runInNewContext(fnSrc + '\nspawnForgeConverge();', ctx);
    return { handlers, evLines };
}

// O1 exit 监听在场（改前模板：spawn error 有 evJson、exit 路径零观察——O1/O2 红）
// O2 wrapper 门拒 rc=4 → events 一行 providers_converge_failed 带 rc
{
    const { handlers, evLines } = makeSandbox();
    ck('O1 exit 监听已挂（错码观察面在场）', typeof handlers.exit === 'function');
    if (handlers.exit) handlers.exit(4);
    const last = evLines[evLines.length - 1];
    ck('O2 rc=4 → events 一行 providers_converge_failed{rc:4}', evLines.length === 1 && last && last.ev === 'providers_converge_failed' && last.rc === 4 && last.trigger === '保存');
}
// O3 正常路 rc=0 零噪音（裁决三负检查⑤：converge rc=0 零补跑噪音）
{
    const { handlers, evLines } = makeSandbox();
    if (handlers.exit) handlers.exit(0);
    ck('O3 rc=0 零额外 events 行（正常路不加噪音）', evLines.length === 0);
}
// O4 spawn error 路既有 err 行保持（ef1 既有行为钉，防本批改丢）
{
    const { handlers, evLines } = makeSandbox();
    if (handlers.error) handlers.error(new Error('ENOENT'));
    const last = evLines[evLines.length - 1];
    ck('O4 spawn error 既有 providers_converge err 行保持', evLines.length === 1 && last && last.ev === 'providers_converge' && String(last.err).includes('ENOENT'));
}
// O5 缺 wrapper 文件分支既有跳过行保持
{
    const evLines = [];
    vm.runInNewContext(fnSrc + '\nspawnForgeConverge();', {
        process: { env: {} },
        path: { join: () => 'X:/bin/pc/forge-register.cmd' }, FSS: { existsSync: () => false },
        require: () => { throw new Error('unreachable'); }, evJson: o => evLines.push(o),
        console: { log() {} }, setTimeout: () => ({ unref() {} }), ROOT: 'X:/PF-ROOT',
    });
    ck('O5 wrapper 缺文件跳过行保持', evLines.length === 1 && evLines[0] && evLines[0].err === 'forge-register.cmd missing');
}
console.log('ef1-converge-obs: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
