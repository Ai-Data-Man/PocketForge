// s83 探针（裁决 2026-09-13-app-management-ledger §3-S4）：GET /api/assets 三源聚合端点——活体形状/降级/回链/白名单 + 排序桩测 + 前端模板锚
// 活体部分跑 dev 桥（:8790，同 §8/§9 前例，依赖 plm 存量基线）；模板提取锚点漂移显式 NOT FOUND 不误报（ui-logic 先例）
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, ok, extra) => { console.log((ok ? 'PASS' : 'FAIL') + ': ' + n + (extra !== undefined && extra !== '' ? '  | ' + String(extra).slice(0, 200) : '')); ok ? pass++ : fail++; };
function get(p) {
    return new Promise((res, rej) => {
        const r = http.get({ host: '127.0.0.1', port: 8790, path: p, timeout: 8000 }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); });
        r.on('error', rej); r.on('timeout', () => { r.destroy(); rej(new Error('timeout')); });
    });
}
// ia-rework S3（裁决 2026-09-15-made-ledger-ia-rework §3-S3）：台账仅收自沉淀技能后，本机 0 个 self → A3 改为自建种子
// __probe-self-ledger（origin.source=self，同 S1 验收 2 形态）后断言在场；s82 用后自清纪律（重复运行先 force rm）
const SEED_DIR = path.join(ROOT, 'forge', '.agents', 'skills', '__probe-self-ledger');
// A3b 判别力种子：模拟产品成功态——本机已有真实 self 技能在场（修前 A3 every(==种子) 在此形态必假红）
const SEED_DIR2 = path.join(ROOT, 'forge', '.agents', 'skills', '__probe-self-real');
function seedSelfLedger() {
    try { fs.rmSync(SEED_DIR, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(SEED_DIR, { recursive: true });
    fs.writeFileSync(path.join(SEED_DIR, 'SKILL.md'), '---\nname: __probe-self-ledger\ndescription: ia-rework probe seed\n---\nprobe body\n');
    fs.writeFileSync(path.join(SEED_DIR, 'origin.json'), JSON.stringify({ _schema: 1, source: 'self', installed_at: new Date().toISOString() }, null, 2));
    try { fs.rmSync(SEED_DIR2, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(SEED_DIR2, { recursive: true });
    fs.writeFileSync(path.join(SEED_DIR2, 'SKILL.md'), '---\nname: __probe-self-real\ndescription: ia-rework probe seed 2\n---\nprobe body\n');
    fs.writeFileSync(path.join(SEED_DIR2, 'origin.json'), JSON.stringify({ _schema: 1, source: 'self', installed_at: new Date().toISOString() }, null, 2));
}
function cleanSelfLedger() { for (const d of [SEED_DIR, SEED_DIR2]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } }

(async () => {
    seedSelfLedger();
    // ===== 活体端点 =====
    let j = null;
    try { j = JSON.parse((await get('/api/assets')).body); } catch (e) { ck('A1 /api/assets 可达且 ok:true', false, e.message); }
    const items = (j && j.items) || [];
    if (j) ck('A1 /api/assets 200 ok:true items 数组', j.ok === true && Array.isArray(j.items), 'n=' + items.length);
    const KINDS = new Set(['tbl', 'file', 'skill']);
    const shapeOk = items.every(i => i && KINDS.has(i.kind) && typeof i.name === 'string' && typeof i.name === 'string' &&
        (i.human === null || typeof i.human === 'string') && (i.ts === null || typeof i.ts === 'number') &&
        (i.srcSid === null || typeof i.srcSid === 'string') && (i.srcTitle === null || typeof i.srcTitle === 'string') && i.ref && typeof i.ref === 'object');
    ck('A2 条目统一模型形状（kind/name/human/ts/srcSid/srcTitle/ref）', shapeOk);
    const byKind = {};
    items.forEach(i => byKind[i.kind] = (byKind[i.kind] || 0) + 1);
    ck('A3 三源各在列（tbl/file/skill ≥1，skill=种子 self 技能源——ia-rework 后内置/市场不入账）', (byKind.tbl || 0) >= 1 && (byKind.file || 0) >= 1 && (byKind.skill || 0) >= 1, JSON.stringify(byKind));
    // A3b（qa ia-rework P3-1 等价断言）：期望集 = {种子} ∪ 运行时实扫 origin:self 目录（scanInstalledSkills 同构：
    // SKILL.md 可读 + origin.json source==='self'；坏 JSON/他 source 不入）——真实 self 技能出现（产品成功态）不再假红
    const expectSelf = new Set(['__probe-self-ledger']);
    const SK_DIR = path.join(ROOT, 'forge', '.agents', 'skills');
    try {
        for (const ent of fs.readdirSync(SK_DIR, { withFileTypes: true })) {
            if (!ent.isDirectory()) continue;
            try {
                fs.readFileSync(path.join(SK_DIR, ent.name, 'SKILL.md'), 'utf8');
                if (JSON.parse(fs.readFileSync(path.join(SK_DIR, ent.name, 'origin.json'), 'utf8')).source === 'self') expectSelf.add(ent.name);
            } catch {}
        }
    } catch {}
    const gotSkills = new Set(items.filter(i => i.kind === 'skill').map(i => i.name));
    ck('A3b 台账 skill 名单集合 === {种子} ∪ 实扫 origin:self 集（等价断言，不焊死本机 0 self）', gotSkills.size === expectSelf.size && [...gotSkills].every(n => expectSelf.has(n)), 'got=' + JSON.stringify([...gotSkills]) + ' expect=' + JSON.stringify([...expectSelf]));
    let sorted = true;
    for (let k = 1; k < items.length; k++) {
        const a = items[k - 1].ts, b = items[k].ts;
        if (a != null && b != null && a < b) sorted = false;
        if (a == null && b != null) sorted = false;
    }
    ck('A4 排序=ts 倒序、null 沉底', sorted);
    const RE = /\.(xlsx|docx|pdf|html|svg|png|jpg|jpeg|csv)$/i;
    ck('A5 文件白名单边界（非白名单扩展名零泄漏）', items.filter(i => i.kind === 'file').every(i => RE.test(i.name)));
    ck('A6 forge_* 建账表不进清单', items.filter(i => i.kind === 'tbl').every(i => !/\.forge_/.test(i.name)));
    const plm = items.filter(i => i.kind === 'tbl' && i.ref && i.ref.svc === 'plm');
    ck('A7 存量 plm 无账降级（srcSid=null → 前端「来源不详」，不考古）', plm.length >= 1 && plm.every(i => i.srcSid === null), 'plm 条目=' + plm.length);
    const linkOk = items.filter(i => i.srcSid && i.srcTitle);
    ck('A8 回链解析 ws→sid→title（≥1 条带完整来源链）', linkOk.length >= 1, 'n=' + linkOk.length);
    ck('A9 文件 ref.ws 合法工作区 id（拼预览路径前过门）', items.filter(i => i.kind === 'file').every(i => /^ws-[0-9]{4}-[0-9]{6}[a-z]*$/.test(i.ref.ws) || i.ref.ws === 'ws-imported'));
    let post = 0;
    try { post = (await new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port: 8790, path: '/api/assets', method: 'POST' }, x => res(x.statusCode)); r.on('error', rej); r.end(); })); } catch {}
    ck('A10 非 GET 拒 405', post === 405, 'status=' + post);
    // A11（裁决 §3-S3 新增「内置技能零误归因」；编号避让既有 A10）：前提=此五名为随包保留名（skillInstallBlocked 防同名安装），台账 skill 条目命中即误归因回归
    const BUILTIN_RESERVED = ['artifact-versioning', 'forge-selfcheck', 'scrape-table-to-db', 'see-image', 'skill-sediment'];
    const misattr = items.filter(i => i.kind === 'skill' && BUILTIN_RESERVED.indexOf(i.name) >= 0).map(i => i.name);
    ck('A11 内置技能零误归因（kind:skill 不命中随包保留名黑名单）', misattr.length === 0, 'hit=' + JSON.stringify(misattr));

    // ===== 桥模板提取（锚点漂移=显式红，不误报）=====
    const bridge = fs.readFileSync(path.join(ROOT, 'forge', 'conf', 'templates', 'chat-bridge.tpl.js'), 'utf8');
    ck('B1 桥模板路由 /api/assets+assetsOverview', /url === '\/api\/assets'/.test(bridge) && /assetsOverview\(\)/.test(bridge));
    ck('B2 每库 forge_meta 建账读（META_TBL）', /META_TBL = 'forge_meta'/.test(bridge) && /_table\/' \+ META_TBL/.test(bridge));
    ck('B3 白名单常量与裁决一致（xlsx/docx/pdf/html/svg/png/jpg/csv）', /ASSET_FILE_RE = \/\\\.\(xlsx\|docx\|pdf\|html\|svg\|png\|jpg\|jpeg\|csv\)\$\/i/.test(bridge));
    ck('B4 建账表不进清单（forge_ 前缀跳过）', /t\.name\.indexOf\('forge_'\) === 0\) continue/.test(bridge));
    const m = bridge.match(/items\.sort\(\(a, b\) => ([^\n]+)\);/);
    if (!m) { ck('B5 排序比较器在位（提取桩测）', false, 'NOT FOUND'); }
    else {
        const cmp = new Function('a', 'b', 'return ' + m[1] + ';');
        const arr = [{ n: 'x', ts: 300 }, { n: 'n1', ts: null }, { n: 'y', ts: 500 }, { n: 'n2', ts: null }, { n: 'z', ts: 100 }];
        arr.sort((a, b) => cmp(a, b));
        ck('B5 排序比较器桩测（倒序+null 沉底）', JSON.stringify(arr.map(x => x.n)) === JSON.stringify(['y', 'x', 'z', 'n1', 'n2']), JSON.stringify(arr.map(x => x.n)));
    }
    ck('B6 技能源复用 /api/skills 读法（scanInstalledSkills 同源）', /function scanInstalledSkills\(\)/.test(bridge) && /json200\(res, scanInstalledSkills\(\)\)/.test(bridge) && /scanInstalledSkills\(\)/.test(bridge.match(/async function assetsOverview[\s\S]*?\n\}/) && bridge.match(/async function assetsOverview[\s\S]*?\n\}/)[0] || ''));

    // ===== 前端模板提取 =====
    const html = fs.readFileSync(path.join(ROOT, 'forge', 'conf', 'templates', 'chat.tpl.html'), 'utf8');
    ck('C1 mtabs 注册 made（六标签懒加载同款）', /made:\['loadMadeUI',false\]/.test(html) && /made:\['loadMadeUI',false\]/.test(html.match(/const mtabs=\{[^\n]+\}/)[0]));
    ck('C2 tab 钮+mpane 在位（✨ 做过的东西）', /data-pane="made"[^>]*>✨ 做过的东西</.test(html) && /id="mpane-made"/.test(html));
    ck('C3 搜索=文件名进 hay（裁决「搜不到文件名」缺口闭合）+200ms 防抖', /it\.name\+' '\+\(it\.human\|\|''\)\+' '\+\(it\.srcTitle\|\|''\)\)\.toLowerCase\(\)\.includes\(q\)/.test(html) && /\$\('made-q'\)\.oninput/.test(html) && /madeQT=setTimeout/.test(html));
    ck('C4 分页 pageSlice 卡片档（R2 <100 条声明；r4/S1 新签名+形态参）', /pageSlice\(list,'made','card'\)/.test(html) && /pagerPaint\('made-pager',listPage\.made,ps\.pages,ps\.total,[^\n]+'card',ps\.trunc\)/.test(html));
    ck('C5 类型 chips=筛选非分组', /id="made-chips"/.test(html) && /madeFilter\.chip===k/.test(html) || /madeFilter\.chip === k/.test(html));
    ck('C6 打开-表=🗄️数据 tab 定位展开（既有 loadDbUI/dbPaint）', /function openAsset\(it\)/.test(html) && /showMtab\('db'\)/.test(html) && /\$\('db-q'\)\.value=it\.ref\.tbl/.test(html));
    ck('C7 打开-文件=既有预览链路（/preview/ 同款）', /window\.open\('\/preview\/'\+encodeURIComponent\(it\.ref\.ws\+'\/'\+it\.ref\.path\)/.test(html));
    ck('C8 打开-技能=技能弹窗既有入口（open-skills 不绕）', /\$\('open-skills'\)\.click\(\)/.test(html) && /paintInstalled\(\)/.test(html));
    ck('C9 回链复用 openSession（勿绕侧栏既有入口）', /openSession\(it\.srcSid\)/.test(html));
    ck('C10 存量降级文案「来源不详」+时间无=「—」不编造', /来源不详/.test(html) && /:"—"/.test(html) === false && /'\u2014'/.test(html));
    const paneMade = (html.match(/<div class="mpane" id="mpane-made"[\s\S]*?<\/div>\s*<\/div>\s*<div class="mpane" id="mpane-mem"/) || [''])[0];
    ck('C11 红线：made pane 内零删除/卸载/重命名动作（删除各域已有，R1 禁双入口）', !/删除|卸载|danger|rename|重命名/.test(paneMade));
    const openAssetFn = html.match(/function openAsset\(it\)\{[\s\S]*?\n\}/);
    ck('C12 红线：openAsset 动作面=打开/定位（无写通道、无 confirm 删除族）', !!openAssetFn && !/delete|uninstall|POST/.test(openAssetFn[0]));

    cleanSelfLedger(); // s82 用后自清（s83 探针种子纪律）；清理失败不吞证——下方残留即红
    if (fs.existsSync(SEED_DIR) || fs.existsSync(SEED_DIR2)) ck('S 探针种子清理', false, 'residual=' + [SEED_DIR, SEED_DIR2].filter(d => fs.existsSync(d)).join(','));
    console.log('assets-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { cleanSelfLedger(); console.error('FATAL', e); process.exit(2); });
