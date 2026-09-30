// s106/C5b 独立验证（红绿对照）：upgradeEvents.lastSeen 跨天持久——「重启进新日期」路径补齐。
// 缺陷形状（s106 取证）：statsBump 跨天行保留 lastSeen 只覆盖进程内跨午夜；桥重启进新日期时当日文件
// 尚无，statsRestore else 分支从默认空指纹起步 → L285 开机对账把陈旧 status.json 终态重计一次 fail
// （09-22 测试残留冻结 9 天=每天 +1 幻影，与「start/fail 日日涨、lastSeen 不动」实录自洽）。
// 断言面：①红臂（HEAD）陈旧终态重计 fail+1；②绿臂（本批）从昨日文件带回 lastSeen 不重计；③真实新终态
// （新 ts）绿臂照常计数（不过度抑制）；④当日文件在场（同日重启）两臂都不重计（既有行为保持）。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const TPL = path.join(__dirname, '..', 'forge', 'conf', 'templates', 'chat-bridge.tpl.js');
const tpl = fs.readFileSync(TPL, 'utf8');
const BASE = process.env.S106_BASE || 'HEAD'; // 提交后复现红臂：S106_BASE=<修前 commit> node tmp/s106-g3-stats-lastseen.js
const head = cp.execSync('git show ' + BASE + ':forge/conf/templates/chat-bridge.tpl.js', { cwd: path.join(__dirname, '..'), maxBuffer: 32 * 1024 * 1024 }).toString();
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const FP_STALE = '1790104669529|failed'; // 2026-09-22T19:17:49.529Z 实录指纹
const STALE_STATUS = { stage: 'failed', ok: false, ts: 1790104669529, msg: '暂存包不存在: PocketForge-preupgradetest-0.0.3.zip' };

function buildArm(src, label) {
    // 提取两枚函数体：statsRestore IIFE + noteUpgradeStatus（锚定原文，模板漂移显式报错）
    const restoreM = src.match(/\(function statsRestore\(\) \{[\s\S]*?\}\)\(\);/);
    const noteM = src.match(/function noteUpgradeStatus\(st\) \{[\s\S]*?\n\}/);
    if (!restoreM || !noteM) throw new Error(label + ' 函数锚提取失败');
    return { restoreSrc: restoreM[0], noteSrc: noteM[0], label };
}

// 桩 statsBump 与桥内同语义（点路径导航+递增），另记 bumps 明细
const mkBump = (stats, bumps) => k => { const seg = k.split('.'); let o = stats; for (const s of seg.slice(0, -1)) o = o[s]; const last = seg[seg.length - 1]; o[last] = (o[last] || 0) + 1; bumps.push(k); };
function runScenario(arm, fixtureYesterday) {
    const SB = path.join(__dirname, 's106-g3-sb');
    fs.rmSync(SB, { recursive: true, force: true });
    fs.mkdirSync(path.join(SB, 'stats'), { recursive: true });
    const yesterday = new Date(Date.now() - 86400000);
    const p2 = n => String(n).padStart(2, '0');
    const ymd = yesterday.getFullYear() + p2(yesterday.getMonth() + 1) + p2(yesterday.getDate());
    const ydate = yesterday.getFullYear() + '-' + p2(yesterday.getMonth() + 1) + '-' + p2(yesterday.getDate());
    if (fixtureYesterday) fs.writeFileSync(path.join(SB, 'stats', 'usage-' + ymd + '.json'), JSON.stringify({ date: ydate, upgradeEvents: { start: 80, ok: 0, fail: 22, lastSeen: FP_STALE } }));
    // 桩环境（与桥内同名同形）
    const stats = { date: '', upgradeEvents: { start: 0, ok: 0, fail: 0, lastSeen: '' }, errorsByType: {}, permissionCards: {} };
    const bumps = [];
    const env = {
        stats, path, FSS: fs,
        STATS_DIR: path.join(SB, 'stats'),
        statsDay: () => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); },
        readJson: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } },
        statsFlush: () => {},
        statsBump: mkBump(stats, bumps),
        statsFlushDebounced: () => {},
    };
    const restore = new Function(...Object.keys(env), arm.restoreSrc);
    const note = new Function(...Object.keys(env), arm.noteSrc + '\nreturn noteUpgradeStatus;');
    restore(...Object.values(env));
    note(...Object.values(env))(STALE_STATUS); // L285 开机对账等价：陈旧终态
    return { stats, bumps, SB };
}

