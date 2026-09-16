// s74 qa 审查探针：IA-1/IA-2 静态发现的两处疑似缺陷的运行时取证（无桥无网络，纯 DOM 桩沙盒）。
// 手法同 tools/e2e/ui-logic-probe.js：从 chat.tpl.html 原文正则锚点逐字提取被审函数，最小 DOM 桩执行。
// 发现A：renderSessions 归档视图空态/搜索空态早退不调 pagerPaint → arch-pager 残留旧翻页钮（对照：paintInstalled 清了）。
// 发现B：loadSkills2 过滤后空集 → 静默空白无空态文案（对照：paintInstalled 有「没有找到」）。
'use strict';
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../../forge/conf/templates/chat.tpl.html', 'utf8');
function grab(re, label) { const m = html.match(re); if (!m) { console.error('NOT FOUND: ' + label); process.exit(1); } return m[0]; }

const renderSessionsSrc = grab(/function renderSessions\(list\)\{[\s\S]+?\n\}/, 'renderSessions');
const paintSideChipsSrc = grab(/function paintSideChips\(\)\{[\s\S]+?\n\}/, 'paintSideChips');
const pageSliceSrc = grab(/function pageSlice\(arr,key,n\)\{[\s\S]+?\n\}/, 'pageSlice');
const pagerPaintSrc = grab(/function pagerPaint\(id,page,pages,total,go\)\{[\s\S]+?\n\}/, 'pagerPaint');
const sessItemSrc = grab(/function sessItem\(s,archived\)\{[\s\S]+?\n\}/, 'sessItem');
const tsLocalSrc = grab(/function tsLocal\(s\)\{[\s\S]+?\n\}/, 'tsLocal');
const fmtMDHMSrc = grab(/function fmtMDHM\(d\)\{[^\n]+\}/, 'fmtMDHM');
const escSrc = grab(/function esc\(s\)\{[^\n]+\}/, 'esc');
const skillOriginBadgeSrc = grab(/function skillOriginBadge\(sk\)\{[\s\S]+?\n\}/, 'skillOriginBadge');
const skillsOriginClassSrc = grab(/function skillsOriginClass\(sk\)\{[\s\S]+?\n\}/, 'skillsOriginClass'); // s95/S2a：来源 chip 判据（paintInstalled 新依赖）
const paintInstalledSrc = grab(/function paintInstalled\(\)\{[\s\S]+?\n\}/, 'paintInstalled');
const loadSkills2Src = grab(/async function loadSkills2\(\)\{[\s\S]+?\n\}/, 'loadSkills2');

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
    const SKILL_N=12, PAGE_N=30;
    const skillsFilter={chip:'all'}; // s95/S2a
    ${skillsOriginClassSrc}
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
ck('A0 对照: pager 绘出(pages=3, 3子节点)', els['arch-pager']._children.length === 3);
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
    console.log('==============================');
    console.log('ia-logic-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})();
