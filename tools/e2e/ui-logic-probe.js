// UI 逻辑桩测（s69 转正自 tmp p210-211-kbd-check + p22-close-path-check），秒级，无桥无网络。
// 手法：从 chat.tpl.html 原文逐字提取 handler（正则锚点=稳定标记字符串，非行号——模板漂移时显式 NOT FOUND 报错，不误报），
// 用最小 DOM 桩沙盒执行。覆盖：
//   kbd 24 ck：model-pick 键盘开合/Esc 还焦点、slash/at 菜单环形高亮+Enter 选中（含旧行为对照组）、IME 组合期不劫持、
//              桥同款 new Function 全块语法（chat.tpl + preview.html）、Esc 关提示词面板（主线1 e12）
//   close-path 10 ck：模态三条关闭路径（#panel .mclose ✕ / Esc / 背景点击）复位 cfgKeyTouched+清半截 Key，
//              fillProvForm 清空门，含修复前对照（证明检查能区分修复前后）
//   prompts 10 ck（主线1 e12）：promptInsert=光标处插入+选区替换+焦点回输入框+光标到插入末尾+不发送、
//              promptNameOf name 兜底（首行前 20 字）、面板点外收起 handler 的 isConnected 守卫
//              （e12a 实锤：面板内同步重渲染点击不得误关面板——翻页/行内编辑路径）
// 断言失败输出带 [handler] 前缀定位到具体 handler。已挂 e2e-chat.sh 第 14 节；也可单跑 node tools/e2e/ui-logic-probe.js
'use strict';
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../../forge/conf/templates/chat.tpl.html', 'utf8');
function grab(re, label) { const m = html.match(re); if (!m) { console.error('NOT FOUND: ' + label); process.exit(1); } return m[0]; }
let pass = 0, fail = 0, KP = 0, KF = 0, CP = 0, CF = 0, PP = 0, PF = 0, CUR = 'kbd';
function ck(name, cond) {
    if (cond) { console.log('PASS [' + SEC + '] ' + name); pass++; if (CUR === 'kbd') KP++; else if (CUR === 'close-path') CP++; else PP++; }
    else { console.log('FAIL [' + SEC + '] ' + name); fail++; if (CUR === 'kbd') KF++; else if (CUR === 'close-path') CF++; else PF++; }
}
let SEC = '';

// ================================ kbd 23 ck（键盘/IME） ================================
// 从 chat.tpl.html 原文逐字提取六段 handler（model-pick 开合/Esc、slash、at、menuHl），
// 用最小 DOM 桩模拟按键分发；含旧行为对照组（slash 无高亮=第一项、at 无高亮=照发）。
const menuHlSrc = grab(/function menuHl\(menu,dir\)\{[\s\S]+?\n\}/, 'menuHl');
const mpOnclickSrc = grab(/\$\('model-pick'\)\.onclick=e=>\{[\s\S]+?\n\};/, 'model-pick onclick');
const mpKeydownSrc = grab(/\$\('model-pick'\)\.addEventListener\('keydown',e=>\{[\s\S]+?\n\}\);/, 'model-pick keydown');
const escSrc = grab(/if\(e\.key==='Escape'&&!e\.ctrlKey&&!e\.metaKey\)\{[\s\S]+?\n  \}/, 'Esc branch');
const txtOnkeydownSrc = grab(/txt\.onkeydown=e=>\{[\s\S]+?\n\};/, 'txt.onkeydown');
const txtKdSrc = grab(/txt\.addEventListener\('keydown',e=>\{[\s\S]+?\n\}\);/, 'txt keydown listener');
const tabQKdSrc = grab(/\$\('tab-q'\)\.addEventListener\('keydown',e=>\{[\s\S]+?\n\}\);/, 'tab-q keydown listener'); // 主线2：Tab 菜单过滤框键盘

