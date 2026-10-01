// [s107/f6 入库] 用途：回执「失败臂」迁移族回归钉（f1 删/改名 + f1b 创建/打开/引入 + f5 归档/版本恢复——
//       右栏/文件树/侧栏动作失败回执全部走消息流 addErr，零阻断式 alert；成功臂与弹窗内 in-context 族
//       （prompts/手艺/应用/商店等 s106 裁决合法形态）原样）。手法=handler 逐字提取（锚点=稳定标记非行号）
//       + AsyncFunction 桩沙盒，alert/addErr/console 全录音。
// 用法：node tools/e2e/receipt-failarms-probe.js [chat.tpl.html 路径]（缺省=dev 树模板，绿形态）。
//       红对照（改前形态复现）：git show <迁移前 ref>:forge/conf/templates/chat.tpl.html > 快照 后传参——
//       快照不入库（tmp 惯例）；断言集对快照呈现红=判别力自证。
// 来源：s107 会话 tmp/s107-f1-redgreen.mjs + s107-f1b-redgreen.mjs + s107-f5-redgreen.mjs 三探针合并
//       （s106 立项「§8.2 探针入库义务」，合并消三份结构面重复钉扎）。
'use strict';
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat.tpl.html');
const html = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok, extra) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok ? '' : '  <<' + String(extra).slice(0, 200))); ok ? pass++ : fail++; };
const grab = (re, label) => { const m = html.match(re); if (!m) { console.error('NOT FOUND: ' + label); process.exit(1); } return m; };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const ERR = '这段对话还在用这个文件夹，先归档或删对话再清理';

const mkStubs = () => {
    const rec = { alert: [], addErr: [], addInfo: [], render: 0, loadWs: 0, consoleErr: [], formRemoved: 0, loadArch: 0, loadSessions: 0 };
    return {
        rec,
        alert: (...a) => rec.alert.push(a.join(' ')),
        addErr: t => rec.addErr.push(String(t)),
        addInfo: t => rec.addInfo.push(String(t)),
        renderCurPane: () => rec.render++,
        loadWorkspaces: () => rec.loadWs++,
        console: { error: (...a) => rec.consoleErr.push(a.map(x => (x && x.message) || String(x)).join(' | ')) },
        row: { querySelectorAll: () => [{ style: {} }] },
        form: { remove: () => rec.formRemoved++ },
        loadArch: async () => rec.loadArch++,
        loadSessions: () => rec.loadSessions++,
    };
};

// ================================ f1 段：删/改名失败臂（s107/rA-f1） ================================
async function main() {
const S1 = grab(/const d=await r\.json\(\); if\(d\.ok\)\{ if\(selDir===c\.path\) selDir=d\.path;[^\n]*/, 'f1 文件夹改名臂')[0];
const S2 = grab(/const d=await r\.json\(\); if\(d\.ok\)\{ if\(selDir===c\.path\|\|selDir\.startsWith\(c\.path\+'\/'\)\) selDir='';[^\n]*/, 'f1 文件夹删除臂')[0];
const S3 = grab(/path:n\.path,name:nn\}\)\}\);\n\s*(const d=await r\.json\(\);[^\n]*)/, 'f1 文件改名臂')[1];
const S4 = grab(/path:n\.path\}\)\}\);\n\s*(const d=await r\.json\(\);[^\n]*)/, 'f1 文件删除臂')[1];
const S6 = grab(/async function wsOrgDelete\(\)\{[\s\S]*?\n\}/, 'f1 批量清理整函数')[0];
const S7 = grab(/\n(\s*)(if\(d\.ok\)\{ loadWorkspaces\(\); addInfo\('工作区已删除'\); \}[^\n]*)/, 'f1 工作区单删臂')[2];
const stripTail = s => s.replace(/\s*\};\s*$/, '');

