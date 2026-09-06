// s75 转交项回归钉子：GET /api/schedules drift 字段两态断言（cf5f250 实施工程师因文件所有权未动 e2e，转测试落桩）。
// 手法同 tools/e2e/ia-logic-probe.js：从 chat-bridge.tpl.js 原文正则锚点逐字提取对账函数
// （readTitle/readIfOk/driftOf），最小沙盒执行——真 fs 只读扫临时目录夹具，无桥无网络不改真文件。
// 断言族（裁决 docs/verdicts/2026-09-07-scheduler-drift-guard.md S1/S4）：
//   T 组 basename 命中两态：一致=false / 差一字=true / 还原=false（活性对照）
//   兜底组 basename 落空+title 唯一命中（实态形：副本名=schedule id ≠ 源配方名）仍两态，含 \\?\ 前缀剥离
//   F 组静默 false 家族：title 多匹配/源被删/副本读不到/base_dir 缺失或不存在/非法条目——宁漏报不误报，不告警不炸
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const tpl = fs.readFileSync(__dirname + '/../../forge/conf/templates/chat-bridge.tpl.js', 'utf8');
function grab(re, label) { const m = tpl.match(re); if (!m) { console.error('NOT FOUND: ' + label); process.exit(1); } return m[0]; }

// 稳定锚点=函数头签名+尾部 catch 字面量（模板漂移→NOT FOUND 显式失败，不误报）
const readTitleSrc = grab(/function readTitle\(source\) \{[\s\S]*?catch \{ return null; \}\n\s*\}/, 'readTitle');
const readIfOkSrc = grab(/function readIfOk\(p\) \{[^\n]*\}/, 'readIfOk');
const driftOfSrc = grab(/function driftOf\(j\) \{[\s\S]*?catch \{ return false; \}\n\s*\}/, 'driftOf');

// 沙盒：真 fs 只读（readFileSync/readdirSync）+真 path，只碰下方临时夹具目录
const FSS = { readFileSync: fs.readFileSync, readdirSync: fs.readdirSync };
const drift = new Function('FSS', 'path',
    [readTitleSrc, readIfOkSrc, driftOfSrc, 'return { driftOf: driftOf, readTitle: readTitle };'].join('\n')
)(FSS, path);

let pass = 0, fail = 0;
function ck(name, cond) { console.log((cond ? 'PASS: ' : 'FAIL: ') + name); cond ? pass++ : fail++; }
const safe = v => { try { return drift.driftOf(v); } catch (e) { return 'THREW: ' + e.message; } };

// ---- 临时夹具：recipes/（=recipe_base_dir）+ scheduled_recipes/（注册副本目录），形制对齐实态 ----
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-drift-'));
const RECIPES = path.join(TMP, 'recipes');
const COPIES = path.join(TMP, 'scheduled_recipes');
const TITLE = '每日记忆自检';
const SRC_A = 'title: 同名任务\ncontext: []\ninstructions: 每天跑一次\nsettings:\n  max_turns: 10\n';
const SRC_B = 'title: ' + TITLE + '\ndescription: 验证用\ninstructions: 检查记忆\nsettings:\n  max_turns: 10\n';
const COPY_B_STALE = 'title: ' + TITLE + '\ndescription: 验证用\ninstructions: 检查记忆\n'; // 注册快照无 settings 块——实态漂移形
const SRC_A_PATH = path.join(RECIPES, 'alpha.yaml');
const SRC_B_PATH = path.join(RECIPES, 'daily-memory-check.yaml');
const COPY_A_PATH = path.join(COPIES, 'alpha.yaml');
const COPY_B_PATH = path.join(COPIES, 'daily-mem.yaml'); // 副本名=schedule id，≠源配方名（实态）
function entry(copyName, baseDir) {
    return { id: copyName.replace(/\.yaml$/, ''), cron: '0 9 * * *', paused: false,
        source: path.join(COPIES, copyName), recipe_base_dir: baseDir };
}

