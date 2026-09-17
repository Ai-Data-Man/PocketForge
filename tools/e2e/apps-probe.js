// s87 探针（裁决 2026-09-14-app-runtime-panel §3-S5/§S5-6）+ s95/S3c 扩（裁决 2026-09-16 §4）：/api/apps 端点
// 活体（dev 桥 :8790）：自建临时 apps/*.yaml fixtures → 枚举/精确键 join/URL 三层/坏 meta 降级/absent+run+stop 活体映射/
// listenPorts/回链/排序 sanity → POST 写通道负向量（无 body/未知 id/非法 op/数组 id/数字 op/deny-list 基础设施键）+
// 启停活体（fixture 热注册 pc project update 全套 -f+env #29 教训 → stop/start/restart → /api/apps/logs）→ 用后自清还原。
// 桩测（模板提取）：appParseYaml/procState/排序比较器单飞执行（assets-probe B5 同款手法）+ 前端锚点 + 红线负断言。
// s87 fixtures 不热注册 pc——run/stop 活体映射借道 fixture 进程键=pc 既有进程名（chat-bridge/daily-backup）；
// s95 活体 fixture 热注册但聚合面只含基线+自身（s87e-live 键=基础设施名，只留注册表扫描面绝不进 pc——覆盖攻击面自证）。
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const FORGE = path.join(ROOT, 'forge');
let pass = 0, fail = 0;
const ck = (n, ok, extra) => { console.log((ok ? 'PASS' : 'FAIL') + ': ' + n + (extra !== undefined && extra !== '' ? '  | ' + String(extra).slice(0, 200) : '')); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(p) {
    return new Promise((res, rej) => {
        const r = http.get({ host: '127.0.0.1', port: 8790, path: p, timeout: 20000 }, x => { let b = ''; x.on('data', c => c && (b += c)); x.on('end', () => res({ status: x.statusCode, body: b })); });
        r.on('error', rej); r.on('timeout', () => { r.destroy(); rej(new Error('timeout')); });
    });
}
function post(body) { // body=undefined → 无 body POST；对象 → JSON 序列化
    return new Promise((res, rej) => {
        const r = http.request({ host: '127.0.0.1', port: 8790, path: '/api/apps', method: 'POST', headers: body !== undefined ? { 'content-type': 'application/json' } : {} }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} res({ code: x.statusCode, j, body: b }); }); });
        r.on('error', rej); r.end(body !== undefined ? JSON.stringify(body) : undefined);
    });
}

// ---- fixtures（探针自有，用后删；目录里若有非探针文件一律不动）----
const APPS_DIR = path.join(FORGE, 'apps');
const pcPort = String(fs.readFileSync(path.join(FORGE, 'data', 'pc.port'), 'utf8')).trim();
// ws→sid 取现网真实对（srcSid 反解 oracle）
const wsMap = JSON.parse(fs.readFileSync(path.join(FORGE, 'data', 'workspace-map.json'), 'utf8'));
const wsPair = Object.entries(wsMap).find(([, v]) => v && typeof v === 'object' && typeof v.sid === 'string' && v.sid) || null;
const EXP_SID = wsPair ? wsPair[1].sid : null;
const SRC_WS = wsPair ? wsPair[0] : 'ws-none';
const FIX = {
    's87a-full.yaml': '# forge-meta: {"description":"探针·完整建账应用","url":"http://127.0.0.1:18901","created_at":"2026-01-15","source":"' + SRC_WS + '"}\n' +
        'processes:\n  s87a-web:\n    command: "cmd /c exit 0"\n    readiness_probe:\n      http_get: { host: 127.0.0.1, port: 18902, scheme: http, path: / }\n  s87a-worker:\n    command: "cmd /c exit 0"\n',
    's87b-probe.yaml': 'processes:\n  s87b-only:\n    command: "cmd /c exit 0"\n    readiness_probe:\n      http_get: { host: 127.0.0.1, port: 18199, scheme: http, path: / }\n',
    's87c-badmeta.yaml': '# forge-meta: {"description":坏JSON探针\n' +
        'processes:\n  s87c-x:\n    command: "cmd /c exit 0"\n    readiness_probe:\n      http_get: { host: 127.0.0.1, port: 18300, scheme: http, path: /ui }\n',
    's87d-bg.yaml': 'processes:\n  s87d-daemon:\n    command: "cmd /c exit 0"\n    readiness_probe:\n      exec: { command: "cmd /c exit 0" }\n',
    // 进程键不以文件名开头（hello-oneshot 反例族）+ 活体 run/stop 映射：键=pc 既有进程名，零注册
    's87e-live.yaml': 'processes:\n  chat-bridge:\n    command: "探针占位"\n  daily-backup:\n    command: "探针占位"\n',
    // s95/S3c 启停活体 fixture（热注册 pc；命令=脚本文件零引号面——嵌套引号会被 pc 分词器绞坏成幽灵态，tmp/f12 实证）
    's95-live.yaml': '# forge-meta: {"description":"s95 启停活体 fixture","created_at":"2026-09-16","source":"e2e"}\n' +
        'processes:\n  s95-live-svc:\n' +
        "    command: '" + path.join(FORGE, 'bin', 'node-v22', 'node-v22.21.1-win-x64', 'node.exe').replace(/\\/g, '/') + ' ' + path.join(__dirname, 's95-live-svc.js').replace(/\\/g, '/') + "'\n" +
        '    is_daemon: true\n    availability:\n      restart: on_failure\n      max_restarts: 3\n      backoff_seconds: 5\n',
    // s95/S3a deny-list 负例：进程键=基础设施名 pg——只留注册表扫描面，绝不进 pc 聚合（同键覆盖 infra 是真实攻击面，tmp/f12 自证）
    's95-infra.yaml': '# forge-meta: {"description":"s95 deny-list 负例","created_at":"2026-09-16","source":"e2e"}\nprocesses:\n  pg:\n    command: "探针占位"\n',
};
const before = (() => { try { return fs.readdirSync(APPS_DIR).filter(f => !f.startsWith('s87')); } catch { return null; } })();
const beforeYaml = before ? before.filter(f => /\.yaml$/i.test(f)).length : 0;

