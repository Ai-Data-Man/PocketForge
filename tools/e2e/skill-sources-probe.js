// 技能市场源配置化探针（s70 切片B，docs/verdicts/2026-09-05-marketplace-ecosystem.md S2，9 ck）
// 场景A（迁移，端口 18795 自建 tools/e2e/.skill-sb-a）：存量 manifest v1→v2 条目补 source{repo,branch}+留档+幂等（3 ck）
// 场景B（配置，同端口自建 .skill-sb-b）：首启生成默认(双源,P2-2)/坏 JSON 容错/空数组零源/缺 branch 回落/存量单源迁移补baoyu+幂等(P2-2)/多源同名跳过（8 ck）
// 场景C（B2 subdir，自建 .skill-sb-b）：subdir 白名单矩阵（../绝对/盘符/尾斜杠拒+合法/空收）/manifest source.subdir 随装进 origin/缺 subdir 键回落解析（8 ck）
// 全部断言不依赖出网（多源合并项在线增强、离线走「失败路径也算过」裁决条款）；不依赖 dev 栈、不碰 8790。
// 沙盒跑完自清；goose.exe 硬链接（同卷零拷贝，桥启动需 spawn goose）。
// 用法：node tools/e2e/skill-sources-probe.js [a|b|c]   （缺省 a+b 全跑，实测约 30-60s，在线多源合并 +30s；fuzz-chat.sh 按 a/b/c 三行接入）
'use strict';
const SCENE = (process.argv[2] || 'ab').toLowerCase();
const C = require('assert');
const FSS = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const FORGE = path.join(ROOT, 'forge');
const SBA = path.join(__dirname, '.skill-sb-a');
const SBB = path.join(__dirname, '.skill-sb-b');
const PORT = 18795;
const OLD_FETCHED = '2020-01-01T00:00:00.000Z';
// qa返工(P2-2): 首启生成默认=双源（anthropics + baoyu，与桥端 dft() 对齐）
// f1a0383 对齐: 首启 stamp 跟 registry latest（=2），探针期望同步 1→2（此前 B-4 假红）
const DFT_CFG = { _schema: 2, sources: [
    { repo: 'anthropics/skills', branch: 'main', subdir: 'skills', enabled: true },
    { repo: 'JimLiu/baoyu-skills', branch: 'main', subdir: 'skills', enabled: true },
] };
let pass = 0, fail = 0;
function ck(name, fn) { try { fn(); console.log('PASS: ' + name); pass++; } catch (e) { console.log('FAIL: ' + name + ' — ' + e.message); fail++; } }
const J = (sb, p) => path.join.apply(null, [sb].concat(p));
const await0 = ms => new Promise(r => setTimeout(r, ms));
const readJ = f => JSON.parse(FSS.readFileSync(f, 'utf8'));
function spawnBridge(sb) {
    const child = spawn(process.execPath, [FORGE + '/bin/chat-bridge.js'], {
        env: { ...process.env, FORGE_ROOT: sb, PORT: String(PORT), NO_PROXY: '127.0.0.1,localhost' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.tail = { buf: '' };
    child.stdout.on('data', d => { child.tail.buf = (child.tail.buf + d).slice(-8000); });
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
            let b = ''; r.on('data', c => b += c); r.on('end', () => { if (b === 'ok') resolve(); else setTimeout(try1, 400); }); // 校验响应体，防撞别的进程
        }).on('error', () => setTimeout(try1, 400));
        try1();
        setTimeout(() => reject(new Error('bridge not up :' + PORT)), 20000);
    });
}
function getJson(p, timeoutMs) {
    return new Promise((resolve, reject) => {
        require('http').get({ host: '127.0.0.1', port: PORT, path: p, timeout: timeoutMs || 10000 }, r => {
            let b = ''; r.on('data', c => b += c);
            r.on('end', () => { try { resolve({ code: r.statusCode, j: JSON.parse(b) }); } catch (e) { reject(new Error('bad json: ' + b.slice(0, 120))); } });
        }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('timeout ' + p)); });
    });
}
async function pollUntil(fn, ms, what) {
    const t0 = Date.now();
    for (;;) {
        let v = null, err = null;
        try { v = fn(); } catch (e) { err = e; }
        if (v) return v;
        if (Date.now() - t0 > ms) throw new Error(ms + 'ms 内未' + what + (err ? ': ' + err.message : ''));
        await0(150);
    }
}
function seedBase(sb) {
    for (const d of ['conf/goose/config', 'conf/goose/data/scheduled_recipes', 'conf/goose/config/recipes', 'data/logs', 'data/stats', 'data/backups', 'data/artifacts', 'data/cache/skills', '.agents/skills']) FSS.mkdirSync(J(sb, d.split('/')), { recursive: true });
    FSS.writeFileSync(J(sb, ['VERSION']), '9.9.9-s70probe');
    // config.yaml 照 report-probe 已证可启动 goose 的形态；沙盒无 vendor，mcp 指向 node.exe 由 goose 自容错
    FSS.writeFileSync(J(sb, ['conf', 'goose', 'config', 'config.yaml']), [
        'extensions:',
        '  faucet-db:',
        '    type: stdio',
        '    enabled: true',
        '  mcp-fetch:',
        '    type: stdio',
        '    name: mcp-fetch',
        '    enabled: true',
        '    cmd: \'node.exe\'',
        '',
    ].join('\n'));
    FSS.writeFileSync(J(sb, ['data', 'providers.json']), JSON.stringify([
        { name: 'prov-a', host: 'https://x', key: 'sk-fixture000key2', models: ['m1'], active: true },
    ]));
    FSS.mkdirSync(J(sb, ['bin', 'goose', 'goose-package']), { recursive: true });
    FSS.linkSync(FORGE + '/bin/goose/goose-package/goose.exe', J(sb, ['bin', 'goose', 'goose-package', 'goose.exe']));
}
const backups = sb => FSS.readdirSync(J(sb, ['data', 'cache', 'skills'])).filter(n => n.includes('.pre-migration-')).length;

