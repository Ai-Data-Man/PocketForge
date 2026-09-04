// 报告 v2 静态/纯函数探针（s65 转正自 s64 tmp/s64-probe-units.js + s64-qa-edge.js，39 ck）
// 前半 = units（规则 R1-R5 正反例/文案表/脱敏正则/体积常量/零污染静态断言，28 ck）
// 后半 = qa-edge（tsLocal 畸形/readExtState 对抗 fixture/reportScheduleCounts 畸形/A7 聚合畸形，11 ck）
// 纯静态、无桥、无网络、秒级。转正改动（其余逐行照搬）：
//  - 路径改 __dirname 相对（原硬编码 C:/ZCodeWorks/PocketForge）
//  - 删 units 两条一次性 git 断言（「diff 未新增端点」「改动文件仅为模板+产物」——s64 提交时的一次性最小 diff 验收，干净树恒空转、脏树误报，不构成长期保护网）
//  - 更新 qa-edge「readExtState 块内顶级注释截断」断言：67b871d（qa P3-2）已修注释行分叉，改为断言修复后行为
// 用法：node tools/e2e/report-probe-static.js
'use strict';
const C = require('assert');
const FSS = require('fs');
const path = require('path');
const os = require('os');
const TPL = path.join(__dirname, '..', '..', 'forge', 'conf', 'templates');
const SRC = FSS.readFileSync(path.join(TPL, 'chat-bridge.tpl.js'), 'utf8');
const HTML = FSS.readFileSync(path.join(TPL, 'chat.tpl.html'), 'utf8');
let pass = 0, fail = 0;
function ck(name, fn) { try { fn(); console.log('PASS: ' + name); pass++; } catch (e) { console.log('FAIL: ' + name + ' — ' + e.message); fail++; } }
function extractFnIn(src, name) {
    const head = 'function ' + name + '(';
    const at = src.indexOf(head);
    if (at < 0) throw new Error('fn not found: ' + name);
    const brace = src.indexOf('{', at);
    let depth = 0;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error('unbalanced: ' + name);
}

// ================= 前半：units =================
// ---- 标记提取规则区（纯函数块，不动桥启动路径）----
function extractMarked() {
    const b = SRC.indexOf('// >>> s64 规则区标记');
    const e = SRC.indexOf('// <<< s64 规则区标记结束');
    C.ok(b >= 0 && e > b, '规则区标记存在');
    return SRC.slice(b, e);
}
const ruleSrc = extractMarked();
const RULES = new Function(ruleSrc + '\nreturn { T: REPORT_RULE_TEXTS, r1: reportRuleR1, r2: reportRuleR2, r3: reportRuleR3, r4: reportRuleR4, r5: reportRuleR5 };')();
const extractFn = name => extractFnIn(SRC, name); // units 原单参闭包（对 SRC 切割）复用同一切割器

// R1-R5 各≥1 正例+反例
const base = { faucetAlive: true, provHasKey: true, unauthorized: 0, upstreamTotal: 0, logHasEaddrinuse: false, proxyOn: false };
ck('R1 正例：faucet 未响应触发', () => C.strictEqual(RULES.r1({ ...base, faucetAlive: false }), RULES.T.r1));
ck('R1 反例：faucet 存活不触发', () => C.strictEqual(RULES.r1({ ...base, faucetAlive: true }), null));
ck('R1 反例：faucet 未探测(null)不触发', () => C.strictEqual(RULES.r1({ ...base, faucetAlive: null }), null));
ck('R2 正例：全未配 key 触发', () => C.strictEqual(RULES.r2({ ...base, provHasKey: false }), RULES.T.r2));
ck('R2 反例：有 key 不触发', () => C.strictEqual(RULES.r2({ ...base, provHasKey: true }), null));
ck('R3 正例：unauthorized>0 触发', () => C.strictEqual(RULES.r3({ ...base, unauthorized: 2 }), RULES.T.r3));
ck('R3 反例：unauthorized=0 不触发', () => C.strictEqual(RULES.r3({ ...base, unauthorized: 0 }), null));
ck('R4 正例：日志含 EADDRINUSE 触发', () => C.strictEqual(RULES.r4({ ...base, logHasEaddrinuse: true }), RULES.T.r4));
ck('R4 反例：无 EADDRINUSE 不触发', () => C.strictEqual(RULES.r4({ ...base, logHasEaddrinuse: false }), null));
ck('R5 正例：代理开+连接错+未授权0 触发', () => C.strictEqual(RULES.r5({ ...base, proxyOn: true, upstreamTotal: 3 }), RULES.T.r5));
ck('R5 反例：代理关不触发', () => C.strictEqual(RULES.r5({ ...base, upstreamTotal: 3 }), null));
ck('R5 反例：无连接错不触发', () => C.strictEqual(RULES.r5({ ...base, proxyOn: true, upstreamTotal: 0 }), null));
ck('R5 去重：unauthorized>0（R3 已报）不触发', () => C.strictEqual(RULES.r5({ ...base, proxyOn: true, upstreamTotal: 3, unauthorized: 2 }), null));

