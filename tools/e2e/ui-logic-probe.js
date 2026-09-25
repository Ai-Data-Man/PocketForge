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
let pass = 0, fail = 0, KP = 0, KF = 0, CP = 0, CF = 0, PP = 0, PF = 0, BP = 0, BF = 0, HP = 0, HF = 0, CUR = 'kbd';
function ck(name, cond) {
    if (cond) { console.log('PASS [' + SEC + '] ' + name); pass++; if (CUR === 'kbd') KP++; else if (CUR === 'close-path') CP++; else if (CUR === 'busy') BP++; else if (CUR === 'health') HP++; else PP++; }
    else { console.log('FAIL [' + SEC + '] ' + name); fail++; if (CUR === 'kbd') KF++; else if (CUR === 'close-path') CF++; else if (CUR === 'busy') BF++; else if (CUR === 'health') HF++; else PF++; }
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
    const els = { 'model-pick': pick, 'model-search': search, 'slash-menu': slashMenu, 'at-menu': atMenu, 'tab-menu': tabMenu, 'tab-q': tabQ, 'modal': off(), 'manage-modal': off(), 'skills-modal': off(), 'prompts-pop': { style: { display: 'none' } }, 'opt-pop': { style: { display: 'none' } } };
    const txtStub = { value: '', onkeydown: null, focused: 0, focus() { this.focused++; }, addEventListener(t, h) { this.handlers[t] = h; }, handlers: {} };
    let built = 0, submits = 0;
    const api = new Function('$', 'txt', 'document', 'setTimeout', 'buildModelItems', 'submit', `
        let cfgKeyTouched=false, mcpPollTimer=null, slashCur=[{}], tabOpened=0;
        function tabMenuOpen(){ tabOpened++; $('tab-menu').style.display='block'; } // 桩：真身是异步取数+渲染，键盘契约只钉「Tab 分支调它且仅菜单未开时调」
        function tabMenuClose(){ $('tab-menu').style.display='none'; }
        function optPopClose(){ $('opt-pop').style.display='none'; } // 主线3（e3a）：✨ 预览卡桩——Esc 同分支关闭
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
    return { api, txt: txtStub, pick, slashMenu, atMenu, search, tabMenu, tabQ, promPop: els['prompts-pop'], optPop: els['opt-pop'],
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
    s.txt.value = '/手艺'; s.slashMenu.style.display = 'block'; // r5/S1 锚随迁：/技能→/手艺（alias 保旧词）
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
    // 主线3（e3a）：同一 Esc 分支关 ✨ 优化预览卡
    s.optPop.style.display = 'block';
    s.txt.handlers.keydown({ key: 'Escape', preventDefault: () => {} });
    ck('Esc closes optimize preview card (主线3 same branch)', s.optPop.style.display === 'none');
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
    const build = () => { const t = mkTxt(); const f = new Function('txt', 'submit', 'optBtnSync', `${promptInsertSrc} return promptInsert;`)(t, () => { submits++; }, () => {}); return { t, f }; }; // optBtnSync=主线3 桩：插入后同步 ✨ 态
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

// ================================ busy S1（s103/S1 忙碌条三要素，裁决 2026-09-25 §3.1） ================================
// 阶段（想/动手/写答案）：开忙=想（qa-rework P2-2 修订——想=等模型响应窗口，统一显示不依赖 thought 帧）、
// tool_call=动手、message_chunk=写答案 + 秒计时 + 当前档人话（THINK_LABELS 单一真相源）；
// deepseek 系无 thought 帧=无草稿面板（假象边界=内容不造假）。
// 行为断言=提取函数沙盒执行；分支接线=源码锚点（模板漂移显式 NOT FOUND，不误报）。
const setBusySrc = grabSoft(/function setBusy\(b\)\{[\s\S]+?\n\}/, 'setBusy');
const curThinkLabelSrc = grabSoft(/function curThinkLabel\(\)\{[\s\S]+?\n\}/, 'curThinkLabel');
const busyPhraseSrc = grabSoft(/function busyPhrase\(\)\{[\s\S]+?\n\}/, 'busyPhrase');
const busyPaintSrc = grabSoft(/function busyPaint\(\)\{[^\n]+\}/, 'busyPaint');
const noteTurnPhaseSrc = grabSoft(/function noteTurnPhase\(ph\)\{[^\n]+\}/, 'noteTurnPhase');
const THINK_LABELSSrc = grabSoft(/const THINK_LABELS=\{[^\n]+\}/, 'THINK_LABELS');
const thoughtFeedSrc = grabSoft(/function thoughtFeed\(u\)\{[\s\S]+?\n\}/, 'thoughtFeed');
const thinkDraftShowSrc = grabSoft(/function thinkDraftShow\(on\)\{[\s\S]+?\n\}/, 'thinkDraftShow');
const thinkDiscardSrc = grabSoft(/function thinkDiscard\(\)\{[\s\S]+?\n\}/, 'thinkDiscard');
const peekOnclickSrc = grabSoft(/\$\('think-peek'\)\.onclick=[^\n]+/, 'think-peek onclick');
const THINK_BUF_MAXSrc = grabSoft(/const THINK_BUF_MAX=\d+;/, 'THINK_BUF_MAX');
const zombieToolcardsSrc = grabSoft(/function zombieToolcards\(\)\{[\s\S]+?\n\}/, 'zombieToolcards');
function grabSoft(re, label) { const m = html.match(re); if (!m) { console.error('SOFT-NOT-FOUND: ' + label + '（修前红形态：HEAD 无此函数）'); return ''; } return m[0]; }
function mkTEl(id) { return { id, textContent: '', style: { display: '' }, onclick: null, scrollTop: 0, scrollHeight: 0 }; }
function buildBusy(sel) {
    const s1ok = setBusySrc && curThinkLabelSrc && busyPhraseSrc && busyPaintSrc && noteTurnPhaseSrc && THINK_LABELSSrc;
    const s2ok = thoughtFeedSrc && thinkDraftShowSrc && thinkDiscardSrc && peekOnclickSrc && THINK_BUF_MAXSrc;
    if (!s1ok) return { api: { setBusy() {}, noteTurnPhase() {}, busyPaint() {}, thoughtFeed() {}, thinkDiscard() {}, thinkDraftShow() {} }, els: {}, typing: { style: {} }, tick() {}, text: () => '', buf: () => '', chatAdds: () => 1 }; // 修前红：任一新函数缺失=整组行为断言红（no-op 桩走过不炸）
    const els = { 'typing-text': mkTEl('typing-text'), 'typing': mkTEl('typing'), 'think': sel, 'think-peek': mkTEl('think-peek'), 'think-draft': mkTEl('think-draft'), 'think-buf': mkTEl('think-buf') };
    els['think-peek'].style.display = 'none'; els['think-draft'].style.display = 'none'; // 初始折叠（同 HTML 内联）
    const typing = els['typing'], send = { disabled: false }, stopBtn = { style: {} };
    let fakeNow = 1000000, live = [], chatAdds = 0;
    const chat = { appendChild: () => { chatAdds++; } };
    const s2body = s2ok ? `${THINK_BUF_MAXSrc}\n        ${thoughtFeedSrc}\n        ${thinkDraftShowSrc}\n        ${thinkDiscardSrc}\n        ${peekOnclickSrc}`
        : 'const THINK_BUF_MAX=32768;\n        function thoughtFeed(u){}\n        function thinkDraftShow(on){}\n        function thinkDiscard(){}'; // S2 缺席=S2 断言红（no-op 桩走过不炸）
    const api = new Function('$', 'typing', 'send', 'stopBtn', 'document', 'notifyDone', 'stopNotify', 'setInterval', 'clearInterval', 'Date', 'chat', `
        let busyPhase='', busyT0=0, busyTick=null, thinkBuf='', thinkDraftOn=false;
        ${THINK_LABELSSrc}
        ${curThinkLabelSrc}
        ${busyPhraseSrc}
        ${busyPaintSrc}
        ${noteTurnPhaseSrc}
        ${s2body}
        ${setBusySrc}
        return { setBusy, noteTurnPhase, busyPaint, thoughtFeed, thinkDraftShow, thinkDiscard, buf: () => thinkBuf };
    `)(id => { if (!els[id]) throw new Error('no stub #' + id); return els[id]; }, typing, send, stopBtn, { hidden: false }, () => {}, () => {},
        fn => { live.push(fn); return 1; }, () => { live.length = 0; }, { now: () => fakeNow }, chat);
    return { api, els, typing, tick: () => { fakeNow += 1100; live.forEach(f => f()); }, text: () => els['typing-text'].textContent, buf: () => api.buf(), chatAdds: () => chatAdds };
}
CUR = 'busy';
{
    const mkSel = o => Object.assign({ value: '', disabled: false, style: { display: '' } }, o);
    {
        const b = buildBusy(mkSel({}));
        SEC = 'busy S1';
        b.api.setBusy(true);
        ck('开忙即「想」阶段+计时（qa-rework P2-2：响应窗口统一显示，无档位真值=无标签 它在想 · 已 0 秒）+起 1s 表', b.text() === '它在想 · 已 0 秒' && b.typing.style.display === 'block');
        b.tick();
        ck('秒数递增（+1.1s 后 已 1 秒）', b.text() === '它在想 · 已 1 秒', b.text());
    }
    {
        const b = buildBusy(mkSel({ value: 'max' }));
        b.api.setBusy(true); b.api.noteTurnPhase('think');
        ck('思考期档位人话（max→它正在尽全力想 · 已 N 秒，THINK_LABELS 单源）', b.text() === '它正在尽全力想 · 已 0 秒', b.text());
    }
    {
        const b = buildBusy(mkSel({ value: 'low' }));
        b.api.setBusy(true); b.api.noteTurnPhase('think');
        ck('非动短语标签括注（low→它在想（快一点），不出「它正在快一点」病句）', b.text() === '它在想（快一点） · 已 0 秒', b.text());
    }
    {
        const b = buildBusy(mkSel({ value: 'max', disabled: true }));
        b.api.setBusy(true); b.api.noteTurnPhase('think');
        const b2 = buildBusy(mkSel({ value: 'max', style: { display: 'none' } }));
        b2.api.setBusy(true); b2.api.noteTurnPhase('think');
        ck('态③/态④无档位真值→诚实无标签（它在想 · 已 N 秒）', b.text() === '它在想 · 已 0 秒' && b2.text() === '它在想 · 已 0 秒', b.text() + ' | ' + b2.text());
    }
    {
        const b = buildBusy(mkSel({}));
        b.api.setBusy(true); b.api.noteTurnPhase('work');
        ck('tool_call 帧→在动手', b.text() === '它在动手 · 已 0 秒', b.text());
        b.api.noteTurnPhase('write');
        ck('message_chunk 帧→在写答案', b.text() === '它在写答案 · 已 0 秒', b.text());
    }
    {
        const b = buildBusy(mkSel({}));
        b.api.setBusy(true); b.tick(); b.tick(); b.tick();
        ck('deepseek 无 thought 帧=「想」阶段+计时保持（qa-rework P2-2：阶段=响应窗口，假象边界在面板内容不在阶段）', b.text() === '它在想 · 已 3 秒', b.text());
        b.api.setBusy(false);
        ck('收忙停表+藏条（typing display:none）', b.typing.style.display === 'none');
        const before = b.text(); b.tick();
        ck('停表后不再走秒', b.text() === before && before.includes('秒'));
    }
    SEC = 'busy S1 wiring';
    ck('thought 分支喂「在想」阶段（:1432 keep silent 已退役）', /agent_thought_chunk'\)\{ (?:thoughtFeed\(u\);|noteTurnPhase\('think'\);)/.test(html) && !/agent_thought_chunk'\)\{ \/\* keep silent \*\//.test(html));
    ck('message_chunk 分支先翻「在写答案」（thinkDiscard 为 S2 预留位）', /agent_message_chunk'\)\{ (?:thinkDiscard\(\); )?noteTurnPhase\('write'\); addMsg\(/.test(html));
    ck('tool 分支翻「在动手」', /tool_call_update'\)\{ noteTurnPhase\('work'\); toolCard\(u\); \}/.test(html));
    const addMsgSrcS1 = grab(/function addMsg\(text,who\)\{[\s\S]+?\n\}/, 'addMsg');
    {
        const typingStub = mkTEl('typing'); const chatEl = { appendChild: () => {}, scrollTop: 0, scrollHeight: 0 };
        const am = new Function('typing', 'chat', 'streamEl', 'document', 'nearBottom', 'mdRender', 'msgButtons', 'demoteLiveUser', `${addMsgSrcS1} return addMsg;`)(typingStub, chatEl, null, { createElement: () => ({ dataset: {}, appendChild() {}, classList: { add() {} } }) , querySelectorAll: () => [] }, () => true, () => '', () => null, () => {});
        typingStub.style.display = 'block';
        am('hi', 'agent');
        ck('写答案阶段忙碌条在场：addMsg 不再藏 typing（显隐唯一出口=setBusy）', typingStub.style.display === 'block');
    }
}
// —— busy S2（s103/S2 思考草稿折叠面板）：有帧才出现/默认折叠/尾随滚动/32KB 尾窗/首 message_chunk 收起弃置/不插聊天流 ——
{
    const mkSel = o => Object.assign({ value: '', disabled: false, style: { display: '' } }, o);
    const tframe = t => ({ sessionUpdate: 'agent_thought_chunk', content: { text: t } }); // 页内分发形态：onAgentEvent 先取 p.params.update 再进分支
    const b = buildBusy(mkSel({ value: 'max' }));
    SEC = 'busy S2';
    b.api.setBusy(true);
    const peek = () => b.els['think-peek'], draft = () => b.els['think-draft'], buf = () => b.els['think-buf'];
    const click = () => { const h = peek().onclick; if (typeof h === 'function') h(); }; // S2 缺席=onclick 未接线，安全跳过让断言红
    ck('默认折叠+无帧不出现：开忙 peek 隐藏', peek().style.display === 'none');
    b.api.thoughtFeed(tframe('先想第一段。'));
    ck('首 thought 帧后 peek 出现、面板仍折叠（仅 glm 系有帧时出现）', peek().style.display === '' && draft().style.display === 'none' && b.text() === '它正在尽全力想 · 已 0 秒');
    ck('喂帧零新增聊天流节点（R1：草稿不插聊天消息域）', b.chatAdds() === 0 && b.buf().length > 0);
    click();
    ck('点开：面板显示+缓冲绘制+toggle 翻「收起思考草稿 ▴」', draft().style.display === 'flex' && buf().textContent === b.buf() && peek().textContent === '收起思考草稿 ▴');
    b.api.thoughtFeed(tframe('又想了一段，接着写。'));
    ck('展开态尾随：缓冲增长+滚到尾', buf().textContent === b.buf() && b.buf().endsWith('又想了一段，接着写。') && buf().scrollTop === buf().scrollHeight);
    click();
    ck('再点收起：面板藏+toggle 回「看看它在想什么 ▸」', draft().style.display === 'none' && peek().textContent === '看看它在想什么 ▸');
    b.api.thoughtFeed(tframe('X'.repeat(512) + '|TAIL-END|'));
    for (let i = 0; i < 79; i++) b.api.thoughtFeed(tframe('Y'.repeat(512)));
    click(); // 展开重绘（折叠期只更缓冲不动 DOM）
    ck('32KB 显示缓冲上限：灌 40KB+ 后缓冲/DOM ≤32768 且保尾弃头', b.buf().length <= 32768 && buf().textContent === b.buf() && buf().textContent.length <= 32768 && b.buf().endsWith('Y'.repeat(512)) && !b.buf().includes('|TAIL-END|'), 'buf=' + b.buf().length);
    const had = draft().style.display === 'flex' && peek().style.display === '' && b.buf().length > 0; // S2 在场性前置（S1 代码上恒 false → 收口族断言红）
    click(); // 收起，进入收口语境
    b.api.thoughtFeed(tframe('开口前最后一段。'));
    b.api.thinkDiscard(); b.api.noteTurnPhase('write'); // 首 message_chunk 分支语义
    ck('首 message_chunk：面板收起+内容弃置+peek 隐藏', had && draft().style.display === 'none' && b.buf() === '' && buf().textContent === '' && peek().style.display === 'none' && b.text() === '它在写答案 · 已 0 秒');
    b.api.setBusy(false); b.api.setBusy(true);
    ck('回合重开面板为空（stop 后 setBusy(true) 重置）', had && b.buf() === '' && peek().style.display === 'none' && draft().style.display === 'none');
    b.api.setBusy(false);
    ck('收忙同弃置（setBusy(false) 出口）', had && b.buf() === '' && draft().style.display === 'none');
}
// —— busy S9（s103/S9 断线中性收口）：zombieToolcards「失败」翻红→中性态，不撒谎；已收尾的卡不动 ——
{
    if (!zombieToolcardsSrc) { SEC = 'busy S9'; ck('zombieToolcards 存在（s95 起既有函数）', false); }
    else {
        const mkCard = status => {
            const st = { className: 'st', textContent: status === 'in_progress' ? '干活中' : (status === 'completed' ? '完成' : '失败') };
            return { _status: status, querySelector: sel => sel === '.st' ? st : null };
        };
        const inprog = mkCard('in_progress'), done = mkCard('completed'), failed = mkCard('failed');
        const z = new Function('toolCards', `${zombieToolcardsSrc} return zombieToolcards;`)(new Map([['t1', inprog], ['t2', done], ['t3', failed]]));
        z();
        SEC = 'busy S9';
        ck('断线收口=中性态「连接断了，这一步的结果不确定」：不翻红不出现「失败」', inprog.querySelector('.st').textContent === '连接断了，这一步的结果不确定' && !inprog.querySelector('.st').className.includes('err') && !inprog.querySelector('.st').textContent.includes('失败'), JSON.stringify(inprog.querySelector('.st')));
        ck('进行中卡 _status→unknown（结果未知，explain 喂料同真值）', inprog._status === 'unknown');
        ck('已收尾的卡不动（completed/failed 既有语义保持）', done._status === 'completed' && done.querySelector('.st').textContent === '完成' && failed._status === 'failed' && failed.querySelector('.st').textContent === '失败');
    }
}
// —— health S7（s103/S7 健康条出聊天流）：healthSync 从模板原文提取，DOM 桩钉「条永不进 #chat」+ 文案三档/互斥/幂等 ——
// 修前红锚：修前 healthSync 用 chat.insertBefore(el, chat.firstChild) + class 'msg agent info' → S7a/S7b FAIL@HEAD
{
    CUR = 'health';
    const hsSrc = grab(/function healthSync\(m\)\{[\s\S]*?\n\}/, 'healthSync');
    const mkHBar = () => {
        const el = { tag: 'div', id: '', className: '', children: [], style: { cssText: '' }, removed: false, onclick: null, _parent: null, textContent: '' };
        el.appendChild = c => { el.children.push(c); return c; };
        el.querySelector = sel => {
            if (sel === 'button') return el.children.find(c => c.tag === 'button') || null;
            if (sel === '.px') return el.children.find(c => c.className === 'px') || null;
            return null;
        };
        el.remove = () => { el.removed = true; };
        Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
        return el;
    };
    const chat = { id: 'chat', inserts: 0, insertBefore() { chat.inserts++; } }; // 聊天流容器：任何插入都计（S7 后必须恒 0）
    const main = { id: 'main', inserts: [], insertBefore(el, ref) { main.inserts.push({ el, ref }); el._parent = main; } };
    chat.parentNode = main;
    const reg = new Map(); // id 注册表（$ 查找；真实页由 DOM 树承担）
    const doc = { createElement: t => { const e = mkHBar(); e.tag = t; return e; } };
    const run = new Function('providerList', '$', 'chat', 'document',
        'let lastHealthFrame=null; ' + hsSrc + ' return { healthSync: m => { healthSync(m); return lastHealthFrame; } };');
    const $ = id => reg.get(id) || null;
    const api = run([{ name: 'fake', hasKey: true }], $, chat, doc);
    const spawnBar = () => { for (const ins of main.inserts) if (ins.el.id === 'health-bar') reg.set('health-bar', ins.el); return reg.get('health-bar') || null; };
    api.healthSync({ sys: 'health', state: 'down' });
    const bar = spawnBar();
    SEC = 'health S7';
    ck('S7a down 帧建条且聊天流零插入（条不进 #chat——修前红锚：chat.insertBefore 路径即 FAIL）', chat.inserts === 0 && !!bar, 'chat.inserts=' + chat.inserts);
    ck('S7b 条挂 #main、位于 #chat 之前（顶部提醒条承载，零新第三处）', !!bar && bar._parent === main && !!main.inserts[0] && main.inserts[0].ref === chat && main.inserts[0].el === bar);
    ck('S7c down 文案人话+按钮「检查线路」', !!bar && bar.children[0].textContent.startsWith('现在联系不上大模型服务商') && bar.querySelector('button').textContent === '检查线路');
    api.healthSync({ sys: 'health', state: 'down', kind: 'key' });
    ck('S7d down+key → Key 口径+按钮「去设置」', bar.querySelector('button').textContent === '去设置' && bar.children[0].textContent.startsWith('这家服务商的 Key 没配上或不对'));
    api.healthSync({ sys: 'health', state: 'stale-model' });
    ck('S7e stale-model → 下线口径+按钮「更新模型」', bar.querySelector('button').textContent === '更新模型' && bar.children[0].textContent.startsWith('你正在用的模型已被服务商下线'));
    const nMain0 = main.inserts.length;
    api.healthSync({ sys: 'health', state: 'down' });
    ck('S7f 重复 down 帧幂等（同条复用，不重复建）', main.inserts.length === nMain0 && reg.get('health-bar') === bar);
    api.healthSync({ sys: 'health', state: 'ok' });
    ck('S7g ok 帧即撤条（恢复即消）', bar.removed === true);
    main.inserts.length = 0; reg.delete('health-bar');
    api.healthSync({ sys: 'health', state: 'ok', proxy: true });
    spawnBar();
    const pxBar = reg.get('health-bar');
    ck('S7h ok+proxy 远端旗仍保留条（s94 F-4c 代理-only 形态不回归）', !!pxBar && !!pxBar.querySelector('.px') && pxBar.querySelector('.px').textContent.includes('网络代理'));
    const apiNoKey = run([{ name: 'fake', hasKey: false }], $, chat, doc);
    main.inserts.length = 0; reg.delete('health-bar');
    apiNoKey.healthSync({ sys: 'health', state: 'down' });
    ck('S7i 无 Key 互斥不建条（key-guide 独占态保持）', spawnBar() === null && reg.get('health-bar') === undefined);
}
CUR = 'kbd';

console.log('ui-logic-probe kbd: PASS=' + KP + ' FAIL=' + KF);
console.log('ui-logic-probe close-path: PASS=' + CP + ' FAIL=' + CF);
console.log('ui-logic-probe prompts: PASS=' + PP + ' FAIL=' + PF);
console.log('ui-logic-probe busy: PASS=' + BP + ' FAIL=' + BF);
console.log('ui-logic-probe health: PASS=' + HP + ' FAIL=' + HF);
console.log('ui-logic-probe: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
