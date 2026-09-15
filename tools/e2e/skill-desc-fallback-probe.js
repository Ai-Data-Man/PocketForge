// s94 探针（修复批 F-1/F-8/F-9/F-4c 前端面）：无 frontmatter 自沉淀技能的 description 回落 + 前端模板锚。
// 活体：dev 桥 :8790 的 /api/skills 与 /api/assets（同 assets-probe 先例：种子自建自清，s82 纪律）。
// 背景（ia1 实锤）：agent 按 skill-sediment 协议写的 SKILL.md 无 YAML frontmatter → description 空 →
// 台账主名无说明（R4 破）。修后：回落=正文第一个 # 一级标题（截 120，结构性事实不编造；无标题保持空=诚实降级）。
// 模板锚：F-9 @ 菜单排除两张建账表 / F-4c 代理人话 + proxy-only 形态 / F-1 save-cfg 建档守卫 + 添加保输入。
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
// 种子：h1 回落档（标题超 120 验截断）+ 无标题档（诚实空）——均无 frontmatter、origin=self
const D1 = path.join(ROOT, 'forge', '.agents', 'skills', '__probe-h1-fallback');
const D2 = path.join(ROOT, 'forge', '.agents', 'skills', '__probe-no-h1');
const LONG_TITLE = '每天收工前清点库存：把当天变动逐条记进台账并核对总数，' + '额外步骤说明文字'.repeat(20);
function seed() {
    for (const d of [D1, D2]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} fs.mkdirSync(d, { recursive: true }); }
    fs.writeFileSync(path.join(D1, 'SKILL.md'), '# ' + LONG_TITLE + '\n\n## 做法\n1. 打开台账\n2. 逐条核对\n');
    fs.writeFileSync(path.join(D1, 'origin.json'), JSON.stringify({ _schema: 1, source: 'self', installed_at: new Date().toISOString() }, null, 2));
    fs.writeFileSync(path.join(D2, 'SKILL.md'), '正文没有一级标题\n## 二级标题不算\n只有段落文字\n');
    fs.writeFileSync(path.join(D2, 'origin.json'), JSON.stringify({ _schema: 1, source: 'self', installed_at: new Date().toISOString() }, null, 2));
}
function clean() { for (const d of [D1, D2]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } }

(async () => {
    seed();
    try {
        // ===== 活体：/api/skills（/api/assets 技能源同函数 scanInstalledSkills，两侧自动受益）=====
        let j = null;
        try { j = JSON.parse((await get('/api/skills')).body); } catch (e) { ck('A1 /api/skills 可达', false, e.message); }
        const byName = {};
        for (const sk of (j || [])) byName[sk.name] = sk;
        ck('A2 无 frontmatter 技能 description 回落一级标题（/api/skills）', byName['__probe-h1-fallback'] && byName['__probe-h1-fallback'].description === LONG_TITLE.slice(0, 120), JSON.stringify((byName['__probe-h1-fallback'] || {}).description || '').slice(0, 80));
        ck('A3 回落截 120 字符（超长标题不整条进面板）', byName['__probe-h1-fallback'] && byName['__probe-h1-fallback'].description.length === 120, 'len=' + ((byName['__probe-h1-fallback'] || {}).description || '').length);
        ck('A4 无一级标题保持空（诚实降级不编造，## 二级不算）', byName['__probe-no-h1'] && byName['__probe-no-h1'].description === '', JSON.stringify((byName['__probe-no-h1'] || {}).description || ''));
        ck('A5 body 原文不受回落影响（「看内容」消费）', byName['__probe-h1-fallback'] && byName['__probe-h1-fallback'].body.includes('逐条核对'), '');

        // ===== 活体：/api/assets 台账 skill 条目 human 同源受益 =====
        let a = null;
        try { a = JSON.parse((await get('/api/assets')).body); } catch (e) { ck('B1 /api/assets 可达', false, e.message); }
        const skillItems = ((a && a.items) || []).filter(i => i.kind === 'skill' && /^__probe-(h1-fallback|no-h1)$/.test(i.name));
        const h1Item = skillItems.find(i => i.name === '__probe-h1-fallback');
        const noH1Item = skillItems.find(i => i.name === '__probe-no-h1');
        ck('B2 台账 self 技能 human=回落标题（R4 人话义务修复）', h1Item && h1Item.human === LONG_TITLE.slice(0, 120), JSON.stringify((h1Item || {}).human || '').slice(0, 80));
        ck('B3 无标题技能 human=null（前端「来源不详」占位，不编造）', noH1Item && noH1Item.human === null, JSON.stringify((noH1Item || {}).human));

        // ===== 模板锚（静态；锚点漂移=显式红，不误报）=====
        const bridge = fs.readFileSync(path.join(ROOT, 'forge', 'conf', 'templates', 'chat-bridge.tpl.js'), 'utf8');
        const html = fs.readFileSync(path.join(ROOT, 'forge', 'conf', 'templates', 'chat.tpl.html'), 'utf8');
        ck('C1 F-8 桥侧回落实现锚（正文首个一级标题）', /const h1 = desc0 \? '' : \(body\.match\(\/\^\#\[ \\t\]\+\\S\.\*\$\/m\) \|\| \[''\]\)\[0\]/.test(bridge));
        ck('C2 F-9 @ 菜单排除 forge_meta/forge_table_info（只排两张建账表，防误伤用户自建 forge_ 表）', /if\(t\.name==='forge_meta'\|\|t\.name==='forge_table_info'\) continue;/.test(html));
        ck('C3 F-4c 代理人话文案在位 + proxy-only 形态（探测 ok 仍提示）', html.includes('电脑上开着网络代理，可能拦住它连服务商') && /!\(m&&m\.proxy&&hasKey\)/.test(html));
        ck('C4 F-4c 桥侧代理旗远端收窄锚', /healthCache\.proxy = !!\(pr && pr\.enabled\) && hostIsRemote\(probeHn\)/.test(bridge));
        ck('C5 F-1 save-cfg 未建档守卫（先「添加」建档再保存）', /先点上方「添加」把「'\+name\+'」建档，再保存。/.test(html) && /if\(!providerList\.some\(x=>x\.name===name\)\) return note/.test(html));
        ck('C6 F-1 添加后保留 Key 与拉取勾选面', /keepFetchPoolNextRender=true;/.test(html) && /if\(k\) cfgKeyTouched=true;/.test(html) && /renderFetchPool\(\); \}/.test(html));
    } finally { clean(); }
    console.log('skill-desc-fallback-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { clean(); console.error('skill-desc-fallback-probe: FATAL', e.message); process.exit(1); });