let child = null;
(async () => {
    if (!(await portFree())) throw new Error('端口 ' + PORT + ' 已被占（可能上次探针桥残留），先清再跑');

    // ================= 场景A：manifest 存量迁移 + 幂等（.skill-sb-a） =================
    if (SCENE.includes('a')) {
    await rmSandbox(SBA);
    seedBase(SBA);
    // 存量 v1 manifest：两条目无 source，desc_zh 一中一空，fetched_at 旧值
    const MF_A = J(SBA, ['data', 'cache', 'skills', 'manifest.json']);
    FSS.writeFileSync(MF_A, JSON.stringify({
        _schema: 1, fetched_at: OLD_FETCHED, translating: false,
        skills: [
            { dir: 'alpha', name: 'alpha', description: 'd1', desc_zh: '甲' },
            { dir: 'beta', name: 'beta', description: 'd2', desc_zh: null },
        ],
    }));

    child = spawnBridge(SBA);
    await waitHealth();
    const m2 = readJ(MF_A);
    const snap = JSON.stringify(m2);
    ck('切片B-1 存量manifest迁移: v1→v2 条目补source{repo,branch} 且 desc_zh/fetched_at 保留', () => {
        C.equal(m2._schema, 2, '_schema=' + m2._schema);
        C.equal(m2.fetched_at, OLD_FETCHED, 'fetched_at 被改');
        C.deepEqual(m2.skills[0].source, { repo: 'anthropics/skills', branch: 'main' }, JSON.stringify(m2.skills[0]));
        C.deepEqual(m2.skills[1].source, { repo: 'anthropics/skills', branch: 'main' }, JSON.stringify(m2.skills[1]));
        C.equal(m2.skills[0].desc_zh, '甲', 'desc_zh 丢失');
        C.equal(m2.skills[1].desc_zh, null, 'desc_zh 被造');
    });
    ck('切片B-2 迁移留档: .pre-migration 备份恰 1 份', () => C.equal(backups(SBA), 1, 'count=' + backups(SBA)));
    await stopBridge(child); child = null;

    // 幂等：已迁移文件重启后再过迁移管线 → 不动
    child = spawnBridge(SBA);
    await waitHealth();
    ck('切片B-3 迁移幂等: 重启后无新备份/_schema 仍2/内容不变', () => {
        const m3 = readJ(MF_A);
        C.equal(backups(SBA), 1, '新增备份 count=' + backups(SBA));
        C.equal(m3._schema, 2, '_schema=' + m3._schema);
        C.equal(JSON.stringify(m3), snap, '内容漂移');
    });
    await stopBridge(child); child = null;
    } // 场景A end

    // ================= 场景B：源配置容错 + 多源合并（.skill-sb-b） =================
    if (!SCENE.includes('b') && !SCENE.includes('c')) {
        for (const sb of [SBA, SBB]) { try { await rmSandbox(sb); } catch {} }
        console.log('skill-sources probe: PASS=' + pass + ' FAIL=' + fail);
        process.exit(fail ? 1 : 0);
    }
    if (SCENE.includes('b')) {
    await rmSandbox(SBB);
    seedBase(SBB);
    const CFG = J(SBB, ['data', 'config', 'skill-sources.json']);
    const MF_B = J(SBB, ['data', 'cache', 'skills', 'manifest.json']);
    const seedStale = () => FSS.writeFileSync(MF_B, JSON.stringify({
        _schema: 2, fetched_at: OLD_FETCHED, translating: false,
        skills: [{ dir: 'alpha', name: 'alpha', description: 'd1', desc_zh: '甲', source: { repo: 'anthropics/skills', branch: 'main' } }],
    }));

    // V1 首启无配置：stale GET 秒回旧缓存（listRemoteSkills 缓存优先不回归）+ 后台 sync 触发生成默认配置
    seedStale();
    child = spawnBridge(SBB);
    await waitHealth();
    const r1 = await getJson('/api/skillstore?remote=1');
    const cfg1 = await pollUntil(() => FSS.existsSync(CFG) && readJ(CFG), 5000, '生成默认配置');
    ck('切片B-4 首启无配置: stale旧缓存秒回 + 默认skill-sources.json自动生成', () => {
        C.equal(r1.j.ok, true, JSON.stringify(r1.j).slice(0, 120));
        C.equal(r1.j.fetched_at, OLD_FETCHED, '缓存优先路径漂移');
        C.deepEqual(cfg1, DFT_CFG, JSON.stringify(cfg1));
    });
    await stopBridge(child); child = null;

    // V2 坏 JSON：warn 上浮 /api/update/status + 用户文件不被改写 + 桥活
    seedStale();
    FSS.mkdirSync(path.dirname(CFG), { recursive: true });
    FSS.writeFileSync(CFG, '{bad json');
    child = spawnBridge(SBB);
    await waitHealth();
    const r2 = await getJson('/api/skillstore?remote=1');
    const w2 = await getJson('/api/update/status');
    ck('切片B-5 坏JSON容错: stale秒回+warn上浮+文件不被改写+桥活', () => {
        C.equal(r2.j.ok, true, 'stale 秒回失效: ' + JSON.stringify(r2.j).slice(0, 120));
        C.ok(w2.j.warnings.some(x => x.includes('skill-sources.json')), JSON.stringify(w2.j.warnings));
        C.equal(FSS.readFileSync(CFG, 'utf8'), '{bad json', '用户文件被改写');
    });
    await stopBridge(child); child = null;

    // V3 空数组（任务容错矩阵：空数组=坏配置→回落内置默认，市场不清空；用户主动关源走条目 enabled:false）
    seedStale();
    FSS.writeFileSync(CFG, JSON.stringify({ _schema: 1, sources: [] }));
    child = spawnBridge(SBB);
    await waitHealth();
    const r3 = await getJson('/api/skillstore?remote=1');
    const w3 = await getJson('/api/update/status');
    ck('切片B-6 空数组容错: 回落内置默认(warn)+stale秒回+坏配置不追加(仅schema升级, P2-2边界)', () => {
        C.equal(r3.j.ok, true, 'stale 秒回失效');
        C.ok(w3.j.warnings.some(x => x.includes('没有有效源')), JSON.stringify(w3.j.warnings));
        C.deepEqual(readJ(CFG), { _schema: 2, sources: [] }, JSON.stringify(readJ(CFG))); // 迁移管线升 _schema 但不往坏配置追加 baoyu，条目原样
    });
    await stopBridge(child); child = null;

    // V4 缺 branch 条目（bogus repo 可区分「回落默认」与「误用坏条目」）→ warn 回落 + 文件不动（独立桥进程防 warn 串扰）
    seedStale();
    FSS.writeFileSync(CFG, JSON.stringify({ _schema: 1, sources: [{ repo: 'ghost-org/ghost-repo' }] }));
    child = spawnBridge(SBB);
    await waitHealth();
    const r4 = await getJson('/api/skillstore?remote=1');
    const w4 = await getJson('/api/update/status');
    ck('切片B-7 缺branch容错: stale秒回+warn回落内置默认+坏条目不追加(仅schema升级, P2-2边界)', () => {
        C.equal(r4.j.ok, true, 'stale 秒回失效');
        C.ok(w4.j.warnings.some(x => x.includes('没有有效源')), JSON.stringify(w4.j.warnings));
        C.deepEqual(readJ(CFG), { _schema: 2, sources: [{ repo: 'ghost-org/ghost-repo' }] }, JSON.stringify(readJ(CFG)));
    });
    await stopBridge(child); child = null;

    // V4b qa返工(P2-2): 存量单源升级——迁移补第二源 baoyu（合法配置才追加）+留档；重启幂等（不重复追加/无新备份/内容一致）
    seedStale();
    FSS.writeFileSync(CFG, JSON.stringify({ _schema: 1, sources: [{ repo: 'anthropics/skills', branch: 'main', subdir: 'skills', enabled: true }] }));
    const cfgBaks = () => FSS.readdirSync(path.dirname(CFG)).filter(n => n.includes('skill-sources.json.pre-migration-')).length; // 沙盒含 B-6/B-7 遗留留档，只断增量
    const baks0 = cfgBaks();
    child = spawnBridge(SBB);
    await waitHealth();
    const cfgUp = readJ(CFG);
    ck('切片B-7b 存量单源升级: 迁移追加baoyu(原条目保留+_schema升2+留档+1份)', () => {
        C.deepEqual(cfgUp, { _schema: 2, sources: [
            { repo: 'anthropics/skills', branch: 'main', subdir: 'skills', enabled: true },
            { repo: 'JimLiu/baoyu-skills', branch: 'main', subdir: 'skills', enabled: true },
        ] }, JSON.stringify(cfgUp));
        C.equal(cfgBaks(), baks0 + 1, '备份 count=' + cfgBaks() + ' base=' + baks0);
    });
    await stopBridge(child); child = null;
    child = spawnBridge(SBB);
    await waitHealth();
    ck('切片B-7c 升级幂等: 重启不重复追加/无新备份/内容一致', () => {
        C.equal(cfgBaks(), baks0 + 1, '新增备份 count=' + cfgBaks() + ' base=' + baks0);
        C.equal(JSON.stringify(readJ(CFG)), JSON.stringify(cfgUp), '内容漂移');
    });
    await stopBridge(child); child = null;

    // V5 多源同名 dir：两份相同源 → 先到保留后到跳过（在线: 响应无重复+日志留痕+source 归属; 离线: ok:false 友好也算过）
    FSS.writeFileSync(CFG, JSON.stringify({ _schema: 1, sources: [
        { repo: 'anthropics/skills', branch: 'main', subdir: 'skills', enabled: true },
        { repo: 'anthropics/skills', branch: 'main', subdir: 'skills', enabled: true },
    ] }));
    try { FSS.unlinkSync(MF_B); } catch {}
    child = spawnBridge(SBB);
    await waitHealth();
    const r5 = await getJson('/api/skillstore?remote=1', 120000);
    let online = false;
    ck('切片B-8 多源同名dir: 先到保留后到跳过(在线:无重复+留痕;离线:友好失败也算过)', () => {
        if (r5.j.ok === true) {
            online = true;
            const dirs = r5.j.skills.map(s => s.dir);
            C.ok(dirs.length > 0, '空清单');
            C.equal(new Set(dirs).size, dirs.length, '重复 dir: ' + dirs.join(','));
            C.ok(child.tail.buf.includes('skill source dup skip'), '无跳过留痕');
        } else {
            C.ok(/技能源拉取失败/.test(String(r5.j.err)), '离线失败路径非友好: ' + JSON.stringify(r5.j).slice(0, 120));
            console.log('NOTE: 切片B-8/9 出网不可达，走失败路径条款（旧缓存保留不阻塞）');
        }
    });
    ck('切片B-9 (在线)清单条目均带 source{repo,branch}（双源仓, P2-2）', () => {
        if (!online) return; // 离线时随 B-8 失败路径条款通过
        for (const s of r5.j.skills) {
            C.ok(s.source && ['anthropics/skills', 'JimLiu/baoyu-skills'].includes(s.source.repo) && s.source.branch === 'main', s.dir + ' ' + JSON.stringify(s.source));
        }
    });
    await stopBridge(child); child = null;
    } // 场景B end

    // ================= 场景C（s70 B2）：subdir 白名单 + source.subdir 记录（.skill-sb-b 复用） =================
    if (SCENE.includes('c')) {
    await rmSandbox(SBB);
    seedBase(SBB);
    const CFG_C = J(SBB, ['data', 'config', 'skill-sources.json']);
    const MF_C = J(SBB, ['data', 'cache', 'skills', 'manifest.json']);
    const seedStaleC = () => FSS.writeFileSync(MF_C, JSON.stringify({
        _schema: 2, fetched_at: OLD_FETCHED, translating: false,
        skills: [{ dir: 'alpha', name: 'alpha', description: 'd1', desc_zh: '甲', source: { repo: 'anthropics/skills', branch: 'main' } }],
    }));
    // C1-C4: subdir 白名单矩阵——../绝对路径/盘符/尾斜杠 → 整条源拒用（warn 回落内置默认）+ 用户文件不动 + 桥活
    const BADS = [
        ['C-1 subdir .. 拒用', { repo: 'anthropics/skills', branch: 'main', subdir: 'skills/../..' }],
        ['C-2 subdir 绝对路径拒用', { repo: 'anthropics/skills', branch: 'main', subdir: '/abs/skills' }],
        ['C-3 subdir 盘符拒用', { repo: 'anthropics/skills', branch: 'main', subdir: 'C:/skills' }],
        ['C-4 subdir 尾斜杠拒用', { repo: 'anthropics/skills', branch: 'main', subdir: 'skills/' }],
    ];
    for (const [name, bad] of BADS) {
        seedStaleC();
        FSS.mkdirSync(path.dirname(CFG_C), { recursive: true });
        FSS.writeFileSync(CFG_C, JSON.stringify({ _schema: 1, sources: [bad] }));
        child = spawnBridge(SBB);
        await waitHealth();
        const rc = await getJson('/api/skillstore?remote=1');
        const wc = await getJson('/api/update/status');
        ck('B2-' + name + ': warn回落内置默认+stale秒回+坏条目不追加(仅schema升级, P2-2边界)', () => {
            C.equal(rc.j.ok, true, 'stale 秒回失效');
            C.ok(wc.j.warnings.some(x => x.includes('没有有效源')), JSON.stringify(wc.j.warnings));
            C.deepEqual(readJ(CFG_C), { _schema: 2, sources: [bad] }, JSON.stringify(readJ(CFG_C)));
        });
        await stopBridge(child); child = null;
    }
    // C5: 合法 subdir + 空串 subdir → 收用零 warn（空串回落内置 'skills'）
    FSS.writeFileSync(CFG_C, JSON.stringify({ _schema: 1, sources: [
        { repo: 'anthropics/skills', branch: 'main', subdir: 'skills', enabled: true },
        { repo: 'ghost-org/ghost-repo', branch: 'main', subdir: '', enabled: true },
    ] }));
    child = spawnBridge(SBB);
    await waitHealth();
    const wc5 = await getJson('/api/update/status');
    ck('B2-C5 subdir 合法+空串收用: 零warn（空串回落默认，合法值原样使用）', () => {
        C.equal(wc5.j.warnings.filter(x => x.includes('skill-sources.json')).length, 0, JSON.stringify(wc5.j.warnings));
    });
    await stopBridge(child); child = null;

    // C6-C8: 安装链 source.subdir（离线走缓存复制路径，零出网）
    seedStaleC();
    const ent = (dir, source) => ({ dir, name: dir, description: 'd-' + dir, desc_zh: null, source });
    FSS.writeFileSync(MF_C, JSON.stringify({
        _schema: 2, fetched_at: OLD_FETCHED, translating: false,
        skills: [
            ent('fuzz-sub-tmp', { repo: 'JimLiu/baoyu-skills', branch: 'main', subdir: 'skills' }), // B2 新形态：带 subdir
            ent('fuzz-legacy-tmp', { repo: 'anthropics/skills', branch: 'main' }), // 旧形态：缺 subdir 键
        ],
    }));
    for (const d of ['fuzz-sub-tmp', 'fuzz-legacy-tmp']) {
        FSS.mkdirSync(J(SBB, ['data', 'cache', 'skills', d]), { recursive: true });
        FSS.writeFileSync(J(SBB, ['data', 'cache', 'skills', d, 'SKILL.md']), '---\nname: ' + d + '\ndescription: d\n---\nbody\n');
    }
    child = spawnBridge(SBB); // 配置缺省→首启生成内置默认（anthropics 源在册，legacy 条目 subdir 从配置回落）
    await waitHealth();
    const post = body => new Promise((resolve, reject) => {
        const rq = require('http').request({ host: '127.0.0.1', port: PORT, path: '/api/skillstore', method: 'POST', headers: { 'content-type': 'application/json' } }, r2 => {
            let b = ''; r2.on('data', c => b += c); r2.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        }); rq.on('error', reject); rq.end(body);
    });
    await post(JSON.stringify({ name: 'fuzz-sub-tmp', remote: true }));
    const o1 = readJ(J(SBB, ['.agents', 'skills', 'fuzz-sub-tmp', 'origin.json']));
    ck('B2-C6 manifest source.subdir 随装进 origin.json（repo/subdir 同记录）', () => {
        C.equal(o1.source, 'market', JSON.stringify(o1));
        C.equal(o1.repo, 'JimLiu/baoyu-skills', JSON.stringify(o1));
        C.equal(o1.subdir, 'skills', 'subdir 未随装: ' + JSON.stringify(o1));
    });
    // C7: origin.json 带 subdir → originOf 照常解析（/api/skills 暴露非空）+ market 冲突门放行（覆盖=更新语义不受 subdir 键影响）
    const api1 = await getJson('/api/skills');
    ck('B2-C7 origin 带 subdir 解析容错: /api/skills 暴露+冲突门放行', () => {
        const t = api1.j.find(x => x.name === 'fuzz-sub-tmp');
        C.ok(t && t.origin && t.origin.source === 'market' && t.origin.repo === 'JimLiu/baoyu-skills', JSON.stringify(t));
    });
    await post(JSON.stringify({ name: 'fuzz-sub-tmp', remote: true })); // market-over-market 第二次装=更新语义（冲突门未拒）
    ck('B2-C7b market origin（带 subdir）覆盖放行: 重装 ok 且 origin 仍在', () => {
        const o = readJ(J(SBB, ['.agents', 'skills', 'fuzz-sub-tmp', 'origin.json']));
        C.equal(o.source, 'market', JSON.stringify(o));
    });
    // C8: 旧 manifest source 缺 subdir 键 → 安装照常解析（subdir 从当前配置该源回落）
    await post(JSON.stringify({ name: 'fuzz-legacy-tmp', remote: true }));
    const o2 = readJ(J(SBB, ['.agents', 'skills', 'fuzz-legacy-tmp', 'origin.json']));
    ck('B2-C8 旧 source 缺 subdir 键照常解析: 安装成功+subdir 从配置回落', () => {
        C.equal(o2.repo, 'anthropics/skills', JSON.stringify(o2));
        C.equal(o2.subdir, 'skills', 'subdir 未回落: ' + JSON.stringify(o2));
    });
    // 卸载随删（origin 随目录消失，B2 记录不留残留）
    await post(JSON.stringify({ name: 'fuzz-sub-tmp', op: 'uninstall' }));
    await post(JSON.stringify({ name: 'fuzz-legacy-tmp', op: 'uninstall' }));
    ck('B2-C9 卸载随删: 安装目录（含 origin subdir 记录）消失', () => {
        C.equal(FSS.existsSync(J(SBB, ['.agents', 'skills', 'fuzz-sub-tmp'])), false);
        C.equal(FSS.existsSync(J(SBB, ['.agents', 'skills', 'fuzz-legacy-tmp'])), false);
    });
    await stopBridge(child); child = null;
    } // 场景C end

    for (const sb of [SBA, SBB]) { try { await rmSandbox(sb); } catch {} } // 沙箱自清（同 report-probe 先例）
    console.log('==============================');
    console.log('skill-sources probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('probe fatal:', e.message); if (child) stopBridge(child); process.exit(1); });