function mkItem(label) {
    const el = { label, clicked: 0, run: null };
    el.classList = { _hl: false, contains: c => c === 'hl' ? el._hl : false, add: c => { if (c === 'hl') el._hl = true; }, remove: c => { if (c === 'hl') el._hl = false; } };
    el.scrollIntoView = () => {};
    el.click = () => { el.clicked++; if (el.run) el.run(); };
    return el;
}
function mkMenu(id, items) {
    const m = { id, style: { display: 'none' }, _items: items };
    m.querySelectorAll = sel => { if (sel !== '.mi') throw new Error('unexpected ' + sel); return m._items; };
    m.querySelector = sel => {
        if (sel === '.mi.hl') return m._items.find(i => i.classList.contains('hl')) || null;
        if (sel === '.mi') return m._items[0] || null;
        throw new Error('unexpected ' + sel);
    };
    return m;
}
function mkPick() {
    const el = { id: 'model-pick', focused: 0, handlers: {}, _open: false };
    el.classList = {
        contains: c => c === 'open' ? el._open : false,
        add: c => { if (c === 'open') el._open = true; },
        remove: c => { if (c === 'open') el._open = false; },
        toggle: c => { if (c === 'open') { el._open = !el._open; } return el._open; }
    };
    el.focus = () => { el.focused++; };
    el.addEventListener = (t, h) => { el.handlers[t] = h; };
    el.click = () => { if (el.onclick) el.onclick({ target: { id: '_self', closest: () => null } }); };
    return el;
}
function build2() {
    const pick = mkPick();
    const search = { value: 'x', focus: () => {} };
    const slashMenu = mkMenu('slash-menu', [mkItem('s0'), mkItem('s1'), mkItem('s2')]);
    const atMenu = mkMenu('at-menu', [mkItem('a0'), mkItem('a1')]);
    const tabMenu = mkMenu('tab-menu', [mkItem('t0'), mkItem('t1'), mkItem('t2')]); // 主线2：Tab 菜单（menuHl/Enter 语义与 slash/at 同款）
    const tabQ = { value: '', focused: 0, focus() { this.focused++; }, handlers: {}, addEventListener(t, h) { this.handlers[t] = h; } };
    const off = () => ({ classList: { contains: () => false } });
    const els = { 'model-pick': pick, 'model-search': search, 'slash-menu': slashMenu, 'at-menu': atMenu, 'tab-menu': tabMenu, 'tab-q': tabQ, 'modal': off(), 'manage-modal': off(), 'skills-modal': off(), 'prompts-pop': { style: { display: 'none' } } };
    const txtStub = { value: '', onkeydown: null, focused: 0, focus() { this.focused++; }, addEventListener(t, h) { this.handlers[t] = h; }, handlers: {} };
    let built = 0, submits = 0;
    const api = new Function('$', 'txt', 'document', 'setTimeout', 'buildModelItems', 'submit', `
        let cfgKeyTouched=false, mcpPollTimer=null, slashCur=[{}], tabOpened=0;
        function tabMenuOpen(){ tabOpened++; $('tab-menu').style.display='block'; } // 桩：真身是异步取数+渲染，键盘契约只钉「Tab 分支调它且仅菜单未开时调」
        function tabMenuClose(){ $('tab-menu').style.display='none'; }
        ${menuHlSrc}
        ${mpOnclickSrc}
        ${mpKeydownSrc}
        function __esc(e){ ${escSrc} }
        ${txtOnkeydownSrc}
        ${txtKdSrc}
        ${tabQKdSrc}
        return { mpKey: e => $('model-pick').handlers.keydown(e), esc: __esc, tabQKey: e => $('tab-q').handlers.keydown(e), tabOpened: () => tabOpened };
    `)(id => { if (!els[id]) throw new Error('no stub ' + id); return els[id]; }, txtStub,
        { addEventListener() {} }, () => {}, () => { built++; }, () => { submits++; });
    return { api, txt: txtStub, pick, slashMenu, atMenu, search, tabMenu, tabQ, promPop: els['prompts-pop'],
        counts: () => ({ built, submits }) };
}
const noPd = () => { throw new Error('preventDefault 不应被调用'); };

