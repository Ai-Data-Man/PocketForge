// [s107/f6 入库] 用途：能力配置弹窗（活体臂）：池搜索/添加/档位自拒写/官方值域信息行/source 三态标注/帧回填闭环
// 用法：node tools/e2e/capeditor-probe.js（env 覆盖：PF_TPL/PF_BRIDGE/PF_PRESETS/PF_GOOSE_BIN 等见体内；自建沙箱桥本地口，不碰 dev 栈 8790）
// 来源：s98-s101 各批 forge/tmp 同名探针（AGENTS §8.2 触桥清单成员；s106 留痕「探针入库义务」的补账，s107/f6 落库）
// s100/T1+T2 GUI 探针（裁决 2026-09-22-capability-config-v2）+ QA s100 P2/P3-a 随迁：能力配置弹窗 + 池头搜索/添加
// + variant/mode 桥自管拒写。**s101/W2 随迁（裁决 2026-09-23 §2.1）**：来源三态标注（（官方）/（你改的）/（猜的））
// + 顶栏快慢信息行显示官方档位真值（官方值域人话化；官方未收录=诚实「不确定」，不再编造五档）；
// 上下文/看图取官方真值（官方命中=非估计；未收录=「（未知）」）。s100/QA 批语义保留：thinking.levels 全库零消费方
// =假旋钮→档位增删 chips 整体撤除，降级只读信息行三态；保存 patch={multimodal, context_len} only（thinking 零发
// ——W3 重开字段级写通道）；桥 P3-a 拒 user patch 携带 mode（人话=快慢识别由系统自动管理）。
// 随迁说明：s99 inline 面板断言与 s100 档位 chips 断言（B1g/B1h/B2 增删臂/C2/C5 档位写）随功能删除整臂迁走——
// 改前模板跑本文件必红（结构不存在），红对照=PF_TPL=改前模板跑本文件。
//   Part A（模板静态）：A1 弹窗结构（#cap-modal 遮罩+✕/Esc/遮罩三路出口共用 closeCapModal）；A2 字段逐字
//      （看图+注+来源标/上下文+（估计）或（未知）/顶栏快慢只读信息行四态文案+逃生口副句/头部句来源三态/技术折叠）；
//      A3 三选与深档框架负断言（radio/快慢怎么调/深档用哪个模型/mateHint/cap-edit inline 面板/chips 增删=0）
//      +保存链 patch 恒零 thinking（mode/levels/variant 三键零发）；A4 池头（搜模型名/＋添加模型/没有匹配的模型
//      在行前=池头出生即建）+池行「配置」更名；A5 措辞禁令负断言（剥注释用户面：换模型/深档/快速版/完整版/变体=0）；
//      A6 既有锚保留（caps 镜像合并/来源三态标注×3/接口地址 label/ui-logic 主 modal 三路精确串零动）。
//   Part B（DOM 桩执行）：B1 打开=弹窗（.on）+预填（顶栏快慢四态派生/看图+来源标/上下文+（估计）或（未知）/技术句）+
//      池行「配置」入口；B2 保存 roundtrip（改看图+上下文）→POST {multimodal,context_len?} 逐字段+patch 恒零
//      thinking+保存即关弹窗；B3 校验门（上下文非正整数=人话拒+零 POST）；B4 三路关（遮罩点击两态/Esc 闸/✕ 取消）
//      + closeCapModal 只碰 cap-modal（不碰主设置弹窗）；B5 池头（行序/即时过滤三态/空态/就地添加回车+按钮）。
//   Part C（活体帧→页，真桥真 WS 禁桩）：C1 镜像非空复发哨兵+source 三态字段随行；C2 弹窗开态=桥侧真值（信息行家族态派生活体帧）；
//      C3 池行来源三态标注随 user 消长（官方→你改的）；C4 variant/mode 拒写新红（页面永不发+真桥人话拒+注册表零变——
//      「发 thinking 变异」真实语义=桥拒非静默剥离，本臂钉死）；C5 保存活体 roundtrip（真桥采纳+thinking
//      逐字节零触碰+家族 variant 逐字节不动=写通道关闭证明）。
// 红绿：node tmp/capeditor-probe.js；s101/W2 红对照=PF_TPL=改前模板/改前桥（A2 来源句、A6b/A6c2、C0c3、C3 三态臂红）。
'use strict';
const fs = require('fs');
const path = require('path');
const FORGE = path.join(__dirname, '..', '..', 'forge'); // 入库 s107/f6：自 forge/tmp 迁 tools/e2e，深度随迁
const TPL_HTML = process.env.PF_TPL || path.join(FORGE, 'conf', 'templates', 'chat.tpl.html');
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok || !why ? '' : ' — ' + String(why))); ok ? pass++ : fail++; };

function extractFnIn(src, name) {
    const head = 'function ' + name + '(';
    const at = src.indexOf(head);
    if (at < 0) throw new Error('fn not found: ' + name);
    const brace = src.indexOf('{', at);
    let depth = 0;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error('unbalanced: ' + name);
}
function grab(re, label) { const m = tpl.match(re); if (!m) throw new Error('grab NOT FOUND: ' + label); return m[0]; }
// 状态机剥 JS 注释（字符串 ' " ` 优先于注释判定——semantics-r5-probe 同款保守方向）
function stripJsComments(src) {
    let out = '', i = 0, n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === '\'' || c === '"' || c === '`') {
            const q = c; out += c; i++;
            while (i < n) { out += src[i]; if (src[i] === '\\' && i + 1 < n) { out += src[i + 1]; i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
            continue;
        }
        if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
        out += c; i++;
    }
    return out;
}
let tpl = '';

