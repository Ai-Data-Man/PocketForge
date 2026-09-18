// s74 qa 审查探针：IA-1/IA-2 静态发现的两处疑似缺陷的运行时取证（无桥无网络，纯 DOM 桩沙盒）。
// 手法同 tools/e2e/ui-logic-probe.js：从 chat.tpl.html 原文正则锚点逐字提取被审函数，最小 DOM 桩执行。
// 发现A：renderSessions 归档视图空态/搜索空态早退不调 pagerPaint → arch-pager 残留旧翻页钮（对照：paintInstalled 清了）。
// 发现B：loadSkills2 过滤后空集 → 静默空白无空态文案（对照：paintInstalled 有「没有找到」）。
// D/E 组（r3/S4，裁决 2026-09-18-bloat-r3-built-in §7 机器断言）：apps 分页 12/页+状态 chips 四态（过滤字段=显示态含
//   uiStopped 修正）、sched 分页 30/页+暂停 chips、chip 切换回第 1 页、空态三分、页码钳制、阈值内翻页器零渲染。
'use strict';
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../../forge/conf/templates/chat.tpl.html', 'utf8');
function grab(re, label) { const m = html.match(re); if (!m) { console.error('NOT FOUND: ' + label); process.exit(1); } return m[0]; }

const renderSessionsSrc = grab(/function renderSessions\(list\)\{[\s\S]+?\n\}/, 'renderSessions');
const paintSideChipsSrc = grab(/function paintSideChips\(\)\{[\s\S]+?\n\}/, 'paintSideChips');
const pageSliceSrc = grab(/function pageSlice\(arr,key,form\)\{[\s\S]+?\n\}/, 'pageSlice'); // r4/S1: 签名 n→form（'card'|'row'，页大小=pfPageSize 档位记忆）
const pagerPaintSrc = grab(/function pagerPaint\(id,page,pages,total,go,form,trunc\)\{[\s\S]+?\n\}/, 'pagerPaint'); // r4/S1: +form/trunc（每页 N 条 select+超限注）
const psBlockSrc = grab(/const PS_TIERS=[\s\S]*?function psSet\(form,v\)\{[^\n]+\}/, 'PS block'); // r4/S1: 档位块（pageSlice/pagerPaint 新依赖；沙盒无 localStorage→psGet 兜底缺省 12/30）
const sessItemSrc = grab(/function sessItem\(s,archived\)\{[\s\S]+?\n\}/, 'sessItem');
const tsLocalSrc = grab(/function tsLocal\(s\)\{[\s\S]+?\n\}/, 'tsLocal');
const fmtMDHMSrc = grab(/function fmtMDHM\(d\)\{[^\n]+\}/, 'fmtMDHM');
const escSrc = grab(/function esc\(s\)\{[^\n]+\}/, 'esc');
const skillOriginBadgeSrc = grab(/function skillOriginBadge\(sk\)\{[\s\S]+?\n\}/, 'skillOriginBadge');
const skillsOriginClassSrc = grab(/function skillsOriginClass\(sk\)\{[\s\S]+?\n\}/, 'skillsOriginClass'); // s95/S2a：来源 chip 判据（paintInstalled 新依赖）
const paintInstalledSrc = grab(/function paintInstalled\(\)\{[\s\S]+?\n\}/, 'paintInstalled');
const loadSkills2Src = grab(/async function loadSkills2\(\)\{[\s\S]+?\n\}/, 'loadSkills2');
const appsChipsSrc = grab(/function appsChips\(\)\{[\s\S]+?\n\}/, 'appsChips'); // r3/S4b
const appsPaintSrc = grab(/function appsPaint\(\)\{[\s\S]+?\n\}/, 'appsPaint'); // r3/S4a+S4b
const appsProcZhSrc = grab(/function appsProcZh\(p\)\{[^\n]+\}/, 'appsProcZh');
const schedChipsSrc = grab(/function schedChips\(\)\{[\s\S]+?\n\}/, 'schedChips'); // r3/S4d
const schedPaintSrc = grab(/function schedPaint\(\)\{[\s\S]+?\n\}/, 'schedPaint'); // r3/S4c+S4d
const cronHumanSrc = grab(/function cronHuman\(cron\)\{[\s\S]+?\n\}/, 'cronHuman');