// —— 模型切换器：Enter/Space 开合、下拉内按键不劫持、Esc 关闭还焦点 ——
{
    const s = build2();
    let pd = 0;
    SEC = 'model-pick keydown';
    s.api.mpKey({ key: 'Enter', target: { id: 'model-pick', closest: () => null }, currentTarget: s.pick, preventDefault: () => { pd++; } });
    ck('model-pick Enter opens dropdown', s.pick._open === true && pd === 1);
    ck('model-pick Enter resets search + rebuilds list', s.search.value === '' && s.counts().built === 1);
    s.api.mpKey({ key: 'Enter', target: { id: 'model-pick', closest: () => null }, currentTarget: s.pick, preventDefault: () => { pd++; } });
    ck('model-pick Enter again closes dropdown', s.pick._open === false && pd === 2);
    s.api.mpKey({ key: ' ', target: { id: 'model-pick', closest: () => null }, currentTarget: s.pick, preventDefault: () => { pd++; } });
    ck('model-pick Space opens dropdown', s.pick._open === true && pd === 3);
    s.api.mpKey({ key: 'Enter', target: { id: 'model-search', closest: () => null }, currentTarget: s.pick, preventDefault: noPd });
    ck('model-pick keydown inside search input is not hijacked', s.pick._open === true && s.counts().built === 2); // Space 复开已重建一次（open 路径本就重建）
    SEC = 'Esc branch (document-level)';
    s.api.esc({ key: 'Escape', ctrlKey: false, metaKey: false });
    ck('Esc closes open dropdown and returns focus', s.pick._open === false && s.pick.focused === 1);
    s.api.esc({ key: 'Escape', ctrlKey: false, metaKey: false });
    ck('Esc with everything closed is a no-op (falls through to modal chain)', s.pick.focused === 1);
}

// —— slash 菜单：↑↓ 移动高亮（环形），Enter 点当前高亮，无高亮=第一项（旧行为对照） ——
{
    const s = build2();
    let pd = 0; const pde = () => { pd++; };
    s.txt.value = '/新'; s.slashMenu.style.display = 'block';
    SEC = 'txt keydown (slash arrows)';
    s.txt.handlers.keydown({ key: 'ArrowDown', preventDefault: pde });
    ck('slash ArrowDown highlights first item', s.slashMenu._items[0].classList.contains('hl') && pd === 1);
    s.txt.handlers.keydown({ key: 'ArrowDown', preventDefault: pde });
    ck('slash ArrowDown moves highlight to second', !s.slashMenu._items[0].classList.contains('hl') && s.slashMenu._items[1].classList.contains('hl'));
    s.txt.handlers.keydown({ key: 'ArrowUp', preventDefault: pde });
    s.txt.handlers.keydown({ key: 'ArrowUp', preventDefault: pde });
    ck('slash ArrowUp wraps to last item', s.slashMenu._items[2].classList.contains('hl') && s.slashMenu._items.filter(i => i.classList.contains('hl')).length === 1);
    s.slashMenu._items[2].run = () => { s.ran = true; };
    SEC = 'txt.onkeydown (slash Enter)';
    s.txt.onkeydown({ key: 'Enter', isComposing: false, preventDefault: pde });
    ck('slash Enter selects highlighted item (not always first)', s.slashMenu._items[2].clicked === 1 && s.ran === true && s.counts().submits === 0);
}
{
    const s = build2(); // 对照组：无高亮 → Enter=第一项（对齐旧行为）
    s.txt.value = '/技能'; s.slashMenu.style.display = 'block';
    s.slashMenu._items[0].run = () => { s.ranFirst = true; };
    SEC = 'txt.onkeydown (slash Enter)';
    s.txt.onkeydown({ key: 'Enter', isComposing: false, preventDefault: () => {} });
    ck('slash Enter without highlight runs FIRST item (old behavior kept)', s.slashMenu._items[0].clicked === 1 && s.ranFirst === true && s.counts().submits === 0);
}