// ============================ Part A：模板静态 ============================
function partA(html) {
    tpl = html;
    let edSrc = '';
    try { edSrc = extractFnIn(html, 'openCapEditor'); } catch (e) { ck('A0 模板含 openCapEditor（提取锚）', false, e.message); return; }
    ck('A0 模板含 openCapEditor + closeCapModal（提取锚）', edSrc.length > 0 && html.indexOf('function closeCapModal(') >= 0);
    // A1 弹窗结构（§2.1：独立 modal 遮罩，复用 #modal 同款 class 形态；三路关闭共用出口）
    ck('A1a #cap-modal 遮罩结构（modal-bg+panel-box+编辑模型配置+cap-body）',
        /<div id="cap-modal" class="modal-bg"><div class="panel-box"[^>]*aria-label="编辑模型配置">/.test(html) && /<div id="cap-body">/.test(html));
    ck('A1b ✕ 出口=closeCapModal()（onclick）', /onclick="closeCapModal\(\)"/.test(html));
    ck('A1c 遮罩点击出口=closeCapModal()（只关本弹窗）', grab(/\$\('cap-modal'\)\.onclick=e=>\{ if\(e\.target\.id==='cap-modal'\) closeCapModal\(\); \}/, 'cap backdrop').length > 0);
    ck('A1d Esc 出口=closeCapModal 闸在主 modal 链前（typeof 守卫=桩环境零动）', grab(/if\(typeof closeCapModal==='function' && closeCapModal\(\)\) return;/, 'cap esc guard').length > 0);
    ck('A1e 弹窗 DOM 排在 #modal 之后（同 z-index 上层）', html.indexOf('id="cap-modal"') > html.indexOf('id="modal"'));
    ck('A1f openCapEditor 不碰主设置弹窗（零 $(\'modal\') 引用）', edSrc.indexOf("$(\'modal\')") < 0 && edSrc.indexOf('$("modal")') < 0);
    // A2 字段逐字（§2.1 表；s100/QA P2-1 批=档位 chips 撤除；s101/W2 批=来源三态+官方真值；
    //     **s101/W3（裁决 2026-09-23 §2.2）批=恢复可改形态**：档位 chips 可增删+默认档 select+看图/上下文/
    //     最大输出皆可改+字段级来源标注（官方/你改的/猜的）+改过即显「不再自动更新」句）
    const must = [
        ['弹窗头部句（来源三态派生）', "'这些是'+capsSrcWord(cap)+'，认错了您改；改哪项哪项就记住您的。'"],
        ['字段① 标签', '能不能看图：'],
        ['字段① 注', '（贴照片时用得上）'],
        ['字段② 标签', '上下文大约多少字：'],
        ['字段② 留空 placeholder', "ctx.placeholder='不知道就留空'"],
        ['字段② （估计）标注', "cap.context_len!=null?'（估计）':'（未知）'"],
        ['字段③ 标签=最大输出（可改）', '最大输出多少字：'],
        ['字段④ 标签=思考档位（从低到高）', '思考档位（从低到高）：'],
        ['字段④ chips 增删机制（renderChips + 加档下拉）', "const renderChips=()=>"],
        ['字段④ 加档候选 placeholder', "ph.textContent='＋ 加一档'"],
        ['字段④ 删档按钮', "rm.textContent='✕'"],
        ['字段④ 默认档 select 标签', '默认档：'],
        ['字段④ 家族提示（桥自管，不可改）', '另外系统按模型自动配了快/深配对（不能改）；想解除就把其中一个模型从可选池勾掉'],
        ['字段级来源标注函数（官方/你改的/猜的）', "function capFieldLabel(cap,field)"],
        ['字段级来源派生（user_fields 在场=user）', "uf.indexOf(field)>=0) return 'user'"],
        ['改过即显「不再自动更新」句', '改过的项不再自动更新（其余仍跟官方表走）'],
        ['字段④ 折叠 summary', '技术细节（平时不用动）'],
        ['字段④ 只读句', '这些档位实际怎么传给服务商——按各家接口规范自动翻译，不用您管'],
        ['字段④ details.tz 先例', "createElement('details'); tech.className='tz'"],
        // s101/W6（QA P3-1 反单向棘轮）：改过的项有恢复出口——按钮文案+在场条件+复位 POST 体+确认句
        ['W6 恢复按钮文案', "'恢复官方默认'"],
        ['W6 按钮在场条件=有 user_fields', 'if(uf.length){'],
        ['W6 复位 POST 体（桥 reset 语义）', "{op:'set',model,patch:{reset:'official'}}"],
        ['W6 复位确认句（人话）', '改过的项都恢复成官方默认？'],
    ];
    for (const [n, s] of must) ck('A2 ' + n + ' 在场', html.indexOf(s) >= 0, s);
    // A2b 档位值域=官方 ∪ 常见档位（非自造五档常数）：加档候选取 cap.official_levels 拼接常见档位
    ck('A2b 档位候选值域=官方表该模型 levels ∪ 常见档位（不取自造五档）',
        edSrc.indexOf('(cap.official_levels||[]).concat(common)') >= 0 && edSrc.indexOf("const common=['none','off','minimal','low','medium','high','max']") >= 0,
        '候选源');
    // A3 三选/深档框架整体删除 + 保存链 patch 带被改字段（W3：thinking:{levels,default} 可发）
    ck('A3a radio 三选=0（openCapEditor 无 type radio）', edSrc.indexOf("type='radio'") < 0);
    ck('A3b 「快慢怎么调」框架=0', edSrc.indexOf('快慢怎么调') < 0);
    ck('A3c 「深档用哪个模型」下拉/mateHint 提示句=0', edSrc.indexOf('深档') < 0 && edSrc.indexOf('mateHint') < 0 && edSrc.indexOf('原来配对的那个模型') < 0);
    ck('A3d 保存 patch 带被改字段（W3：thinking.levels/default 与 input/context_len/max_output 可发；variant/mode 零发）',
        edSrc.indexOf('patch.thinking.levels=lvList.slice()') >= 0 && edSrc.indexOf('patch.thinking.default=') >= 0 &&
        edSrc.indexOf('patch.multimodal=') >= 0 && edSrc.indexOf('patch.context_len=') >= 0 && edSrc.indexOf('patch.max_output=') >= 0 &&
        edSrc.indexOf('variant:') < 0 && edSrc.indexOf("mode:'") < 0, 'patch 形状');
    ck('A3e patch 走单一真相源 POST 链', /op:'set',model,patch/.test(edSrc) && !/thinking\[/.test(edSrc));
    ck('A3f 保存成功→closeCapModal（关本弹窗）+providers 重下发', /note\('「'\+model\+'」的配置已保存。'\);[\s\S]{0,80}closeCapModal\(\);/.test(edSrc) && edSrc.indexOf('loadProvidersUI()') >= 0);
    ck('A3g inline 旧面板迁移（.cap-edit 类=0）', html.indexOf('cap-edit') < 0);
    // A4 池头：搜索恒在场+添加从池尾迁走+池行更名「配置」
    let poolSrc = '';
    try { poolSrc = extractFnIn(html, 'renderModelPool'); } catch (e) { ck('A4 模板含 renderModelPool（提取锚）', false, e.message); return; }
    ck('A4 模板含 renderModelPool（提取锚）', true);
    const poolMust = [
        ['池头搜索框', "q.placeholder='搜模型名'"],
        ['池头＋添加模型', "'＋添加模型'"],
        ['搜索空态', "'没有匹配的模型'"],
        ['就地行内输入', "addIn.placeholder='模型名（回车加入）'"],
        ['即时过滤（oninput）', 'q.oninput=applyFilter'],
        ['池行按钮更名「配置」', "capBtn.textContent='配置'"],
    ];
    for (const [n, s] of poolMust) ck('A4 ' + n + ' 在场', poolSrc.indexOf(s) >= 0, s);
    ck('A4b 池头机制恒在场（head/addRow/rows/noHit 建于空池早退之前）', poolSrc.indexOf("pr.models||[]") >= 0 && poolSrc.indexOf('box.appendChild(head)') < poolSrc.indexOf("if(!(pr.models||[]).length)"));
    ck('A4c 池尾 addrow 迁移（getElementById pool-add/setTimeout 轮询接线=0）', poolSrc.indexOf('getElementById') < 0 && poolSrc.indexOf('setTimeout') < 0);
    // A5 措辞禁令负断言：剥注释后用户面（HTML 段剥 <!-- -->；脚本段剥 // 与 /* */）
    const scriptStart = html.indexOf('<script>');
    const htmlFace = html.slice(0, scriptStart).replace(/<!--[\s\S]*?-->/g, '');
    const scriptFace = stripJsComments(html.slice(scriptStart, html.lastIndexOf('</script>')));
    const face = htmlFace + '\n' + scriptFace;
    const BANNED = ['换模型', '深档', '快速版', '完整版', '变体'];
    for (const w of BANNED) ck('A5 措辞禁令：用户面「' + w + '」=0', face.indexOf(w) < 0, face.slice(Math.max(0, face.indexOf(w) - 30), face.indexOf(w) + 30));
    // A6 既有锚保留（跨批零动面）
    ck('A6a R1 页侧镜像合并：caps 从 list[].caps 条目合并（帧级 m.caps 不存在）', /modelCaps=Object\.assign\(\{\}, \.\.\.\(m\.list\|\|\[\]\)\.map\(p=>p\.caps\|\|\{\}\)\)/.test(html));
    ck('A6b 池行来源三态标注（s101/W2：capsSrcLabel → （官方）/（你改的）/（猜的））', /document\.createTextNode\(' '\+m\+capsSrcLabel\(modelCaps\[m\]\)\)/.test(scriptFace));
    ck('A6c 顶栏 bits 来源三态标注（buildModelItems title：capsSrcLabel）', /el\.title=o\.provider\+' · '\+o\.value\+capsSrcLabel\(c\)/.test(scriptFace));
    ck('A6c2 来源三态映射函数在场（official/你改的/猜的 + 官方表未收录时上下文=未知）',
        /function capsSrcOf\(c\)\{[\s\S]{0,140}'official'[\s\S]{0,80}'user'/.test(scriptFace) && scriptFace.indexOf("'（官方）'") >= 0 &&
        scriptFace.indexOf("'（你改的）'") >= 0 && scriptFace.indexOf("'（猜的）'") >= 0 && scriptFace.indexOf("'上下文未知'") >= 0);
    ck('A6d 接口地址 label：主词+括注（代配的人看）', htmlFace.indexOf('接口地址（OpenAI 兼容 /v1 结尾，代配的人看）') >= 0);
    // A6e ui-logic 主 modal 精确串零动（三路关闭串逐字在场——ui-logic 同批绿的前提）
    const UI_ANCHORS = [
        ['mclose ✕ 串', 'onclick="$(\'modal\').classList.remove(\'on\');cfgKeyTouched=false;$(\'cfg-key\').value=\'\'"'],
        ['Esc 主 modal 串', 'if($(\'modal\').classList.contains(\'on\')){ $(\'modal\').classList.remove(\'on\'); cfgKeyTouched=false; $(\'cfg-key\').value=\'\'; }'],
        ['遮罩 主 modal 串', '$(\'modal\').onclick=e=>{ if(e.target.id===\'modal\'){ $(\'modal\').classList.remove(\'on\'); cfgKeyTouched=false; $(\'cfg-key\').value=\'\'; } };'],
    ];
    for (const [n, s] of UI_ANCHORS) ck('A6e ui-logic 主 modal ' + n + ' 零动在场', html.indexOf(s) >= 0, s);
}

// ============================ Part B：DOM 桩执行 ============================
function mkDoc() {
    const byId = {};
    const mkEl = (id) => {
        const el = { id: id || '', className: '', children: [], style: {}, value: '', textContent: '', type: '', checked: false,
            min: '', step: '', placeholder: '', title: '', name: '', onclick: null, onchange: null, oninput: null, onkeydown: null, pfname: '' };
        let h = '';
        Object.defineProperty(el, 'innerHTML', { get: () => h, set: v => { h = String(v); if (h === '') el.children.length = 0; } }); // 真 DOM：置空即清子（chips/addSel 重建依赖）
        const set = new Set();
        el.classList = { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) };
        el.appendChild = c => { el.children.push(c); return c; };
        el.remove = () => {};
        el.focus = () => {};
        el.querySelector = () => null;
        return el;
    };
    return {
        createElement: () => mkEl(),
        createTextNode: t => ({ text: t }),
        getElementById: id => (byId[id] || (byId[id] = mkEl(id))),
        _byId: byId,
    };
}
const nodeText = el => (el.text !== undefined && !el.children) ? el.text : (el.children || []).map(c => (c.text !== undefined ? c.text : nodeText(c))).join('') || (el.textContent || '');
const findAll = (el, pred, out = []) => { for (const c of (el.children || [])) { if (pred(c)) out.push(c); findAll(c, pred, out); } return out; };
const FAM_NOTE = '另外系统按模型自动配了快/深配对（不能改）；想解除就把其中一个模型从可选池勾掉';
const USER_NOTE = '改过的项不再自动更新（其余仍跟官方表走）';
const numInputs = body => findAll(body, c => c.type === 'number');
const chipsOf = body => findAll(body, c => Array.isArray(c.children) && c.children.some(x => Array.isArray(x.children) && x.children.some(y => y.textContent === '＋ 加一档')))[0];
const addSelOf = body => findAll(body, c => Array.isArray(c.children) && c.children.some(o => o.textContent === '＋ 加一档'))[0];
const findNote = (body, txt) => findAll(body, c => c.textContent === txt)[0];
const srcOf = (body, label) => { const r = findAll(body, c => (c.children || [])[0] && c.children[0].textContent === label)[0]; return r && r.children.length ? nodeText(r.children[r.children.length - 1]) : ''; };
const bodyOf = env => env.$('cap-body');
const findBtn = (root, label) => findAll(root, c => c.textContent === label && c.onclick !== null)[0];
const THINK_LABELS = { off: '不用额外想', low: '快一点', medium: '标准', high: '深想', max: '尽全力想' }; // 与模板逐字同源（探针侧常量）
let pageFnsSrc = '';
const mkEnv = (caps, provs, provName) => {
    const document = mkDoc();
    const $log = [];
    const notes = [], loads = [], sends = [], confirms = [];
    const $ = id => {
        $log.push(id);
        if (id === 'model-pool' || id === 'cap-body' || id === 'cap-modal') return document.getElementById(id);
        return null; // 主 modal 等一律缺席——closeCapModal/openCapEditor 若误碰即刻 NPE 红
    };
    const noFetch = async () => { throw new Error('unexpected fetch'); };
    return {
        document, notes, loads, sends, confirms, $log, $,
        modelCaps: caps, providerList: provs, curProvName: provName,
        note: t => notes.push(t), loadProvidersUI: () => loads.push(1),
        wssend: o => sends.push(o), esc: s => s,
        noFetch,
        build: () => new Function('document', '$', 'modelCaps', 'providerList', 'curProvName', 'note', 'loadProvidersUI', 'fetch', 'wssend', 'esc', 'THINK_LABELS', 'confirm',
            pageFnsSrc + '\nreturn {openCapEditor, closeCapModal, renderModelPool};')(
            document, $, caps, provs, provName, t => notes.push(t), () => loads.push(1), noFetch, o => sends.push(o), s => s, THINK_LABELS, t => { confirms.push(t); return true; }),
    };
};
const openEditor = (env, fetchMock, model) => {
    // Function 构造一次：页面三函数（closeCapModal/openCapEditor/renderModelPool）同作用域，fetch 注入为参数
    const g = new Function('document', '$', 'modelCaps', 'providerList', 'curProvName', 'note', 'loadProvidersUI', 'fetch', 'wssend', 'esc', 'THINK_LABELS', 'confirm',
        pageFnsSrc + '\nreturn {openCapEditor, closeCapModal, renderModelPool};')(
        env.document, env.$, env.modelCaps, env.providerList, env.curProvName, t => env.notes.push(t), () => env.loads.push(1), fetchMock, o => env.sends.push(o), s => s, THINK_LABELS, t => { env.confirms.push(t); return true; });
    g.openCapEditor(model);
    return g;
};

async function partB(html) {
    pageFnsSrc = ['capsSrcOf', 'capsSrcLabel', 'capsSrcWord', 'capSrcOfField', 'capFieldLabel', 'closeCapModal', 'openCapEditor', 'renderModelPool'].map(n => extractFnIn(html, n)).join('\n');
    const FIVE = ['off', 'low', 'medium', 'high', 'max'];
    const CAPS = {
        'glm-5.3-flash': { context_len: null, context_est: true, max_output: null, multimodal: false, input: { image: false, pdf: false, video: false }, thinking: { mode: 'variant', levels: [], unknown: true, variant: { fast: 'glm-5.3-flash', deep: 'glm-5.3' } }, source: 'guess' },
        'glm-5.3': { context_len: 131072, context_est: false, max_output: 131072, multimodal: true, input: { image: true, pdf: false, video: false }, thinking: { mode: 'variant', levels: ['low', 'high', 'max'], default: 'max', variant: { fast: 'glm-5.3-flash', deep: 'glm-5.3' } }, source: 'official' },
        'glm-5.2': { context_len: null, context_est: true, max_output: null, multimodal: false, input: { image: false, pdf: false, video: false }, thinking: { mode: 'none', levels: [], default: null }, source: 'guess' },
    };
    const PROVS = [{ name: 'P1', host: 'http://h/v1/', models: ['glm-5.3-flash', 'glm-5.3', 'glm-5.2'], active: true }];
    const calls = [];
    const fetchMock = async (url, opts) => { calls.push({ url, opts }); return { json: async () => ({ ok: true }) }; };

    // B1 打开=弹窗 + 可改形态预填（池行「配置」真实入口）
    {
        const env = mkEnv(CAPS, PROVS, 'P1');
        const f = env.build();
        f.renderModelPool(PROVS[0]);
        const capBtns = findAll(env.$('model-pool'), c => c.textContent === '配置' && c.onclick !== null);
        ck('B1 池行按钮=「配置」（三行齐）', capBtns.length === 3, String(capBtns.length));
        ck('B1b 配置按钮 title 含看图/上下文/思考档位（W3 恢复可改口径）',
            capBtns[0].title.indexOf('看图') >= 0 || capBtns[0].title.indexOf('上下文') >= 0, capBtns[0].title);
        capBtns[0].onclick({ preventDefault: () => {}, stopPropagation: () => {} });
        const modal = env.$('cap-modal');
        ck('B1c 点「配置」→ 弹窗开（cap-modal .on）', modal.classList.contains('on'));
        const body = bodyOf(env);
        ck('B1d 头部「glm-5.3-flash」会什么+来源句（W3 三态派生：guess=按名字猜的）',
            body.children[0].textContent === '「glm-5.3-flash」会什么' && body.children[1].textContent.includes('这些是按名字猜的'), body.children[1].textContent);
        const mm = findAll(body, c => Array.isArray(c.children) && c.children.length === 4 && c.children[0].textContent === '能不能看图：')[0];
        ck('B1e 看图 select（可改，初值=不能看图）+注+字段级来源标（猜的）', !!mm && mm.children[1].value === 'false' && nodeText(mm.children[2]).includes('（贴照片时用得上）') && nodeText(mm.children[3]) === '（猜的）', mm && nodeText(mm));
        const ns = numInputs(body);
        const est = findAll(body, c => c.textContent === '（未知）')[0];
        ck('B1f 上下文/最大输出 number 可改（两枚）+空值+（未知）标注（W2 未收录=诚实未知）',
            ns.length === 2 && ns[0].value === '' && ns[1].value === '' && !!est && ns[0].placeholder.includes('不知道就留空'), ns.length + '|est=' + !!est);
        ck('B1f2 上下文/最大输出字段级来源标（（猜的）各在场）',
            srcOf(body, '上下文大约多少字：') === '（猜的）' && srcOf(body, '最大输出多少字：') === '（猜的）', srcOf(body, '上下文大约多少字：') + '/' + srcOf(body, '最大输出多少字：'));
        // 思考档位 chips 可增删 + 默认档 select
        const chips = chipsOf(body), addSel = addSelOf(body);
        ck('B1g 思考档位 chips 可增删（加档下拉在场，含常见档位候选）',
            !!chips && !!addSel && addSel.children.length > 1 && addSel.children.some(o => o.value === 'max'),
            addSel ? addSel.children.map(o => o.value).join(',') : 'no addSel');
        const chipsTxt = chips ? chips.children.map(c => nodeText(c)).join('|') : '';
        ck('B1g2 档位集空=诚实空态文案（未收录不编造）', chipsTxt.includes('暂无档位'), chipsTxt);
        ck('B1g3 默认档 select 在场（选项=当前档位集）', !!srcOf(body, '默认档：'), 'defSel');
        ck('B1g4 档位字段级来源标=（猜的）', srcOf(body, '思考档位（从低到高）：') === '（猜的）', srcOf(body, '思考档位（从低到高）：'));
        ck('B1g5 家族提示在场（variant=桥自管，文案标「不能改」）', !!(findNote(body, FAM_NOTE)), findNote(body, FAM_NOTE) ? 'ok' : 'missing');
        const un = findNote(body, USER_NOTE);
        ck('B1h 「不再自动更新」句在场但初态隐藏（未改过=不显）', !!un && un.style.display === 'none', un && un.style.display);
        ck('B1i 技术折叠只读句在场（details.tz）', findAll(body, c => Array.isArray(c.children) && c.children.some(x => x.textContent === '这些档位实际怎么传给服务商——按各家接口规范自动翻译，不用您管')).length === 1);
        ck('B1j 保存/取消在场', !!findBtn(body, '保存') && !!findBtn(body, '取消'));
    }
    // B1b 换一条（official 条目：手填上下文预填+来源标=官方；默认档预填）
    {
        const env = mkEnv(CAPS, PROVS, 'P1');
        openEditor(env, env.noFetch, 'glm-5.3');
        const body = bodyOf(env);
        const ns = numInputs(body);
        const est = findAll(body, c => c.textContent === '（估计）')[0];
        const mm = findAll(body, c => Array.isArray(c.children) && c.children.length === 4 && c.children[0].textContent === '能不能看图：')[0];
        ck('B1k 官方条目：上下文/最大输出预填+（估计）零标注；看图预填=能看图；来源标=（官方）',
            String(ns[0].value) === '131072' && String(ns[1].value) === '131072' && !est && mm.children[1].value === 'true' &&
            srcOf(body, '上下文大约多少字：') === '（官方）', ns[0].value + '|' + srcOf(body, '上下文大约多少字：'));
        ck('B1k2 档位 chips=官方值域三项+默认档预填 max',
            (chipsOf(body).children.map(c => nodeText(c)).join('|')).includes('深想') && srcOf(body, '默认档：') === '（官方）', chipsOf(body).children.map(c => nodeText(c)).join('|'));
        ck('B1l 打开弹窗不碰主设置弹窗（$ 日志无 modal/manage/skills）', env.$log.every(id => id === 'cap-modal' || id === 'cap-body' || id === 'model-pool'), JSON.stringify(env.$log));
    }
    // B1m 家族判据（variant 在场性+活跃池）与桥自管提示
    {
        // 无家族：mode none，零家族提示
        const envN = mkEnv(CAPS, PROVS, 'P1');
        openEditor(envN, envN.noFetch, 'glm-5.2');
        ck('B1m 非家族条目（mode none）→ 零家族提示 + chips 可增删照旧',
            !findNote(bodyOf(envN), FAM_NOTE) && !!addSelOf(bodyOf(envN)), 'none-fam');
        // 家族成员不在活跃池 → 家族提示不出
        const PROVD = [{ name: 'P1', host: 'http://h/v1/', models: ['glm-5.3'], active: true }];
        const CAPSD = { 'glm-5.3': CAPS['glm-5.3'], 'glm-5.3-flash': { context_len: 1000000, context_est: false, max_output: 131072, multimodal: true, input: { image: true, pdf: true, video: true }, thinking: { mode: 'variant', levels: ['low', 'high', 'max'], default: 'max', variant: { fast: 'glm-5.3-flash', deep: 'glm-5.3' } }, source: 'official' } };
        const envD = mkEnv(CAPSD, PROVD, 'P1');
        openEditor(envD, envD.noFetch, 'glm-5.3-flash');
        ck('B1m3 成员不在活跃池（家族已散）→ 零家族提示 + 官方档位 chips 仍可改',
            !findNote(bodyOf(envD), FAM_NOTE) && (chipsOf(bodyOf(envD)).children.map(c => nodeText(c)).join('|')).includes('尽全力想'), 'dispersed');
    }
    // B2 保存 roundtrip（改全部可改字段）→ POST patch 形状含被改字段
    {
        calls.length = 0;
        const env = mkEnv(CAPS, PROVS, 'P1');
        openEditor(env, fetchMock, 'glm-5.3-flash');
        const body = bodyOf(env);
        const mm = findAll(body, c => Array.isArray(c.children) && c.children.length === 4 && c.children[0].textContent === '能不能看图：')[0];
        mm.children[1].value = 'true'; mm.children[1].onchange();
        const ns = numInputs(body);
        ns[0].value = '128000'; ns[0].oninput();
        ns[1].value = '4096'; ns[1].oninput();
        // 加两档到位（low/high），再设默认档
        const addSel = addSelOf(body);
        addSel.value = 'low'; addSel.onchange();
        const addSel2 = addSelOf(body);
        addSel2.value = 'high'; addSel2.onchange();
        const defSel = findAll(body, c => (c.children || [])[0] && c.children[0].textContent === '默认档：')[0].children[1];
        defSel.value = 'high'; defSel.onchange();
        await findBtn(body, '保存').onclick();
        const b = calls.length === 1 ? JSON.parse(calls[0].opts.body) : null;
        ck('B2 保存→POST /api/modelcaps 恰一次', calls.length === 1 && calls[0].url === '/api/modelcaps' && calls[0].opts.method === 'POST');
        ck('B2e POST 体逐字段：multimodal/context_len/max_output/thinking{levels,default}（被改字段全带上；variant/mode 零发）',
            !!b && b.op === 'set' && b.model === 'glm-5.3-flash' && b.patch.multimodal === true && b.patch.context_len === 128000 &&
            b.patch.max_output === 4096 && b.patch.thinking && JSON.stringify(b.patch.thinking.levels) === JSON.stringify(['low', 'high']) &&
            b.patch.thinking.default === 'high' && !('variant' in b.patch.thinking) && !('mode' in b.patch.thinking), JSON.stringify(b));
        ck('B2f 成功回执=配置已保存 + 弹窗关（cap-modal 去 .on）+providers 重下发',
            env.notes.some(t => t.includes('配置已保存')) && !env.$('cap-modal').classList.contains('on') && env.loads.length === 1, JSON.stringify(env.notes));
    }
    // B2c 改过即转「（你改的）」+「不再自动更新」句显形（字段级，仅改过的字段转）
    {
        const env = mkEnv(CAPS, PROVS, 'P1');
        openEditor(env, env.noFetch, 'glm-5.3');
        const body = bodyOf(env);
        ck('B2c0 初态：看图=（官方），上下文=（官方），「不再自动更新」句隐藏',
            srcOf(body, '能不能看图：') === '（官方）' && srcOf(body, '上下文大约多少字：') === '（官方）' && findNote(body, USER_NOTE).style.display === 'none', 'init');
        const mm = findAll(body, c => Array.isArray(c.children) && c.children.length === 4 && c.children[0].textContent === '能不能看图：')[0];
        mm.children[1].value = 'false'; mm.children[1].onchange();
        ck('B2c1 改看图→该字段转（你改的），未改的上下文仍（官方）（字段级非整条）',
            srcOf(body, '能不能看图：') === '（你改的）' && srcOf(body, '上下文大约多少字：') === '（官方）', srcOf(body, '能不能看图：') + '/' + srcOf(body, '上下文大约多少字：'));
        ck('B2c2 改过→「不再自动更新」句显形', findNote(body, USER_NOTE).style.display === '', findNote(body, USER_NOTE).style.display);
    }
    // B2b 留空上下文语义（user 改过的已有值→发 null 清空；非 user 原空→不带键）
    {
        calls.length = 0;
        const env = mkEnv(CAPS, PROVS, 'P1');
        openEditor(env, fetchMock, 'glm-5.3'); // context_len=131072 官方值（未标 user）
        const body = bodyOf(env);
        numInputs(body)[0].value = '';
        await findBtn(body, '保存').onclick();
        const b = calls.length ? JSON.parse(calls[0].opts.body) : {};
        ck('B2g 非 user 官方值清空→不发 context_len（清空只对用户改过的字段有意义；官方值重刷新即回）', !('context_len' in b.patch), JSON.stringify(b.patch));
        calls.length = 0;
        const CAPSU = Object.assign({}, CAPS, { 'glm-5.3': Object.assign({}, CAPS['glm-5.3'], { user_fields: ['context_len'] }) });
        const env2 = mkEnv(CAPSU, PROVS, 'P1');
        openEditor(env2, fetchMock, 'glm-5.3');
        numInputs(bodyOf(env2))[0].value = '';
        await findBtn(bodyOf(env2), '保存').onclick();
        const b2 = calls.length ? JSON.parse(calls[0].opts.body) : {};
        ck('B2h user 改过的值清空→发 context_len=null', b2.patch && b2.patch.context_len === null, JSON.stringify(b2.patch));
    }
    // B2i 恢复官方默认（s101/W6，QA P3-1 反单向棘轮）：按钮在场条件=有 user_fields；点击→确认→POST reset:'official'；
    //     复位后（用复位回执重开弹窗）字段标注回「（官方）」；无 user_fields 时按钮不出现（负断言）。
    {
        calls.length = 0;
        const CAPSU = Object.assign({}, CAPS, { 'glm-5.3': Object.assign({}, CAPS['glm-5.3'], { user_fields: ['thinking.levels'], user: true, source: 'user', thinking: Object.assign({}, CAPS['glm-5.3'].thinking, { levels: ['low', 'high'] }) }) });
        const env = mkEnv(CAPSU, PROVS, 'P1');
        openEditor(env, fetchMock, 'glm-5.3');
        const body = bodyOf(env);
        const rbtn = findBtn(body, '恢复官方默认');
        ck('B2i 有 user_fields → 「恢复官方默认」按钮在场（字段标注=（你改的））',
            !!rbtn && srcOf(body, '思考档位（从低到高）：') === '（你改的）' && findNote(body, USER_NOTE).style.display === '', rbtn ? 'btn ok' : 'no btn');
        await rbtn.onclick();
        const rb = calls.length === 1 ? JSON.parse(calls[0].opts.body) : null;
        ck('B2i2 点击→确认句人话+POST 恰一次 patch={reset:\'official\'}（桥复位语义，非发送改值）',
            env.confirms.length === 1 && env.confirms[0].includes('恢复成官方默认') &&
            !!rb && rb.op === 'set' && rb.model === 'glm-5.3' && rb.patch && rb.patch.reset === 'official' && Object.keys(rb.patch).length === 1,
            JSON.stringify(rb) + ' | ' + JSON.stringify(env.confirms));
        ck('B2i3 复位成功→回执「已恢复官方默认」+弹窗关+providers 重下发（帧回填后标注回官方）',
            env.notes.some(t => t.includes('已恢复官方默认')) && !env.$('cap-modal').classList.contains('on') && env.loads.length === 1, JSON.stringify(env.notes));
        // 复位回执态重开：官方三档 + 字段标注回「（官方）」
        const CAPR = Object.assign({}, CAPS, { 'glm-5.3': Object.assign({}, CAPS['glm-5.3'], { source: 'official', thinking: Object.assign({}, CAPS['glm-5.3'].thinking, { levels: ['low', 'high', 'max'], default: 'max' }) }) });
        const envR = mkEnv(CAPR, PROVS, 'P1');
        openEditor(envR, envR.noFetch, 'glm-5.3');
        ck('B2i4 复位后重开弹窗：档位标注回「（官方）」+默认档回官方 max+恢复按钮消失（无 user_fields=负断言）',
            srcOf(bodyOf(envR), '思考档位（从低到高）：') === '（官方）' &&
            findAll(bodyOf(envR), c => (c.children || [])[0] && c.children[0].textContent === '默认档：')[0].children[1].value === 'max' &&
            !findBtn(bodyOf(envR), '恢复官方默认'), 'post-reset');
        // 无 user_fields（干净官方条目）→ 按钮不出现
        const envC = mkEnv(CAPS, PROVS, 'P1');
        openEditor(envC, envC.noFetch, 'glm-5.3');
        ck('B2i5 无 user_fields → 恢复按钮不出现（负断言；未改过无恢复可言）',
            !findBtn(bodyOf(envC), '恢复官方默认'), 'clean');
    }
    // B3 校验门：上下文/最大输出非正整数→人话拒+零 POST（弹窗不关）
    // qa s106 返工随迁：78f85a2（S1/C2）把校验回执从 note 改落弹窗内 say(capNote)=#cap-body 末子节点
    // ——该 commit 漏迁本断言（s99 §8.2 纪律同款事故面），修前 B3/B3b 在 78f85a2..6f55f57 态恒红（tmp/s106-k3-capeditor-pre.html 复证）
    {
        const said = b => { const ch = b.children; return ch.length ? String(ch[ch.length - 1].textContent) : ''; };
        calls.length = 0;
        const env = mkEnv(CAPS, PROVS, 'P1');
        openEditor(env, fetchMock, 'glm-5.3-flash');
        const body = bodyOf(env);
        numInputs(body)[0].value = '-5';
        await findBtn(body, '保存').onclick();
        ck('B3 上下文非正整数→人话拒+零 POST+弹窗保持开',
            said(body).includes('上下文要填正整数') && calls.length === 0 && env.$('cap-modal').classList.contains('on'), JSON.stringify(said(body)));
        calls.length = 0; env.notes.length = 0;
        const env2 = mkEnv(CAPS, PROVS, 'P1');
        openEditor(env2, fetchMock, 'glm-5.3-flash');
        numInputs(bodyOf(env2))[1].value = '-5';
        await findBtn(bodyOf(env2), '保存').onclick();
        ck('B3b 最大输出非正整数→人话拒+零 POST',
            said(bodyOf(env2)).includes('最大输出要填正整数') && calls.length === 0, JSON.stringify(said(bodyOf(env2))));
    }
    // B3c 档位增删：加档/删档/重复不产生（chips 重绘即去重）+候选含官方值域
    {
        const env = mkEnv(CAPS, PROVS, 'P1');
        openEditor(env, env.noFetch, 'glm-5.3');
        const body = bodyOf(env);
        const c0 = chipsOf(body).children.length;
        const addSel = addSelOf(body);
        // 官方三项已在列 → 候选中不重复出现 low/high/max
        ck('B3c 加档候选去重（已在列的官方档位不出现在候选）',
            !addSel.children.some(o => o.value === 'low' || o.value === 'high' || o.value === 'max') && addSel.children.some(o => o.value === 'none'),
            addSel.children.map(o => o.value).join(','));
        addSel.value = 'none'; addSel.onchange();
        const c1 = chipsOf(body).children.length;
        ck('B3c2 加一档→chips 增一', c1 === c0 + 1, c0 + '→' + c1);
        // 删档按钮（末枚 chip 的 ✕）
        const chip0 = findAll(body, c => c.children && c.children.some && c.children.some(y => y.textContent === '✕'))[0];
        const rm = chip0.children[1]; rm.onclick();
        ck('B3c3 删一档→chips 减一', chipsOf(body).children.length === c1 - 1, String(chipsOf(body).children.length));
    }
    // B4 三路关 + 只关本弹窗
    {
        const env = mkEnv(CAPS, PROVS, 'P1');
        const f = env.build();
        // ① 遮罩点击（从模板逐字提取 backdrop 行执行）
        const bgLine = grab(/\$\('cap-modal'\)\.onclick=e=>\{ if\(e\.target\.id==='cap-modal'\) closeCapModal\(\); \}/, 'cap backdrop');
        const wire = new Function('$', 'closeCapModal', bgLine);
        wire(env.$, f.closeCapModal);
        f.openCapEditor('glm-5.3');
        env.$('cap-modal').onclick({ target: { id: 'cap-modal' } });
        ck('B4 关①遮罩点击→关（去 .on）', !env.$('cap-modal').classList.contains('on'));
        f.openCapEditor('glm-5.3');
        env.$('cap-modal').onclick({ target: { id: 'panel-box' } });
        ck('B4b 点弹窗内容区不关（目标非遮罩）', env.$('cap-modal').classList.contains('on'));
        // ② Esc 闸（模板逐字行）：开着→吞掉不落主 modal 链；关着→放行给主 modal 链
        const escLine = grab(/if\(typeof closeCapModal==='function' && closeCapModal\(\)\) return;/, 'cap esc guard');
        const escFn = new Function('closeCapModal', 'mainModal', escLine + '\n mainModal();');
        let mainRan = false; const main = () => { mainRan = true; };
        escFn(f.closeCapModal, main);
        ck('B4c 关②Esc：能力弹窗开着→只关它，主 modal 链被吞（不碰主设置弹窗）', !env.$('cap-modal').classList.contains('on') && mainRan === false);
        mainRan = false;
        escFn(f.closeCapModal, main);
        ck('B4d Esc：能力弹窗已关→放行主 modal 链（既有三路语义零动）', mainRan === true);
        // ③ ✕/取消（模板 onclick 逐字+取消按钮）
        ck('B4e 关③ ✕ 出口逐字（markup onclick="closeCapModal()"）', /onclick="closeCapModal\(\)"/.test(tpl));
        f.openCapEditor('glm-5.3');
        findBtn(bodyOf(env), '取消').onclick();
        ck('B4f 取消按钮→关本弹窗', !env.$('cap-modal').classList.contains('on'));
        ck('B4g closeCapModal 关闭二次调用=安全 false（只碰 cap-modal）', f.closeCapModal() === false && env.$log.every(id => id === 'cap-modal' || id === 'cap-body' || id === 'model-pool'), JSON.stringify(env.$log));
    }
    // B5 池头：行序/即时过滤三态/空池恒在场/就地添加（按钮+回车）
    {
        const env = mkEnv(CAPS, PROVS, 'P1');
        const f = env.build();
        f.renderModelPool(PROVS[0]);
        const box = env.$('model-pool');
        ck('B5 池头行序：提示→搜索+添加→行区→空态（addRow 收起恒在场）',
            box.children.length >= 5 && box.children[1].children[0].placeholder === '搜模型名' && box.children[1].children[1].textContent === '＋添加模型' &&
            box.children[2].style.display === 'none' && box.children[3].children.length === 3, JSON.stringify(box.children.map(c => c.className)));
        const q = box.children[1].children[0], rows = box.children[3], noHit = box.children[4];
        const vis = () => rows.children.map(l => (l.style.display === 'none' ? '-' : '+') + l.pfname).join(',');
        q.value = 'glm-5.3'; q.oninput();
        ck('B5b 即时过滤命中（flash+5.3 在，5.2 隐，空态不出）', vis() === '+glm-5.3-flash,+glm-5.3,-glm-5.2' && noHit.style.display === 'none', vis());
        q.value = 'zzz'; q.oninput();
        ck('B5c 全不命中→「没有匹配的模型」出+行全隐', noHit.style.display === '' && vis() === '-glm-5.3-flash,-glm-5.3,-glm-5.2', vis());
        q.value = ''; q.oninput();
        ck('B5d 清空→全显+空态收起', noHit.style.display === 'none' && vis() === '+glm-5.3-flash,+glm-5.3,+glm-5.2', vis());
        // 就地添加：按钮展开→输入→加入
        const addBtn = box.children[1].children[1], addRow = box.children[2];
        addBtn.onclick();
        ck('B5e 点「＋添加模型」→池头就地出行内输入（display flex）', addRow.style.display === 'flex');
        addRow.children[0].value = 'new-model';
        env.sends.length = 0;
        addRow.children[1].onclick();
        ck('B5f 加入=providers save（去重入池）+回执+池行重绘',
            env.sends.length === 1 && env.sends[0].type === 'providers' && env.sends[0].save === true && env.sends[0].update.models.includes('new-model') &&
            env.notes.includes('已加入 new-model') && findAll(env.$('model-pool'), c => c.pfname === 'new-model').length === 1,
            JSON.stringify(env.sends) + JSON.stringify(env.notes));
        // 回车加入
        const box2 = env.$('model-pool');
        const addBtn2 = box2.children[1].children[1], addRow2 = box2.children[2];
        addBtn2.onclick();
        addRow2.children[0].value = 'enter-model';
        env.sends.length = 0;
        addRow2.children[0].onkeydown({ key: 'Enter' });
        ck('B5g 行内输入回车=加入（迁移自池尾 addrow 语义）', env.sends.length === 1 && env.sends[0].update.models.includes('enter-model') && env.notes.includes('已加入 enter-model'), JSON.stringify(env.sends));
        // 空池：搜索+添加机制恒在场（R2 出生即建）
        const envEmpty = mkEnv({}, [{ name: 'P1', models: [], active: true }], 'P1');
        const fe = envEmpty.build();
        fe.renderModelPool({ name: 'P1', models: [], active: true });
        const be = envEmpty.$('model-pool');
        const hasEmptyNote = be.children.some(c => c.textContent.indexOf('还没勾任何模型') >= 0);
        ck('B5h 空池：搜索框+添加按钮仍在场（恒在场）+空提示在', be.children[1].children[0].placeholder === '搜模型名' && be.children[1].children[1].textContent === '＋添加模型' && hasEmptyNote, JSON.stringify(be.children.map(c => c.textContent.slice(0, 10))));
    }
}

// ============================ Part C：活体帧→页（真桥真 WS 禁桩） ============================
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const TPL_BRIDGE = process.env.PF_BRIDGE || path.join(FORGE, 'conf', 'templates', 'chat-bridge.tpl.js');
const SB_LIVE = path.join(FORGE, 'tmp', 'capeditor-live-sb');
const LIVE_PORT = 20797;
const sleepC = ms => new Promise(r => setTimeout(r, ms));

function liveHttpJson(method, p, body) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
        const rq = http.request({ host: '127.0.0.1', port: LIVE_PORT, path: p, method, headers: data ? { 'content-type': 'application/json', 'content-length': data.length } : {} }, res => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode, json: j, text: b }); });
        });
        rq.on('error', reject); rq.setTimeout(15000, () => rq.destroy(new Error('timeout')));
        if (data) rq.write(data); rq.end();
    });
}
function liveWsConnect(onFrame) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const rq = http.request({ host: '127.0.0.1', port: LIVE_PORT, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + LIVE_PORT } });
        rq.end();
        const timer = setTimeout(() => reject(new Error('ws upgrade timeout')), 8000);
        rq.on('upgrade', (res, socket) => {
            clearTimeout(timer);
            const wsFrame = str => { const payload = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4); const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4])); let header; if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]); else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); } return Buffer.concat([header, mask, masked]); };
            const api = { send: o => socket.write(wsFrame(JSON.stringify(o))), close: () => { try { socket.destroy(); } catch {} } };
            let buf = Buffer.alloc(0);
            socket.on('data', d => {
                buf = Buffer.concat([buf, d]);
                while (buf.length >= 2) {
                    let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
                    if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
                    if (buf.length < off + len) return;
                    let msg; try { msg = JSON.parse(buf.slice(off, off + len).toString('utf8')); } catch { buf = buf.slice(off + len); continue; }
                    buf = buf.slice(off + len);
                    if (msg) onFrame(msg);
                }
            });
            socket.on('error', () => {}); socket.on('close', () => {});
            resolve(api);
        });
        rq.on('error', e => { clearTimeout(timer); reject(e); });
    });
}
async function liveWaitHealth() {
    const t0 = Date.now();
    for (;;) {
        const ok = await new Promise(res => {
            const r = http.get({ host: '127.0.0.1', port: LIVE_PORT, path: '/healthz', timeout: 1000 }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b === 'ok')); }).on('error', () => res(false));
            r.on('timeout', () => { r.destroy(); res(false); });
        });
        if (ok) return true;
        if (Date.now() - t0 > 30000) return false;
        await sleepC(300);
    }
}