// ---- 最小 DOM 桩 ----
function mkEl(id) {
    const el = {
        id: id || '', _children: [], _html: '', _text: '',
        style: { cssText: '', display: '' }, dataset: {},
        classList: { _s: new Set(), toggle(c, f) { (f === undefined ? !this._s.has(c) : f) ? this._s.add(c) : this._s.delete(c); }, add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
        setAttribute(k, v) { this['attr_' + k] = v; },
        appendChild(c) { this._children.push(c); return c; },
    };
    Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this._children = []; } });
    Object.defineProperty(el, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });
    return el;
}
const els = {
    'sessions': mkEl('sessions'), 'arch-pager': mkEl('arch-pager'),
    'svw-chat': mkEl('svw-chat'), 'svw-arch': mkEl('svw-arch'), 'arch-q': mkEl('arch-q'),
    'skills-list': mkEl('skills-list'), 'skills-pager': mkEl('skills-pager'), 'skills-q': mkEl('skills-q'),
};
const document = { createElement: t => mkEl(t), querySelectorAll: () => [] };
const $ = id => { if (!els[id]) throw new Error('no stub #' + id); return els[id]; };

const sandbox = new Function('$', 'document', 'fetch', `
    let lastSessions=[], archSet={}, sideView='chat', archCount=0, installedAll=[], currentSid=null;
    let listPage={ins:1,store:1,mcp:1,arch:1};
    const skillsFilter={chip:'all'}; // s95/S2a
    ${skillsOriginClassSrc}
    ${psBlockSrc}
    ${escSrc}
    ${tsLocalSrc}
    ${fmtMDHMSrc}
    ${skillOriginBadgeSrc}
    ${pageSliceSrc}
    ${pagerPaintSrc}
    ${sessItemSrc}
    ${paintSideChipsSrc}
    ${renderSessionsSrc}
    ${paintInstalledSrc}
    ${loadSkills2Src}
    function openSession(){} function archiveSession(){} function askDeleteSession(){}
    return {
        set sideView(v){sideView=v}, set archSetV(v){archSet=v}, set lastSessionsV(v){lastSessions=v}, set installedAllV(v){installedAll=v},
        set skillsChip(v){skillsFilter.chip=v}, // s96/P3-1：chip 过滤行为断言驱动口
        renderSessions, paintInstalled,
        loadSkills2: (...a)=>loadSkills2(...a),
        get state(){return {sideView,archCount}},
    };
`)($, document, async () => ({ json: async () => [{ name: 'alpha', description: 'x' }] }));
sandbox.sideView = 'arch';

// ---- D/E 组沙盒（r3/S4）：mkEl 同款桩 + 卡片/行内查询桩（querySelector→null / querySelectorAll→[]，ontoggle/onclick 不执行只须解析） ----
function mkEl2(id) {
    const el = mkEl(id);
    el.querySelector = () => null;
    el.querySelectorAll = () => [];
    return el;
}
const els2 = {
    'apps-list': mkEl2('apps-list'), 'apps-pager': mkEl2('apps-pager'), 'apps-q': mkEl2('apps-q'), 'apps-chips': mkEl2('apps-chips'),
    'sched-list': mkEl2('sched-list'), 'sched-pager': mkEl2('sched-pager'), 'sched-q': mkEl2('sched-q'), 'sched-chips': mkEl2('sched-chips'),
};
const document2 = { createElement: t => mkEl2(t), querySelectorAll: () => [] };
const $2 = id => { if (!els2[id]) throw new Error('no stub #' + id); return els2[id]; };
const sandbox2 = new Function('$', 'document', `
    let appsAll=null, appsNote=null, appsPortsTrunc=false;
    const appsUserStopped={};
    const appsFilter={chip:'all'};
    let schedAll=null;
    const schedFilter={chip:'all'};
    const APP_STATE_ZH={run:'✅ 运行中',stop:'⏹ 已停',fail:'⚠️ 出错了'};
    const APP_PROC_ZH={run:'在跑',stop:'已停',fail:'出错',absent:'下次启动时自动带起'};
    let listPage={apps:1,sched:1};
    ${appsProcZhSrc}
    ${cronHumanSrc}
    ${psBlockSrc}
    ${escSrc}
    ${pageSliceSrc}
    ${pagerPaintSrc}
    ${appsChipsSrc}
    ${appsPaintSrc}
    ${schedChipsSrc}
    ${schedPaintSrc}
    function appsOp(){} function openSession(){}
    return {
        set appsAllV(v){appsAll=v}, set schedAllV(v){schedAll=v},
        set appsChip(v){appsFilter.chip=v}, set schedChip(v){schedFilter.chip=v}, set appsPage(v){listPage.apps=v},
        appsPaint, schedPaint, appsChips, schedChips,
        markStopped(id){appsUserStopped[id]=true},
        get page(){return listPage.apps},
    };
`)($2, document2);