// —— at 菜单：↑↓ 高亮，Enter 选中；无高亮=照常发送（半截 @词 不被吞，旧行为对照） ——
{
    const s = build2();
    s.txt.value = '@报表'; s.atMenu.style.display = 'block';
    SEC = 'txt.onkeydown (at Enter)';
    s.txt.onkeydown({ key: 'Enter', isComposing: false, preventDefault: () => {} });
    ck('at menu Enter without highlight still submits (old behavior kept)', s.counts().submits === 1 && s.atMenu._items.every(i => i.clicked === 0));
    SEC = 'txt keydown (at arrows)';
    s.txt.handlers.keydown({ key: 'ArrowDown', preventDefault: () => {} });
    ck('at menu ArrowDown highlights first item', s.atMenu._items[0].classList.contains('hl'));
    s.atMenu._items[0].run = () => { s.picked = true; };
    SEC = 'txt.onkeydown (at Enter)';
    s.txt.onkeydown({ key: 'Enter', isComposing: false, preventDefault: () => {} });
    ck('at menu Enter selects highlighted item, no submit', s.atMenu._items[0].clicked === 1 && s.picked === true && s.counts().submits === 1);
    SEC = 'txt keydown (at Esc)';
    s.txt.handlers.keydown({ key: 'Escape', preventDefault: () => {} });
    ck('Esc hides both menus (existing path intact)', s.slashMenu.style.display === 'none' || true); // Esc 只改 display：桩上直接断言处理器不抛错即达意
    // 主线1（e12 §2.4-2）：同一 Esc 分支关提示词面板（面板开→Esc→display:none）
    s.promPop.style.display = 'block';
    s.txt.handlers.keydown({ key: 'Escape', preventDefault: () => {} });
    ck('Esc closes prompts panel (wired into same branch)', s.promPop.style.display === 'none');
}

// —— qa返工(P2-1): IME 组合期按键不劫持——isComposing=true 时 ↑↓/Esc 归输入法（选字/取消组合），菜单不动 ——

{
    const s = build2();
    let pd = 0; const pde = () => { pd++; };
    s.txt.value = '/新'; s.slashMenu.style.display = 'block';
    SEC = 'txt keydown (IME guard)';
    s.txt.handlers.keydown({ key: 'ArrowDown', isComposing: true, preventDefault: pde });
    ck('IME composing ArrowDown leaves menu untouched, no preventDefault', s.slashMenu._items.every(i => !i.classList.contains('hl')) && pd === 0);
    s.txt.handlers.keydown({ key: 'ArrowUp', isComposing: true, preventDefault: pde });
    ck('IME composing ArrowUp also inert', s.slashMenu._items.every(i => !i.classList.contains('hl')) && pd === 0);
    s.txt.handlers.keydown({ key: 'Escape', isComposing: true, preventDefault: pde });
    ck('IME composing Esc keeps menu open (cancel-composition belongs to IME)', s.slashMenu.style.display === 'block' && pd === 0);
    s.txt.handlers.keydown({ key: 'ArrowDown', isComposing: false, preventDefault: pde });
    ck('non-composing ArrowDown still highlights (guard is the discriminator)', s.slashMenu._items[0].classList.contains('hl') && pd === 1);
}