try {
    fs.mkdirSync(RECIPES, { recursive: true });
    fs.mkdirSync(COPIES, { recursive: true });
    fs.writeFileSync(SRC_A_PATH, SRC_A);
    fs.writeFileSync(COPY_A_PATH, SRC_A);
    fs.writeFileSync(SRC_B_PATH, SRC_B);
    fs.writeFileSync(COPY_B_PATH, COPY_B_STALE);

    ck('T0 提取健全: readTitle 读出 title 字段', drift.readTitle(SRC_B_PATH) === TITLE);

    // ===== T 组：basename 命中路径两态 =====
    ck('T1 basename 命中: 源副本内容一致 → drift=false', safe(entry('alpha.yaml', RECIPES)) === false);
    fs.writeFileSync(SRC_A_PATH, SRC_A.replace('max_turns: 10', 'max_turns: 11'));
    ck('T2 basename 命中: 内容差一字 → drift=true', safe(entry('alpha.yaml', RECIPES)) === true);
    fs.writeFileSync(SRC_A_PATH, SRC_A);
    ck('T3 活性对照: 源还原 → drift=false（钉子非恒 false）', safe(entry('alpha.yaml', RECIPES)) === false);

    // ===== 兜底组：basename 落空+title 唯一命中（副本名=id ≠ 源配方名）=====
    ck('T4 title 兜底: 副本旧快照（无 settings 块，实态漂移形）→ drift=true', safe(entry('daily-mem.yaml', RECIPES)) === true);
    ck('T5 title 兜底: recipe_base_dir 带 \\\\\\?\\ 前缀（实态形）剥前缀照常 → drift=true', safe(entry('daily-mem.yaml', '\\\\?\\' + RECIPES)) === true);
    fs.writeFileSync(COPY_B_PATH, SRC_B);
    ck('T6 title 兜底: 副本同步源内容 → drift=false（S4 闸等价：防常驻误报）', safe(entry('daily-mem.yaml', RECIPES)) === false);

    // ===== F 组：静默 false 家族（须在「有漂移但该静默」的态上验）=====
    fs.writeFileSync(COPY_B_PATH, COPY_B_STALE);
    fs.writeFileSync(path.join(RECIPES, 'dup-title.yaml'), 'title: ' + TITLE + '\ndescription: 同题另一份\n');
    ck('F1 title 多匹配（同题歧义）→ 静默 false', safe(entry('daily-mem.yaml', RECIPES)) === false);
    fs.unlinkSync(path.join(RECIPES, 'dup-title.yaml'));
    ck('F1b 对照: 歧义源移除后同态漂移复现 → true（证 F1 的 false 系歧义所致）', safe(entry('daily-mem.yaml', RECIPES)) === true);
    fs.renameSync(SRC_B_PATH, path.join(TMP, 'stashed-src.yaml'));
    ck('F2 源被删（title 无匹配，目录余他配方）→ 静默 false', safe(entry('daily-mem.yaml', RECIPES)) === false);
    fs.renameSync(path.join(TMP, 'stashed-src.yaml'), SRC_B_PATH);
    ck('F2b 对照: 源还原 → 漂移复现 true（证 F2 的 false 系源被删所致）', safe(entry('daily-mem.yaml', RECIPES)) === true);
    ck('F3 副本读不到（source 指向不存在文件）→ 静默 false（活体读不到不算漂移）', safe(entry('ghost.yaml', RECIPES)) === false);
    ck('F4 recipe_base_dir 缺失 → 静默 false', safe({ id: 'x', cron: '0 9 * * *', source: COPY_B_PATH }) === false);
    ck('F5 非法条目（null/非字符串字段）→ 静默 false 不炸', safe(null) === false && safe({ source: 123, recipe_base_dir: RECIPES }) === false && safe({ source: COPY_B_PATH, recipe_base_dir: 789 }) === false);
    ck('F6 base_dir 目录不存在（readdir 抛）→ 静默 false', safe(entry('daily-mem.yaml', path.join(TMP, 'no-such-dir'))) === false);
} finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
}
console.log('==============================');
console.log('sched-drift-probe: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
