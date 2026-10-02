// PocketForge 建数据库 MCP server（vendored stdio，零依赖 node；s108/d2）
// 裁决 docs/verdicts/2026-10-03-s108-db-write-path.md 裁决一：建库/建表此前零 MCP 覆盖，
// 唯一路径=shell 27 卡墙；本工具把「建」整体吸收进一次同意的卡内。只做「建」，不复制「写」存量
// （日常插入仍 faucet_insert，hints :12 原句）。边界（照裁决 §工具规格，机制不进配置面、无开关）：
//   两把工具全部 write 注解（readOnlyHint=false → goose smart_approve 注解归一确定性入 ask_before，
//   research/2026-10-02-s107-read-tool-permission.md §2.2）——一次建库一张卡、一次建表一张卡，不拿注解说谎。
//   密钥（data/faucet/.apikey）只在工具进程内读取使用，绝不回显、不进 agent 上下文（比 shell 读 key 是收紧）。
//   restart 归属：只进 db_create_service 内部编排（上游热加载缺口 40s+ 不刷新，ADR-0006 不 fork）——
//   探可见宽限 ~3s（上游未来修好热加载则零改动自然跳过 restart）→ 不可见才经 pc REST API
//   POST /process/restart/faucet（端口逐次读 data/pc.port 动态值，禁写死——本机有 8099/8100 漂移场景）→
//   healthz 等待 → 复验。insert 路径（db_create_table）永不动 restart。失败臂=人话报错+下一步指引，
//   禁止自动重试风暴；全程至多一次 restart。
//   名字卫生：service/table 入参沿用 CJK 裁决二同款白名单 ^[\p{L}\p{N}_\-]{1,64}$/u
//   （姊妹裁决 2026-10-03-s108-cjk-tablename——桥闸门+本工具入参同语义两处执行点），拒绝给构造性人话错误。
//   REST 通道事实（VERIFIED-RUN 2026-10-03，本机 faucet v0.1.12 隔离实例 18159/18160）：
//   POST _schema 表名在 UTF-8 JSON body 中文安全；insert 走编码 path（变量段 encodeURIComponent）；
//   CLI db add 经 execFile 中文参数原生安全（CreateProcessW UTF-16，无 shell 注入面）。
// 用法：node db-create-mcp.js <安装根>（根由 goose-config 物化的绝对路径经 argv 传入，不吃 env——read-file-mcp 同款）
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const NAME_RE = /^[\p{L}\p{N}_\-]{1,64}$/u; // CJK 裁决二同款：Unicode 字母+数字+下划线+连字符，1-64
const FAUCET_EXE = path.join(ROOT, 'bin', 'faucet', 'faucet.exe');
const FAUCET_DIR = path.join(ROOT, 'data', 'faucet');
const KEY_FILE = path.join(FAUCET_DIR, '.apikey');
const SQLITE_DIR = path.join(ROOT, 'data', 'sqlite');
const GRACE_PROBES = 3;          // 建库后热加载宽限探查次数（~3s，1s 间隔）
const RECHECK_PROBES = 5;        // restart+healthz 后复验次数（~5s）
const HEALTHZ_BUDGET_MS = 20000; // healthz 等待预算（验收臂 faucet 重启 <5s，预算留慢机余量）
const REQ_TIMEOUT_MS = 8000;     // 单次 REST 请求超时