const runStmt = async (src, stubs, dPayload, extra = {}) => {
    const r = { json: async () => dPayload };
    const defs = { c: extra.c || { path: 'docs' }, nm: extra.nm || 'x.md', selDir: extra.selDir };
    const names = ['r', 'renderCurPane', 'alert', 'addErr', ...Object.keys(defs)];
    const f = new AsyncFunction(...names, src + '\nreturn typeof selDir !== "undefined" ? selDir : null;');
    return f(r, stubs.renderCurPane, stubs.alert, stubs.addErr, ...Object.values(defs));
};
let st, out;
st = mkStubs();
await runStmt(S1, st, { ok: false, err: ERR }, { selDir: 'docs' });
ck('F1 文件夹改名失败：addErr("没改成："+err)，零 alert', String(st.rec.addErr[0] || '') === '没改成：' + ERR && st.rec.alert.length === 0);
st = mkStubs();
out = await runStmt(S1, st, { ok: true, path: 'newdocs' }, { selDir: 'docs' });
ck('F1 文件夹改名成功臂不动：selDir 跟随+零回执', out === 'newdocs' && st.rec.addErr.length === 0 && st.rec.render === 1);
st = mkStubs();
await runStmt(S2, st, { ok: false, err: ERR }, { selDir: 'docs/sub' });
ck('F1 文件夹删除失败：addErr("没删成："+err)，零 alert', String(st.rec.addErr[0] || '') === '没删成：' + ERR && st.rec.alert.length === 0);
st = mkStubs();
await runStmt(S2, st, { ok: true }, { selDir: 'docs/sub' });
ck('F1 文件夹删除成功臂不动', st.rec.render === 1 && st.rec.addErr.length === 0);
st = mkStubs();
await runStmt(S3, st, { ok: false, err: '名字含非法字符' }, {});
ck('F1 文件改名失败：addErr 透传，零 alert', String(st.rec.addErr[0] || '') === '没改成：名字含非法字符' && st.rec.alert.length === 0);
st = mkStubs();
await runStmt(S4, st, { ok: false, err: ERR }, {});
ck('F1 文件删除失败：addErr 透传，零 alert', String(st.rec.addErr[0] || '') === '没删成：' + ERR && st.rec.alert.length === 0);
const runBatch = async fetchImpl => {
    const st2 = mkStubs();
    const wsOrg = { on: true, sel: new Set(['wa', 'wb']) };
    const f = new AsyncFunction('wsOrg', 'wsBatchWarned', 'wsList', 'sessionId', 'fmtSize', 'confirm', 'fetch', 'loadWorkspaces', 'addInfo', 'addErr', 'alert', 'console', S6 + '\nawait wsOrgDelete();');
    await f(wsOrg, true, [{ id: 'wa', bytes: 10 }, { id: 'wb', bytes: 20 }], 'sess1', () => '10B', () => true, fetchImpl, st2.loadWorkspaces, st2.addInfo, st2.addErr, st2.alert, st2.console);
    return st2;
};
st = await runBatch(async () => ({ json: async () => ({ ok: true, deleted: 2, failed: [{ ws: 'wa', err: ERR }, { ws: 'wb', err: '正被活跃工作区「wc」引用' }] }) }));
ck('F1 批量部分失败：addErr「删掉了 2 个，2 个没删成：…；…」分号串接+零 alert+列表照刷',
    st.rec.addErr.length === 1 && String(st.rec.addErr[0] || '').startsWith('删掉了 2 个，2 个没删成：wa：' + ERR + '；wb：正被活跃工作区「wc」引用') && !st.rec.addErr[0].includes('\n') && st.rec.loadWs === 1 && st.rec.alert.length === 0);