async function partC(html) {
    // C0 静态：桥侧 variant 校验门在场 + 旧机制词拒因清零（红对照=改前桥无门且带深档拒因）
    const bsrc = fs.readFileSync(TPL_BRIDGE, 'utf8');
    ck('C0a 桥校验门在场：「家族配对由系统自动管理，不用您操心」', bsrc.indexOf('家族配对由系统自动管理，不用您操心') >= 0);
    ck('C0b 桥拒因机制词清零（err 字面量含 深档/变体/换成=0）', !/err: '[^']*(深档|变体|换成)[^']*'/.test(bsrc));
    ck('C0c 桥 schema v3 迁移步在场（model-caps latest:3 + 2→3 标来源步在）', /'model-caps\.json': \{[\s\S]{0,80}latest: 3,/.test(bsrc) && bsrc.indexOf('cap.source = \'user\'') >= 0 && bsrc.indexOf('t.levels = FIVE.slice()') >= 0);
    ck('C0c2 桥 P3-a mode 拒写门在场（user patch 携带 thinking.mode → 快慢识别由系统自动管理）',
        bsrc.indexOf("if ('mode' in t) return { ok: false, err: '快慢识别由系统自动管理，不用您操心' }") >= 0);
    ck('C0c3 桥 W2 官方预置表机制在场（readPresets/presetLookup + conf/model-presets.json 直读 + source 三态）',
        bsrc.indexOf("path.join(ROOT, 'conf', 'model-presets.json')") >= 0 && bsrc.indexOf('function presetLookup(') >= 0 &&
        bsrc.indexOf("source: 'official'") >= 0 && bsrc.indexOf("source: 'guess'") >= 0 && bsrc.indexOf('W1_MODEL_EFFORTS') < 0);
    // 页侧 providers 处理语句逐字提取（仅机械剥尾注释+摘早退 return——其余逐字执行）
    const providersLine = html.split('\n').find(l => l.includes("if(m.sys==='providers'){"));
    const stmt = ((providersLine || '').split('//')[0] || '').trim();
    if (!(stmt && stmt.includes(' return; }'))) { ck('C0d 页侧 providers 处理语句可定位（含 return 早退）', false, String(providersLine).slice(0, 120)); return; }
    ck('C0d 页侧 providers 处理语句可定位（含 return 早退）', true);
    const runFrame = new Function('m', 'providerList', 'modelCaps', 'renderProviders', 'renderModelLabel', 'thinkEcho', 'renderThinkCtl', 'ctx',
        stmt.replace(' return; }', ' }') + ';ctx.providerList=providerList;ctx.modelCaps=modelCaps;');
    const pageApply = frame => { const ctx = {}; runFrame(frame, [], {}, () => {}, () => {}, '', () => {}, ctx); return ctx; };
    const poolDoc = mkDoc(), poolBox = poolDoc.getElementById('model-pool');
    const runPool = new Function('document', '$', 'esc', 'modelCaps', 'providerList', 'curProvName', 'note', 'wssend',
        extractFnIn(html, 'capsSrcOf') + '\n' + extractFnIn(html, 'capsSrcLabel') + '\n' + extractFnIn(html, 'renderModelPool') + '\nreturn renderModelPool;');
    const renderRows = (ctx, provName) => {
        poolBox.children.length = 0;
        const pr = (ctx.providerList || []).find(p => p.name === provName);
        runPool(poolDoc, id => (id === 'model-pool' ? poolBox : null), s => s, ctx.modelCaps, ctx.providerList, provName, () => {}, () => {})(pr);
        return name => { const lab = findAll(poolBox, c => c.pfname === name)[0]; return lab ? nodeText(lab) : ''; };
    };

    // 沙盒桥（modelcaps-probe 同款：spawn 锚桩化，providers/HTTP 面零改动）
    try { fs.rmSync(SB_LIVE, { recursive: true, force: true }); } catch {}
    for (const d of ['conf/goose/config', 'conf/goose/data/sessions', 'data/logs', 'data/stats']) fs.mkdirSync(path.join(SB_LIVE, ...d.split('/')), { recursive: true });
    fs.copyFileSync(path.join(FORGE, 'conf', 'model-presets.json'), path.join(SB_LIVE, 'conf', 'model-presets.json')); // s101/W2：官方预置表随包落 conf/（真桥现读）
    fs.writeFileSync(path.join(SB_LIVE, 'VERSION'), '9.9.9-capeditor-live-probe');
    fs.writeFileSync(path.join(SB_LIVE, 'conf', 'goose', 'config', 'config.yaml'), 'GOOSE_PROVIDER: openai\nGOOSE_DISABLE_UPDATE_CHECK: true\nextensions: {}\n');
    fs.writeFileSync(path.join(SB_LIVE, 'data', 'providers.json'), JSON.stringify([
        // s101/W4：家族降为兜底（仅官方无档位的模型配对）——glm-5.3 有官方三档=参数路线、不再 variant；
        // 家族形态（variant/家族提示）改由官方表未收录的 no-lv 对承载（verify 资格），故池内加此对。
        { name: 'probe家', host: 'http://127.0.0.1:1/v1', models: ['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'deepseek-v4.1-flash', 'mystery-xyz-9000', 'no-lv-flash', 'no-lv'], key: 'probe-key', active: true }
    ], null, 2));
    fs.writeFileSync(path.join(SB_LIVE, 'data', 'secrets.env'), 'PC_TOKEN=probe\n'); // providers 帧路径会 rewriteSecretsEnv——缺文件即抛错吞帧
    if (bsrc.split("const child = spawn(GOOSE, ['acp'], {").length - 1 !== 1) { ck('C0e 桥模板 spawnAcp 锚点恰一处（可桩化）', false, 'anchor count != 1'); return; }
    ck('C0e 桥模板 spawnAcp 锚点恰一处（可桩化）', true);
    fs.writeFileSync(path.join(SB_LIVE, 'bridge-patched.js'), bsrc.replace("const child = spawn(GOOSE, ['acp'], {", "const child = spawn(process.execPath, [process.env.PF_ACP_STUB || GOOSE, 'acp'], {"));
    fs.writeFileSync(path.join(SB_LIVE, 'goose-stub.js'), `
let buf = ''; let seq = 0;
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => {
  buf += c; let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.id === undefined || j.id === null) continue;
    let result = {};
    if (j.method === 'initialize') result = { agentInfo: { name: 'goose-probe', version: '1.50.0-probe' }, protocolVersion: 1 };
    else if (j.method === 'session/new') result = { sessionId: '20260922_' + (++seq), configOptions: [], modes: { availableModes: [], currentModeId: null } };
    else if (j.method === 'session/load') result = { sessionId: (j.params || {}).sessionId, configOptions: [], updates: [] };
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: j.id, result }) + '\\n');
  }
});
process.stdin.on('end', () => process.exit(0));
const t = setTimeout(() => process.exit(0), 120000); if (t.unref) t.unref();
`);
    const bridge = spawn(process.execPath, [path.join(SB_LIVE, 'bridge-patched.js')], {
        // s101/W4：家族降为兜底且默认关——本活体臂验「家族提示（variant=桥自管）」形态，故显式 FORGE_VARIANT_FAMILY=1
        // 复现家族配对（默认关=官方有档位的 glm 走参数路线、无 variant、零家族提示，见 think-grad B(off) 臂覆盖）。
        env: Object.assign({}, process.env, { FORGE_ROOT: SB_LIVE, PORT: String(LIVE_PORT), PF_ACP_STUB: path.join(SB_LIVE, 'goose-stub.js'), FORGE_VARIANT_FAMILY: '1', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let berr = ''; bridge.stderr.on('data', d => { berr += d; });
    let wsapi = null;
    try {
        if (!await liveWaitHealth()) { ck('C0f 沙盒桥启动（healthz）', false, berr.slice(-300)); return; }
        ck('C0f 沙盒桥启动（healthz）', true);
        const frames = [];
        wsapi = await liveWsConnect(f => frames.push(f));
        const nextProvidersFrame = async mark => { // 游标式等帧：只认 mark 之后新到的 providers 帧（旧帧不复用）
            for (let i = 0; i < 70; i++) {
                for (let j = mark; j < frames.length; j++) if (frames[j].sys === 'providers') return frames[j];
                await sleepC(120);
            }
            return null;
        };
        const mark1 = frames.length;
        wsapi.send({ type: 'providers' });
        const frame1 = await nextProvidersFrame(mark1);
        if (!frame1) { ck('C1 真 providers 帧到达', false, 'timeout'); return; }

        // ---- C1（qa/R1 存量哨兵）：真帧→页镜像非空 ----
        ck('C1a 帧形状真值：caps 嵌在 list[].caps（帧级 m.caps 不存在）+source 三态字段随行',
            !!(frame1.list && frame1.list[0] && frame1.list[0].caps && Object.keys(frame1.list[0].caps).length >= 5) && frame1.caps === undefined &&
            frame1.list[0].caps['glm-5.3'] && frame1.list[0].caps['glm-5.3'].source === 'official' &&
            frame1.list[0].caps['mystery-xyz-9000'] && frame1.list[0].caps['mystery-xyz-9000'].source === 'guess',
            JSON.stringify({ n: Object.keys(frame1.list && frame1.list[0] && frame1.list[0].caps || {}), s: frame1.list && frame1.list[0] && frame1.list[0].caps && frame1.list[0].caps['glm-5.3'] && frame1.list[0].caps['glm-5.3'].source }));
        const ctx1 = pageApply(frame1);
        // s101/W4 随迁：家族条目=官方无档位的 no-lv 对（glm-5.3 有官方三档 → 参数路线 mode:native，不再 variant）
        ck('C1b 页侧镜像非空（R1：list[].caps 合并）+家族条目在（no-lv variant fast=no-lv-flash；glm-5.3 官方三档参数路线）',
            Object.keys(ctx1.modelCaps).length >= 5 && !!(ctx1.modelCaps['no-lv'] && ctx1.modelCaps['no-lv'].thinking.mode === 'variant' &&
                ctx1.modelCaps['no-lv'].thinking.variant.fast === 'no-lv-flash') &&
            ctx1.modelCaps['glm-5.3'] && ctx1.modelCaps['glm-5.3'].thinking.mode === 'native' &&
            JSON.stringify(ctx1.modelCaps['glm-5.3'].thinking.levels) === JSON.stringify(['low', 'high', 'max']),
            JSON.stringify(Object.keys(ctx1.modelCaps)));

        // ---- C2 弹窗开态=桥侧真值（活体帧喂预填：可改形态——chips/默认档/看图/上下文全在场。s101/W4：
        //      官方有档位的 glm-5.3 走参数路线（chips 官方三档、零家族提示）；家族提示改由 no-lv 对承载）----
        {
            const env = mkEnv(ctx1.modelCaps, ctx1.providerList, 'probe家');
            openEditor(env, env.noFetch, 'glm-5.3');
            const body = bodyOf(env);
            const chips = chipsOf(body);
            ck('C2 活体开态（W3 可改形态）：弹窗 .on+档位 chips 可增删（官方值域三项）+默认档 select+零家族提示（参数路线）+radio 零残留',
                env.$('cap-modal').classList.contains('on') && !!chips && findAll(body, c => c.textContent === FAM_NOTE).length === 0 &&
                (chips.children.map(c => nodeText(c)).join('|')).includes('深想') &&
                (chips.children.map(c => nodeText(c)).join('|')).includes('尽全力想') &&
                !!findAll(body, c => (c.children || [])[0] && c.children[0].textContent === '默认档：')[0] &&
                findAll(body, c => c.type === 'radio').length === 0,
                chips ? chips.children.map(c => nodeText(c)).join('|') : 'no chips');
            const envF = mkEnv(ctx1.modelCaps, ctx1.providerList, 'probe家');
            openEditor(envF, envF.noFetch, 'no-lv-flash');
            ck('C2b 家族提示（W4：仅官方无档位且家族兜底配对才出）——no-lv-flash variant+成员在池 → 家族提示在场',
                findAll(bodyOf(envF), c => c.textContent === FAM_NOTE).length === 1, 'no fam note');
        }

        // ---- C3（s101/W2 随迁）：池行来源三态标注随桥侧 source 真值——官方/你改的/猜的 ----
        {
            const rows1 = renderRows(ctx1, 'probe家');
            ck('C3a 池行三态标注在场：官方表命中（glm-5.3）标「（官方）」；官方未收录（mystery-xyz-9000）标「（猜的）」',
                rows1('glm-5.3').includes('（官方）') && rows1('mystery-xyz-9000').includes('（猜的）'),
                rows1('glm-5.3') + ' | ' + rows1('mystery-xyz-9000'));
            const su = await liveHttpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { multimodal: false } });
            ck('C3b 前置：user 写入 ok（官方表不再覆写）', su.status === 200 && su.json && su.json.ok === true, su.text.slice(0, 80));
            const mark2 = frames.length;
            wsapi.send({ type: 'providers' });
            const frame2 = await nextProvidersFrame(mark2);
            const rows2 = renderRows(pageApply(frame2), 'probe家');
            ck('C3c 改过（user）→「（你改的）」；未改过的官方条目仍「（官方）」',
                rows2('glm-5.3').includes('（你改的）') && rows2('glm-5.3-flash').includes('（官方）'),
                rows2('glm-5.3') + ' | ' + rows2('glm-5.3-flash'));
        }

        // ---- C4 variant 拒写新红（s100/T2 桥自管门；红对照=改前桥此臂 ok:true 必红）----
        {
            const g0 = await liveHttpJson('GET', '/api/modelcaps');
            const pre = JSON.stringify(g0.json.caps['glm-5.3'].thinking);
            const r1 = await liveHttpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { variant: { fast: 'glm-5.3-flash', deep: 'glm-5.2' } } } });
            ck('C4 user patch 携带 thinking.variant → 拒（人话=家族配对由系统自动管理，不用您操心）',
                r1.status === 200 && r1.json && r1.json.ok === false && r1.json.err === '家族配对由系统自动管理，不用您操心', r1.text.slice(0, 120));
            const r2 = await liveHttpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { mode: 'variant', variant: { fast: 'glm-5.3-flash', deep: 'glm-5.2' } } } });
            ck('C4b 旧形态（mode+variant）同拒——家族配对无任何 user 入口',
                r2.status === 200 && r2.json && r2.json.ok === false && r2.json.err === '家族配对由系统自动管理，不用您操心', r2.text.slice(0, 120));
            const g1 = await liveHttpJson('GET', '/api/modelcaps');
            ck('C4c 注册表零变（thinking 逐字节同；梯度/llmproxy 读路径零改的前提）',
                JSON.stringify(g1.json.caps['glm-5.3'].thinking) === pre && JSON.stringify(g1.json.caps['glm-5.3-flash'].thinking) === JSON.stringify(g0.json.caps['glm-5.3-flash'].thinking),
                'pre=' + pre + ' post=' + JSON.stringify(g1.json.caps['glm-5.3'].thinking));
            // P3-a 钉死「发 thinking 变异」的真实语义：UI 恒不发（B2e）+纯 API 面发 mode=桥拒非静默剥离
            const r3 = await liveHttpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { mode: 'none' } } });
            ck('C4d user patch 携带 thinking.mode → 桥拒（人话=快慢识别由系统自动管理，不用您操心）——非静默剥离',
                r3.status === 200 && r3.json && r3.json.ok === false && r3.json.err === '快慢识别由系统自动管理，不用您操心', r3.text.slice(0, 120));
            const r4 = await liveHttpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { mode: 'none', levels: ['low'] } } });
            ck('C4e mode+levels 混发同样整包拒（mode 门先行）+注册表零变',
                r4.status === 200 && r4.json && r4.json.ok === false && r4.json.err === '快慢识别由系统自动管理，不用您操心' &&
                JSON.stringify(JSON.parse((await liveHttpJson('GET', '/api/modelcaps')).text).caps['glm-5.3'].thinking) === pre,
                r4.text.slice(0, 120));
        }

        // ---- C5 保存活体 roundtrip（页→真桥→落盘；W3：档位/默认档/看图 可改并真落盘——写通道重开证明）----
        {
            const gpre5 = await liveHttpJson('GET', '/api/modelcaps');
            const thPre = JSON.stringify(gpre5.json.caps['glm-5.3'].thinking);
            const thPreMirror = JSON.stringify(gpre5.json.caps['glm-5.3-flash'].thinking);
            const mark3 = frames.length;
            wsapi.send({ type: 'providers' });
            const frame3 = await nextProvidersFrame(mark3);
            const ctx3 = pageApply(frame3);
            const capture = [];
            const fetchCap = async (url, opts) => { capture.push({ url, body: JSON.parse(opts.body) }); return { json: async () => ({ ok: true }) }; };
            const env = mkEnv(ctx3.modelCaps, ctx3.providerList, 'probe家');
            openEditor(env, fetchCap, 'glm-5.3');
            const body = bodyOf(env);
            const mm = findAll(body, c => Array.isArray(c.children) && c.children.length === 4 && c.children[0].textContent === '能不能看图：')[0];
            mm.children[1].value = 'true'; mm.children[1].onchange(); // 改看图
            const addSel = addSelOf(body); addSel.value = 'none'; addSel.onchange(); // 加一档 none（用户改 levels）
            const defSel = findAll(body, c => (c.children || [])[0] && c.children[0].textContent === '默认档：')[0].children[1];
            defSel.value = 'none'; defSel.onchange(); // 改默认档
            await findBtn(body, '保存').onclick();
            const pb = capture.length === 1 ? capture[0].body : null;
            ck('C5a 页侧活体 POST（W3）：patch 带被改字段 multimodal+thinking{levels,default}（variant/mode 零发）',
                !!pb && pb.model === 'glm-5.3' && pb.patch.multimodal === true &&
                pb.patch.thinking && JSON.stringify(pb.patch.thinking.levels) === JSON.stringify(['none', 'low', 'high', 'max']) &&
                pb.patch.thinking.default === 'none' &&
                !('variant' in pb.patch.thinking) && !('mode' in pb.patch.thinking), JSON.stringify(pb));
            const rr = await liveHttpJson('POST', '/api/modelcaps', pb);
            ck('C5b 真桥采纳（ok:true）', rr.status === 200 && rr.json && rr.json.ok === true, rr.text.slice(0, 100));
            const g2 = await liveHttpJson('GET', '/api/modelcaps');
            const th = g2.json.caps['glm-5.3'] || {};
            // s101/W4：glm-5.3 现在走参数路线（mode:native，无 variant）——桥自管字段（mode/keys）逐字节不动
            ck('C5c 落盘（W3）：levels/default/看图 生效+user_fields 含三字段+桥自管字段 mode/keys 逐字节不动',
                JSON.stringify(th.thinking.levels) === JSON.stringify(['none', 'low', 'high', 'max']) && th.thinking.default === 'none' &&
                th.multimodal === true && (th.user_fields || []).includes('thinking.levels') && (th.user_fields || []).includes('thinking.default') &&
                th.thinking.mode === 'native' &&
                JSON.stringify(th.thinking.keys) === JSON.stringify(['reasoning_effort', 'thinking']) && !('variant' in th.thinking),
                JSON.stringify(th));
            ck('C5d 邻居条目零连坐（另一侧档位逐字节同=W3 用户写不双侧镜像）',
                JSON.stringify(g2.json.caps['glm-5.3-flash'].thinking) === thPreMirror,
                JSON.stringify(g2.json.caps['glm-5.3-flash'].thinking) + ' pre=' + thPreMirror);
            // 消费面闭环（活体）：用户改过的 levels 真被翻译层读（llmproxy 出站 effort=high 仍在值域内）
            ck('C5e 消费面闭环（活体）：改后 levels 被桥读（syncModelCaps 落盘 user_fields 在场=normalizeEffort 读点同源）',
                Array.isArray(th.thinking.levels) && th.thinking.levels.length === 4 && th.source === 'user', JSON.stringify(th.thinking.levels));
        }

        // ---- C6 恢复官方默认活体闭环（s101/W6，QA P3-1）：改过→弹窗出按钮→点按钮的 POST 真发真桥→
        //      providers 帧回填→重开弹窗档位标注回「（官方）」+按钮消失（帧→页链路活体证明，禁桩）----
        {
            const su6 = await liveHttpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { levels: ['low'] } } });
            const mark6 = frames.length;
            wsapi.send({ type: 'providers' });
            const frame6 = await nextProvidersFrame(mark6);
            const ctx6 = pageApply(frame6);
            const cap6 = [];
            const env6 = mkEnv(ctx6.modelCaps, ctx6.providerList, 'probe家');
            openEditor(env6, async (url, opts) => { cap6.push(JSON.parse(opts.body)); return { json: async () => ({ ok: true }) }; }, 'glm-5.3');
            const rbtn6 = findBtn(bodyOf(env6), '恢复官方默认');
            ck('C6 活体：user 改过（levels=[low]）→ 弹窗出「恢复官方默认」按钮 + 该字段标注（你改的）',
                su6.json && su6.json.ok === true && !!rbtn6 && srcOf(bodyOf(env6), '思考档位（从低到高）：') === '（你改的）', rbtn6 ? 'btn' : 'no btn');
            await rbtn6.onclick();
            const rb6 = cap6.length === 1 ? cap6[0] : null;
            const rr6 = rb6 ? await liveHttpJson('POST', '/api/modelcaps', rb6) : null;
            ck('C6b 点按钮 POST patch={reset:\'official\'} → 真桥采纳 ok:true + 落盘回官方三档+user_fields 清空',
                !!rb6 && rb6.patch && rb6.patch.reset === 'official' && !!rr6 && rr6.json && rr6.json.ok === true &&
                JSON.stringify(rr6.json.caps['glm-5.3'].thinking.levels) === JSON.stringify(['low', 'high', 'max']) && !rr6.json.caps['glm-5.3'].user_fields,
                JSON.stringify(rb6) + ' | ' + (rr6 && rr6.text.slice(0, 80)));
            const mark7 = frames.length;
            wsapi.send({ type: 'providers' });
            const frame7 = await nextProvidersFrame(mark7);
            const ctx7 = pageApply(frame7);
            const env7 = mkEnv(ctx7.modelCaps, ctx7.providerList, 'probe家');
            openEditor(env7, env7.noFetch, 'glm-5.3');
            ck('C6c 帧回填后重开：档位标注回「（官方）」+默认档回官方 max+按钮消失（活体帧→页闭环）',
                srcOf(bodyOf(env7), '思考档位（从低到高）：') === '（官方）' &&
                findAll(bodyOf(env7), c => (c.children || [])[0] && c.children[0].textContent === '默认档：')[0].children[1].value === 'max' &&
                !findBtn(bodyOf(env7), '恢复官方默认'), 'live post-reset');
        }
    } finally {
        if (wsapi) wsapi.close();
        try { bridge.kill(); } catch {}
        await new Promise(r => setTimeout(r, 500)); // 等 Windows 句柄释放再清（qa/P4-9）
        try { fs.rmSync(SB_LIVE, { recursive: true, force: true }); } catch {}
    }
}
const chipLabelsOf = chips => chips.children.map(w => w.children[0].textContent);

(async () => {
    console.log('--- Part A: 模板静态（' + path.basename(TPL_HTML) + '）---');
    try { partA(fs.readFileSync(TPL_HTML, 'utf8')); } catch (e) { ck('A 探针异常', false, e.message); }
    console.log('--- Part B: DOM 桩执行 ---');
    try { await partB(fs.readFileSync(TPL_HTML, 'utf8')); } catch (e) { ck('B 探针异常', false, e.message); }
    if (process.env.PF_NOLIVE === '1') { console.log('SKIP: Part C 活体臂（PF_NOLIVE=1 快速静态迭代模式）'); }
    else {
        console.log('--- Part C: 活体帧→页（沙盒真桥）---');
        try { await partC(fs.readFileSync(TPL_HTML, 'utf8')); } catch (e) { ck('C 探针异常', false, e.message); }
    }
    console.log('==============================');
    console.log('capeditor-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})();