// 文案表——每条含"建议"；r1-r5 均含"发给帮你的人"出口（qa P3-3 门槛4）；无命中文案指向补充说明
ck('文案表 r1-r5 均含「建议」', () => { for (const k of ['r1', 'r2', 'r3', 'r4', 'r5']) C.ok(RULES.T[k].includes('建议'), k); });
ck('文案表 r1-r5 均含「发给帮你的人」出口', () => { for (const k of ['r1', 'r2', 'r3', 'r4', 'r5']) C.ok(RULES.T[k].includes('发给帮你的人'), k); });
ck('文案表 none 指向「请补充说明」', () => C.ok(RULES.T.none.includes('请补充说明')));

// A7 汇总行形态
const errLine = new Function(extractFn('reportErrLine') + '\nreturn reportErrLine;')();
ck('A7 零错误行', () => C.ok(errLine({ upstream: 0, kind: {} }).includes('没有连不上模型')));
ck('A7 聚合行含总数与细分', () => {
    const s = errLine({ upstream: 3, kind: { unauthorized: 2, rate: 0, timeout: 1, server: 0 } });
    C.ok(s.includes('连不上模型 3 次') && s.includes('钥匙失效 2 次') && s.includes('超时 1 次'), s);
});

// 体积硬顶：单一常量两处引用
ck('REPORT_MAX_BYTES 单一定义', () => C.strictEqual((SRC.match(/256 \* 1024/g) || []).length, 1));
ck('reportTail 引用常量', () => C.ok(/const MAX = REPORT_MAX_BYTES;/.test(extractFn('reportTail'))));
ck('截断循环引用常量', () => C.ok(/> REPORT_MAX_BYTES/.test(extractFn('buildReport'))));

// reportFmtBytes 纯函数
const fmt = new Function(extractFn('reportFmtBytes') + '\nreturn reportFmtBytes;')();
ck('fmtBytes 阶梯', () => { C.strictEqual(fmt(500), '500 B'); C.strictEqual(fmt(2048), '2.0 KB'); C.strictEqual(fmt(5 * 1048576), '5.0 MB'); C.strictEqual(fmt(1.5 * 1073741824), '1.5 GB'); });

