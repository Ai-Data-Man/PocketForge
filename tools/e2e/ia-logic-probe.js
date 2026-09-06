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
    console.log('==============================');
    console.log('ia-logic-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})();