const headArm = buildArm(head, 'HEAD');
const curArm = buildArm(tpl, 'CUR');

// ① 红臂：无补运 → 空指纹起步 → 陈旧终态重计
let r = runScenario(headArm, true);
ok(r.stats.upgradeEvents.fail === 1 && r.bumps.indexOf('upgradeEvents.fail') >= 0, '红臂 陈旧终态被重计 fail+1（每天首个桥进程 +1 幻影的修前形状）: fail=' + r.stats.upgradeEvents.fail);
ok(r.stats.upgradeEvents.lastSeen === FP_STALE, '红臂 重计后 lastSeen=陈旧指纹（「lastSeen 冻结在 09-22 而 fail 日日涨」自洽）');

// ② 绿臂：昨日文件带回 lastSeen → 不重计
r = runScenario(curArm, true);
ok(r.stats.upgradeEvents.fail === 0 && r.bumps.length === 0, '绿臂 昨日 lastSeen 带回，陈旧终态不重计（fail=0, bumps=0）');
ok(r.stats.upgradeEvents.lastSeen === FP_STALE, '绿臂 lastSeen 指纹保持（对账仍发生，只是不计数）');

// ③ 绿臂不过度抑制：真实新终态（新 ts）照常计数
const r2sb = (() => {
    const rr = runScenario(curArm, true);
    return rr;
})();
// 新终态走同一 noteUpgradeStatus——ts 不同=新指纹
const NEW_STATUS = { stage: 'failed', ok: false, ts: 1790104669999, msg: '新失败' };
(function () {
    const { stats } = r2sb; // 复用绿臂已 restore 的桩（stats 已带 lastSeen）
    const bumps2 = [];
    const noteFn = new Function('stats', 'statsBump', 'statsFlushDebounced', tpl.match(/function noteUpgradeStatus\(st\) \{[\s\S]*?\n\}/)[0] + '\nreturn noteUpgradeStatus;')(stats, mkBump(stats, bumps2), () => {});
    noteFn(NEW_STATUS);
    ok(stats.upgradeEvents.fail === 1 && bumps2.indexOf('upgradeEvents.fail') >= 0, '绿臂 真实新终态（新 ts）照常计 fail+1（不过度抑制）');
    noteFn(NEW_STATUS);
    ok(stats.upgradeEvents.fail === 1, '绿臂 同指纹二次观察不重计（指纹去重既有语义保持）');
})();

// ④ 当日文件在场（同日重启）既有行为保持：两臂都不重计
function runSameDay(arm) {
    const rr = runScenario(arm, true);
    // 把「当日文件」补进场再跑一次 restore（模拟同日重启：readJson 命中今日文件带回 lastSeen）
    const p2 = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    fs.writeFileSync(path.join(rr.SB, 'stats', 'usage-' + today.replace(/-/g, '') + '.json'), JSON.stringify({ date: today, upgradeEvents: { start: 1, ok: 0, fail: 5, lastSeen: FP_STALE } }));
    const stats2 = { date: '', upgradeEvents: { start: 0, ok: 0, fail: 0, lastSeen: '' }, errorsByType: {}, permissionCards: {} };
    const bumps2 = [];
    const env = {
        stats: stats2, path, FSS: fs, STATS_DIR: path.join(rr.SB, 'stats'),
        statsDay: () => today, readJson: (f, dd) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dd; } },
        statsFlush: () => {}, statsBump: mkBump(stats2, bumps2), statsFlushDebounced: () => {},
    };
    new Function(...Object.keys(env), arm.restoreSrc)(...Object.values(env));
    new Function(...Object.keys(env), arm.noteSrc + '\nreturn noteUpgradeStatus;')(...Object.values(env))(STALE_STATUS);
    return { stats: stats2, bumps: bumps2, SB: rr.SB };
}
let rsd = runSameDay(headArm);
ok(rsd.stats.upgradeEvents.fail === 5 && rsd.bumps.length === 0, '红臂 同日重启（当日文件在场）不重计（s99 以来既有行为，本批不动）');
rsd = runSameDay(curArm);
ok(rsd.stats.upgradeEvents.fail === 5 && rsd.bumps.length === 0, '绿臂 同日重启行为保持（fail=5 原样带回零 bump）');

fs.rmSync(path.join(__dirname, 's106-g3-sb'), { recursive: true, force: true });
console.log('RESULT g3: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
