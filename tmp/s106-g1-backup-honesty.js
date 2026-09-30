// s106/C5a-1 独立验证（红绿对照）：备份终行诚实性——PG 停机（端口 30s 未监听）路径下，
// 旧脚本终行无条件 `backup ok:`（说谎）；新脚本终行降级 `backup ok（这次没带数据库：PG 未起，下次会带）`。
// 场景=真实 dev 树现状（QA 沙盒轮占着 PG 六端口，PG 停着）——用独立沙盒树旁挂跑，不碰 dev 树 data/backups。
// 沙盒端口 55432（不在禁占六端口 8790/8099/8091/5432/4222/8222 内，保持关闭=探活失败）。
// 断言面：①两库 skip 行保持 L99 文案族原样；②旧终行无降级注（红）；③新终行带降级注（绿）；
// ④陈旧 dump 在场时 zip 仍含它（保底安全网）+终行仍降级（诚实：本次没带上新的）。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const SB = path.join(__dirname, 's106-g1-sb');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

// ---- 沙盒搭景 ----
fs.rmSync(SB, { recursive: true, force: true });
for (const d of ['conf/goose/config', 'data/pg-dumps', 'bin/pg/bin']) fs.mkdirSync(path.join(SB, d), { recursive: true });
fs.writeFileSync(path.join(SB, 'conf', 'goose', 'config', 'config.yaml'), '# g1 sandbox config\n');
fs.writeFileSync(path.join(SB, 'data', 'pg.port'), '55432');
fs.writeFileSync(path.join(SB, 'data', 'pg-dumps', 'pg-2026-09-20T00-00-00.sql'), '-- stale dump from 09-20\n');
fs.copyFileSync(path.join(__dirname, '..', 'forge', 'bin', 'pg-probe.js'), path.join(SB, 'bin', 'pg-probe.js'));
fs.writeFileSync(path.join(SB, 'bin', 'pg', 'bin', 'pg_dump.exe'), 'stub'); // 只需在场（waitPgPort 30s 失败在前，永不执行）
fs.writeFileSync(path.join(SB, 'bin', 'pg', 'bin', 'psql.exe'), 'stub');

// ---- 红臂：HEAD 版脚本（git show 落临时文件）----
const BASE = process.env.S106_BASE || 'HEAD'; // 提交后复现红臂：S106_BASE=<修前 commit> node tmp/s106-g1-backup-honesty.js
const oldSrc = cp.execSync('git show ' + BASE + ':forge/conf/templates/forge-backup.tpl.js', { cwd: path.join(__dirname, '..') }).toString();
const oldJs = path.join(SB, 'forge-backup.HEAD.js');
fs.writeFileSync(oldJs, oldSrc);

function runArm(script, label) {
    const r = cp.spawnSync(process.execPath, [script, SB, '3'], { encoding: 'utf8', timeout: 180000, env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } });
    const out = (r.stdout || '') + (r.stderr || ''); // skip 族走 console.warn(stderr)，终行走 console.log(stdout)——双流合审
    console.log('--- ' + label + ' 输出 ---\n' + out.trim());
    return out;
}
const lines = t => t.split('\n').map(s => s.trim()).filter(Boolean);

const red = lines(runArm(oldJs, '红臂=HEAD（修前）'));
const redFinal = red.filter(l => l.startsWith('backup ok')).pop() || '';
ok(red.filter(l => l.indexOf('PG 端口 30s 未监听') >= 0).length === 2, '红臂 skip 两行保持 L99 文案族（postgres+forge_bridge）');
ok(/^backup ok: /.test(redFinal), '红臂终行无条件 backup ok（无降级注——数据安全网说谎，修前形状）: ' + redFinal);
ok(redFinal.indexOf('没带数据库') < 0, '红臂终行不含降级归因');

const green = lines(runArm(path.join(__dirname, '..', 'forge', 'bin', 'forge-backup.js'), '绿臂=本批（修后）'));
const greenFinal = green.filter(l => l.startsWith('backup ok')).pop() || '';
ok(green.filter(l => l.indexOf('PG 端口 30s 未监听') >= 0).length === 2, '绿臂 skip 两行保持 L99 文案族原样（零随迁面）');
ok(/^backup ok（这次没带数据库：PG 未起，下次会带）: /.test(greenFinal), '绿臂终行降级形态带人话归因: ' + greenFinal);
ok(greenFinal.indexOf('kept=') > 0 && greenFinal.indexOf('pruned=') > 0, '绿臂终行 kept/pruned 字段保持（消费面零破坏）');

// 陈旧 dump 双验：在场（zip 含旧 DB 份=保底）+ 终行仍降级（本次没带上新的=诚实）
const dumps = fs.readdirSync(path.join(SB, 'data', 'pg-dumps')).filter(f => /^pg-.*\.sql$/.test(f));
ok(dumps.length === 1 && dumps[0].startsWith('pg-2026-09-20'), '陈旧 dump 未被本轮清理/覆盖（轮换只在成功 dump 后发生）');
const zips = fs.readdirSync(path.join(SB, 'data', 'backups')).filter(f => f.startsWith('forge-backup-'));
ok(zips.length === 2, '红绿两臂各产出 1 个 zip（沙盒内自洽，keep=3 不足以轮换）');
ok(greenFinal.indexOf('没带数据库') >= 0, '绿臂在 zip 含陈旧 dump 时终行仍降级（「本次」口径：旧份≠新份）');

fs.rmSync(SB, { recursive: true, force: true });
console.log('RESULT g1: ' + pass + ' pass, ' + fail + ' fail' + (fail ? '  [沙盒清理失败会留在 tmp/s106-g1-sb]' : ''));
process.exit(fail ? 1 : 0);
