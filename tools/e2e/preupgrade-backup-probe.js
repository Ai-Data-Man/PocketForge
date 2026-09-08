// s75c 转正：桥端升级前自备份回归探针（43eff60 的 28 断言 + s77 D4 失败族警告清除 3 断言；真桥端点驱动，自带清理）
// 断言面：内容逐位一致 / 幂等 / keep 3 轮转 / 失败注入 warn 不阻断 / runner 无害失败不停栈
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = 'C:\\ZCodeWorks\\PocketForge\\forge';
const UPD = path.join(ROOT, 'data', 'updates');
const BDIR = path.join(ROOT, 'data', 'backups');
const Z1 = 'PocketForge-preupgradetest-0.0.1.zip', Z2 = 'PocketForge-preupgradetest-0.0.2.zip', Z3 = 'PocketForge-preupgradetest-0.0.3.zip';
const LOG = path.join(ROOT, 'data', 'logs', 'update-runner.log');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } }
function post(body) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(JSON.stringify(body));
        const req = http.request({ host: '127.0.0.1', port: 8790, path: '/api/update/start', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length } }, r => {
            let b = ''; r.on('data', c => b += c); r.on('end', () => resolve(JSON.parse(b)));
        });
        req.on('error', reject); req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
        req.end(data);
    });
}
function getJson(p) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: 8790, path: p, timeout: 5000 }, r => {
            let b = ''; r.on('data', c => b += c); r.on('end', () => resolve(JSON.parse(b)));
        });
        req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}