function err(text) { return { content: [{ type: 'text', text }], isError: true }; }
function ok(text) { return { content: [{ type: 'text', text }] }; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function readPort(file) {
    try { return parseInt(fs.readFileSync(file, 'utf8').trim(), 10) || 0; } catch { return 0; }
}
function readKey() {
    try { const k = fs.readFileSync(KEY_FILE, 'utf8').trim(); return k || null; } catch { return null; }
}
function api(method, p, port, key, body) {
    return new Promise(resolve => {
        const data = body === undefined ? null : JSON.stringify(body);
        const headers = { 'X-API-Key': key };
        if (data !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
        let rq;
        try {
            rq = http.request({ hostname: '127.0.0.1', port, path: p, method, headers, timeout: REQ_TIMEOUT_MS }, r => {
                let b = '';
                r.on('data', c => b += c);
                r.on('end', () => resolve({ code: r.statusCode, body: b }));
            });
            rq.on('error', () => resolve({ code: 0, body: '' }));
            rq.on('timeout', () => { rq.destroy(); resolve({ code: 0, body: '' }); });
            if (data !== null) rq.write(data);
            rq.end();
        } catch { resolve({ code: 0, body: '' }); }
    });
}
function apiErr(r) { // 上游错误体 {"error":{...,"message":"..."}} → 人话短语（不含路径/端口）
    try { const m = JSON.parse(r.body || '{}').error; if (m && m.message) return String(m.message).slice(0, 200); } catch {}
    return r.code ? ('服务返回了状态码 ' + r.code) : '联系不上数据库服务';
}
// 服务可见性：200=可见（空表也回 resource:[]）；404 Service not found=不可见（rca §二实测形态）
function svcVisible(svc, port, key) {
    return api('GET', '/api/v1/' + encodeURIComponent(svc) + '/_table', port, key).then(r => r.code === 200 ? r : null);
}
function faucetCli(args) {
    return new Promise(resolve => {
        execFile(FAUCET_EXE, args.concat(['--data-dir', FAUCET_DIR]),
            { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 },
            (e, stdout, stderr) => resolve({ e, out: String(stdout || ''), se: String(stderr || '') }));
    });
}
async function waitHealthz(port, budgetMs) {
    const t0 = Date.now();
    for (;;) {
        const r = await api('GET', '/healthz', port, ''); // healthz 免鉴权（实测 200；空 key 头不触发 401）
        if (r.code === 200) return true;
        if (Date.now() - t0 > budgetMs) return false;
        await sleep(500);
    }
}
// pc REST restart：端口逐次读 data/pc.port（裁决：禁写死——8100 场景实测存在）；端点 VERIFIED-RUN 2026-10-03
function pcRestartFaucet() {
    const port = readPort(path.join(ROOT, 'data', 'pc.port'));
    if (!port) return Promise.resolve({ code: 0, body: '' });
    return api('POST', '/process/restart/faucet', port, '', '{}');
}
function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function badName(kind, v) {
    return '这个名字用不了：' + JSON.stringify(String(v).slice(0, 40)) + '。' + kind + '名请只用文字、数字、下划线或连字符，1 到 64 个字（中文、英文都行），不要空格、斜杠、点或别的符号。';
}

// ---- 工具 1：db_create_service（建库+留账；restart 编排唯一宿主） ----
const TOOL_SVC = {
    name: 'db_create_service',
    description: '新建一个数据库（一类数据的家，比如「家务账」）。填 name 库名、description 一句人话说清这个库给谁做什么、source 工作区目录名（系统备注里 data/artifacts/ 后面那串）。它会自动建库文件、登记到数据库网关、留账（forge_meta 一行，设置面板「做过的东西」靠它显示来历），必要时让数据库服务重新加载（可能要等几秒），完成后 faucet_list_services 等 faucet_* 工具立即可见。建新库用它，不要用 shell 命令、不要自己重启任何进程。',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: '库名（文字/数字/下划线/连字符，1-64 字，中英文都行）' },
            description: { type: 'string', description: '一句中文人话：这个库是给谁做什么的' },
            source: { type: 'string', description: '来源（当前对话的工作区目录名，系统备注里 data/artifacts/ 后面那串；不知道就留空）' }
        },
        required: ['name', 'description']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } // write 注解 → smart_approve 确定性 ask_before（一次建库=一张真同意卡）
};