// reportSanitize 全形态命中整行替换
const reM = SRC.match(/return String\(text\)\.split\('\\n'\)\.map\(l => \(\/(.+)\/i\.test\(l\)/);
C.ok(reM, 'reportSanitize 正则存在');
const SAN = new RegExp(reM[1], 'i');
const FORMS = ['sk-abc123', 'ghp_x', 'gho_x', 'github_pat_x', 'AIzaSyABCDEFGHIJK', 'glpat-x', 'xoxb-x', 'GH_TOKEN=x'];
ck('脱敏正则 8 形态全命中', () => { for (const f of FORMS) C.ok(SAN.test('2026-09-04 leak ' + f), f); });
ck('脱敏正则不误伤正常行', () => C.ok(!SAN.test('2026-09-04 faucet healthz ok') && !SAN.test('skype 是别的词不行吗'))); // s65 qa P2：原式 === 优先级高于 &&，归约恒等于只测第一行，skype 守卫是死代码

// 零污染静态断言——新增采集函数无任何写 API
const HELPERS = ['reportSysProxy', 'reportDiskFree', 'reportFmtBytes', 'reportDirSize', 'reportBloat', 'reportScheduleCounts', 'reportMcpList', 'reportSkillCount', 'reportErrLine', 'reportRuleR1', 'reportRuleR2', 'reportRuleR3', 'reportRuleR4', 'reportRuleR5'];
const WRITE_RE = /writeFileSync|appendFileSync|renameSync|unlinkSync|rmSync|cpSync|mkdirSync|writeFile|writeSync\(|openSync\([^,)]*,\s*['"]w|spawn\(|execSync|exec\(/;
ck('新增采集函数零写 API 零子进程', () => {
    for (const h of HELPERS) {
        const body = extractFn(h);
        C.ok(!WRITE_RE.test(body), h + ' 含写/子进程调用');
    }
});
ck('reportSysProxy 只读注册表（query，无 add/delete 等）', () => {
    const body = extractFn('reportSysProxy');
    C.ok(/'query'/.test(body), 'query 缺失');
    C.ok(!/['"](add|delete|copy|restore|save|unload|import|compare)['"]/.test(body), '出现注册表写子命令');
});
ck('buildReport 写操作仅 报告目录 mkdir + 报告原子写', () => {
    const body = extractFn('buildReport');
    C.strictEqual((body.match(/mkdirSync/g) || []).length, 1, 'mkdirSync 次数');
    C.ok(/mkdirSync\(REPORTS_DIR/.test(body), 'mkdir 目标非 REPORTS_DIR');
    C.strictEqual((body.match(/atomicWrite\(/g) || []).length, 1, 'atomicWrite 次数');
    C.ok(/atomicWrite\(file, reportSanitize\(md\)\)/.test(body), '原子写目标非报告文件');
    C.ok(!/writeFileSync|appendFileSync|renameSync|unlinkSync|rmSync|cpSync|spawn\(|execFile\(/.test(body), 'buildReport 出现其他写/子进程');
});
ck('A3 白名单仅 3 个只读目标', () => {
    const m = SRC.match(/const REPORT_BLOAT_TARGETS = \[([\s\S]*?)\];/);
    C.ok(m, '白名单定义存在');
    C.strictEqual((m[1].match(/^\s{4}\['/gm) || []).length, 3, '白名单条目数');
});

// ================= 后半：qa-edge =================
// ---- 1. tsLocal（chat.tpl.html）+ byNew 复刻 ----
const tsLocal = new Function(extractFnIn(HTML, 'tsLocal') + '\nreturn tsLocal;')();
const byNew = s => { const d = tsLocal(s.updatedAt); return d ? d.getTime() : 0; };
ck('tsLocal 畸形集：不抛异常，返回 Date 或 null', () => {
    const cases = [undefined, null, '', '   ', '乱码', 'not a date', 0, 123, {}, [], true,
        'x'.repeat(5000), '-99999-01-01 00:00:00', '2026-13-45 99:99:99', '0000-00-00 00:00:00',
        '2026/09/04 23:00', '2026-09-04T15:26:22+00:00', '2026-09-04 15:26:22', '2026-09-04T15:26:22Z',
        '9999-12-31 23:59:59', '1969-12-31 23:59:59'];
    for (const s of cases) {
        const d = tsLocal(s);
        C.ok(d === null || d instanceof Date, 'type: ' + JSON.stringify(String(s).slice(0, 30)));
        if (d) C.ok(!isNaN(d.getTime()), 'NaN date leaked: ' + String(s).slice(0, 30));
    }
});
ck('byNew 全畸形集有限数 → 排序比较器不会 NaN（NaN 比较恒 false，sort 结果为乱序）', () => {
    const items = [{ updatedAt: '乱码' }, { updatedAt: '2026-09-04 15:26:22' }, {}, { updatedAt: null },
        { updatedAt: '2026-09-01 00:00:00' }, { updatedAt: 'x'.repeat(9999) }];
    const vals = items.map(byNew);
    for (const v of vals) C.ok(Number.isFinite(v), 'non-finite: ' + v);
    const sorted = items.slice().sort((a, b) => byNew(b) - byNew(a));
    C.strictEqual(sorted.length, items.length, 'sort 丢失元素');
    C.strictEqual(sorted[0].updatedAt, '2026-09-04 15:26:22', '最新在前');
});
ck('tsLocal 真形态：db 裸串当 UTC、ACP 带 +00:00', () => {
    const db = tsLocal('2026-09-04 15:26:22'); // 无时区 → 按 UTC
    C.ok(db && db.getTime() === Date.UTC(2026, 8, 4, 15, 26, 22), 'db 裸串应按 UTC');
    const acp = tsLocal('2026-09-04 15:26:22+00:00');
    C.ok(acp && acp.getTime() === db.getTime(), 'ACP 后缀与裸串同一时刻');
});

// ---- 2. readExtState 对抗 fixture ----
const TmpD = FSS.mkdtempSync(path.join(os.tmpdir(), 'pf-report-probe-'));
let SB2 = null; // s65 qa P3：SB2 自身 mkdtemp 抛出时 TmpD 也不残留
try { // 探针体顶层抛出 → finally 兜底清临时目录（同族 report-probe-sandbox.js 形态）
    // readExtState 硬编码 ROOT：在源码文本上做 ROOT 替换后求值（require/FSS/path 显式注入）
    function readExtStateOn(yaml, rootLit) {
        const fnSrc = extractFnIn(SRC, 'readExtState').replace(/path\.join\(ROOT, 'conf', 'goose', 'config', 'config\.yaml'\)/, "path.join(" + JSON.stringify(rootLit) + ", 'conf', 'goose', 'config', 'config.yaml')");
        const f = new Function('require', 'const FSS=require("fs"),path=require("path");' + fnSrc + '\nreturn readExtState;');
        const dir = path.join(rootLit, 'conf', 'goose', 'config');
        FSS.mkdirSync(dir, { recursive: true });
        FSS.writeFileSync(path.join(dir, 'config.yaml'), yaml);
        return f(require)();
    }
    SB2 = FSS.mkdtempSync(path.join(os.tmpdir(), 'pf-report-probe-root-')).split('\\').join('/');
    ck('readExtState 结构级：env/cmd 值与嵌套 enabled 假块一概不带出', () => {
        const out = readExtStateOn([
            'GOOSE_PROVIDER: openai',
            'extensions:',
            '  # 顶级注释在块内（goose 未来可能写入）',
            '  faucet-db:',
            '    type: stdio',
            '    enabled: true',
            '  mcp-evil:',
            '    enabled: true',
            "    cmd: 'C:/secret/evil.exe --token=RAW_TOKEN_xyz'",
            '    env:',
            '      SECRET_KEY: sk-fixture000key9',
            '      CUSTOM_TOKEN: TOKEN_xyzzy@1',
            '      enabled: false',
            '    args:',
            '      - --key=ghp_fixture000token9',
            '  mcp-noenabled:',
            '    type: stdio',
            'GOOSE_LEADER: x',
            '  mcp-after-top:',
            '    enabled: true',
            '',
        ].join('\n'), SB2);
        // 只允许 name→boolean 键值
        for (const [k, v] of Object.entries(out)) C.ok(typeof v === 'boolean', '非布尔值混入: ' + k + '=' + JSON.stringify(v));
        const raw = JSON.stringify(out);
        for (const s of ['sk-fixture000key9', 'TOKEN_xyzzy@1', 'ghp_fixture000token9', 'RAW_TOKEN_xyz', 'evil.exe', 'mcp-after-top']) C.ok(!raw.includes(s), '泄漏: ' + s);
        C.strictEqual(out['mcp-evil'], true, 'mcp-evil enabled');
        C.strictEqual(out['mcp-noenabled'], true, '无 enabled 行默认 true');
        C.strictEqual(out['faucet-db'], true, 'faucet-db enabled');
    });
    ck('readExtState 顶格注释不截断扫描（qa P3-2 修复 67b871d：断行正则 /^[^\\s#]/ 与 mcpEnabled 同语法）', () => {
        const out = readExtStateOn([
            'extensions:',
            '  faucet-db:',
            '    enabled: true',
            '# goose 注释（顶级、无缩进）',
            '  mcp-after-comment:',
            '    enabled: false',
            '',
        ].join('\n'), SB2);
        C.strictEqual(out['faucet-db'], true);
        C.strictEqual(out['mcp-after-comment'], false, '注释后的块仍被扫到（enabled:false）');
    });
    ck('readExtState CRLF 与空 extensions 容错', () => {
        const out1 = readExtStateOn('extensions:\r\n  mcp-fetch:\r\n    enabled: false\r\n', SB2);
        C.strictEqual(out1['mcp-fetch'], false, 'CRLF');
        const out2 = readExtStateOn('GOOSE_PROVIDER: openai\n', SB2);
        C.deepStrictEqual(out2, {}, '无 extensions 块 → 空对象');
    });

    // ---- 3. reportScheduleCounts 畸形 ----
    const readJsonSrc = extractFnIn(SRC, 'readJson');
    const reportScheduleCounts = new Function('require', 'const FSS=require("fs"),path=require("path");' + readJsonSrc + '\n' +
        extractFnIn(SRC, 'reportScheduleCounts').replace(/path\.join\(ROOT, 'conf', 'goose', 'data', 'schedule\.json'\)/, "path.join(" + JSON.stringify(SB2) + ", 'conf', 'goose', 'data', 'schedule.json')") +
        '\nreturn reportScheduleCounts;')(require);
    function schedCase(name, content) {
        const d = path.join(SB2, 'conf', 'goose', 'data');
        FSS.mkdirSync(d, { recursive: true });
        if (content === null) { try { FSS.unlinkSync(path.join(d, 'schedule.json')); } catch {} }
        else FSS.writeFileSync(path.join(d, 'schedule.json'), content);
        const r = reportScheduleCounts();
        C.ok(r === null || (typeof r.total === 'number' && typeof r.paused === 'number' && Object.keys(r).length === 2), '形态非法: ' + JSON.stringify(r));
        return r;
    }
    ck('schedule.json 缺失 → null → 报告「未取到」', () => { C.strictEqual(schedCase('missing', null), null); });
    ck('schedule.json 空/乱码/null/对象 → null', () => {
        for (const c of ['', '乱码不是json', 'null', '{"a":1}', '[', '[]]]']) C.strictEqual(schedCase('bad', c), null, c);
    });
    ck('schedule.json 混合元素：paused===true 严格计数，字符串元素不崩', () => {
        const r = schedCase('mixed', JSON.stringify([{ paused: true }, { paused: 'yes' }, { paused: 1 }, 'str', null, {}, { paused: false }]));
        C.strictEqual(r.total, 7, 'total=7');
        C.strictEqual(r.paused, 1, 'paused 只数严格 true');
    });
    ck('schedule.json 巨量条目只出两个数字（10000 条）', () => {
        const arr = Array.from({ length: 10000 }, (_, i) => ({ id: 'x' + i, title: '周三提醒老公吃药' + i, cron: '0 9 * * *', paused: i % 3 === 0 }));
        const r = schedCase('big', JSON.stringify(arr));
        C.strictEqual(r.total, 10000); C.strictEqual(r.paused, 3334);
    });

    // ---- 4. A7 聚合畸形（复刻 buildReport 内聚合逻辑对畸形 stats 的行为）----
    ck('A7 聚合：畸形 stats 不崩、不污染', () => {
        const rows = [['usage-20260901.json', '乱码'], ['usage-20260902.json', '{"errorsByType":{"upstreamByKind":{"unauthorized":"3","rate":null,"timeout":true,"server":[1]}}}'],
            ['usage-20260903.json', '{"errorsByType":"notanobject"}'], ['usage-20260904.json', '{"errorsByType":{"upstreamByKind":"nope"}}'],
            ['usage-20260905.json', '\uFEFF{"errorsByType":{"upstreamByKind":{"unauthorized":2}}}']];
        const errAgg = { upstream: 0, kind: { unauthorized: 0, rate: 0, timeout: 0, server: 0 } };
        for (const [, raw] of rows) {
            let j = null; try { j = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch {}
            const k = ((j && j.errorsByType) || {}).upstreamByKind || {};
            for (const key of Object.keys(errAgg.kind)) errAgg.kind[key] += Number(k[key]) || 0;
        }
        errAgg.upstream = errAgg.kind.unauthorized + errAgg.kind.rate + errAgg.kind.timeout + errAgg.kind.server;
        C.strictEqual(errAgg.kind.unauthorized, 5, '字符串"3"+数字2 → 5');
        C.strictEqual(errAgg.kind.timeout, 1, 'true → Number(true)=1（记录：布尔被计 1，仅手改文件可触发，无害）');
        C.strictEqual(errAgg.kind.server, 1, '[1] → Number([1])=1（记录：数组强制转换怪癖，仅手改文件可触发，无害）');
        C.strictEqual(errAgg.upstream, 7);
    });

} finally {
    FSS.rmSync(TmpD, { recursive: true, force: true });
    if (SB2) FSS.rmSync(SB2, { recursive: true, force: true });
}
console.log('==============================');
console.log('report-probe-static: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
