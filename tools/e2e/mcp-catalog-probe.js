// MCP 目录配置化探针（s70 切片C，docs/verdicts/2026-09-05-marketplace-ecosystem.md S3；s78g 补字段级合并节，11 ck）
// 场景（端口 18796 自建 tools/e2e/.mcp-cb）：首启生成默认/坏 JSON 回落/缺字段回落/坏 id 回落/id 重复回落/配置回环增删零代码/白名单随配置（7 ck）
//   + 字段级合并（qa s78f P3-2）：运行时缺键回填模板/运行时自定义保住/运行时缺整条模板补入/无运行时文件原路（4 ck）
// 全部断言零出网（安装断言走白名单拒绝/已装短路分支）；不依赖 dev 栈、不碰 8790；沙盒跑完自清。
// 用法：node tools/e2e/mcp-catalog-probe.js   （fuzz-chat.sh 单行接入）
'use strict';
const C = require('assert');
const FSS = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const FORGE = path.join(ROOT, 'forge');
const SB = path.join(__dirname, '.mcp-cb');
const PORT = 18796;
let pass = 0, fail = 0;
function ck(name, fn) { try { fn(); console.log('PASS: ' + name); pass++; } catch (e) { console.log('FAIL: ' + name + ' — ' + e.message); fail++; } }
const J = p => path.join.apply(null, [SB].concat(p));
const await0 = ms => new Promise(r => setTimeout(r, ms));
const readJ = f => JSON.parse(FSS.readFileSync(f, 'utf8'));
function spawnBridge() {
    const child = spawn(process.execPath, [FORGE + '/bin/chat-bridge.js'], {
        env: { ...process.env, FORGE_ROOT: SB, PORT: String(PORT), NO_PROXY: '127.0.0.1,localhost' },
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
        setTimeout(resolve, 5000);
    });
}
async function rmSandbox(p) {
    const t0 = Date.now();
    for (;;) {
        try { return FSS.rmSync(p, { recursive: true, force: true }); }
        catch (e) {
            if (Date.now() - t0 > 8000) throw e;
            await0(200);
        }
    }
}
function portFree() {
    return new Promise(resolve => {
        require('http').get({ host: '127.0.0.1', port: PORT, path: '/healthz', timeout: 800 }, () => resolve(false)).on('error', () => resolve(true));
    });
}
function waitHealth() {
    return new Promise((resolve, reject) => {
        const try1 = () => require('http').get({ host: '127.0.0.1', port: PORT, path: '/healthz', timeout: 1000 }, r => {
            let b = ''; r.on('data', c => b += c); r.on('end', () => { if (b === 'ok') resolve(); else setTimeout(try1, 400); });
        }).on('error', () => setTimeout(try1, 400));
        try1();
        setTimeout(() => reject(new Error('bridge not up :' + PORT)), 20000);
    });
}
function getJson(p) {
    return new Promise((resolve, reject) => {
        require('http').get({ host: '127.0.0.1', port: PORT, path: p, timeout: 10000 }, r => {
            let b = ''; r.on('data', c => b += c);
            r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('bad json: ' + b.slice(0, 120))); } });
        }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('timeout ' + p)); });
    });
}
function post(body) {
    return new Promise((resolve, reject) => {
        const rq = require('http').request({ host: '127.0.0.1', port: PORT, path: '/api/mcpstore', method: 'POST', headers: { 'content-type': 'application/json' } }, r2 => {
            let b = ''; r2.on('data', c => b += c); r2.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        }); rq.on('error', reject); rq.end(body);
    });
}
const DFT_IDS = ['sequential-thinking', 'memory-graph', 'fetch'];
function seedBase() {
    for (const d of ['conf/goose/config', 'conf/goose/data/scheduled_recipes', 'conf/goose/config/recipes', 'data/logs', 'data/stats', 'data/backups', 'data/artifacts', 'data/cache/skills', '.agents/skills']) FSS.mkdirSync(J(d.split('/')), { recursive: true });
    FSS.writeFileSync(J(['VERSION']), '9.9.9-s70probe');
    FSS.writeFileSync(J(['conf', 'goose', 'config', 'config.yaml']), [
        'extensions:',
        '  mcp-fetch:',
        '    type: stdio',
        '    name: mcp-fetch',
        '    enabled: true',
        '    cmd: \'node.exe\'',
        '',
    ].join('\n'));
    FSS.writeFileSync(J(['data', 'providers.json']), JSON.stringify([
        { name: 'prov-a', host: 'https://x', key: 'sk-fixture000key2', models: ['m1'], active: true },
    ]));
    FSS.mkdirSync(J(['bin', 'goose', 'goose-package']), { recursive: true });
    // s78c: 沙盒不幂等实锤——上一轮中断留下的 goose.exe 使 linkSync EEXIST 打死探针（fuzz 149/150 单红）；
    // 先清后建，probe 自恢复
    const gooseLink = J(['bin', 'goose', 'goose-package', 'goose.exe']);
    try { FSS.rmSync(gooseLink, { force: true }); } catch {}
    FSS.linkSync(FORGE + '/bin/goose/goose-package/goose.exe', gooseLink);
}
const CFG = J(['data', 'config', 'mcp-catalog.json']);
const writeCfg = j => { FSS.mkdirSync(path.dirname(CFG), { recursive: true }); FSS.writeFileSync(CFG, typeof j === 'string' ? j : JSON.stringify(j)); };