let pass = 0, fail = 0;
function ck(name, cond) { console.log((cond ? 'PASS: ' : 'FAIL: ') + name); cond ? pass++ : fail++; }

// ============ 发现A：arch-pager 残留 ============
// 造 65 条归档 → 3 页 → pager 有 3 个子节点
const list = Array.from({ length: 65 }, (_, i) => ({ sessionId: 's' + i, title: '会话' + i, updatedAt: '2026-09-0' + ((i % 9) + 1) + ' 10:00:00' }));
const archSet = {}; list.forEach(s => archSet[s.sessionId] = 1);
sandbox.archSetV = archSet; sandbox.lastSessionsV = list;
els['arch-q'].value = '';
sandbox.renderSessions(list);
ck('A0 对照: 65 归档→第1页渲染30行', els['sessions']._children.length === 30);
ck('A0 对照: pager 绘出(pages=3, 4子节点=‹/计数/›/每页N条select r4/S1)', els['arch-pager']._children.length === 4);
// 搜索不中 → 早退
els['arch-q'].value = 'zzz不存在的词';
sandbox.renderSessions(list);
const stalePager = els['arch-pager']._children.length > 0;
console.log('  [取证] 空态后 arch-pager 子节点数=' + els['arch-pager']._children.length + '，sessions.innerHTML=' + JSON.stringify(els['sessions'].innerHTML.slice(0, 40)));
ck('A1 发现已修: 搜索空态后 arch-pager 已清空 (残留=' + stalePager + ')', stalePager === false);
// 对照组：同款空态 paintInstalled 会清 pager（证明检查能区分对错两种写法）
els['arch-q'].value = '';
sandbox.renderSessions(list); // 恢复 3 页
els['skills-q'].value = 'zzz不中';
sandbox.installedAllV = [{ name: 'alpha', description: 'x' }];
sandbox.paintInstalled();
ck('A2 对照: paintInstalled 空态清空 skills-pager', els['skills-pager']._children.length === 0 && /没有找到/.test(els['skills-list'].innerHTML));
// 归档清空路径（!arc.length 早退）同样残留
els['arch-q'].value = '';
sandbox.archSetV = {};
sandbox.renderSessions(list.map(s => ({ ...s })));
ck('A3 发现已修: 归档清空早退后 arch-pager 已清空 (子节点=' + els['arch-pager']._children.length + ')', els['arch-pager']._children.length === 0);