async function createService(args) {
    const name = args.name, desc = args.description, source = args.source;
    if (!name || typeof name !== 'string') return err('要告诉它建库的名字：name 参数填库名（中英文都行，1 到 64 个字）。');
    if (!NAME_RE.test(name)) return err(badName('库', name));
    if (!desc || typeof desc !== 'string' || !desc.trim()) return err('要写一句说明：description 参数用一句人话说清这个库给谁做什么（设置面板靠它显示来历）。');
    const key = readKey();
    if (!key) return err('数据库还没配好钥匙（首启供给可能还没跑完）。等十几秒再试一次；还不行就重启数字员工后再试。');
    const port = readPort(path.join(ROOT, 'data', 'faucet.port'));
    if (!port) return err('找不到数据库服务的端口记录。请重启数字员工后再试。');
    // ① 建库文件（data/sqlite/<名>.db，旧教法同路径；0 字节=合法空库，sqlite/facet 均按空库接受——实测）
    const dbPath = path.join(SQLITE_DIR, name + '.db');
    try {
        fs.mkdirSync(SQLITE_DIR, { recursive: true });
        if (!fs.existsSync(dbPath)) { const fd = fs.openSync(dbPath, 'a'); fs.closeSync(fd); }
    } catch (e) { return err('库文件建不了（磁盘可能满了或没权限）：' + (e && e.message ? String(e.message).slice(0, 120) : '未知原因')); }
    // ② 登记到网关（execFile 无 shell，中文参数原生安全）
    const add = await faucetCli(['db', 'add', '--name', name, '--driver', 'sqlite', '--dsn', dbPath]);
    if (/UNIQUE constraint failed: services\.name/.test(add.se)) {
        return err('已经有一个叫「' + name + '」的库（也可能是上次建到一半留下的）。它没坏：用 faucet_list_services 能看到就直接用；要新建就换个名字再调一次。');
    }
    if (add.e) return err('登记到数据库网关失败了：' + (add.se || add.e.message || '').slice(0, 160) + '。请把这句原样告诉用户，不要自己反复重试。');
    // ③ 探可见（宽限 ~3s——上游若修好热加载，这里直接通过，零 restart；裁决：宽限探查保留）
    const t0 = Date.now();
    let seen = null;
    for (let i = 0; i < GRACE_PROBES && !seen; i++) {
        seen = await svcVisible(name, port, key);
        if (!seen) await sleep(1000);
    }
    let restarted = false;
    if (!seen) {
        // ④ 不可见 → 经 pc REST 重启 faucet（端口动态读）→ healthz 等待 → 复验。全程至多一次，失败即人话收口
        restarted = true;
        const pr = await pcRestartFaucet();
        if (pr.code !== 200) return err('数据库服务没有接住重载请求（' + (pr.code ? '状态码 ' + pr.code : '联系不上进程管家') + '）。库本身已经建好、数据不会丢；请告诉用户稍后重启数字员工，新库就能用。不要反复重试。');
        const healthy = await waitHealthz(port, HEALTHZ_BUDGET_MS);
        if (!healthy) return err('数据库服务重载后一直没缓过来（等了 ' + Math.round(HEALTHZ_BUDGET_MS / 1000) + ' 秒）。库本身已经建好、数据不会丢；请告诉用户重启数字员工后再用新库。不要反复重试。');
        for (let i = 0; i < RECHECK_PROBES && !seen; i++) {
            seen = await svcVisible(name, port, key);
            if (!seen) await sleep(1000);
        }
        if (!seen) return err('数据库服务重载完成了，但一直没列出这个新库。库文件和登记都在、数据不会丢；请告诉用户重启数字员工后再试，并如实说明这一步没走完。不要反复重试。');
    }
    const waited = Math.round((Date.now() - t0) / 1000);
    // ⑤ 留账（forge_meta 建表+写一行，建账是工具内置义务——hints 建库留账句）
    let accountNote = '';
    try {
        let sc = await api('POST', '/api/v1/' + encodeURIComponent(name) + '/_schema', port, key,
            { name: 'forge_meta', columns: [{ name: 'description', type: 'TEXT' }, { name: 'created_at', type: 'TEXT' }, { name: 'source', type: 'TEXT' }] });
        if (sc.code !== 201 && !/already exists/.test(sc.body)) throw new Error(apiErr(sc));
        const ins = await api('POST', '/api/v1/' + encodeURIComponent(name) + '/_table/forge_meta', port, key,
            { resource: [{ description: String(desc).trim(), created_at: today(), source: typeof source === 'string' ? source.trim() : '' }] });
        if (ins.code !== 201) throw new Error(apiErr(ins));
    } catch (e) {
        accountNote = '，但有一件事没办成：没记上账（' + String(e && e.message || e).slice(0, 120) + '）——库能用，只是在「做过的东西」里会显示成来源不详。请把这句如实告诉用户。';
    }
    return ok('库建好了：「' + name + '」' + (restarted ? '（等了数据库服务重载，约 ' + waited + ' 秒）' : '') + '。账已留：设置面板「做过的东西」会显示它的来历说明。现在 faucet_list_services 立即可见，建表用 db_create_table、插数据用 faucet_insert' + accountNote + '。');
}