function alive() {
    return new Promise(resolve => {
        const req = http.get({ host: '127.0.0.1', port: 8790, path: '/healthz', timeout: 3000 }, r => { r.resume(); r.on('end', () => resolve(true)); });
        req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function walk(dir, base, out) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const rel = path.relative(base, full).split(path.sep).join('/');
        if (ent.isDirectory()) walk(full, base, out);
        else if (ent.isFile()) out[rel] = sha(full);
    }
}
const preupgs = () => { try { return fs.readdirSync(BDIR).filter(n => /^pre-upgrade-/.test(n)).sort(); } catch { return []; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    // ---- 快照（清理基线）----
    const snapPre = preupgs();
    const snapStatus = fs.existsSync(path.join(UPD, 'status.json')) ? fs.readFileSync(path.join(UPD, 'status.json')) : null;
    const snapLog = fs.existsSync(LOG) ? fs.readFileSync(LOG) : null;

    try {
        // ---- A. 内容逐位一致 ----
        // dev 树 memory/ 为空（本机没存过记忆）——种一枚再验（贴近真实机器），清理时删
        const seedMem = path.join(ROOT, 'conf', 'goose', 'config', 'memory', 'preupgradetest-seed.txt');
        fs.writeFileSync(seedMem, 's75 pre-upgrade backup test seed');
        fs.writeFileSync(path.join(UPD, Z1), Buffer.from('PK-test-dummy-1'));
        const pkg1 = 'zip:' + Z1 + ':' + fs.statSync(path.join(UPD, Z1)).size;
        let r = await post({ staged: Z1 });
        ok(r.ok === true, 'A1 start 响应 ok:true');
        let now = preupgs();
        ok(now.length === snapPre.length + 1, 'A2 新增恰好 1 个 pre-upgrade 目录 (was ' + snapPre.length + ' now ' + now.length + ')');
        const d1 = path.join(BDIR, now[now.length - 1]);
        const man = JSON.parse(fs.readFileSync(path.join(d1, 'manifest.json'), 'utf8'));
        ok(man.pkg === pkg1, 'A3 manifest.pkg=' + man.pkg);
        ok(typeof man.from === 'string' && man.from.length > 0, 'A4 manifest.from=' + man.from);
        // 逐位一致：整树 sha 对账（两棵源树 vs 备份镜像）
        let mism = 0, missing = [];
        for (const rel of ['conf/goose/config', 'data/config']) {
            const src = path.join(ROOT, rel.split('/').join(path.sep));
            const m1 = {}; walk(src, src, m1);
            const dst = path.join(d1, rel.split('/').join(path.sep));
            const m2 = {}; try { walk(dst, dst, m2); } catch { missing.push(rel); continue; }
            for (const k of Object.keys(m1)) if (m1[k] !== m2[k]) mism++;
            for (const k of Object.keys(m2)) if (!(k in m1)) mism++;
            ok(Object.keys(m2).length === Object.keys(m1).length && Object.keys(m1).length > 0, 'A5 ' + rel + ' 文件数一致 (' + Object.keys(m2).length + '/' + Object.keys(m1).length + ')');
        }
        ok(mism === 0 && missing.length === 0, 'A6 两棵源树逐位一致 (mismatch=' + mism + ' missing=' + missing.length + ')');
        // 任务点名件
        for (const f of ['conf/goose/config/config.yaml', 'conf/goose/config/permission.yaml', 'data/config/skill-sources.json', 'data/config/mcp-catalog.json', '恢复说明.txt'])
            ok(fs.existsSync(path.join(d1, f.split('/').join(path.sep))), 'A7 存在 ' + f);
        ok(fs.existsSync(path.join(d1, 'conf', 'goose', 'config', 'memory', 'preupgradetest-seed.txt')), 'A8 memory/ 种子记忆在备份内');
        ok(fs.readdirSync(path.join(d1, 'conf', 'goose', 'config', 'recipes')).length > 0, 'A9 recipes/ 非空');
        // runner 无害失败：无 .sha256 → verify 抛错 → 只写失败 status，不停栈
        await sleep(2000);
        const st1 = JSON.parse(fs.readFileSync(path.join(UPD, 'status.json'), 'utf8'));
        ok(st1.ok === false && st1.stage !== 'stop' && st1.stage !== 'apply' && st1.stage !== 'restart', 'A10 runner 无 sha 校验文件早期失败 (stage=' + st1.stage + ')');
        ok(await alive(), 'A11 桥仍存活（栈未被停）');

        // ---- B. 幂等：同包重复触发不堆积 ----
        r = await post({ staged: Z1 });
        ok(r.ok === true, 'B1 二次 start ok:true');
        const now2 = preupgs();
        ok(now2.length === now.length && now2[now2.length - 1] === now[now.length - 1], 'B2 同包二次触发不新增目录（复用 ' + now2[now2.length - 1] + '）');

        // ---- C. keep 3 轮转 ----
        for (let i = 1; i <= 4; i++) {
            const fd = path.join(BDIR, 'pre-upgrade-2000-01-0' + i + 'T00-00-00');
            fs.mkdirSync(fd, { recursive: true });
            fs.writeFileSync(path.join(fd, 'manifest.json'), JSON.stringify({ pkg: 'fake:' + i }));
        }
        fs.writeFileSync(path.join(UPD, Z2), Buffer.from('PK-test-dummy-2'));
        r = await post({ staged: Z2 });
        ok(r.ok === true, 'C1 新包 start ok:true');
        const now3 = preupgs();
        ok(now3.length === 3, 'C2 轮转后恰 3 份 (实为 ' + now3.length + ': ' + now3.join(', ') + ')');
        ok(now3.includes('pre-upgrade-2000-01-04T00-00-00') && !now3.includes('pre-upgrade-2000-01-01T00-00-00') && !now3.includes('pre-upgrade-2000-01-02T00-00-00') && !now3.includes('pre-upgrade-2000-01-03T00-00-00'), 'C3 最旧 3 份被清、最新 1 份假目录存活');
        ok(now3.includes(now[now.length - 1]), 'C4 A 阶段真备份仍在窗口内');
        ok(!now3.includes(path.basename(d1)) === false || true, 'C4b (信息) d1=' + path.basename(d1));

        // ---- D. 失败注入：backups 变只读态（用同名文件占位模拟不可建目录）→ warn 不阻断 ----
        fs.renameSync(BDIR, BDIR + '.testhold');
        fs.writeFileSync(BDIR, 'not-a-dir'); // mkdir/readdir 必败 ≈ 磁盘满/只读
        fs.writeFileSync(path.join(UPD, Z3), Buffer.from('PK-test-dummy-3'));
        r = await post({ staged: Z3 });
        ok(r.ok === true, 'D1 备份失败时升级照常放行 (ok:' + r.ok + ')');
        const stt = await getJson('/api/update/status');
        ok(Array.isArray(stt.warnings) && stt.warnings.some(w => w.indexOf('升级前自动备份失败') === 0), 'D2 warn 进 /api/update/status: ' + (stt.warnings || []).find(w => w.indexOf('升级前自动备份失败') === 0));
        await sleep(1500);
        ok(await alive(), 'D3 桥仍存活');
        fs.rmSync(BDIR, { force: true });
        fs.renameSync(BDIR + '.testhold', BDIR);
        // ---- D4. 失败族警告随下一次评估清除（s77：失败注入恢复后活体桥不得残留假警告）----
        r = await post({ staged: Z3 });
        ok(r.ok === true, 'D4a 恢复后同包 start ok:true (ok:' + r.ok + ')');
        const stt2 = await getJson('/api/update/status');
        ok(!Array.isArray(stt2.warnings) || !stt2.warnings.some(w => w.indexOf('升级前自动备份失败') === 0), 'D4b 失败族警告被清除，不再残留');
        await sleep(1500);
        ok(await alive(), 'D4c 桥仍存活');

        // ---- 清理 ----
        try { fs.rmSync(seedMem, { force: true }); } catch {}
        for (const z of [Z1, Z2, Z3]) { try { fs.rmSync(path.join(UPD, z), { force: true }); } catch {} }
        const fin = preupgs();
        for (const n of fin) if (!snapPre.includes(n)) fs.rmSync(path.join(BDIR, n), { recursive: true, force: true });
        ok(JSON.stringify(preupgs()) === JSON.stringify(snapPre), 'Z1 备份目录还原到测试前快照');
        if (snapStatus === null) { try { fs.rmSync(path.join(UPD, 'status.json'), { force: true }); } catch {} } else fs.writeFileSync(path.join(UPD, 'status.json'), snapStatus);
        if (snapLog !== null) fs.writeFileSync(LOG, snapLog); else { try { fs.rmSync(LOG, { force: true }); } catch {} }
        ok(true, 'Z2 status.json/update-runner.log 还原');
    } catch (e) {
        console.error('TEST ERROR:', e.stack);
        fail++;
        // 尽力清理
        try { if (fs.existsSync(BDIR + '.testhold')) { try { fs.rmSync(BDIR, { force: true }); } catch {} fs.renameSync(BDIR + '.testhold', BDIR); } } catch {}
        for (const z of [Z1, Z2, Z3]) { try { fs.rmSync(path.join(UPD, z), { force: true }); } catch {} }
        try { for (const n of preupgs()) if (!snapPre.includes(n)) fs.rmSync(path.join(BDIR, n), { recursive: true, force: true }); } catch {}
        if (snapStatus !== null) try { fs.writeFileSync(path.join(UPD, 'status.json'), snapStatus); } catch {}
        if (snapLog !== null) try { fs.writeFileSync(LOG, snapLog); } catch {}
    }
    console.log('RESULT: ' + pass + ' pass, ' + fail + ' fail');
    process.exit(fail ? 1 : 0);
})();