st = await runBatch(async () => ({ json: async () => ({ ok: true, deleted: 2, failed: [] }) }));
ck('F1 批量全成成功臂不动：仅 addInfo', String(st.rec.addInfo[0] || '') === '已清理 2 个工作区' && st.rec.addErr.length === 0);
st = await runBatch(async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:8790'); });
ck('F1 批量网络 catch：console.error("ws批量清理失败") 原文落 console+人话兜底，零 alert',
    String(st.rec.consoleErr[0] || '').startsWith('ws批量清理失败') && String(st.rec.addErr[0] || '') === '没清理成，稍后再试一次' && st.rec.alert.length === 0);
const runWs = dPayload => {
    const st2 = mkStubs();
    new Function('d', 'loadWorkspaces', 'addInfo', 'addErr', 'alert', S7)(dPayload, st2.loadWorkspaces, st2.addInfo, st2.addErr, st2.alert);
    return st2;
};
st = runWs({ ok: false, err: ERR });
ck('F1 工作区单删失败（活跃守卫）：addErr("没删成："+err)，零 alert', String(st.rec.addErr[0] || '') === '没删成：' + ERR && st.rec.alert.length === 0 && st.rec.loadWs === 0);
st = runWs({ ok: true });
ck('F1 工作区单删成功臂不动：addInfo("工作区已删除")', String(st.rec.addInfo[0] || '') === '工作区已删除' && st.rec.loadWs === 1);

// ================================ f1b 段：创建/打开/引入失败臂（s107/rA-f1b） ================================
const B1 = grab(/path:c\.path\+'\/'\+nm,type:'file'\}\)\}\);\n\s*(const d=await r\.json\(\);[^\n]*)/, 'f1b 文件夹内建文件臂')[1];
const B2 = grab(/path:c\.path\+'\/'\+nm,type:'dir'\}\)\}\);\n\s*(const d=await r\.json\(\);[^\n]*)/, 'f1b 文件夹内建子目录臂')[1];
const B3 = grab(/(const d=await r\.json\(\); d\.ok\?renderCurPane\(\):(?:alert\('失败: '|addErr\('没取消成：')[^\n]*)/, 'f1b 取消引入臂')[1];
const B45 = grab(/try\{ const r=await fetch\('\/open\/'[^\n]*/, 'f1b 本地打开整行')[0];
const B6 = grab(/(else \{ (?:alert\('引入失败: '|addErr\('没引入成：')[^\n]*)/, 'f1b 引入失败 else 块')[1];
const B7 = stripTail(grab(/path:\(selDir\?selDir\+'\/':''\)\+nm,type:'file'\}\)\}\);\n\s*(const d=await r\.json\(\);[^\n]*)/, 'f1b 建文件臂')[1]);
const B8 = stripTail(grab(/path:\(selDir\?selDir\+'\/':''\)\+nm,type:'dir'\}\)\}\);\n\s*(const d=await r\.json\(\);[^\n]*)/, 'f1b 建目录臂')[1]);
const runOpen = async fetchImpl => {
    const st2 = mkStubs();
    const f = new AsyncFunction('fetch', 'curWs', 'n', 'addInfo', 'addErr', 'alert', 'console', B45);
    await f(fetchImpl, 'ws-x', { name: '报表.xlsx' }, st2.addInfo, st2.addErr, st2.alert, st2.console);
    return st2;
};
st = mkStubs();
await runStmt(B1, st, { ok: false, err: '名字不能以点开头' });
ck('F1B 文件夹内建文件失败：addErr("没建成："+err)，零 alert', String(st.rec.addErr[0] || '') === '没建成：名字不能以点开头' && st.rec.alert.length === 0);
st = mkStubs();
out = await runStmt(B1, st, { ok: true }, { selDir: '' });
ck('F1B 建文件成功臂不动：selDir 进新目录', out === 'docs' && st.rec.render === 1);
st = mkStubs();
await runStmt(B2, st, { ok: false, err: '已经存在同名文件或文件夹' });
ck('F1B 文件夹内建子目录失败：addErr 透传，零 alert', String(st.rec.addErr[0] || '') === '没建成：已经存在同名文件或文件夹' && st.rec.alert.length === 0);
st = mkStubs();
await runStmt(B3, st, { ok: false, err: '链接已在别处管理' });
ck('F1B 取消引入失败：addErr("没取消成："+err)，零 alert', String(st.rec.addErr[0] || '') === '没取消成：链接已在别处管理' && st.rec.alert.length === 0);
st = await runOpen(async () => ({ json: async () => ({ ok: false, err: '文件没找到或名字不对' }) }));
ck('F1B 打开失败：addErr("没打开成："+err)，零 alert+成功孪生在场', String(st.rec.addErr[0] || '') === '没打开成：文件没找到或名字不对' && st.rec.alert.length === 0 && B45.includes("addInfo('已在电脑上打开 '"));
st = await runOpen(async () => { throw new Error('Failed to fetch (net::ERR_CONNECTION_RESET)'); });
ck('F1B 打开 catch：console.error 原文落 console+人话兜底，零 alert 零英文',
    String(st.rec.consoleErr[0] || '').startsWith('本地打开失败') && String(st.rec.addErr[0] || '') === '没打开成，稍后再试一次' && st.rec.alert.length === 0 && !st.rec.addErr.some(t => /[A-Za-z]{4}/.test(t)));
st = mkStubs();
new Function('d', 'row', 'form', 'alert', 'addErr', 'if(0);\n' + B6)({ ok: false, err: '当前工作区不存在' }, st.row, st.form, st.alert, st.addErr);
ck('F1B 引入失败：addErr("没引入成："+err)+按钮复位+表单移除，零 alert', String(st.rec.addErr[0] || '') === '没引入成：当前工作区不存在' && st.rec.formRemoved === 1 && st.rec.alert.length === 0);
ck('F1B 引入成功孪生在场：addInfo("以链接方式引进本对话")', html.includes("addInfo('已把「'+wsDisplayName(w)+'」以链接方式引进本对话，里面的文件都能 @ 引用了。')"));
st = mkStubs();
await runStmt(B7, st, { ok: false, err: '名字不能以点开头' });
ck('F1B 右栏建文件失败：addErr("没建成：")，零 alert', String(st.rec.addErr[0] || '') === '没建成：名字不能以点开头' && st.rec.alert.length === 0);
st = mkStubs();
out = await runStmt(B8, st, { ok: true }, { selDir: 'docs' });
ck('F1B 右栏建目录成功臂不动：selDir 手术保持', out === 'docs/x.md' && st.rec.render === 1);