function cleanup() {
    for (const f of Object.keys(FIX)) { try { fs.unlinkSync(path.join(APPS_DIR, f)); } catch {} }
}

(async () => {
    try { for (const [f, body] of Object.entries(FIX)) fs.writeFileSync(path.join(APPS_DIR, f), body, 'utf8'); }
    catch (e) { console.error('FATAL fixture write:', e.message); cleanup(); process.exit(2); }

    // ===== 活体端点 =====
    let j = null;
    try { j = JSON.parse((await get('/api/apps')).body); } catch (e) { ck('A1 /api/apps 可达且 ok:true', false, e.message); }
    const apps = (j && j.apps) || [];
    const by = Object.fromEntries(apps.map(a => [a.id, a]));
    if (j) ck('A1 200 ok:true apps 数组 + 空目录基线外零杂项', j.ok === true && Array.isArray(j.apps) && apps.every(a => FIX.hasOwnProperty(a.id + '.yaml') || (before || []).includes(a.id + '.yaml')), 'n=' + apps.length + ' baselineYaml=' + beforeYaml);
    ck('A2 枚举=apps/*.yaml 全集（5 fixtures 在列）', ['s87a-full', 's87b-probe', 's87c-badmeta', 's87d-bg', 's87e-live'].every(id => !!by[id]), Object.keys(by).join(','));
    ck('A3 进程键=精确键名解析（s87e 键不以文件名开头也照实列出）', by['s87e-live'] && ['chat-bridge', 'daily-backup'].every(n => by['s87e-live'].procs.some(p => p.name === n)) && by['s87e-live'].procs.length === 2);
    ck('A4 URL 第 1 层 meta.url 压过 http_get 探针（18901≠18902）', by['s87a-full'] && by['s87a-full'].url === 'http://127.0.0.1:18901', by['s87a-full'] && by['s87a-full'].url);
    ck('A5 URL 第 2 层 http_get 合成（无 meta）', by['s87b-probe'] && by['s87b-probe'].url === 'http://127.0.0.1:18199/', by['s87b-probe'] && by['s87b-probe'].url);
    ck('A6 坏 JSON meta=当无 meta 不炸端点（human null，结构层照活）', by['s87c-badmeta'] && by['s87c-badmeta'].human === null && by['s87c-badmeta'].url === 'http://127.0.0.1:18300/ui', by['s87c-badmeta'] && by['s87c-badmeta'].url);
    ck('A7 URL 第 3 层=null：exec 探针/command 不猜端口（红线：无死链）', by['s87d-bg'] && by['s87d-bg'].url === null, by['s87d-bg'] && by['s87d-bg'].url);
    // 活体状态映射 oracle：探针直读 pc list 同源字段推期望，桥输出必须一致
    let pcList = null;
    try { pcList = JSON.parse(require('child_process').execFileSync(path.join(FORGE, 'bin', 'pc', 'process-compose.exe'),
        ['-p', pcPort, 'process', 'list', '-o', 'json'], { timeout: 15000, windowsHide: true, env: { ...process.env, NO_PROXY: '127.0.0.1,localhost' } }).toString()); } catch (e) { ck('A8 pc list oracle 可读', false, e.message); }
    if (pcList) {
        const pcBy = Object.fromEntries(pcList.map(x => [x.name, x]));
        const expect = e => e && e.is_running === true ? 'run' : (e && e.is_running === false ? (e.exit_code === 0 ? 'stop' : 'fail') : 'absent');
        const cb = by['s87e-live'] && by['s87e-live'].procs.find(p => p.name === 'chat-bridge');
        const dbk = by['s87e-live'] && by['s87e-live'].procs.find(p => p.name === 'daily-backup');
        ck('A8 活体 run 映射（chat-bridge is_running=true）', cb && cb.state === expect(pcBy['chat-bridge']) && cb.state === 'run', 'state=' + (cb && cb.state));
        ck('A9 活体 stop/fail 映射按 exit_code（daily-backup）', dbk && dbk.state === expect(pcBy['daily-backup']), 'state=' + (dbk && dbk.state) + ' exit=' + (pcBy['daily-backup'] && pcBy['daily-backup'].exit_code));
        ck('A10 absent 映射（yaml 有 pc 无→下次启动自动带起）', by['s87b-probe'] && by['s87b-probe'].procs.every(p => p.state === 'absent') && by['s87b-probe'].state === 'stop');
        ck('A11 app 级聚合（任一 fail→fail / 全 run→run / 否则 stop）', by['s87e-live'] && by['s87e-live'].state === 'stop', 's87e.state=' + (by['s87e-live'] && by['s87e-live'].state));
    }
    ck('A12 listenPorts=实听端口并集（在跑进程才有；absent=空数组）', by['s87e-live'] && by['s87e-live'].listenPorts.includes(8790) && by['s87b-probe'] && Array.isArray(by['s87b-probe'].listenPorts) && by['s87b-probe'].listenPorts.length === 0, JSON.stringify(by['s87e-live'] && by['s87e-live'].listenPorts));
    ck('A13 srcSid=meta.source→workspace-map 反解', !wsPair || (by['s87a-full'] && by['s87a-full'].srcSid === EXP_SID), 'ws=' + (wsPair && wsPair[0]) + ' expect=' + EXP_SID + ' got=' + (by['s87a-full'] && by['s87a-full'].srcSid));
    ck('A14 srcTitle 形状（sid 有会话名则字符串，否则 null——不编造）', !wsPair || (by['s87a-full'] && (by['s87a-full'].srcTitle === null || typeof by['s87a-full'].srcTitle === 'string')));
    ck('A15 createdAt=meta.created_at 优先 / 无 meta 落 mtime ISO', by['s87a-full'] && by['s87a-full'].createdAt === '2026-01-15' && /^\d{4}-\d{2}-\d{2}T/.test(by['s87d-bg'].createdAt || ''), by['s87a-full'] && by['s87a-full'].createdAt + ' | ' + (by['s87d-bg'] && by['s87d-bg'].createdAt));
    // s95 F-1：createdAtTs=桥侧 parseAssetTs 结果——纯日期串→本地零点（不再恒 08:00）；完整 ISO 形态走 Date.parse 不误伤；无账=null
    ck('A15b createdAtTs 活体（纯日期串=本地零点 / mtime ISO=Date.parse 原值 / 无账 null）',
        by['s87a-full'] && by['s87a-full'].createdAtTs === new Date(2026, 0, 15).getTime() && new Date(by['s87a-full'].createdAtTs).getHours() === 0
        && by['s87d-bg'] && by['s87d-bg'].createdAtTs === Date.parse(by['s87d-bg'].createdAt) && by['s87b-probe'].createdAtTs !== null,
        'a=' + (by['s87a-full'] && by['s87a-full'].createdAtTs) + ' bg=' + (by['s87d-bg'] && by['s87d-bg'].createdAtTs));
    const sortedOk = (() => { // 同 state 内 createdAt 非空者降序、null 沉底（排序全量规则走 B12 桩测）
        for (let i = 1; i < apps.length; i++) {
            if (apps[i - 1].state !== apps[i].state) continue;
            const x = apps[i - 1].createdAt, y = apps[i].createdAt;
            if (x == null && y != null) return false;
            if (x != null && y != null && x < y) return false;
        } return true; })();
    ck('A16 活体排序 sanity（同 state 内时间倒序 null 沉底）', sortedOk);
    // ===== s95/S3c：POST 写通道负向量（裁决 §4.2-S3a 降级路径 + §S3c 断言组） =====
    let p0 = null; try { p0 = await post(); } catch (e) { ck('A17 无 body POST 不炸连接', false, e.message); }
    if (p0) ck('A17 无 body POST → 参数不合法（既有坏包路径，不 405）', p0.j && p0.j.ok === false && p0.j.err === '参数不合法', p0.code + ' ' + p0.body);
    const p1 = await post({ id: 'no-such-app-zzz', op: 'stop' });
    ck('A18 未知 id → ok:false 参数不合法（白名单）', p1.j && p1.j.ok === false && p1.j.err === '参数不合法', p1.body);
    const p2 = await post({ id: 's87a-full', op: 'fly' });
    ck('A19 合法 id+非法 op → ok:false 参数不合法（校验先于执行）', p2.j && p2.j.ok === false && p2.j.err === '参数不合法', p2.body);
    const p3 = await post({ id: ['s87a-full'], op: 'stop' });
    ck('A20 数组 id → ok:false（String([v]) 家族拒）', p3.j && p3.j.ok === false, p3.body);
    const p4 = await post({ id: 's87a-full', op: 1 });
    ck('A21 数字 op → ok:false', p4.j && p4.j.ok === false, p4.body);
    const p5 = await post({ id: 's95-infra', op: 'stop' });
    ck('A22 基础设施键 fixture（proc=pg）→ ok:false 参数不合法（deny-list 纵深，注册表有 pc 无）', p5.j && p5.j.ok === false && p5.j.err === '参数不合法', p5.body);
    const lg0 = await get('/api/apps/logs?id=s95-infra');
    ck('A23 日志端点同门：deny-list id → ok:false 参数不合法', lg0.status === 200 && JSON.parse(lg0.body).ok === false && JSON.parse(lg0.body).err === '参数不合法', lg0.body);
    const lg1 = await get('/api/apps/logs?id=no-such-app-zzz');
    ck('A24 日志端点未知 id → ok:false 参数不合法', JSON.parse(lg1.body).ok === false, lg1.body);
    let lg2 = 0; try { lg2 = (await new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port: 8790, path: '/api/apps/logs', method: 'POST' }, x => res(x.statusCode)); r.on('error', rej); r.end(); })); } catch {}
    ck('A25 POST /api/apps/logs → 405（只读端点）', lg2 === 405, 'status=' + lg2);

    // ===== 桥模板提取桩测 =====
    const bridge = fs.readFileSync(path.join(FORGE, 'conf', 'templates', 'chat-bridge.tpl.js'), 'utf8');
    const appsRoute = (() => { const i = bridge.indexOf("url === '/api/apps'"); const j = bridge.indexOf('    else if', i); return i >= 0 ? bridge.slice(i, j > 0 ? j : i + 4000) : ''; })();
    ck('B1 桥模板路由 /api/apps（GET=appsOverview 只读 + POST 写通道 readJsonBody + 其余 405）', /url === '\/api\/apps'/.test(bridge) && /appsOverview\(\)/.test(bridge) && /req\.method === 'GET'/.test(appsRoute) && /readJsonBody/.test(appsRoute) && /else \{ res\.writeHead\(405\); res\.end\(\); \}/.test(appsRoute), 'route seg=' + appsRoute.length + 'B');
    ck('B2 listenPorts 护栏（budget=8 + portsTruncated 标记）', /let budget = 8;/.test(bridge) && /portsTruncated = true;/.test(bridge));
    ck('B3 pc 调用走先例通道（-p pc.port + process list -o json）', /\['-p', pcPort\]\.concat\(args\)/.test(bridge) && /\['process', 'list', '-o', 'json'\]/.test(bridge) && /data', 'pc\.port'/.test(bridge));
    const fnSrc = bridge.match(/function appParseYaml\(text\) \{[\s\S]*?\n\}/);
    if (!fnSrc) { ck('B4 appParseYaml 可提取（模板结构漂移，先改探针）', false, 'NOT FOUND'); }
    else {
        const appParseYaml = new Function('return (' + fnSrc[0] + ')')();
        const t1 = appParseYaml('processes:\n  p-web:\n    command: "x --port 9999"\n    readiness_probe:\n      exec: { command: "cmd /c exit 0" }\n');
        ck('B5 红线：command 端口不进 URL（exec 探针→probeUrl null）', t1.procs.length === 1 && t1.procs[0] === 'p-web' && t1.probeUrl === null, JSON.stringify(t1));
        const t2 = appParseYaml('processes:\n  p2:\n    readiness_probe:\n      http_get: { host: 127.0.0.1, port: 0, scheme: http, path: / }\n');
        ck('B6 模板占位 port:0 不合成 URL', t2.probeUrl === null, t2.probeUrl);
        const t3 = appParseYaml('# forge-meta: {"x":1}\nprocesses:\n  p3:\n    readiness_probe:\n      http_get:\n        host: 0.0.0.0\n        port: 8443\n        scheme: https\n        path: /a/b\n');
        ck('B7 块式 http_get 四键合成（https://0.0.0.0:8443/a/b）', t3.probeUrl === 'https://0.0.0.0:8443/a/b', t3.probeUrl);
        const t4 = appParseYaml('top: 1\nprocesses:\n  a1:\n    command: "x"\n  a2:\n    command: "y"\nother:\n  z: 1\n');
        ck('B8 processes 段边界（前顶层键跳过/后顶层键截断，键全集精确）', JSON.stringify(t4.procs) === JSON.stringify(['a1', 'a2']), JSON.stringify(t4.procs));
    }
    const psSrc = bridge.match(/function procState\(e\) \{[\s\S]*?\n\}/);
    if (!psSrc) { ck('B9 procState 可提取', false, 'NOT FOUND'); }
    else {
        const procState = new Function('return (' + psSrc[0] + ')')();
        ck('B10 procState 桩测（run/stop/fail/absent 布尔数值驱动，不依赖 status 字符串）',
            procState({ is_running: true }) === 'run' && procState({ is_running: false, exit_code: 0 }) === 'stop' &&
            procState({ is_running: false, exit_code: 7 }) === 'fail' && procState({}) === 'absent' && procState(undefined) === 'absent');
    }
    const ptsSrc = bridge.match(/function parseAssetTs\(v\) \{[\s\S]*?\n\}/);
    if (!ptsSrc) { ck('B18 parseAssetTs 可提取', false, 'NOT FOUND'); }
    else {
        const parseAssetTs = new Function('return (' + ptsSrc[0] + ')')();
        const d = new Date(parseAssetTs('2026-09-17'));
        // s95 F-1：纯日期串→本地零点（东八区不再恒 08:00）；完整 ISO 维持 Date.parse；非法/越界/非串=null 不编造
        ck('B18 parseAssetTs 桩测（F-1：纯日期串=本地零点，非 UTC 零点）',
            parseAssetTs('2026-09-17') === new Date(2026, 8, 17).getTime() && d.getHours() === 0 && d.getDate() === 17);
        ck('B19 parseAssetTs 形态分流（mtime 完整 ISO 不被日期串规则误伤）+ 越界/非串拒',
            parseAssetTs('2026-09-16T18:23:45.123Z') === Date.parse('2026-09-16T18:23:45.123Z') && parseAssetTs('2026-13-45') === null && parseAssetTs('') === null && parseAssetTs(null) === null && parseAssetTs(1758000000000) === null);
    }
    ck('B18b 桥端 createdAtTs 接入（F-1：parseAssetTs 消费 meta.created_at/mtime，前端无第二套解析）', /createdAtTs: parseAssetTs\(createdAt\)/.test(bridge) && /const createdAt = \(typeof meta\.created_at === 'string' && meta\.created_at\.trim\(\)\) \|\| r\.mtime \|\| null;/.test(bridge));
    const cmpSrc = bridge.match(/apps\.sort\((\(a, b\) => \{[\s\S]*?\n\s*\})\);/);
    if (!cmpSrc) { ck('B11 排序比较器可提取', false, 'NOT FOUND'); }
    else {
        const cmp = new Function('return (' + cmpSrc[1] + ')')();
        const arr = [{ id: 'stop-old', state: 'stop', createdAt: '2026-01-01' }, { id: 'run-b', state: 'run', createdAt: '2026-01-02' }, { id: 'fail', state: 'fail', createdAt: '2026-09-01' }, { id: 'run-a', state: 'run', createdAt: '2026-03-01' }, { id: 'stop-null', state: 'stop', createdAt: null }, { id: 'stop-new', state: 'stop', createdAt: '2026-09-14' }];
        arr.sort(cmp);
        ck('B12 排序桩测（run 在前→createdAt 倒序→null 沉底；fail/stop 序固定）', JSON.stringify(arr.map(x => x.id)) === JSON.stringify(['run-a', 'run-b', 'stop-new', 'stop-old', 'stop-null', 'fail']), JSON.stringify(arr.map(x => x.id)));
    }
    const appsFn = bridge.match(/async function appsOverview[\s\S]*?\n\}/);
    ck('B13 pc 失败降级（端点 200+note，进程态全 absent，不炸）', !!appsFn && /note = '状态未知/.test(appsFn[0]) && /catch \(e\) \{ note =/.test(appsFn[0]));
    ck('B14 红线：appsOverview 保持零写面（写通道在 POST 分支，读函数无 write/unlink/rename/project 调用）', !!appsFn && !/writeFileSync|unlinkSync|renameSync|project (update|start|stop|restart)/.test(appsFn[0]));
    // ===== s95/S3a+S3b+D1 桥端/前端锚（裁决 2026-09-16 §4/§5） =====
    ck('B15 写通道三道闸：注册表推导进程名（绝不信请求体）+APP_INFRA_PROCS deny-list 与主 yaml 同源（s96/P3-2+P3-3 启动现读 appParseYaml+空解析回落 9 键基线 F12④）+白名单门', /appReadRegistry\(\)\.find\(r => r\.id === b\.id\)/.test(bridge) && /APP_INFRA_PROCS\.includes\(n\)/.test(bridge) && (() => { const iife = bridge.match(/const APP_INFRA_PROCS = \(\(\) => \{[\s\S]*?\n\}\)\(\);/); return !!iife && /appParseYaml\(FSS\.readFileSync\(path\.join\(ROOT, 'conf', 'process-compose\.yaml'\), 'utf8'\)\)\.procs/.test(iife[0]) && /keys && keys\.length/.test(iife[0]) && /const FALLBACK = \['chat-bridge', 'nats', 'faucet', 'goose-scheduler', 'faucet-rawsql', 'faucet-provision', 'daily-backup', 'pg-init', 'pg'\]/.test(iife[0]); })());
    ck('B16 执行形态：stop 多参一次（F7）+start/restart 逐名串联+pcProcMap 前置探活（管家联系不上独立口径）+失败人话不透传 stderr', /\['process', 'stop'\]\.concat\(reg\.procs\)/.test(bridge) && /for \(const n of reg\.procs\) await new Promise\(\(resolve, reject\) => pcExec\(\['process', op, n\]/.test(bridge) && /进程管家暂时联系不上，稍后再试。' \}\); return;/.test(bridge) && /没' \+ OP_ZH\[op\] \+ '成——跟小 forge 说一声/.test(bridge));
    ck('B17 日志端点：--tail 101 截断判定 + pcProcMap 先行（F12⑤ absent 名挂起防御）+多进程首个非空', /'process', 'logs', n, '--tail', '101'/.test(bridge) && /appsAppLogs[\s\S]{0,400}pcProcMap\(\)/.test(bridge) && /lines\.length\) return \{ ok: true, proc: n, lines, truncated \};/.test(bridge));

    // ===== 前端模板提取 =====
    const html = fs.readFileSync(path.join(FORGE, 'conf', 'templates', 'chat.tpl.html'), 'utf8');
    ck('C1 mtabs 注册 apps（七标签懒加载同款，重开重拉走既有 for-in 重置）', /apps:\['loadAppsUI',false\]/.test(html) && /apps:\['loadAppsUI',false\]/.test(html.match(/const mtabs=\{[^\n]+\}/)[0]));
    ck('C2 tab 钮位置=✨做过的东西 之后 + mpane-apps 在位', /data-pane="made"[^>]*>✨ 做过的东西<\/button>\s*<button class="rtab mtab" data-pane="apps"[^>]*>🚀 小应用</.test(html) && /id="mpane-apps"/.test(html));
    const appsBlock = (html.match(/\/\/ ===== 🚀 小应用[\s\S]*?\$\('apps-refresh'\)\.onclick[^\n]*/) || [''])[0];
    ck('C3 apps UI 代码块在位（提取面）', appsBlock.length > 500);
    if (appsBlock) {
        ck('C4 状态徽章三态人话 + absent 人话（下次启动时自动带起）+ pc 失联「状态未知」降级', /✅ 运行中/.test(appsBlock) && /⏹ 已停/.test(appsBlock) && /⚠️ 出错了/.test(appsBlock) && /下次启动时自动带起/.test(appsBlock) && /状态未知/.test(appsBlock));
        ck('C5 url=null 人话句（无按钮无死链）+ 有 url 才 window.open', /这个应用没有网页，它在后台做事/.test(appsBlock) && /window\.open\(/.test(appsBlock) && /apps-open/.test(appsBlock));
        ck('C6 出错态行动指引=对话通道（无按钮）', /跟小 forge 说一声，让它看看怎么回事/.test(appsBlock) && !/重试|重启它|修复/.test(appsBlock));
        ck('C7 回链复用 openSession（勿绕侧栏既有入口）', /openSession\(srcEl\.dataset\.sid\)/.test(appsBlock));
        ck('C8 空态文案照裁决（帮我做个 ××）', /小 forge 还没给你搭过应用——跟它说「帮我做个 ××」试试。/.test(appsBlock));
        ck('C9 无轮询无推送（块内零 setInterval/setTimeout 轮询）+ 手动「刷新看看」', !/setInterval|setTimeout/.test(appsBlock));
        ck('C10 主名降级=〈id〉·小 forge 搭的应用（结构性兜底不编造）+时间无=「—」', /小 forge 搭的应用/.test(appsBlock) && /'—'/.test(appsBlock));
        const btns = appsBlock.match(/<button[^>]*>[^<]*<\/button>/g) || [];
        ck('C11 动作面（s95/S3b 修订）：打开看看（url 有才给）+启停钮状态驱动（⏹停止/▶启动/⟳重启）——删除/编辑/改名仍无（s87 维持）', !/>(卸载|删除|编辑|改名)</.test(btns.join(' ; ')) && btns.some(b => />打开看看</.test(b)) && /data-op="stop"[^>]*>⏹ 停止</.test(appsBlock) && /data-op="start"[^>]*>▶ 启动</.test(appsBlock) && /data-op="restart"[^>]*>⟳ 重启</.test(appsBlock), btns.join(' ; '));
        ck('C12 yaml 路径收折叠技术区（details/summary，不进卡片主面）', /<details class="tz"[^>]*><summary>详情<\/summary>/.test(appsBlock) && /应用文件：/.test(appsBlock));
        ck('C15 absent 无 ▶ 钮（F12③ 收窄：全 absent 卡无操作面）+状态未知（appsNote）无操作面', /const anyPresent=a\.procs\.some\(p=>p\.state!=='absent'\);/.test(appsBlock) && /if\(!appsNote&&anyPresent\)\{/.test(appsBlock));
        ck('C16 停止注裁决原文（UI 发起会话内标记 appsUserStopped；再启即清）', /已停。下次启动数字员工时它会自己回来；想让它彻底别再回来，跟小 forge 说一声拆掉。/.test(appsBlock) && /const appsUserStopped=\{\};/.test(html) && /else delete appsUserStopped\[id\];/.test(html));
        ck('C17 按钮人话 aria/title（先停一停…/启动这个应用）+无确认框', /title="先停一停（下次启动数字员工时会自己回来）"/.test(appsBlock) && /title="启动这个应用"/.test(appsBlock) && !/confirm\(/.test(appsBlock));
        ck('C18 日志子区：📋 最近日志 按需拉取（ontoggle+一次标记）+pre.textContent 转义+零轮询', /📋 最近日志/.test(appsBlock) && /\/api\/apps\/logs\?id='\+encodeURIComponent\(a\.id\)/.test(appsBlock) && /ld\.dataset\.loaded/.test(appsBlock) && /pre\.textContent=\(d\.lines\|\|\[\]\)\.join\('\\n'\)/.test(appsBlock));
        // s95 F-2：手动停命中的卡按「已停」呈现——徽章/进程行/动作面全部走 state（而非 a.state），出错提示行加 !uiStopped 门（真 fail 判别力）
        ck('C19 F-2 停止态呈现：appsUserStopped 命中+fail → 已停徽章+停止注+▶启动（无出错行/无⟳重启）；真 fail 仍走进错面',
            /const uiStopped=a\.state==='fail'&&!!appsUserStopped\[a\.id\];/.test(appsBlock) && /const state=uiStopped\?'stop':a\.state;/.test(appsBlock)
            && /APP_STATE_ZH\[state\]/.test(appsBlock) && /appsProcZh\(pz\[0\]\)/.test(appsBlock)
            && /failTip=\(!appsNote&&a\.state==='fail'&&!uiStopped\)/.test(appsBlock) && /stopNote=\(state==='stop'&&appsUserStopped\[a\.id\]\)/.test(appsBlock)
            && /if\(state==='run'\)/.test(appsBlock) && /else if\(state==='stop'\|\|state==='fail'\)/.test(appsBlock) && /if\(state==='fail'\) opsWord\+=/.test(appsBlock)
            && /刷新后回到/.test(appsBlock));
        ck('C20 F-1 注册时间走桥端 createdAtTs（纯日期串→本地零点，前端不再裸 new Date(a.createdAt)）', /const time=\(a\.createdAtTs\|\|a\.createdAt\)\?new Date\(a\.createdAtTs\|\|a\.createdAt\)/.test(appsBlock));
    }
    const paneApps = (html.match(/<div class="mpane" id="mpane-apps"[\s\S]*?<div class="mpane" id="mpane-mem"/) || [''])[0];
    ck('C13 pane（s95/S2c 修订）：搜索框 apps-q 在场；pane HTML 恒一按钮=刷新看看（启停钮 JS 动态建，无静态操作钮）', !!paneApps && (paneApps.match(/<button[^>]*>/g) || []).length === 1 && /apps-refresh/.test(paneApps) && /id="apps-q"/.test(paneApps));
    ck('C14 tab 副题=哪个在跑/怎么打开 + 与做过的东西的心智区分句', /哪个在跑、怎么打开/.test(paneApps) && /过去的事/.test(paneApps));

    // ===== s95/S3c 启停活体（fixture 热注册 pc → stop/start/restart → 日志端点 → 反注册还原） =====
    const APPS_ENV = path.join(FORGE, 'conf', 'apps.env.yaml');
    const PC_EXE = path.join(FORGE, 'bin', 'pc', 'process-compose.exe');
    const appsEnvHash0 = crypto.createHash('sha256').update(fs.readFileSync(APPS_ENV)).digest('hex');
    const baselineYamls = (before || []).filter(f => /\.yaml$/i.test(f));
    function aggregate(includeOnly) { // dev-stack-up 同款聚合（剥 processes: 行 + CRLF 连接）；includeOnly=只进 pc 的文件集
        const yamls = fs.readdirSync(APPS_DIR).filter(f => /\.yaml$/i.test(f) && includeOnly.includes(f)).sort();
        const c = yamls.map(f => fs.readFileSync(path.join(APPS_DIR, f), 'utf8').replace(/^processes:\s*$/m, ''));
        fs.writeFileSync(APPS_ENV, 'processes:' + '\r\n' + c.join('\r\n'), 'utf8');
    }
    function pcEnv() { // #29 教训：project update 客户端 env 展开 ${VAR}——不带全套 env 会把运行栈命令行展开成空
        const env = { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' };
        env.FORGE_ROOT = FORGE; env.PC_PORT = pcPort;
        try { env.FAUCET_PORT = fs.readFileSync(path.join(FORGE, 'data', 'faucet.port'), 'utf8').trim(); } catch {}
        try { env.PG_PORT = fs.readFileSync(path.join(FORGE, 'data', 'pg.port'), 'utf8').trim(); } catch {}
        env.GOOSE_PATH_ROOT = path.join(FORGE, 'conf', 'goose'); env.GOOSE_DISABLE_KEYRING = '1'; env.GOOSE_TELEMETRY_ENABLED = 'false';
        try { for (const l of fs.readFileSync(path.join(FORGE, 'data', 'secrets.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/); if (m && (/^FORGE_/.test(m[1]) || m[1] === 'GOOSE_MODEL_NAME') && m[2]) env[m[1]] = m[2]; } } catch {}
        return env;
    }
    function projectUpdate() {
        return new Promise(resolve => {
            require('child_process').execFile(PC_EXE, ['-p', pcPort, 'project', 'update',
                '-f', path.join(FORGE, 'conf', 'process-compose.yaml'), '-f', path.join(FORGE, 'conf', 'ports.env.yaml'), '-f', APPS_ENV],
                { timeout: 25000, windowsHide: true, env: pcEnv() }, e => resolve(!e));
        });
    }
    async function procState95() {
        try {
            const out = require('child_process').execFileSync(PC_EXE, ['-p', pcPort, 'process', 'list', '-o', 'json'], { timeout: 15000, windowsHide: true, env: pcEnv() }).toString();
            const arr = JSON.parse(out.slice(out.indexOf('[')));
            const e = arr.find(x => x.name === 's95-live-svc');
            return e ? { run: e.is_running, restarts: e.restarts } : null;
        } catch { return null; }
    }
    try {
        aggregate(baselineYamls.concat(['s95-live.yaml'])); // 只进基线+活体：s87e-live（键=chat-bridge/daily-backup）与 s95-infra（键=pg）只留注册表扫描面——infra 键经聚合覆盖是真实攻击面（tmp/f12 自证）
        ck('E1 热注册 pc project update（全套 -f+env，#29 教训）', await projectUpdate());
        let st = null;
        for (let i = 0; i < 12 && !(st && st.run); i++) { await sleep(1000); st = await procState95(); }
        ck('E2 fixture 进程起跑（is_running=true）', !!(st && st.run), JSON.stringify(st));
        if (st && st.run) {
            const s1 = await post({ id: 's95-live', op: 'stop' });
            ck('E3 stop → ok:true', s1.j && s1.j.ok === true, s1.body);
            await sleep(1200);
            const st2 = await procState95();
            ck('E4 stop 后 is_running=false（F12①：不被 on_failure 拉起）', st2 && st2.run === false, JSON.stringify(st2));
            const s2 = await post({ id: 's95-live', op: 'start' });
            ck('E5 start → ok:true', s2.j && s2.j.ok === true, s2.body);
            await sleep(1200);
            const st3 = await procState95();
            ck('E6 start 后 is_running=true（start-on-stopped 活体）', st3 && st3.run === true, JSON.stringify(st3));
            const s3 = await post({ id: 's95-live', op: 'restart' });
            ck('E7 restart → ok:true', s3.j && s3.j.ok === true, s3.body);
            await sleep(1200);
            const st4 = await procState95();
            ck('E8 restart 后 is_running=true', st4 && st4.run === true, JSON.stringify(st4));
            const lg = await get('/api/apps/logs?id=s95-live');
            let lgj = null; try { lgj = JSON.parse(lg.body); } catch {}
            ck('E9 日志端点活体：ok:true+proc 名+尾部行含 fixture 输出', lgj && lgj.ok === true && lgj.proc === 's95-live-svc' && Array.isArray(lgj.lines) && lgj.lines.some(l => l.includes('s95-live-svc log line 1')), (lg.body || '').slice(0, 160));
        }
    } finally {
        try { aggregate(baselineYamls); await projectUpdate(); } catch {} // 反注册还原（摘除 s95-live-svc）
    }

    // ===== 自清与终态（s82 纪律）=====
    cleanup();
    let j2 = null;
    try { j2 = JSON.parse((await get('/api/apps')).body); } catch {}
    ck('D1 用后自清：fixtures 删除 + /api/apps 回到基线（apps 数=目录基线 yaml 数）', j2 && j2.ok === true && Array.isArray(j2.apps) && j2.apps.length === beforeYaml, 'n=' + (j2 && j2.apps ? j2.apps.length : '?') + ' baseline=' + beforeYaml);
    const after = (() => { try { return fs.readdirSync(APPS_DIR).filter(f => !/^s(87|95)/.test(f)); } catch { return null; } })();
    ck('D2 目录基线零扰动（非探针文件原样保留）', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
    ck('D3 还原：apps.env.yaml 字节回基线 + pc 表无 s95-live-svc', crypto.createHash('sha256').update(fs.readFileSync(APPS_ENV)).digest('hex') === appsEnvHash0 && (await procState95()) === null);

    console.log('apps-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { cleanup(); console.error('FATAL', e); process.exit(2); });