let child = null;
(async () => {
    if (!(await portFree())) throw new Error('端口 ' + PORT + ' 已被占（可能上次探针桥残留），先清再跑');
    seedBase();

    // D1 首启无配置：GET 生成默认 3 条 + 文件落盘 _schema:1
    child = spawnBridge();
    await waitHealth();
    const r1 = await getJson('/api/mcpstore');
    ck('切片C-1 首启无配置: 列表=内置3条默认 + mcp-catalog.json 自动生成(_schema:1)', () => {
        C.deepEqual(r1.map(x => x.id), DFT_IDS, JSON.stringify(r1.map(x => x.id)));
        const f = readJ(CFG);
        C.equal(f._schema, 1, '_schema=' + f._schema);
        C.deepEqual(f.catalog.map(x => x.id), DFT_IDS, JSON.stringify(f.catalog.map(x => x.id)));
    });
    await stopBridge(child); child = null;

    // D2-D5 坏配置矩阵：坏 JSON / 条目缺字段 / 坏 id / id 重复 → 回落内置默认 + warn + 用户文件不动
    const BADS = [
        ['坏JSON回落', '{bad json'],
        ['缺字段回落', { _schema: 1, catalog: [{ id: 'x', name: 'n', desc: 'd', entry: 'a.js', license: 'MIT' }] }], // 缺 pkg
        ['坏id回落', { _schema: 1, catalog: [{ id: '../evil', name: 'n', desc: 'd', pkg: 'p', entry: 'a.js', license: 'MIT' }] }],
        ['id重复回落', { _schema: 1, catalog: [
            { id: 'dup', name: 'n1', desc: 'd', pkg: 'p1', entry: 'a.js', license: 'MIT' },
            { id: 'dup', name: 'n2', desc: 'd', pkg: 'p2', entry: 'b.js', license: 'MIT' },
        ] }],
    ];
    for (const [name, bad] of BADS) {
        writeCfg(bad);
        child = spawnBridge();
        await waitHealth();
        const rl = await getJson('/api/mcpstore');
        const wl = await getJson('/api/update/status');
        ck('切片C-' + name + ': 列表=内置默认+warn上浮+文件不动', () => {
            C.deepEqual(rl.map(x => x.id), DFT_IDS, JSON.stringify(rl.map(x => x.id)));
            C.ok(wl.warnings.some(x => x.includes('mcp-catalog.json')), JSON.stringify(wl.warnings));
            C.equal(FSS.readFileSync(CFG, 'utf8'), typeof bad === 'string' ? bad : JSON.stringify(bad), '用户文件被改写');
        });
        await stopBridge(child); child = null;
    }

    // D6 配置回环：增条目→GET 出现；删条目→GET 消失（每请求读配置，零代码零重启）
    // D7 白名单随配置：不在目录的 id 安装/卸载均友好拒绝（零出网）
    writeCfg({ _schema: 1, catalog: DFT_IDS.concat('fuzz-mcp-zzz').map(id => ({
        id, name: 'n-' + id, desc: 'd', pkg: 'pkg-' + id,
        entry: 'node_modules/@s/' + id + '/i.js', license: 'MIT',
    })) });
    child = spawnBridge();
    await waitHealth();
    const r6a = await getJson('/api/mcpstore');
    writeCfg({ _schema: 1, catalog: DFT_IDS.map(id => ({
        id, name: 'n-' + id, desc: 'd', pkg: 'pkg-' + id, entry: 'i.js', license: 'MIT',
    })) });
    const r6b = await getJson('/api/mcpstore');
    ck('切片C-6 配置回环: 增条目列表出现→删条目列表消失（零代码零重启）', () => {
        C.ok(r6a.some(x => x.id === 'fuzz-mcp-zzz'), '增条目未出现: ' + JSON.stringify(r6a.map(x => x.id)));
        C.equal(r6b.some(x => x.id === 'fuzz-mcp-zzz'), false, '删条目仍在');
        C.equal(r6b.length, 3, '长度漂移');
    });
    const p7a = await post(JSON.stringify({ id: 'ghost-mcp-zzz' }));
    const p7b = await post(JSON.stringify({ id: 'fuzz-mcp-zzz', op: 'uninstall' }));
    const p7c = await post(JSON.stringify({ id: 'sequential-thinking', op: 'uninstall' }));
    ck('切片C-7 白名单随配置: 目录外安装拒/目录外与在册未装的卸载均友好拒绝（零出网）', () => {
        C.equal(p7a.err, '目录里没有这个 MCP', JSON.stringify(p7a));
        C.equal(p7b.err, '没有安装这个 MCP，不用卸载', JSON.stringify(p7b)); // 已从配置删除→目录外卸载同门拒
        C.equal(p7c.err, '没有安装这个 MCP，不用卸载', JSON.stringify(p7c));
    });
    await stopBridge(child); child = null;

    // D8 字段级合并（qa s78f P3-2：整文件优先→条目级合并，模板演进对存量合法文件可见）
    // 一文件三态同测：sequential-thinking=自定义 name/desc（保住）+ fetch=缺 desc 键（回填模板含 s78e 注记特征）
    // + memory-graph=整条缺（模板全量补尾，运行时序优先）。判别=无回落警告（整体回落必 warn+清空自定义）。
    writeCfg({ _schema: 1, catalog: [
        { id: 'sequential-thinking', name: '自定义思考', desc: '我的自定义说明', pkg: '@modelcontextprotocol/server-sequential-thinking', entry: 'node_modules/@modelcontextprotocol/server-sequential-thinking/dist/index.js', license: 'MIT' },
        { id: 'fetch', name: '网页抓取', pkg: 'fetch-mcp', entry: 'node_modules/fetch-mcp/cli.js', license: 'MIT' },
    ] });
    child = spawnBridge();
    await waitHealth();
    const r8 = await getJson('/api/mcpstore');
    const m8 = await getJson('/api/config/market'); // market GET 带全字段（mcpstore 视图只出 id/name/desc/license，验 pkg/entry 须走此端点）
    const w8 = await getJson('/api/update/status');
    ck('切片C-8 缺键回填: fetch 缺 desc 键→回填模板 desc(含 s78e 注记特征)+无回落警告', () => {
        const f = r8.find(x => x.id === 'fetch');
        C.ok(f && f.desc && f.desc.indexOf('接口类(json)') >= 0, JSON.stringify(f)); // 模板 desc 再演进时同步此特征串（desc 演进可见性正是本 ck 回归对象）
        C.equal(w8.warnings.some(x => x.includes('mcp-catalog.json')), false, JSON.stringify(w8.warnings)); // 修前整体回落必 warn=本 ck 红的判别点
    });
    ck('切片C-8 自定义保住: 运行时自定义 name/desc 不被模板盖（同文件走合并非回落）', () => {
        const st = r8.find(x => x.id === 'sequential-thinking');
        C.equal(st.name, '自定义思考', JSON.stringify(st));
        C.equal(st.desc, '我的自定义说明', JSON.stringify(st));
    });
    ck('切片C-8 模板条目补入: 运行时缺整条 memory-graph→模板全量进且补尾（运行时序优先）', () => {
        C.deepEqual(r8.map(x => x.id), ['sequential-thinking', 'fetch', 'memory-graph'], JSON.stringify(r8.map(x => x.id)));
        const mg = m8.mcpCatalog.find(x => x.id === 'memory-graph');
        C.equal(mg.name, '关系图谱记忆', JSON.stringify(mg));
        C.equal(mg.pkg, '@modelcontextprotocol/server-memory', JSON.stringify(mg));
        C.equal(mg.entry, 'node_modules/@modelcontextprotocol/server-memory/dist/index.js', JSON.stringify(mg));
    });
    await stopBridge(child); child = null;

    // D8-④ 无运行时文件→原路（首启生成默认；修前即绿=对照，锁不回归）
    FSS.rmSync(CFG, { force: true });
    child = spawnBridge();
    await waitHealth();
    const r9 = await getJson('/api/mcpstore');
    ck('切片C-8 无文件原路: 首启生成默认 3 条 + 文件落盘 _schema:1', () => {
        C.deepEqual(r9.map(x => x.id), DFT_IDS, JSON.stringify(r9.map(x => x.id)));
        const f = readJ(CFG);
        C.equal(f._schema, 1, '_schema=' + f._schema);
        C.deepEqual(f.catalog.map(x => x.id), DFT_IDS, JSON.stringify(f.catalog.map(x => x.id)));
    });
    await stopBridge(child); child = null;

    await rmSandbox(SB);
    console.log('==============================');
    console.log('mcp-catalog probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('probe fatal:', e.message); if (child) stopBridge(child); process.exit(1); });