// ---- 工具 2：db_create_table（建表+表说明+可选首批行；永不 restart） ----
const TOOL_TBL = {
    name: 'db_create_table',
    description: '在已有数据库里新建一张表，可顺带写入头几行。service 填库名（db_create_service 建的、或 faucet_list_services 里看到的）、table 填表名、columns 填列定义数组（每项 {"name":"列名","type":"TEXT"}，type 常用 TEXT 文字 / INTEGER 整数 / REAL 小数）、description 一句人话说清这张表装什么给谁用、rows 可选（数组，每行是 {列名: 值}）。它会自动建表、写表说明（forge_table_info，数据面板的说明来自这里）、写入给定行。建新表用它；往已有的表补数据用 faucet_insert。',
    inputSchema: {
        type: 'object',
        properties: {
            service: { type: 'string', description: '库名（faucet_list_services 里看到的）' },
            table: { type: 'string', description: '表名（文字/数字/下划线/连字符，1-64 字，中英文都行）' },
            columns: { type: 'array', description: '列定义数组，每项 {"name":"列名","type":"TEXT"}', items: { type: 'object' } },
            description: { type: 'string', description: '一句中文人话：这张表装什么、给谁用' },
            rows: { type: 'array', description: '可选：首批数据行，每行 {列名: 值}', items: { type: 'object' } }
        },
        required: ['service', 'table', 'columns', 'description']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } // write 注解 → 一次建表=一张真同意卡（首批行搭车，不拆卡）
};

