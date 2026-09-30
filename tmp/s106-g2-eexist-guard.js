// s106/C5a-3 独立验证（红绿对照）：preUpgradeBackup 的 mkdir data\backups Windows 瞬态 EEXIST 容忍。
// 实录形状（pc.log 163 枚+drill 13 枚，2026-09-07 s75 至今）：路径签名一致止于 data\backups、夹在成功调用
// 之间、recursive:true 本应容忍——用猴补 mkdirSync 定点复现「抛 EEXIST 但目录确在」的瞬态，验证守卫行为。
// 断言面：①红臂（HEAD 裸调用）瞬态 EEXIST 上抛=备份失败（升级会继续但没备份）；②绿臂（守卫）瞬态容忍
// 备份真正执行；③目录已存在的常规 recursive 行为两臂都不抛（回归基线）；④文件占位（探针 D2 语义）绿臂
// 仍上抛=「升级前自动备份失败」警告保持，绝不允许静默把备份写成跳过。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const TPL = path.join(__dirname, '..', 'forge', 'conf', 'templates', 'chat-bridge.tpl.js');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const cur = fs.readFileSync(TPL, 'utf8');
const BASE = process.env.S106_BASE || 'HEAD'; // 提交后复现红臂：S106_BASE=<修前 commit> node tmp/s106-g2-eexist-guard.js
const head = cp.execSync('git show ' + BASE + ':forge/conf/templates/chat-bridge.tpl.js', { cwd: path.join(__dirname, '..'), maxBuffer: 32 * 1024 * 1024 }).toString();

// 提取两臂的 mkdir 语句（锚=bdir 只出现在 preUpgradeBackup）：守卫形态优先（try 两行），HEAD=裸单行
const grabMkdir = src => {
    const g = src.match(/try \{ FSS\.mkdirSync\(bdir[^\n]*\}\n[^\n]*/);
    if (g) return g[0];
    const b = src.match(/\n\s*FSS\.mkdirSync\(bdir[^\n]*/);
    if (b) return b[0].trim();
    throw new Error('mkdir 语句锚提取失败');
};

function evalArm(stmt, bdir, fakeErr) {
    // 桩 FSS：mkdirSync 在 fakeErr 旗置位时抛定点瞬态（真实 Windows 竞态的形状），其余透传真 fs
    const FSS = { ...fs };
    if (fakeErr) FSS.mkdirSync = () => { const e = new Error("EEXIST: file already exists, mkdir '" + bdir + "'"); e.code = 'EEXIST'; throw e; };
    const fn = new Function('FSS', 'bdir', stmt);
    try { fn(FSS, bdir); return { thrown: null }; } catch (e) { return { thrown: e }; }
}

const SB = path.join(__dirname, 's106-g2-sb');
fs.rmSync(SB, { recursive: true, force: true });
fs.mkdirSync(SB, { recursive: true });

const headStmt = grabMkdir(head);
const curStmt = grabMkdir(cur);
console.log('HEAD 语句: ' + headStmt.replace(/\s+/g, ' ').slice(0, 110));
console.log('本批语句: ' + curStmt.replace(/\s+/g, ' ').slice(0, 110));

// ①③ 真实常规路径：目录已存在，真 fs，两臂都不抛
let r = evalArm(headStmt, SB, false);
ok(r.thrown === null, '红臂 常规基线：目录已存在 recursive 不抛（s75 以来行为保持）');
r = evalArm(curStmt, SB, false);
ok(r.thrown === null, '绿臂 常规基线：目录已存在 recursive 不抛');

// ② 瞬态复现：mkdir 抛 EEXIST 但目录确在
r = evalArm(headStmt, SB, true);
ok(r.thrown && r.thrown.code === 'EEXIST', '红臂 瞬态 EEXIST 上抛（=「升级前自动备份失败（升级会继续）」167 枚实录形状）: ' + (r.thrown && r.thrown.message));
r = evalArm(curStmt, SB, true);
ok(r.thrown === null, '绿臂 瞬态 EEXIST 被容忍，备份继续执行（目录确在=守卫放行）');

// ④ 文件占位（探针 D2 语义保持）：路径是文件时 mkdir 抛 EEXIST，守卫必须仍上抛
const fPath = path.join(SB, 'not-a-dir');
fs.writeFileSync(fPath, 'x');
const FSS2 = { ...fs };
try { FSS2.mkdirSync(fPath, { recursive: true }); ok(false, '绿臂 文件占位基线（真 fs 应抛 EEXIST）'); }
catch (e) {
    ok(e.code === 'EEXIST', '绿臂 文件占位：真 fs recursive 对文件路径仍抛 EEXIST（Node 语义基线）');
    const fn2 = new Function('FSS', 'bdir', curStmt);
    try { fn2(fs, fPath); ok(false, '绿臂 文件占位：守卫应上抛却被吞（D2 语义回归）'); }
    catch (e2) { ok(e2.code === 'EEXIST', '绿臂 文件占位：守卫照常上抛（「升级前自动备份失败」警告保持，绝不静默跳过备份）'); }
}

fs.rmSync(SB, { recursive: true, force: true });
console.log('RESULT g2: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