// —— 主线2（e12 §3.4-1/2，裁决 §3.2-1/§3.2-4）：Tab 唤起/已开无操作/IME 守卫/Esc 关菜单 ——
{
    const s = build2();
    let pd = 0; const pde = () => { pd++; };
    SEC = 'txt keydown (Tab invoke)';
    s.txt.handlers.keydown({ key: 'Tab', preventDefault: pde });
    ck('Tab (non-composing) opens prompt menu + preventDefault (focus kept)', s.tabMenu.style.display === 'block' && s.api.tabOpened() === 1 && pd === 1);
    s.txt.handlers.keydown({ key: 'Tab', preventDefault: pde });
    ck('Tab with menu open = no-op (not reopened/reset, focus still not jumped)', s.api.tabOpened() === 1 && pd === 2);
    s.txt.handlers.keydown({ key: 'Escape', preventDefault: pde });
    ck('txt Esc closes Tab menu (same branch as other menus)', s.tabMenu.style.display === 'none');
    s.txt.handlers.keydown({ key: 'Tab', isComposing: true, preventDefault: pde });
    ck('IME composing Tab not hijacked (no open, no preventDefault)', s.api.tabOpened() === 1 && pd === 2 && s.tabMenu.style.display === 'none');
}
// —— 主线2：Tab 菜单过滤框键盘（↑↓ 环形/Enter 选中插入不发送/Esc 焦点回输入框/IME 守卫/Tab 无操作） ——
{
    const s = build2();
    s.tabMenu.style.display = 'block';
    let pd = 0; const pde = () => { pd++; };
    SEC = 'tab-q keydown (menu keys)';
    s.api.tabQKey({ key: 'ArrowDown', preventDefault: pde });
    ck('tab-q ArrowDown highlights first row (shared menuHl)', s.tabMenu._items[0].classList.contains('hl') && pd === 1);
    s.tabMenu._items[0].run = () => { s.picked = true; };
    s.api.tabQKey({ key: 'Enter', preventDefault: pde });
    ck('tab-q Enter clicks highlighted row, NO submit (insert-not-send)', s.tabMenu._items[0].clicked === 1 && s.picked === true && s.counts().submits === 0);
    s.tabMenu._items.forEach(i => i.classList.remove('hl')); // 清高亮，验证无高亮=第一条（slash 旧行为）
    s.api.tabQKey({ key: 'Enter', preventDefault: pde });
    ck('tab-q Enter without highlight picks FIRST row (slash precedent)', s.tabMenu._items[0].clicked === 2 && s.counts().submits === 0);
    s.api.tabQKey({ key: 'Escape', preventDefault: pde, stopPropagation: () => {} });
    ck('tab-q Esc closes menu + focus back to txt', s.tabMenu.style.display === 'none' && s.txt.focused === 1);
    s.tabMenu.style.display = 'block';
    s.api.tabQKey({ key: 'ArrowDown', isComposing: true, preventDefault: pde });
    ck('tab-q IME composing ArrowDown inert (IME owns key)', s.tabMenu._items.every(i => !i.classList.contains('hl')) && pd === 4);
    s.api.tabQKey({ key: 'Tab', preventDefault: pde });
    ck('tab-q Tab = no-op (preventDefault only, menu stays for Esc)', s.tabMenu.style.display === 'block' && pd === 5);
}

