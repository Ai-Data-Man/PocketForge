// s87 探针（裁决 2026-09-14-app-runtime-panel §3-S5/§S5-6）：GET /api/apps 注册清单 × pc 状态合并端点
// 活体（dev 桥 :8790）：自建临时 apps/*.yaml fixtures → 枚举/精确键 join/URL 三层/坏 meta 降级/absent+run+stop 活体映射/
// listenPorts/回链/排序 sanity/405 → 用后自清（s82 纪律：apps/ 现为空目录，终态恢复空数组）；
// 桩测（模板提取）：appParseYaml/procState/排序比较器单飞执行（assets-probe B5 同款手法）+ 前端锚点 + 红线负断言。
// fixtures 不热注册 pc——run/stop 活体映射借道 fixture 进程键=pc 既有进程名（chat-bridge/daily-backup），
// 零进程写入零 pc 写操作；探针存活窗内栈不重启，聚合器（启动器）不会消费这些 fixture。
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const FORGE = path.join(ROOT, 'forge');
let pass = 0, fail = 0;
const ck = (n, ok, extra) => { console.log((ok ? 'PASS' : 'FAIL') + ': ' + n + (extra !== undefined && extra !== '' ? '  | ' + String(extra).slice(0, 200) : '')); ok ? pass++ : fail++; };
function get(p) {
    return new Promise((res, rej) => {
        const r = http.get({ host: '127.0.0.1', port: 8790, path: p, timeout: 20000 }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); });
        r.on('error', rej); r.on('timeout', () => { r.destroy(); rej(new Error('timeout')); });
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
    const sortedOk = (() => { // 同 state 内 createdAt 非空者降序、null 沉底（排序全量规则走 B12 桩测）
        for (let i = 1; i < apps.length; i++) {
            if (apps[i - 1].state !== apps[i].state) continue;
            const x = apps[i - 1].createdAt, y = apps[i].createdAt;
            if (x == null && y != null) return false;
            if (x != null && y != null && x < y) return false;
        } return true; })();
    ck('A16 活体排序 sanity（同 state 内时间倒序 null 沉底）', sortedOk);
    let post = 0;
    try { post = (await new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port: 8790, path: '/api/apps', method: 'POST' }, x => res(x.statusCode)); r.on('error', rej); r.end(); })); } catch {}
    ck('A17 非 GET 拒 405（无写通道）', post === 405, 'status=' + post);

    // ===== 桥模板提取桩测 =====
    const bridge = fs.readFileSync(path.join(FORGE, 'conf', 'templates', 'chat-bridge.tpl.js'), 'utf8');
    ck('B1 桥模板路由 /api/apps+appsOverview+405', /url === '\/api\/apps'/.test(bridge) && /appsOverview\(\)/.test(bridge) && /url === '\/api\/apps'[\s\S]{0,300}req\.method !== 'GET'/.test(bridge));
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
    ck('B14 红线：桥零写通道（appsOverview 无 write/unlink/rename/project 调用）', !!appsFn && !/writeFileSync|unlinkSync|renameSync|project (update|start|stop|restart)/.test(appsFn[0]));

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
        ck('C11 红线：动作面仅「打开看看」一枚（无启停/删除/编辑双入口）', btns.length === 1 && />打开看看</.test(btns[0]), btns.join(' ; '));
        ck('C12 yaml 路径收折叠技术区（details/summary，不进卡片主面）', /<details class="tz"[^>]*><summary>详情<\/summary>/.test(appsBlock) && /应用文件：/.test(appsBlock));
    }
    const paneApps = (html.match(/<div class="mpane" id="mpane-apps"[\s\S]*?<div class="mpane" id="mpane-mem"/) || [''])[0];
    ck('C13 pane 内唯一按钮=刷新看看（R2 0-8 档直列：无搜索框无分页器）', !!paneApps && (paneApps.match(/<button[^>]*>/g) || []).length === 1 && /apps-refresh/.test(paneApps) && !/<input/.test(paneApps));
    ck('C14 tab 副题=哪个在跑/怎么打开 + 与做过的东西的心智区分句', /哪个在跑、怎么打开/.test(paneApps) && /过去的事/.test(paneApps));

    // ===== 自清与终态（s82 纪律）=====
    cleanup();
    let j2 = null;
    try { j2 = JSON.parse((await get('/api/apps')).body); } catch {}
    ck('D1 用后自清：fixtures 删除 + /api/apps 回到基线（apps 数=目录基线 yaml 数）', j2 && j2.ok === true && Array.isArray(j2.apps) && j2.apps.length === beforeYaml, 'n=' + (j2 && j2.apps ? j2.apps.length : '?') + ' baseline=' + beforeYaml);
    const after = (() => { try { return fs.readdirSync(APPS_DIR).filter(f => !f.startsWith('s87')); } catch { return null; } })();
    ck('D2 目录基线零扰动（非探针文件原样保留）', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));

    console.log('apps-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { cleanup(); console.error('FATAL', e); process.exit(2); });
