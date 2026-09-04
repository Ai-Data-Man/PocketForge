// 报告 v2 沙箱探针（s65 转正自 s64 tmp/s64-probe-report.js + s64-qa-sandbox.js，29 ck，两沙箱顺序跑）
// 场景A（工程验收，端口 18790，自建 tools/e2e/.report-sb-a）：节序/脱敏两路/定时任务零正文/MCP 结构级排除/
//   A3 万级小文件预算/体积硬顶/R1-R4 实景（19 ck）
// 场景B（qa 证伪，端口 18799，自建 tools/e2e/.report-sb-b）：三级截断级联 pc.log→backup.log→统计+最新优先保留/
//   head+tailMd 本身超限→硬顶 break 路径/乱码 pc.port/NO_PROXY 超长（10 ck）
// 不依赖 dev 栈、不碰 8790（waitHealth 校验响应体防撞别的进程）；沙箱跑完自清，异常退出残留由下次启动先清兜底。
// 桥退出会带走其 goose 子进程（实测 s64/s65 多轮无残留）；goose.exe 用硬链接（同卷零拷贝）。
// 用法：node tools/e2e/report-probe-sandbox.js   （实测约 47s：A≈27s + B≈20s）
'use strict';
const C = require('assert');
const FSS = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const FORGE = path.join(ROOT, 'forge');
const SBA = path.join(__dirname, '.report-sb-a');
const SBB = path.join(__dirname, '.report-sb-b');
let pass = 0, fail = 0;
function ck(name, fn) { try { fn(); console.log('PASS: ' + name); pass++; } catch (e) { console.log('FAIL: ' + name + ' — ' + e.message); fail++; } }
const J = (sb, p) => path.join.apply(null, [sb].concat(p));
function spawnBridge(sb, port, noProxy) {
    const child = spawn(process.execPath, [FORGE + '/bin/chat-bridge.js'], {
        env: { ...process.env, FORGE_ROOT: sb, PORT: String(port), NO_PROXY: noProxy },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', d => process.stderr.write('[bridge] ' + d));
    return child;
}
function stopBridge(child) {
    return new Promise(resolve => {
        if (!child || child.exitCode !== null) return resolve();
        child.once('exit', resolve);
        try { child.kill(); } catch { resolve(); }
        setTimeout(resolve, 5000); // 兜底：exit 事件不来也继续（同 s63 destroy 5s 兜底）
    });
}
// rmSync 间歇 EPERM：goose 孙进程靠 pipe EOF 自退，句柄拆除窗实测 0.1-0.3s（1.2 万文件最长 2290ms）；
// maxRetries 方案已证伪（node v24 上游 Sleep 单位 bug 致零间隔），故固定 200ms 轮询、8s 上限（≈25× 余量）。
async function rmSandbox(p) {
    const t0 = Date.now();
    for (;;) {
        try { return FSS.rmSync(p, { recursive: true, force: true }); }
        catch (e) {
            if (Date.now() - t0 > 8000) throw e;
            await new Promise(r => setTimeout(r, 200));
        }
    }
}
function waitHealth(port) {
    return new Promise((resolve, reject) => {
        const try1 = () => require('http').get({ host: '127.0.0.1', port, path: '/healthz', timeout: 1000 }, r => {
            let b = ''; r.on('data', c => b += c); r.on('end', () => { if (b === 'ok') resolve(); else setTimeout(try1, 400); }); // 校验响应体，防止撞上别的进程
        }).on('error', () => setTimeout(try1, 400));
        try1();
        setTimeout(() => reject(new Error('bridge not up :' + port)), 20000);
    });
}
function genReport(port) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        require('http').get({ host: '127.0.0.1', port, path: '/api/report', headers: { 'X-PF-Report': '1' }, timeout: 60000 }, r => {
            let b = ''; r.on('data', c => b += c);
            r.on('end', () => {
                try {
                    const out = JSON.parse(b);
                    C.ok(out.ok === true, 'ok:true: ' + b.slice(0, 200));
                    resolve({ ms: Date.now() - t0, text: FSS.readFileSync(out.path, 'utf8'), size: FSS.statSync(out.path).size });
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// 规则文案（与模板 REPORT_RULE_TEXTS 对齐；探针侧固定串便于人读）
const R1TXT = '数据库服务没起来。建议：双击桌面的『停止数字员工』，再双击『启动数字员工』，然后重试刚才的事。';
const R2TXT = '数字员工还没有配『钥匙』。建议：看聊天窗口顶部的引导条，点它去配。';
const R3TXT = '最近有『钥匙失效』的记录。建议：到设置里把模型钥匙重新配一遍。';
const R4TXT = '启动端口被别的程序占了。建议：重启电脑后再双击启动；还不行就把这份报告发给帮你的人。';
const R5TXT = '电脑开着代理，最近也有连不上网的记录，可能有关。';

let child = null;
(async () => {
    try {
        // ================= 场景 A：工程验收（:18790） =================
        await rmSandbox(SBA);
        for (const d of ['conf/goose/config', 'conf/goose/data/scheduled_recipes', 'conf/goose/config/recipes', 'data/logs', 'data/stats', 'data/backups', 'data/artifacts/ws-bloat', '.agents/skills/skill-alpha', '.agents/skills/skill-beta', '.agents/skills/skill-empty']) FSS.mkdirSync(J(SBA, d.split('/')), { recursive: true });
        FSS.writeFileSync(J(SBA, ['VERSION']), '9.9.9-s64probe');
        // config.yaml：mcp 块 env 注入 sk- 形态 + 一个不匹配任何脱敏正则的自定义值
        FSS.writeFileSync(J(SBA, ['conf', 'goose', 'config', 'config.yaml']), [
            'extensions:',
            '  faucet-db:',
            '    type: stdio',
            '    enabled: true',
            '  browser:',
            '    enabled: false',
            '  mcp-fetch:',
            '    type: stdio',
            '    name: mcp-fetch',
            '    enabled: true',
            '    cmd: \'node.exe\'',
            '    env:',
            '      KEY: sk-fixture000key3',
            '      TOKEN: TOKEN_xyzzy@1',
            '  mcp-ghost:',
            '    type: stdio',
            '    name: mcp-ghost',
            '    enabled: false',
            '    env:',
            '      KEY: ghp_fixture000token3',
            '',
        ].join('\n'));
        // 定时任务：schedule.json 只含 id/cron/paused；title/instructions 在 yaml（隐私注入点）
        FSS.writeFileSync(J(SBA, ['conf', 'goose', 'data', 'schedule.json']), JSON.stringify([{ id: 'daily-mem', source: 'conf\\\\goose\\\\data\\\\scheduled_recipes\\\\daily-mem.yaml', cron: '0 9 * * *', paused: true, currently_running: false }]));
        FSS.writeFileSync(J(SBA, ['conf', 'goose', 'data', 'scheduled_recipes', 'daily-mem.yaml']), 'title: 周三提醒老公吃药\ninstructions: |\n  记得说 INSTR_MARKER_s64 完成打卡\ncron: 0 9 * * *\n');
        // providers：两路脱敏注入之一（key 明文形态）
        FSS.writeFileSync(J(SBA, ['data', 'providers.json']), JSON.stringify([
            { name: 'prov-a', host: 'https://x', key: 'sk-fixture000key2', models: ['m1'], active: true },
            { name: 'prov-b', host: 'https://y', apiKey: 'ghp_fixture000token2', models: [] },
        ]));
        // stats：R3 信号（unauthorized=2, timeout=1）+ 无敏感内容
        FSS.writeFileSync(J(SBA, ['data', 'stats', 'usage-20260904.json']), JSON.stringify({ date: '2026-09-04', errorsByType: { upstream: 3, upstreamByKind: { unauthorized: 2, rate: 0, timeout: 1, server: 0 } } }, null, 2));
        // 端口桩：faucet/pc 都指向死端口 → R1 触发、进程行「未响应」
        FSS.writeFileSync(J(SBA, ['data', 'faucet.port']), '1\n');
        FSS.writeFileSync(J(SBA, ['data', 'pc.port']), '1\n');
        FSS.writeFileSync(J(SBA, ['data', 'backups', 'forge-backup-fixture.zip']), Buffer.alloc(1024, 65));
        // pc.log：8 形态敏感行 + EADDRINUSE + healthz 噪音 + 垫行（小报告场景）
        const LOG_SPECIAL = [
            '2026-09-04 openai key sk-fixture000key leaked in transit',
            '2026-09-04 env GH_TOKEN=ghp_e2esanitizerprobe000000',
            '2026-09-04 token gho_fixture0000000000x',
            '2026-09-04 token github_pat_fixture00000000_AA',
            '2026-09-04 key AIzaSyFixture0000000000',
            '2026-09-04 token glpat-fixture0000x',
            '2026-09-04 token xoxb-fixture-000-000',
            '2026-09-04 EADDRINUSE: address already in use 127.0.0.1:8790',
        ];
        FSS.writeFileSync(J(SBA, ['data', 'logs', 'pc.log']), ['2026-09-04 boot ok']
            .concat(Array.from({ length: 200 }, (_, i) => '2026-09-04 healthz probe ' + i))
            .concat(LOG_SPECIAL).join('\n') + '\n');
        // 技能：2 个有效 + 1 个空目录
        FSS.writeFileSync(J(SBA, ['.agents', 'skills', 'skill-alpha', 'SKILL.md']), '---\nname: alpha\n---\nbody');
        FSS.writeFileSync(J(SBA, ['.agents', 'skills', 'skill-beta', 'SKILL.md']), '---\nname: beta\n---\nbody');
        // 桥启动即 spawn goose——沙箱内硬链接真 goose.exe（同卷零拷贝）
        FSS.mkdirSync(J(SBA, ['bin', 'goose', 'goose-package']), { recursive: true });
        FSS.linkSync(FORGE + '/bin/goose/goose-package/goose.exe', J(SBA, ['bin', 'goose', 'goose-package', 'goose.exe']));
        // A3 膨胀点：1.2 万小文件（预算场景）
        console.log('seeding 12000 files ...');
        for (let i = 0; i < 12000; i++) FSS.writeFileSync(J(SBA, ['data', 'artifacts', 'ws-bloat', 'f' + String(i).padStart(6, '0') + '.txt']), 'x');

        child = spawnBridge(SBA, 18790, '127.0.0.1,localhost');
        await waitHealth(18790);

        // ===== 报告 1：常规体积（规则/脱敏/隐私/计数全场景）=====
        const r1 = await genReport(18790);
        const t = r1.text;
        const at = s => t.indexOf(s);
        ck('验收1 节序：生成时间 < 毛病 < 快速判断 < 环境', () => {
            const iGen = at('- 生成时间：'), iMao = at('## 小forge自己看到的毛病'), iKuai = at('## 快速判断'), iEnv = at('## 环境');
            C.ok(iGen >= 0 && iGen < iMao && iMao < iKuai && iKuai < iEnv, [iGen, iMao, iKuai, iEnv].join(','));
        });
        ck('验收8 前置：现有八节全部在', () => {
            for (const s of ['## 环境', '## 日志（pc.log 尾部', '## 备份日志', '## 使用统计', '## 模型接口配置', '## 会话概况', '## 请补充说明', '## GitHub issue 模板']) C.ok(at(s) >= 0, s);
        });
        ck('R1 实景命中（faucet 死端口）', () => C.ok(t.includes(R1TXT), '毛病节缺 R1'));
        ck('R2 不触发（providers 已配 key）', () => C.ok(!t.includes(R2TXT)));
        ck('R3 实景命中（unauthorized=2）', () => C.ok(t.includes(R3TXT)));
        ck('R4 实景命中（pc.log 含 EADDRINUSE）', () => C.ok(t.includes(R4TXT)));
        ck('R5 去重实景：unauthorized>0 时不触发（无论本机代理状态）', () => C.ok(!t.includes(R5TXT)));
        ck('A7 快速判断行：连不上 3 次（钥匙失效 2、超时 1）', () => {
            C.ok(/最近 7 天：连不上模型 3 次（钥匙失效 2 次、超时 1 次）/.test(t), t.split('## 快速判断')[1] && t.split('## 快速判断')[1].slice(0, 120));
        });
        ck('验收2 脱敏：providers+日志两路 8 形态 0 命中', () => {
            for (const s of ['sk-fixture000key', 'sk-fixture000key2', 'ghp_fixture000token2', 'gho_fixture0000000000x', 'github_pat_fixture00000000', 'AIzaSyFixture', 'glpat-fixture0000x', 'xoxb-fixture-000-000', 'GH_TOKEN=ghp_e2esanitizerprobe000000']) C.ok(!t.includes(s), s);
        });
        ck('验收2 脱敏：命中行呈 <已脱敏>（日志 7 行 + 0 漏网）', () => {
            const n = (t.match(/<已脱敏>/g) || []).length;
            C.ok(n >= 7, 'count=' + n);
            C.ok(!/leaked in transit|esani/.test(t), '敏感行残留');
        });
        ck('验收3 定时任务：仅计数行，id/cron/title/instructions 全 0 命中', () => {
            C.ok(at('定时任务：1 个（暂停 1 个）') >= 0, '计数行');
            for (const s of ['daily-mem', '0 9 * * *', '周三提醒老公吃药', 'INSTR_MARKER_s64', 'scheduled_recipes']) C.ok(!t.includes(s), s);
        });
        ck('验收4 MCP 结构级排除：只渲染名称+启停，env 值 0 命中', () => {
            C.ok(at('网页抓取（开）') >= 0, '目录 MCP 渲染');
            C.ok(at('mcp-ghost（停用）') >= 0, '非目录 MCP 渲染');
            for (const s of ['sk-fixture000key3', 'ghp_fixture000token3', 'TOKEN_xyzzy@1', 'node.exe']) C.ok(!t.includes(s), s);
        });
        ck('验收5 A3：万级小文件计入了（≥12000 文件），无文件名/目录名泄露', () => {
            const m = t.match(/工作区 [\d.]+ [KMG]?B（(\d+) 个文件）/);
            C.ok(m && parseInt(m[1], 10) >= 12000, m && m[1]);
            C.ok(/会话库 [\d.]+ B（0 个文件）|会话库 [\d.]+ [KMG]B/.test(t), '会话库行');
            C.ok(at('备份 1.0 KB（1 个文件）') >= 0, '备份行');
            C.ok(!t.includes('ws-bloat') && !t.includes('f000000') && !t.includes('forge-backup-fixture'), '泄露文件名');
        });
        ck('验收5 A3：报告 1 往返 <30s（预算兜底不挂死）', () => C.ok(r1.ms < 30000, r1.ms + 'ms'));
        ck('A1/A2/A6 短行在', () => {
            C.ok(at('- 系统代理：') >= 0 && at('NO_PROXY：') >= 0, '代理行');
            C.ok(/- 数据盘剩余空间：[\d.]+ GB/.test(t), '磁盘行');
            C.ok(at('- 已安装技能：2 个') >= 0, '技能计数（空目录不算）');
            C.ok(at('- 定时任务：') >= 0, '定时任务行');
        });
        ck('验收8 前置：会话概况节在（goose 可能已建库，未取到/正常读取两形态都合法）', () => {
            C.ok(at('## 会话概况') >= 0 && (at('未取到（会话库不可读）') >= 0 || /总会话 \d+/.test(t)), t.slice(at('## 会话概况'), at('## 会话概况') + 120));
        });

        // ===== 报告 2：pc.log 超大 → 体积硬顶 =====
        FSS.writeFileSync(J(SBA, ['data', 'logs', 'pc.log']), Array.from({ length: 400 }, (_, i) => '2026-09-04 big line ' + i + ' ' + 'x'.repeat(1000)).join('\n') + '\n');
        const r2 = await genReport(18790);
        ck('验收7 落盘 ≤256KB 且含（已截断）', () => {
            C.ok(r2.size <= 256 * 1024, 'size=' + r2.size);
            C.ok(r2.text.includes('（已截断）'), '无截断标记');
        });
        ck('验收7 诊断节与环境节完整保留', () => {
            for (const s of ['## 小forge自己看到的毛病', '## 快速判断', '## 环境', '- 数据盘剩余空间：', '- 膨胀点体积：', '- 定时任务：', '- MCP 扩展：', '- 已安装技能：', '## GitHub issue 模板', '## 请补充说明']) C.ok(r2.text.indexOf(s) >= 0, s);
        });

        // ===== 报告 3：providers 全未配 key → R2 实景 =====
        FSS.writeFileSync(J(SBA, ['data', 'providers.json']), JSON.stringify([{ name: 'prov-a', host: 'https://x', models: [], active: true }]));
        const r3 = await genReport(18790);
        ck('R2 实景命中（全未配 key）', () => C.ok(r3.text.includes(R2TXT)));

        console.log('场景A(:18790) 落盘 r1=' + r1.size + 'B/' + r1.ms + 'ms, r2=' + r2.size + 'B, r3=' + r3.size + 'B');
        await stopBridge(child); child = null;
        await rmSandbox(SBA);

        // ================= 场景 B：qa 证伪（:18799） =================
        await rmSandbox(SBB);
        for (const d of ['conf/goose/config', 'conf/goose/data', 'data/logs', 'data/stats']) FSS.mkdirSync(J(SBB, d.split('/')), { recursive: true });
        FSS.writeFileSync(J(SBB, ['VERSION']), '9.9.9-qaprobe');
        FSS.writeFileSync(J(SBB, ['conf', 'goose', 'config', 'config.yaml']), 'GOOSE_PROVIDER: openai\nextensions:\n  mcp-fetch:\n    enabled: true\n');
        FSS.writeFileSync(J(SBB, ['data', 'providers.json']), JSON.stringify([{ name: 'prov-a', host: 'https://x', key: 'sk-fixture000key2', models: ['m1'], active: true }]));
        // 场景1 布景：pc.log 单行 250KB；backup.log 29 行 x 9KB；stats 7 天 x 60KB（带 day 标记）
        FSS.writeFileSync(J(SBB, ['data', 'logs', 'pc.log']), 'HUGE ' + 'x'.repeat(250 * 1024) + ' EADDRINUSE-marker\n');
        FSS.writeFileSync(J(SBB, ['data', 'logs', 'backup.log']), Array.from({ length: 29 }, (_, i) => 'bak ' + i + ' ' + 'y'.repeat(9000)).join('\n') + '\n');
        for (let d = 1; d <= 7; d++) {
            const day = '2026-09-0' + d;
            FSS.writeFileSync(J(SBB, ['data', 'stats', 'usage-' + day.replace(/-/g, '') + '.json']),
                JSON.stringify({ date: day, errorsByType: { upstream: 1, upstreamByKind: { unauthorized: 0, rate: 0, timeout: 0, server: 1 } } }) + '\n"filler-day-' + d + ' ' + 'z'.repeat(60 * 1024) + '"');
        }
        FSS.writeFileSync(J(SBB, ['data', 'pc.port']), 'not-a-port\n'); // 乱码端口 → 未探测
        FSS.mkdirSync(J(SBB, ['bin', 'goose', 'goose-package']), { recursive: true });
        FSS.linkSync(FORGE + '/bin/goose/goose-package/goose.exe', J(SBB, ['bin', 'goose', 'goose-package', 'goose.exe']));

        child = spawnBridge(SBB, 18799, 'np.'.repeat(200));
        await waitHealth(18799);

        // ===== 场景1：三级截断级联 =====
        const q1 = await genReport(18799);
        const t1 = q1.text;
        ck('场景1 落盘 ≤256KB', () => C.ok(q1.size <= 256 * 1024, 'size=' + q1.size));
        ck('场景1 截断标记出现 3 处（日志/备份/统计）', () => C.strictEqual((t1.match(/（已截断）/g) || []).length, 3, 'count=' + (t1.match(/（已截断）/g) || []).length));
        ck('场景1 日志节被清空且标记', () => C.ok(t1.includes('pc.log 尾部 0 行') && t1.includes('\n（已截断）')), '');
        ck('场景1 备份节被清空且标记', () => C.ok(/backup\.log 尾部 无/.test(t1)), '');
        ck('场景1 统计「最新优先」：09-07 保留、09-01 被截', () => {
            C.ok(t1.includes('usage-20260907.json'), '最新一天丢了');
            C.ok(!t1.includes('usage-20260901.json') && !t1.includes('filler-day-1'), '最旧一天没截掉');
            C.ok(!t1.includes('filler-day-4') && t1.includes('usage-20260905.json'), '保留集合与 slice(-3) 不符');
        });
        ck('场景1 诊断节/环境节/结构化短行完整', () => {
            for (const s of ['## 小forge自己看到的毛病', '## 快速判断', '## 环境', '- 数据盘剩余空间：', '- 膨胀点体积：', '- 定时任务：', '- MCP 扩展：', '## 请补充说明', '## GitHub issue 模板', '## 会话概况']) C.ok(t1.includes(s), s);
        });
        ck('场景1 R4 信号在 250KB 单行内仍被识别（pcTail 含该行时触发）', () => {
            // nLog 截到 0 行后 secLog 不含该行——但 sig.logHasEaddrinuse 用的是完整 pcTail（截断不影响诊断信号）
            C.ok(t1.includes('端口被别的程序占了'), 'R4 未触发');
        });
        ck('场景1 乱码 pc.port → 未知/未探测 而非崩溃', () => C.ok(t1.includes('pc（进程管理器，端口 未知）：未探测'), t1.split('进程：')[1] && t1.split('进程：')[1].slice(0, 200)));

        // ===== 场景2：head+tailMd 超限（providers 巨型字段）→ 硬顶 break 路径 =====
        FSS.writeFileSync(J(SBB, ['data', 'logs', 'pc.log']), 'boot\n');
        FSS.writeFileSync(J(SBB, ['data', 'logs', 'backup.log']), '');
        FSS.writeFileSync(J(SBB, ['data', 'providers.json']), JSON.stringify([{ name: 'prov-a', host: 'https://x', key: 'k2', models: ['m1'], active: true, note: 'N'.repeat(400 * 1024) }]));
        const q2 = await genReport(18799);
        console.log('场景2 实测落盘大小: ' + q2.size + 'B（硬顶=262144B）');
        ck('场景2 报告仍生成、结构完整、无崩溃', () => {
            for (const s of ['## 小forge自己看到的毛病', '## 环境', '## 模型接口配置', '## GitHub issue 模板']) C.ok(q2.text.includes(s), s);
        });
        ck('场景2 首行 NOT E 理：NO_PROXY 超长值被切到 120', () => {
            const m = q2.text.match(/NO_PROXY：(.{0,200})/);
            C.ok(m && m[1].replace(/np\./g, '').length <= 120, '长度=' + (m ? m[1].length : 'none'));
        });

        console.log('场景B(:18799) 落盘 r1=' + q1.size + 'B, r2=' + q2.size + 'B');
    } catch (e) {
        console.error('PROBE ERROR:', e);
        process.exitCode = 1;
    } finally {
        await stopBridge(child); child = null;
        for (const d of [SBA, SBB]) { try { await rmSandbox(d); } catch {} }
    }
    console.log('==============================');
    console.log('report-probe-sandbox: PASS=' + pass + ' FAIL=' + fail);
    if (fail) process.exitCode = 1;
})();