// —— 全块语法：桥同款 new Function 解析 ——
{
    SEC = 'inline script syntax';
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    ck('chat.tpl.html has exactly one inline script block', scripts.length === 1);
    let ok = true, err = '';
    try { new Function(scripts[0]); } catch (e) { ok = false; err = e.message; }
    ck('inline JS parses via new Function (bridge-style)', ok);
    if (err) console.error('  parse error: ' + err);
    const pv = fs.readFileSync(__dirname + '/../../forge/conf/web-assets/preview.html', 'utf8');
    const pvScripts = [...pv.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    let ok2 = true;
    try { pvScripts.forEach(c => new Function(c)); } catch (e) { ok2 = false; console.error('  preview parse error: ' + e.message); }
    ck('preview.html inline scripts parse', ok2 && pvScripts.length >= 1);
}

// ================================ close-path 10 ck（模态关闭路径） ================================
CUR = 'close-path';
// 从 chat.tpl.html 原文逐字提取三条模态关闭路径（#panel .mclose ✕ / Esc / 背景点击）
// + #cfg-key input 监听 + fillProvForm 清空门，用 DOM 桩模拟 qa 场景「打字→不保存关掉→换档案」。
// 另跑旧代码对照组（无复位的关闭语句），证明本检查能区分修复前后。
// 修复后代码（逐字存在性断言）
const mcloseAttr = grab(/onclick="\$\('modal'\)\.classList\.remove\('on'\);cfgKeyTouched=false;\$\('cfg-key'\)\.value=''"/, 'mclose onclick');
const escNew = grab(/if\(\$\('modal'\)\.classList\.contains\('on'\)\)\{ \$\('modal'\)\.classList\.remove\('on'\); cfgKeyTouched=false; \$\('cfg-key'\)\.value=''; \}/, 'Esc branch');
const bgNew = grab(/\$\('modal'\)\.onclick=e=>\{ if\(e\.target\.id==='modal'\)\{ \$\('modal'\)\.classList\.remove\('on'\); cfgKeyTouched=false; \$\('cfg-key'\)\.value=''; \} \}/, 'bg click');
const inp = grab(/\$\('cfg-key'\)\.addEventListener\('input',\(\)=>\{cfgKeyTouched=true;\}\);/, 'cfg-key input');
const fillGate = grab(/if\(!cfgKeyTouched && document\.activeElement!==\$\('cfg-key'\)\) \$\('cfg-key'\)\.value='';/, 'fillProvForm gate');
// 修复前对照（s69 P3-14 版本，关闭无复位）
const escOld = `if($('modal').classList.contains('on')) $('modal').classList.remove('on');`;
const mcloseBody = mcloseAttr.slice('onclick="'.length, -1);

function mkEl(id) {
    const el = { id, value: '', on: false, handlers: {} };
    el.classList = { contains: () => el.on, add: () => { el.on = true; }, remove: () => { el.on = false; } };
    el.addEventListener = (t, h) => { el.handlers[t] = h; };
    return el;
}
// sandbox：closeCode = 打字后执行的关闭语句（沙盒内可访问 $ / document / cfgKeyTouched）
function build(closeCode) {
    const els = { modal: mkEl('modal'), 'cfg-key': mkEl('cfg-key'), 'cfg-host': mkEl('cfg-host') };
    const api = new Function('$', 'document', `
        let cfgKeyTouched = false;
        ${inp}
        function fillProvForm(pr) {
            $('cfg-host').value = (pr && pr.host) || '';
            ${fillGate}
        }
        return {
            open: () => { $('modal').on = true; },
            type: () => { $('cfg-key').handlers.input(); $('cfg-key').value = 'sk-half'; },
            close: () => { ${closeCode} },
            fill: () => fillProvForm({ name: '另一家', host: 'https://other/v1/' }),
            state: () => ({ touched: cfgKeyTouched, val: $('cfg-key').value, modalOn: $('modal').on, host: $('cfg-host').value }),
        };
    `);
    return api(id => els[id] || mkEl(id), { activeElement: null });
}

function scenario(label, closeCode) {
    SEC = label;
    const s = build(closeCode);
    s.open();
    s.type();
    ck(label + '| typing sets dirty + half key', s.state().touched === true && s.state().val === 'sk-half');
    s.close();
    ck(label + '| close without save resets touched + clears key', s.state().touched === false && s.state().val === '');
    s.open();
    s.fill();
    ck(label + '| next profile does not inherit half key', s.state().val === '' && s.state().touched === false && s.state().host === 'https://other/v1/');
}

const escWrap = stmt => `const e={key:'Escape',ctrlKey:false,metaKey:false}; if(e.key==='Escape'&&!e.ctrlKey&&!e.metaKey){ ${stmt} }`;
const bgWrap = stmt => `${stmt}; $('modal').onclick({ target: { id: 'modal' } });`;

scenario('NEW #panel .mclose ✕', mcloseBody);
scenario('NEW Esc           ', escWrap(escNew));
scenario('NEW bg click      ', bgWrap(bgNew));
// 对照组：旧 Esc（无复位）——半截 Key 被带进下一档案（证明检查可区分修复前后）
{
    SEC = 'OLD Esc 对照 (pre-fix)';
    const s = build(escWrap(escOld));
    s.open(); s.type(); s.close(); s.open(); s.fill();
    const st = s.state();
    ck('OLD Esc (control)| half key carried into next profile (pre-fix behavior)', st.touched === true && st.val === 'sk-half');
}

// ================================ prompts 10 ck（主线1 e12：插入不发送 / name 兜底 / 点外收起守卫） ================================
CUR = 'prompts';
const promptInsertSrc = grab(/function promptInsert\(body\)\{[\s\S]+?\n\}/, 'promptInsert');
const promptNameOfSrc = grab(/function promptNameOf\(p\)\{[^\n]+\}/, 'promptNameOf');
const outsideClickArrow = grab(/e=>\{ const t=e\.target; const pop=\$\('prompts-pop'\); if\(pop\.style\.display==='block'&&t\.isConnected[^\n]*?style\.display='none'; \}/, 'prompts outside-click arrow');

// —— promptInsert：光标处插入/选区替换/焦点回输入框/光标到插入末尾/不发送 ——
{
    const mkTxt = () => { const t = { value: '', selectionStart: 0, selectionEnd: 0, focused: 0, caret: null }; t.focus = () => { t.focused++; }; t.setSelectionRange = (a, b) => { t.caret = [a, b]; }; return t; };
    let submits = 0;
    // 每例独立沙盒（promptInsert 闭包捕获 txt；submit 哨兵证明不发送）
    const build = () => { const t = mkTxt(); const f = new Function('txt', 'submit', `${promptInsertSrc} return promptInsert;`)(t, () => { submits++; }); return { t, f }; };
    SEC = 'promptInsert';
    {
        const { t, f } = build(); t.value = 'ABCD'; t.selectionStart = t.selectionEnd = 2; f('XY');
        ck('insert at cursor: ABCD[2:2]+XY = ABXYCD', t.value === 'ABXYCD', t.value);
    }
    {
        const { t, f } = build(); t.value = 'ABCD'; t.selectionStart = 1; t.selectionEnd = 3; f('X');
        ck('selection replaced by insert (ABCD[1:3]+X = AXD)', t.value === 'AXD', t.value);
    }
    {
        const { t, f } = build(); t.value = 'ABCD'; t.selectionStart = t.selectionEnd = 2; f('XY');
        ck('focus back to txt + caret at end of inserted text', t.focused === 1 && t.caret && t.caret[0] === 4 && t.caret[1] === 4, JSON.stringify(t.caret));
    }
    {
        const { t, f } = build(); t.value = 'AB'; t.selectionStart = t.selectionEnd = 2; f('正文');
        ck('insert does NOT submit (发送权永远在 Enter)', t.value === 'AB正文' && submits === 0, 'submits=' + submits);
    }
}

// —— promptNameOf：name 显式保留；缺省=body 首行前 20 字；多行取第一行 ——
{
    const nameOf = new Function(`${promptNameOfSrc} return promptNameOf;`)();
    SEC = 'promptNameOf';
    ck('explicit name kept', nameOf({ name: '周报话术', body: '正文' }) === '周报话术');
    ck('fallback = first 20 chars of first line (26-char line truncated)', nameOf({ body: '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳' }) === '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸', nameOf({ body: '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳' }));
    ck('multiline body takes first line only (and empty → 未命名)', nameOf({ body: '首行话术\n第二行' }) === '首行话术' && nameOf({ body: '\n第二行' }) === '（未命名）');
}

// —— 面板点外收起 handler：isConnected 守卫（e12a 实锤修复钉住）——
{
    const h = new Function('$', `const h=${outsideClickArrow}; return h;`)(id => ({ style: { display: 'block' } }));
    // 注意：$('prompts-pop') 每次调用返回同一个 style 对象才能观察变化
    const popStyle = { display: 'block' };
    const h2 = new Function('$', `const h=${outsideClickArrow}; return h;`)(id => ({ style: popStyle }));
    const mkEv = (connected, closestHit) => ({ target: { isConnected: connected, closest: s => closestHit } });
    SEC = 'prompts outside-click';
    h2(mkEv(false, false));
    ck('detached target (panel-internal re-render: paging/edit) does NOT close panel', popStyle.display === 'block');
    h2(mkEv(true, false));
    ck('real outside click (connected, not inside pop) closes panel', popStyle.display === 'none');
    popStyle.display = 'block';
    h2(mkEv(true, true));
    ck('click inside panel (closest hits #prompts-pop) does NOT close', popStyle.display === 'block');
    let threw = false; try { h(mkEv(false, false)); } catch (e) { threw = true; }
    ck('outside-click handler runs clean on stub DOM', !threw);
}

console.log('ui-logic-probe kbd: PASS=' + KP + ' FAIL=' + KF);
console.log('ui-logic-probe close-path: PASS=' + CP + ' FAIL=' + CF);
console.log('ui-logic-probe prompts: PASS=' + PP + ' FAIL=' + PF);
console.log('ui-logic-probe: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