// ================================ f5 段：归档/版本恢复失败臂（s107/f5） ================================
const ARCH = grab(/async function archiveSession\(sid,arch\)\{[\s\S]*?\n\}/, 'f5 archiveSession 整函数')[0];
const R1 = grab(/(else \{ [^\n]*rs\.textContent='恢复'; \})/, 'f5 恢复 fail 臂')[1];
const R2 = grab(/(catch\(e\)\{ [^\n]*rs\.textContent='恢复'; \})/, 'f5 恢复 catch 臂')[1];
const runArch = async fetchImpl => {
    const st2 = mkStubs();
    const f = new AsyncFunction('sid', 'arch', 'fetch', 'loadArch', 'loadSessions', 'loadWorkspaces', 'addInfo', 'alert', 'addErr', 'console', ARCH + '\nawait archiveSession("s1", true);');
    await f('s1', true, fetchImpl, st2.loadArch, st2.loadSessions, st2.loadWorkspaces, st2.addInfo, st2.alert, st2.addErr, st2.console);
    return st2;
};
st = await runArch(async () => ({ json: async () => ({ ok: false, err: '缺 sid' }) }));
ck('F5 归档失败臂：addErr("没归档成："+err)，零 alert', String(st.rec.addErr[0] || '') === '没归档成：缺 sid' && st.rec.alert.length === 0);
st = await runArch(async () => { throw new Error('Failed to fetch (net)'); });
ck('F5 归档 catch：console.error("归档失败") 原文落 console+人话兜底，零 alert 零英文',
    String(st.rec.consoleErr[0] || '').startsWith('归档失败') && String(st.rec.addErr[0] || '') === '没归档成，稍后再试一次' && st.rec.alert.length === 0);
st = await runArch(async () => ({ json: async () => ({ ok: true }) }));
ck('F5 归档成功臂不动：addInfo("已归档")', String(st.rec.addInfo[0] || '') === '已归档' && st.rec.loadArch === 1);
const runRestore = (src, prep) => {
    const st2 = mkStubs();
    const rs = { disabled: false, textContent: '恢复中…' };
    new Function('dd', 'rr', 'rs', 'f', 'v', 'renderCurPane', 'addInfo', 'alert', 'addErr', 'console', prep + src)(null, null, rs, { name: 'x/y.md', size: 1 }, { time: 'T', oid: 'o' }, st2.renderCurPane, st2.addInfo, st2.alert, st2.addErr, st2.console);
    return { st: st2, rs };
};
let rr = runRestore(R1, 'dd={ok:false,err:"文件没找到或名字不对"}; if(dd.ok){}');
ck('F5 恢复失败臂：addErr("没恢复成："+err)+按钮复位，零 alert', String(rr.st.rec.addErr[0] || '') === '没恢复成：文件没找到或名字不对' && rr.rs.textContent === '恢复' && rr.st.rec.alert.length === 0);
rr = runRestore(R2, 'try{ throw new Error("network reset") }');
ck('F5 恢复 catch：console.error("版本恢复失败") 原文落 console+人话兜底+按钮复位，零 alert 零英文',
    String(rr.st.rec.consoleErr[0] || '').startsWith('版本恢复失败') && String(rr.st.rec.addErr[0] || '') === '没恢复成，稍后再试一次' && rr.rs.disabled === false && rr.st.rec.alert.length === 0);
ck('F5 恢复成功孪生在场：addInfo("恢复到上一版")', html.includes("addInfo('已把「'+f.name.split('/').pop()+'」恢复到上一版。')"));

// ================================ 结构面（三合一统一钉扎） ================================
const cnt = re => (html.match(re) || []).length;
const nAlert = cnt(/alert\(/g);
ck('S1 全模板 alert 总数=25（44-f1 7-f1b 8-f5 4）', nAlert === 25);
ck('S2 已迁移族清零：改名失败/删除失败/创建失败/打不开/引入失败/失败: /操作失败/恢复失败 全 0',
    ['改名失败', '删除失败', '创建失败', '打不开', '引入失败', '失败: ', '操作失败', '恢复失败'].every(w => cnt(new RegExp("alert\\('" + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) === 0));
ck('S3 弹窗内 in-context 族原样（s106 裁决合法形态，本族不碰）：没保存成×1/没存成×1/没删成×5/处理了×1',
    cnt(/alert\('没保存成/g) === 1 && cnt(/alert\('没存成/g) === 1 && cnt(/alert\('没删成/g) === 5 && cnt(/alert\('处理了/g) === 1);

console.log('==============================\nreceipt-failarms-probe[' + file + ']: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('PROBE-THREW:', e); process.exit(1); });
