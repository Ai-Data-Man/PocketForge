// 技能市场源配置化探针（s70 切片B，docs/verdicts/2026-09-05-marketplace-ecosystem.md S2，9 ck）
// 场景A（迁移，端口 18795 自建 tools/e2e/.skill-sb-a）：存量 manifest v1→v2 条目补 source{repo,branch}+留档+幂等（3 ck）
// 场景B（配置，同端口自建 .skill-sb-b）：首启生成默认/坏 JSON 容错/空数组零源/缺 branch 回落/多源同名跳过（6 ck）
// 全部断言不依赖出网（多源合并项在线增强、离线走「失败路径也算过」裁决条款）；不依赖 dev 栈、不碰 8790。
// 沙盒跑完自清；goose.exe 硬链接（同卷零拷贝，桥启动需 spawn goose）。
// 用法：node tools/e2e/skill-sources-probe.js [a|b]   （缺省 a+b 全跑，实测约 30-60s，在线多源合并 +30s；fuzz-chat.sh 按 a/b 两行接入）
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
const DFT_CFG = { _schema: 1, sources: [{ repo: 'anthropics/skills', branch: 'main', subdir: 'skills', enabled: true }] };
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
    if (!SCENE.includes('b')) {
        for (const sb of [SBA, SBB]) { try { await rmSandbox(sb); } catch {} }
        console.log('skill-sources probe: PASS=' + pass + ' FAIL=' + fail);
        process.exit(fail ? 1 : 0);
    }
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
    ck('切片B-6 空数组容错: 回落内置默认(warn)+stale秒回+文件不动', () => {
        C.equal(r3.j.ok, true, 'stale 秒回失效');
        C.ok(w3.j.warnings.some(x => x.includes('没有有效源')), JSON.stringify(w3.j.warnings));
        C.equal(FSS.readFileSync(CFG, 'utf8'), '{"_schema":1,"sources":[]}', '用户文件被改写');
    });
    await stopBridge(child); child = null;

    // V4 缺 branch 条目（bogus repo 可区分「回落默认」与「误用坏条目」）→ warn 回落 + 文件不动（独立桥进程防 warn 串扰）
    seedStale();
    FSS.writeFileSync(CFG, JSON.stringify({ _schema: 1, sources: [{ repo: 'ghost-org/ghost-repo' }] }));
    child = spawnBridge(SBB);
    await waitHealth();
    const r4 = await getJson('/api/skillstore?remote=1');
    const w4 = await getJson('/api/update/status');
    ck('切片B-7 缺branch容错: stale秒回+warn回落内置默认+文件不动', () => {
        C.equal(r4.j.ok, true, 'stale 秒回失效');
        C.ok(w4.j.warnings.some(x => x.includes('没有有效源')), JSON.stringify(w4.j.warnings));
        C.equal(FSS.readFileSync(CFG, 'utf8'), JSON.stringify({ _schema: 1, sources: [{ repo: 'ghost-org/ghost-repo' }] }), '用户文件被改写');
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
    ck('切片B-9 (在线)清单条目均带 source{repo,branch}', () => {
        if (!online) return; // 离线时随 B-8 失败路径条款通过
        for (const s of r5.j.skills) C.deepEqual(s.source && { repo: s.source.repo, branch: s.source.branch }, { repo: 'anthropics/skills', branch: 'main' }, s.dir);
    });
    await stopBridge(child); child = null;

    for (const sb of [SBA, SBB]) { try { await rmSandbox(sb); } catch {} } // 沙箱自清（同 report-probe 先例）
    console.log('==============================');
    console.log('skill-sources probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('probe fatal:', e.message); if (child) stopBridge(child); process.exit(1); });