async function createTable(args) {
    const svc = args.service, tbl = args.table;
    if (!svc || typeof svc !== 'string' || !NAME_RE.test(svc)) return err(svc ? badName('库', svc) : '要告诉它在哪个库建表：service 参数填库名（faucet_list_services 里看到的）。');
    if (!tbl || typeof tbl !== 'string' || !NAME_RE.test(tbl)) return err(tbl ? badName('表', tbl) : '要告诉它表叫什么：table 参数填表名（中英文都行，1 到 64 个字）。');
    if (!args.description || typeof args.description !== 'string' || !args.description.trim()) return err('要写一句说明：description 参数用一句人话说清这张表装什么、给谁用（数据面板靠它显示说明）。');
    if (!Array.isArray(args.columns) || !args.columns.length) return err('要给出列：columns 参数是数组，每项 {"name":"列名","type":"TEXT"}，至少一列。');
    const cols = [];
    for (const c of args.columns.slice(0, 64)) {
        if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim()) return err('columns 里有拿不出手的列定义：每项必须是 {"name":"列名","type":"TEXT"}，name 不能空。');
        cols.push({ name: c.name.trim(), type: (typeof c.type === 'string' && c.type.trim()) ? c.type.trim().toUpperCase() : 'TEXT' });
    }
    const rowsIn = Array.isArray(args.rows) ? args.rows : null;
    if (rowsIn) for (const r of rowsIn) if (!r || typeof r !== 'object' || Array.isArray(r)) return err('rows 里每行都必须是 {列名: 值} 的对象。');
    const key = readKey();
    if (!key) return err('数据库还没配好钥匙（首启供给可能还没跑完）。等十几秒再试一次；还不行就重启数字员工后再试。');
    const port = readPort(path.join(ROOT, 'data', 'faucet.port'));
    if (!port) return err('找不到数据库服务的端口记录。请重启数字员工后再试。');
    // 库必须已在（本工具不做 restart——那是 db_create_service 的内部编排；insert 路径永不动它）
    const seen = await svcVisible(svc, port, key);
    if (!seen) return err('没有叫「' + svc + '」的库在数据库网关里（或服务暂时没响应）。先用 db_create_service 建库；如果是刚建的，等几秒再试一次。');
    // ① 建表（表名在 UTF-8 JSON body，中文安全；REST POST _schema）
    const sc = await api('POST', '/api/v1/' + encodeURIComponent(svc) + '/_schema', port, key,
        { name: tbl, columns: cols.map(c => ({ name: c.name, type: c.type })) });
    if (/already exists/.test(sc.body)) return err('「' + svc + '」库里已经有一张叫「' + tbl + '」的表。要加数据用 faucet_insert；要建的是别的表就换个名字。');
    if (sc.code !== 201) return err('建表没成功：' + apiErr(sc) + '。请把这句如实告诉用户，不要自己反复重试。');
    // ② 表说明（forge_table_info 建表+写一行——hints 建表留说明义务）
    let infoNote = '';
    try {
        let tsc = await api('POST', '/api/v1/' + encodeURIComponent(svc) + '/_schema', port, key,
            { name: 'forge_table_info', columns: [{ name: 'tbl', type: 'TEXT' }, { name: 'description', type: 'TEXT' }, { name: 'created_at', type: 'TEXT' }] });
        if (tsc.code !== 201 && !/already exists/.test(tsc.body)) throw new Error(apiErr(tsc));
        const tins = await api('POST', '/api/v1/' + encodeURIComponent(svc) + '/_table/forge_table_info', port, key,
            { resource: [{ tbl: tbl, description: String(args.description).trim(), created_at: today() }] });
        if (tins.code !== 201) throw new Error(apiErr(tins));
    } catch (e) {
        infoNote = '（但表说明没写上：' + String(e && e.message || e).slice(0, 100) + '——表能用，只是数据面板里没有说明文字。请如实告诉用户。）';
    }
    // ③ 可选首批行（编码 path REST insert——rca §三 VERIFIED 通道）
    let rowsNote = '';
    if (rowsIn && rowsIn.length) {
        const ins = await api('POST', '/api/v1/' + encodeURIComponent(svc) + '/_table/' + encodeURIComponent(tbl), port, key,
            { resource: rowsIn.slice(0, 1000) });
        if (ins.code === 201) rowsNote = '，并写入了 ' + Math.min(rowsIn.length, 1000) + ' 行数据';
        else rowsNote = '（但首批数据没写进去：' + apiErr(ins) + '——表已经建好；缺的行用 faucet_insert 补。请如实告诉用户。）';
    }
    return ok('表建好了：「' + svc + '」库里的「' + tbl + '」，共 ' + cols.length + ' 列' + rowsNote + '。表说明已写：数据面板里能看到这句人话' + infoNote + '。以后往这张表补数据用 faucet_insert。');
}

const TOOLS = [TOOL_SVC, TOOL_TBL];

function reply(id, result, error) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result, error }) + '\n'); }
function handle(msg) {
    const { id, method } = msg;
    if (method === 'initialize') {
        reply(id, { protocolVersion: (msg.params && msg.params.protocolVersion) || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'db-create', version: '1.0.0' } });
    } else if (method === 'tools/list') {
        reply(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
        const p = msg.params || {};
        const fn = p.name === 'db_create_service' ? createService : (p.name === 'db_create_table' ? createTable : null);
        if (!fn) { reply(id, { content: [{ type: 'text', text: '没有这个工具：' + p.name }], isError: true }); return; }
        Promise.resolve()
            .then(() => fn(p.arguments || {}))
            .then(r => reply(id, r))
            .catch(e => reply(id, err('这一步出了没料到的错：' + String((e && e.message) || e).slice(0, 160) + '。请如实告诉用户；库和已写的数据不会因为这个错丢掉。')));
    } else if (id !== undefined && method && !method.startsWith('notifications/')) {
        reply(id, undefined, { code: -32601, message: 'unknown method: ' + method });
    } // notifications/*：按协议不回包
}

let bufIn = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
    bufIn += d;
    let i;
    while ((i = bufIn.indexOf('\n')) >= 0) {
        const line = bufIn.slice(0, i).trim();
        bufIn = bufIn.slice(i + 1);
        if (!line) continue;
        try { handle(JSON.parse(line)); } catch (e) { process.stderr.write('[db-create-mcp] bad line: ' + e.message + '\n'); } // 坏行不杀进程（fail-visible 落 stderr）
    }
});
process.stdin.on('end', () => process.exit(0));