// ============ 发现B：loadSkills2 过滤空集静默空白 ============
els['skills-q'].value = 'beta'; // 与 fetch 返回的 alpha 不匹配
sandbox.installedAllV = [];
(async () => {
    await sandbox.loadSkills2();
    const silent = els['skills-list']._children.length === 0 && !/没有找到|还没有技能/.test(els['skills-list'].innerHTML);
    console.log('  [取证] loadSkills2 过滤空集: children=' + els['skills-list']._children.length + ' html=' + JSON.stringify(els['skills-list'].innerHTML));
    ck('B1 发现已修: loadSkills2 过滤空集显示「没有找到」不再静默 (silent=' + silent + ')', silent === false);
    // 对照：paintInstalled 同数据同查询给空态文案
    sandbox.installedAllV = [{ name: 'alpha', description: 'x' }];
    sandbox.paintInstalled();
    ck('B2 对照: paintInstalled 同查询显示「没有找到」', /没有找到/.test(els['skills-list'].innerHTML));
    // ============ C 组：来源 chip 过滤行为断言（s96/P3-1 补恒绿缺口——S3c-sync 只同步了符号提取，零行为断言） ============
    // 判据与前端 paintInstalled 同源（提取执行非字面锚）：null=自带 / market+local=装的 / self=自己攒的。
    // 桩沙箱种四类来源各 1：self 1 + null 内置 1 + market 1 + local 1。
    sandbox.installedAllV = [
        { name: 'k-self', description: '自己攒的', origin: { source: 'self' } },
        { name: 'k-null', description: '自带的', origin: null },
        { name: 'k-market', description: '市场装的', origin: { source: 'market', repo: 'acme/skill-repo' } },
        { name: 'k-local', description: '本机库装的', origin: { source: 'local' } },
    ];
    els['skills-q'].value = '';
    const cardsHtml = () => els['skills-list']._children.map(c => c.innerHTML).join(''); // 桩 appendChild 不写容器 innerHTML，读卡片聚合
    sandbox.skillsChip = 'self';
    sandbox.paintInstalled();
    ck('C1 chip=self 命中 origin=self 不命中 null 内置（1 卡=k-self）', els['skills-list']._children.length === 1 && /k-self/.test(cardsHtml()) && !/k-null|k-market|k-local/.test(cardsHtml()));
    sandbox.skillsChip = 'builtin';
    sandbox.paintInstalled();
    ck('C2 chip=builtin 判据=origin null（1 卡=k-null）', els['skills-list']._children.length === 1 && /k-null/.test(cardsHtml()) && !/k-self|k-market|k-local/.test(cardsHtml()));
    sandbox.skillsChip = 'ext';
    sandbox.paintInstalled();
    ck('C3 chip=ext 判据=market+local（2 卡，self/builtin 不中）', els['skills-list']._children.length === 2 && /k-market/.test(cardsHtml()) && /k-local/.test(cardsHtml()) && !/k-self|k-null/.test(cardsHtml()));
    sandbox.skillsChip = 'all';
    sandbox.paintInstalled();
    ck('C4 chip=all 对照全渲染（4 卡）', els['skills-list']._children.length === 4);

    // ============ D 组（r3/S4a+S4b）：apps 分页 12/页 + 状态 chips 四态（裁决 §7 机器断言） ============
    // fixture：31 个混排 = run 20 + stop 8 + fail 3（裁决 S4a/S4b 验收口径：31 触发 3 页、混排 chip 定向）
    const mkApp = (i, state) => ({ id: 'app-' + i, human: '应用' + i, state, procs: [{ name: 'web', state }], url: 'http://x', srcSid: null, listenPorts: [1], yaml: 'y.yaml' });
    const apps31 = [];
    for (let i = 0; i < 20; i++) apps31.push(mkApp(i, 'run'));
    for (let i = 20; i < 28; i++) apps31.push(mkApp(i, 'stop'));
    for (let i = 28; i < 31; i++) apps31.push(mkApp(i, 'fail'));
    sandbox2.appsAllV = apps31;
    els2['apps-q'].value = '';
    sandbox2.appsChip = 'all';
    sandbox2.appsPaint();
    ck('D1 apps 31 条→第 1 页 12 卡+翻页器在场+共 31 条', els2['apps-list']._children.length === 12 && els2['apps-pager']._children.length === 4 && /共 31 条/.test(els2['apps-pager']._children[1]._text));
    els2['apps-pager']._children[2].onclick(); // › 翻第 2 页
    ck('D2 › 翻页到第 2 页（页码推进+重渲染不炸）', sandbox2.page === 2 && els2['apps-list']._children.length === 12);
    const appsCardHtml = () => els2['apps-list']._children.map(c => c.innerHTML).join('');
    sandbox2.appsChip = 'fail';
    sandbox2.appsPaint();
    ck('D3 chip=出错了 只剩 fail 卡（run 在前排序下沉的混排痛点即解；命中数与分页无关=3 全显）', els2['apps-list']._children.length === 3 && /app-28|app-29|app-30/.test(appsCardHtml()) && !/应用1[0-9]? /.test(appsCardHtml()) && /⚠️ 出错了/.test(appsCardHtml()));
    sandbox2.markStopped('app-28'); // UI 手动停的 fail 卡 → 显示态=已停
    sandbox2.appsChip = 'fail';
    sandbox2.appsPaint();
    ck('D4 uiStopped 修正：手动停的 fail 卡归「已停」不归「出错」（与徽章口径一致，剩 2 卡）', els2['apps-list']._children.length === 2 && !/app-28/.test(appsCardHtml()));
    sandbox2.appsChip = 'stop';
    sandbox2.appsPaint();
    ck('D5 手动停的卡出现在「已停」chip（8+1=9 卡）', els2['apps-list']._children.length === 9 && /app-28/.test(appsCardHtml()));
    sandbox2.appsChip = 'run';
    sandbox2.appsPaint();
    ck('D6 chip=运行中 只剩 run 卡（20 条→第 1 页 12 卡+翻页器「共 20 条」，卡片零已停/出错了徽章）', els2['apps-list']._children.length === 12 && /共 20 条/.test(els2['apps-pager']._children[1]._text) && !/已停|出错了/.test(appsCardHtml()));
    // chip 切换回第 1 页：先站在第 3 页再点 chip（经 chips 按钮真 onclick 走完整链）
    sandbox2.appsPage = 3;
    sandbox2.appsChips(); // 渲染 chips 容器（4 钮：all/run/stop/fail）
    els2['apps-chips']._children[1].onclick(); // 点「✅ 运行中」
    ck('D7 chip onclick 切换回第 1 页（pageSlice 既有钳制兜底外的显式复位）', sandbox2.page === 1 && els2['apps-list']._children.length === 12);
    // 页码钳制：站第 3 页后过滤到单页量级
    sandbox2.appsPage = 3;
    sandbox2.appsChip = 'fail';
    sandbox2.appsPaint();
    ck('D8 过滤缩窄后页码钳制不越界（3 页→fail 2 卡，页码钳回 1）', sandbox2.page === 1 && els2['apps-list']._children.length === 2);
    // 空态三分：chip 非全且空 / q+chip 组合空 / 真空
    sandbox2.appsChip = 'stop';
    sandbox2.appsAllV = apps31.slice(0, 20); // 只剩 run
    sandbox2.appsPaint();
    ck('D9 chip 非全且结果空=「没有已停的小应用。」+翻页器清空', /没有已停的小应用。/.test(els2['apps-list'].innerHTML) && els2['apps-pager']._children.length === 0);
    els2['apps-q'].value = '不存在的词';
    sandbox2.appsChip = 'run';
    sandbox2.appsPaint();
    ck('D10 q+chip 组合空=现有「没找到」分支照旧', /没找到跟“不存在的词”有关的应用。/.test(els2['apps-list'].innerHTML) && els2['apps-pager']._children.length === 0);
    els2['apps-q'].value = '';
    sandbox2.appsChip = 'all';
    sandbox2.appsAllV = apps31.slice(0, 5); // ≤12 条
    sandbox2.appsPaint();
    ck('D11 ≤12 条翻页器不渲染且卡片数不变（机制恒建、阈值内零视觉）', els2['apps-list']._children.length === 5 && els2['apps-pager']._children.length === 0);

    // ============ E 组（r3/S4c+S4d）：sched 分页 30/页 + 暂停 chips ============
    const mkJob = (i, paused) => ({ id: 'j' + i, title: '任务' + i, cron: '0 9 * * *', paused, drift: false });
    const jobs31 = [];
    for (let i = 0; i < 24; i++) jobs31.push(mkJob(i, false));
    for (let i = 24; i < 31; i++) jobs31.push(mkJob(i, true));
    sandbox2.schedAllV = jobs31;
    els2['sched-q'].value = '';
    sandbox2.schedChip = 'all';
    sandbox2.schedPaint();
    ck('E1 sched 31 条→第 1 页 30 行+翻页器在场+共 31 条', els2['sched-list']._children.length === 30 && els2['sched-pager']._children.length === 4 && /共 31 条/.test(els2['sched-pager']._children[1]._text));
    sandbox2.schedChip = 'paused';
    sandbox2.schedPaint();
    const schedRowHtml = () => els2['sched-list']._children.map(c => c.innerHTML).join('');
    ck('E2 chip=暂停的 只剩 paused 行（7 行且行内「已暂停」可辨）', els2['sched-list']._children.length === 7 && !/任务2[0-3]/.test(schedRowHtml()) && schedRowHtml().includes('已暂停'));
    sandbox2.schedChip = 'on';
    sandbox2.schedPaint();
    ck('E3 chip=排着的 只剩未暂停行（24 行、零「已暂停」）', els2['sched-list']._children.length === 24 && !schedRowHtml().includes('已暂停'));
    // chip 切换回第 1 页（经 chips 按钮真 onclick）
    sandbox2.schedChips(); // 渲染 chips 容器（3 钮：all/on/paused）
    els2['sched-chips']._children[2].onclick(); // 点「⏸ 暂停的」
    ck('E4 chip onclick 切换回第 1 页+过滤生效', els2['sched-list']._children.length === 7 && schedRowHtml().includes('已暂停'));
    // 空态：无 paused 条目时 chip=暂停的
    sandbox2.schedAllV = jobs31.slice(0, 3); // 3 条全 active → ≤30 无翻页器
    sandbox2.schedChip = 'all';
    sandbox2.schedPaint();
    ck('E5 ≤30 条翻页器不渲染且行数不变', els2['sched-list']._children.length === 3 && els2['sched-pager']._children.length === 0);
    sandbox2.schedChip = 'paused';
    sandbox2.schedPaint();
    ck('E6 chip 非全且结果空=「没有暂停的定时任务。」+翻页器清空', /没有暂停的定时任务。/.test(els2['sched-list'].innerHTML) && els2['sched-pager']._children.length === 0);
    console.log('==============================');
    console.log('ia-logic-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})();
