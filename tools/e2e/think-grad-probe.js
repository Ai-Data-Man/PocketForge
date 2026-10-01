// [s107/f6 入库] 用途：思考档位梯度（DOM 桩+沙箱真桥+真 goose 三层）：家族 gradient 两档/档位人话/切档 ws 帧/习惯记忆/别名出厂零暴露
// 用法：node tools/e2e/think-grad-probe.js（env 覆盖：PF_TPL/PF_BRIDGE/PF_PRESETS/PF_GOOSE_BIN 等见体内；自建沙箱桥本地口，不碰 dev 栈 8790）
// 来源：s98-s101 各批 forge/tmp 同名探针（AGENTS §8.2 触桥清单成员；s106 留痕「探针入库义务」的补账，s107/f6 落库）
// s98/llm-proxy 探针（原 58228dc think-grad 梯度模式断言随迁——切模型模拟已被 /llmproxy 力度翻译通道取代）。
// Part A（DOM 层，模板提取桩，秒级零网络）：四态矩阵——
//   G1 ①家族 gradient（桥在 model 选项上附 {family,fast,deep}）+池含双成员→两档在场（值 low/max、标签/title
//      逐字、flash 侧=快选中）；G1b 选深→ws 发 set_think{value:'max'}+记 pfThinkEffort 习惯、零 switch_model；
//      G1c 完整版侧=深选中，选快→set_think low；
//   G2 ②无 gradient+遮蔽→诚实禁用；G2b 有 gradient 但成员不在池→不认（池变家族解散防双控）；
//   G3 ④原生五档（无 gradient）照旧零回归（onchange 仍 set_think+记习惯）；
//   G5 lastKnownModel 缺→回落 configOptions model.currentValue 判成员。
//   G6 桥锚（qa2/P4-a）：switch_model restarted 回执带 configOptions 且过跨界翻译点。
// Part B（沙箱真桥+桩 goose ACP，stdin wire 逐帧落盘断言）——s99/S4 期望随迁（RCA tmp/s99-thinkgrad-red-rca.md §6，
//   产品零改）：桩 goose 改形态①主臂（session/new 初值读 GOOSE_MODEL=桥 spawn env 钉的别名；别名态五档，
//   模拟 is_reasoning_model 闸门放行）。新语义断言：家族会话以别名入 goose（spawn env 钉死、零 model 写帧——
//   P3-1 废帧跳过）、subscribe 档位预置 low 在场、家族内快↔深切换=零 set_config_option(model) 帧只走
//   thinking_effort low/max 往返（1874b94 二路重构）、回执帧全程真名+gradient、零别名出厂。
//   形态②负臂（存量真名会话→零翻译零合成+诚实遮蔽+零预置）由 forge/tmp/llmproxy-xlate-probe.js 10 断言覆盖，
//   此处不复制（RCA §6.3 去重指路）。
// 红绿：PF_TPL/PF_BRIDGE 指向改前模板必红（改前无 gradient/两档、wire 无别名无 effort 帧）。
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const FORGE = path.join(__dirname, '..', '..', 'forge'); // 入库 s107/f6：自 forge/tmp 迁 tools/e2e，深度随迁
const TPL_HTML = process.env.PF_TPL || path.join(FORGE, 'conf', 'templates', 'chat.tpl.html');
const TPL_BRIDGE = process.env.PF_BRIDGE || path.join(FORGE, 'conf', 'templates', 'chat-bridge.tpl.js');
const SB = path.join(FORGE, 'tmp', 'think-grad-sb');
// s99/S4 随迁后别名只活在 goose 侧（spawn env GOOSE_MODEL 钉 gpt-5-forge-glm-5.3-flash；家族内切换零 model 写帧，
// wire 上不再出现别名写帧——B5 断言 ws 帧零 gpt-5-forge 前缀出厂）
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok || !why ? '' : ' — ' + String(why))); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================ Part A：DOM 层模板提取桩 ============================
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
function partA(html) {
    let renderSrc, famSrc, labelsSrc, onchangeSrc, switchSrc, modelSrc, lvSrc;
    try {
        renderSrc = extractFnIn(html, 'renderThinkCtl');
        famSrc = extractFnIn(html, 'thinkFamily');
        modelSrc = extractFnIn(html, 'thinkCtrlModel'); // s101/W4: 值域来源换血（官方 levels 驱动）
        lvSrc = extractFnIn(html, 'thinkLevelsOf');
        const lm = html.match(/^const THINK_LABELS=\{[^\n]*\};/m);
        if (!lm) throw new Error('THINK_LABELS not found');
        labelsSrc = lm[0];
        const om = html.match(/\$\('think'\)\.onchange=[^\n]*/);
        if (!om) throw new Error('think onchange wiring not found');
        onchangeSrc = om[0];
        switchSrc = extractFnIn(html, 'switchModel');
    } catch (e) { ck('G0 模板含 renderThinkCtl/thinkFamily/thinkCtrlModel/thinkLevelsOf/THINK_LABELS/onchange/switchModel 提取锚', false, e.message); return; }
    ck('G0 模板含 renderThinkCtl/thinkFamily/thinkCtrlModel/thinkLevelsOf/THINK_LABELS/onchange/switchModel 提取锚', true);

    const mkSel = () => {
        const sel = { tag: 'select', disabled: false, title: '', value: '', style: {}, children: [], onchange: null,
            appendChild(c) { this.children.push(c); return c; } };
        Object.defineProperty(sel, 'innerHTML', { get() { return ''; }, set(v) { if (String(v) === '') sel.children.length = 0; } });
        return sel;
    };
    const document = { createElement: () => ({ tag: 'option', value: '', textContent: '' }) };
    const mkLs = init => ({ store: Object.assign({}, init), getItem(k) { return k in this.store ? this.store[k] : null; }, setItem(k, v) { this.store[k] = String(v); } });
    const FIVE_OPTS = ['off', 'low', 'medium', 'high', 'max'].map(v => ({ value: v, name: v }));
    const GRAD = (model, effort) => [ // 家族形态：桥 xlateConfigOptions 产物（gradient 挂 model 选项）——仅 env 开家族时出现
        { id: 'model', currentValue: model, gradient: { family: 'glm-5.3', fast: 'glm-5.3-flash', deep: 'glm-5.3' }, options: [{ value: model, name: model }] },
        { id: 'thinking_effort', category: 'thought_level', type: 'select', currentValue: effort || 'low', options: FIVE_OPTS }];
    const SHADOW = model => [ // 遮蔽形态（无家族；glm 系 go 回包被遮蔽成 ["off"]）
        { id: 'model', currentValue: model, options: [{ value: model, name: model }] },
        { id: 'thinking_effort', category: 'thought_level', type: 'select', currentValue: 'off', options: [{ value: 'off', name: 'off' }] }];
    const NATIVE = model => [ // 真名形态（顶栏档位改由 caps 声明驱动，回包 options 仅遮蔽残留）
        { id: 'model', currentValue: model, options: [{ value: model, name: model }] },
        { id: 'thinking_effort', category: 'thought_level', type: 'select', currentValue: 'off', options: [{ value: 'off', name: 'off' }] }];
    // s101/W4：caps 镜像（翻译层声明值域）——renderThinkCtl 新读点
    const CAPS = {
        'glm-5.3': { thinking: { mode: 'native', levels: ['low', 'high', 'max'], default: 'max', off_supported: false } },
        'glm-5.3-flash': { thinking: { mode: 'native', levels: ['low', 'high', 'max'], default: 'max', off_supported: false } },
        'ccp/claude-sonnet-5': { thinking: { mode: 'native', levels: ['low', 'medium', 'high', 'xhigh', 'max'], default: 'high', off_supported: true } },
    };
    const CAPS_EMPTY = { 'glm-5.3-flash': { thinking: { mode: 'none', levels: [], unknown: true } }, 'glm-5.3': { thinking: { mode: 'none', levels: [], unknown: true } } };
    const build = (cfg, pool, cur, lsInit, caps) => {
        const sel = mkSel(), ls = mkLs(lsInit);
        const fn = new Function('document', '$', 'configOptions', 'localStorage', 'poolModels', 'lastKnownModel', 'thinkEcho', 'modelCaps',
            labelsSrc + '\n' + famSrc + '\n' + modelSrc + '\n' + lvSrc + '\n' + renderSrc + '\nreturn { renderThinkCtl, thinkFamily };')(document, () => sel, cfg, ls, () => pool.map(v => ({ value: v })), cur, '', caps || CAPS);
        fn.renderThinkCtl();
        return { sel, ls, fam: fn.thinkFamily() };
    };
    const act = (sel, ls) => { // onchange+switchModel 同域求值：ws 帧落 sent（负向断言 switch_model 不发在此层做）
        const sent = [], infos = [];
        new Function('$', 'localStorage', 'wssend', 'currentSid', 'sessionId', 'addInfo', 'subscribe',
            switchSrc + '\n' + onchangeSrc)(() => sel, ls, o => { sent.push(o); return true; }, 'S1', 'S1', t => infos.push(t), () => { throw new Error('subscribe should not run'); });
        return { sent, infos };
    };
    const PAIR = ['glm-5.3-flash', 'glm-5.3'];

    // G1 ①：家族 gradient + 池双成员 → 两档在场，flash=快选中（s99/S2 §3.4：挡位文案重写——旧「快一点（快速
//   版）/想深点（完整版…）」含机制内幕词已按裁决 2026-09-21 §3.4 换为零机制词新文案，断言同批更新）
    {
        const { sel, fam } = build(GRAD('glm-5.3-flash'), PAIR, 'glm-5.3-flash');
        ck('G1 家族 gradient+池双成员：两档在场、可点、值 low/max、标签/title 逐字，flash=快选中',
            fam && sel.style.display === '' && sel.disabled === false && sel.children.length === 2 &&
            sel.children[0].value === 'low' && sel.children[0].textContent === '快一点' &&
            sel.children[1].value === 'max' && sel.children[1].textContent === '想深点（更准，稍慢）' &&
            sel.title === '深的更准，也多花一点时间' && sel.value === 'low',
            JSON.stringify({ fam, d: sel.style.display, dis: sel.disabled, n: sel.children.length, v: sel.value, t: sel.title }));
    }
    // G1b：选深 → set_think max（原生 effort 通道，桥翻译成模型），记习惯；零 switch_model
    {
        const { sel, ls } = build(GRAD('glm-5.3-flash'), PAIR, 'glm-5.3-flash');
        const { sent } = act(sel, ls);
        sel.value = 'max';
        sel.onchange({ target: sel });
        ck('G1b 选深→ws 恰一条 set_think{value:"max"}+记 pfThinkEffort 习惯，零 switch_model（梯度模式已删）',
            sent.length === 1 && sent[0].type === 'set_think' && sent[0].value === 'max' && ls.store.pfThinkEffort === 'max',
            JSON.stringify(sent) + JSON.stringify(ls.store));
    }
    // G1c：完整版侧=深选中；选快→set_think low（往返对称）
    {
        const { sel, ls } = build(GRAD('glm-5.3'), PAIR, 'glm-5.3');
        ck('G1c 完整版侧：两档在场且深选中（max）',
            sel.disabled === false && sel.children.length === 2 && sel.value === 'max',
            JSON.stringify({ dis: sel.disabled, v: sel.value }));
        const { sent } = act(sel, ls);
        sel.value = 'low';
        sel.onchange({ target: sel });
        ck('G1c 选快→set_think low', sent.length === 1 && sent[0].value === 'low', JSON.stringify(sent));
    }
    // G2 ②：无 gradient+遮蔽 → 官方声明档位在场（W4：顶栏由 caps 驱动，遮蔽不再导致禁用）
    {
        const { sel } = build(SHADOW('glm-5.3-flash'), ['glm-5.3-flash'], 'glm-5.3-flash');
        ck('G2 无家族遮蔽+官方三档：顶栏三档在场、无「不用额外想」、初始档=max（W4：值域来自 caps 声明）',
            sel.style.display === '' && sel.disabled === false && sel.children.length === 3 &&
            sel.children.map(o => o.value).join(',') === 'low,high,max' && sel.value === 'max' &&
            sel.children.every(o => o.textContent !== '不用额外想'),
            JSON.stringify({ dis: sel.disabled, n: sel.children.length, v: sel.value }));
        const { sel: s2 } = build(SHADOW('glm-5.3'), ['glm-5.3'], 'glm-5.3');
        ck('G2b 完整版侧无家族：同样按官方三档渲染（不再遮蔽禁用）', s2.disabled === false && s2.children.length === 3, JSON.stringify({ dis: s2.disabled, n: s2.children.length }));
    }
    // G2d（W4 验收③）：无参数模型（官方未收录/levels 空）→ 诚实禁用（s99 态③文案）
    {
        const { sel } = build(SHADOW('glm-5.3-flash'), ['glm-5.3-flash'], 'glm-5.3-flash', {}, CAPS_EMPTY);
        ck('G2d 官方无档位（levels 空）→诚实禁用「这个模型想多深它自己定，调不了快慢」',
            sel.disabled === true && sel.title === '这个模型想多深它自己定，调不了快慢' && sel.children.length === 1 &&
            sel.children[0].textContent === '想多深它自己定', JSON.stringify({ dis: sel.disabled, t: sel.title }));
    }
    // G2c：gradient 在场但成员不在池（设置勾掉）→ 家族不认（退回 caps 声明的官方档位形态，不再双控）
    {
        const { sel, fam } = build(GRAD('glm-5.3-flash'), ['别的模型'], 'glm-5.3-flash');
        ck('G2c 成员不在池：gradient 不认（家族解散→按官方三档渲染，不出现两档）', fam === null && sel.disabled === false && sel.children.length === 3,
            JSON.stringify({ fam: !!fam, dis: sel.disabled, n: sel.children.length }));
    }
    // G3 ④：真名模型（无 gradient）→ 官方五档（claude 声明值域）照旧，初值=default
    {
        const { sel, ls } = build(NATIVE('ccp/claude-sonnet-5'), ['ccp/claude-sonnet-5'], 'ccp/claude-sonnet-5');
        ck('G3 官方五档（claude low/medium/high/xhigh/max）：五档照旧，初值=default(high)',
            sel.disabled === false && sel.children.length === 5 && sel.value === 'high' &&
            ['快一点', '标准', '深想', '想得很深', '尽全力想'].every((t, i) => sel.children[i].textContent === t),
            JSON.stringify({ v: sel.value, ops: sel.children.map(o => o.textContent) }));
        const { sent } = act(sel, ls);
        sel.value = 'high';
        sel.onchange({ target: sel });
        ck('G3b 官方档 onchange 仍发 set_think+记 pfThinkEffort（零回归）',
            sent.length === 1 && sent[0].type === 'set_think' && sent[0].value === 'high' && ls.store.pfThinkEffort === 'high',
            JSON.stringify(sent));
    }
    // G5：lastKnownModel 缺 → 回落 configOptions model.currentValue 判成员
    {
        const { sel } = build(GRAD('glm-5.3'), PAIR, null);
        ck('G5 lastKnownModel 空→按 configOptions currentValue 判成员（深选中）',
            sel.disabled === false && sel.children.length === 2 && sel.value === 'max',
            JSON.stringify({ v: sel.value }));
    }
    // G6（qa2/P4-a 桥锚，模板静态）：switch_model restarted 回执带 configOptions 且过跨界翻译点
    {
        const bSrc = fs.readFileSync(TPL_BRIDGE, 'utf8');
        const at = bSrc.indexOf("hotRestartProvider('切换').then(() => {"); // switch_model 跨档分支（唯一 .then 调用点；s103/S5 触发源参数随迁）
        const seg = at >= 0 ? bSrc.slice(at, at + 1600) : '';
        ck('G6 桥锚：switch_model restarted 回执带 configOptions 且过 xlateConfigOptions（load 回包随行）',
            seg.includes('frame.configOptions = co') && seg.includes('xlateConfigOptions(co)') && /method: 'session\/load'/.test(seg));
    }
}

// ============================ Part B：沙箱真桥 + 桩 goose ACP（wire 断言） ============================
const crypto = require('crypto');
function wsFrame(str) {
    const payload = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
function wsConnect(port, onFrame) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: {
            Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
            Origin: 'http://127.0.0.1:' + port } });
        req.end();
        const timer = setTimeout(() => reject(new Error('ws upgrade timeout')), 8000);
        req.on('upgrade', (res, socket) => {
            clearTimeout(timer);
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
            socket.on('error', () => {});
            socket.on('close', () => {});
            resolve(api);
        });
        req.on('error', e => { clearTimeout(timer); reject(e); });
    });
}
async function waitFrame(frames, pred, ms) {
    const t0 = Date.now();
    for (;;) {
        const f = frames.find(pred);
        if (f) return f;
        if (Date.now() - t0 > ms) return null;
        await sleep(120);
    }
}
async function waitHealth(port) {
    const t0 = Date.now();
    for (;;) {
        const ok = await new Promise(res => {
            const r = http.get({ host: '127.0.0.1', port, path: '/healthz', timeout: 1000 }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b === 'ok')); }).on('error', () => res(false));
            r.on('timeout', () => { r.destroy(); res(false); });
        });
        if (ok) return true;
        if (Date.now() - t0 > 20000) return false;
        await sleep(300);
    }
}
const STUB_SRC = `
// 探针桩 goose（s99/S4 随迁 RCA §6.1 形态①主臂）：session/new 初值读 GOOSE_MODEL（桥 spawn env 已钉别名
// gpt-5-forge-*，或显式 PF_STUB_MODEL 覆盖）；thinking_effort 别名态报五档（模拟 is_reasoning_model 闸门放行，
// 活体实证同款），真名态恒 ["off"]（遮蔽形态——形态②负臂归 llmproxy-xlate-probe，不在此复制）。
// set_config_option(model/thinking_effort) 记值并回带新 configOptions——wire 断言依赖的回显链。
const fs = require('fs');
const WIRE = process.env.PF_STUB_WIRE;
let curModel = process.env.PF_STUB_MODEL || process.env.GOOSE_MODEL || 'glm-5.3-flash', curThink = 'off', seq = 0;
const onAlias = () => /^gpt-5-forge-/.test(curModel);
function opts() {
    return [
        { id: 'model', currentValue: curModel, options: [{ value: curModel, name: curModel }] },
        { id: 'thinking_effort', category: 'thought_level', type: 'select', currentValue: curThink, options: onAlias() ? ['off','low','medium','high','max'].map(v => ({ value: v, name: v })) : [{ value: 'off', name: 'off' }] }
    ];
}
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => {
    buf += c; let i;
    while ((i = buf.indexOf('\\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
        let j; try { j = JSON.parse(line); } catch { continue; }
        try { fs.appendFileSync(WIRE, JSON.stringify(j) + '\\n'); } catch {}
        if (j.id === undefined || j.id === null) continue;
        let result = {};
        if (j.method === 'initialize') result = { agentInfo: { name: 'goose-probe', version: '1.50.0-probe' }, protocolVersion: 1 };
        else if (j.method === 'session/new') result = { sessionId: '20260920_' + (++seq), configOptions: opts(), modes: { availableModes: [], currentModeId: null } };
        else if (j.method === 'session/set_config_option') {
            const p = j.params || {};
            if (p.configId === 'model') curModel = p.value;
            if (p.configId === 'thinking_effort') curThink = p.value;
            result = { configOptions: opts() };
        }
        else if (j.method === 'session/load') result = { sessionId: (j.params || {}).sessionId, configOptions: opts(), updates: [] };
        else if (j.method === 'session/prompt') result = { stopReason: 'end' };
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: j.id, result }) + '\\n');
    }
});
process.stdin.on('end', () => process.exit(0));
const t = setTimeout(() => process.exit(0), 60000); if (t.unref) t.unref();
`;
const wireRead = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };

// s101/W4：两臂——默认（家族关，参数路线：真名入 goose、零 gradient）与强制开（FORGE_VARIANT_FAMILY=1，老形态：
// 别名入 goose、gradient 两档）。两臂共用同一沙箱构建，仅 env 一个变量——红绿对照的判据（W4 验收④）。
async function partB() {
    const src = fs.readFileSync(TPL_BRIDGE, 'utf8');
    const SPAWN_ANCHOR = "const child = spawn(GOOSE, ['acp'], {";
    if (src.split(SPAWN_ANCHOR).length - 1 !== 1) { ck('B-1 spawnAcp 锚点恰一处（可桩化）', false, 'anchor count != 1'); return; }
    for (const arm of ['off', 'on']) {
        try { fs.rmSync(SB, { recursive: true, force: true }); } catch {}
        for (const d of ['conf/goose/config', 'conf/goose/data/sessions', 'conf/templates', 'data/logs', 'data/stats']) fs.mkdirSync(path.join(SB, ...d.split('/')), { recursive: true });
        fs.copyFileSync(path.join(FORGE, 'conf', 'model-presets.json'), path.join(SB, 'conf', 'model-presets.json')); // s101/W2/W4：真桥现读官方表（档位值域来源）
        fs.writeFileSync(path.join(SB, 'VERSION'), '9.9.9-llm-proxy-grad-probe');
        fs.writeFileSync(path.join(SB, 'conf', 'goose', 'config', 'config.yaml'), 'extensions: {}\n');
        fs.writeFileSync(path.join(SB, 'goose-stub.js'), STUB_SRC);
        fs.writeFileSync(path.join(SB, 'bridge-patched.js'), src.replace(SPAWN_ANCHOR, "const child = spawn(process.execPath, [process.env.PF_ACP_STUB || GOOSE, 'acp'], {"));
        if (arm === 'off') ck('B-1 桥模板可桩化（spawnAcp 锚点一处，逐字拷贝仅换 acp 子进程命令）', true);

        const port = 18811;
        const wire = path.join(SB, 'wire-grad-' + arm + '.jsonl');
        try { fs.unlinkSync(wire); } catch {}
        // 池 fixture：同一 active 供应商勾了快/深双条目（research/37 L1 形态）。
        // off 臂用 glm（官方有档位=家族资格不成立，验「参数路线」）；on 臂用官方表未收录的 no-lv/no-lv-flash
        // （无官方档位=家族兜底资格成立，验老两档形态）——W4 资格判据的活体对照。
        const pool = arm === 'on' ? ['no-lv-flash', 'no-lv'] : ['glm-5.3-flash', 'glm-5.3'];
        fs.writeFileSync(path.join(SB, 'data', 'providers.json'), JSON.stringify([{ name: 'think-grad-fake', host: 'http://127.0.0.1:18399', key: 'sk-probe', models: pool, active: true }]));
        const env = { ...process.env, FORGE_ROOT: SB, PORT: String(port), NO_PROXY: '127.0.0.1,localhost',
            PF_ACP_STUB: path.join(SB, 'goose-stub.js'), PF_STUB_WIRE: wire };
        if (arm === 'on') env.FORGE_VARIANT_FAMILY = '1';
        else delete env.FORGE_VARIANT_FAMILY;
        const child = spawn(process.execPath, [path.join(SB, 'bridge-patched.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stderr.on('data', d => process.stderr.write('[bridge-grad-' + arm + '] ' + d));
        try {
            ck('B(' + arm + ')0 沙箱桥起活（healthz=ok）', await waitHealth(port));
            const frames = [];
            const ws = await wsConnect(port, m => frames.push(m));
            ws.send({ type: 'subscribe', sessionId: null, model: arm === 'on' ? 'no-lv-flash' : 'glm-5.3-flash' });
            const sub = await waitFrame(frames, f => f.sys === 'subscribed', 10000);
            const sid = sub && sub.sessionId;
            const subModel = sub && (sub.configOptions.find(o => o.id === 'model') || {});
            const modelFrames = () => wireRead(wire).filter(j => j.method === 'session/set_config_option' && j.params && j.params.configId === 'model');
            const thinkFrames = () => wireRead(wire).filter(j => j.method === 'session/set_config_option' && j.params && j.params.configId === 'thinking_effort');
            await sleep(300);
            if (arm === 'off') {
                // ---- 默认档（W4 验收④红臂）：家族关 → goose 见真名、零 gradient；档位可调由 caps 声明放行 ----
                ck('B(off)1 subscribed：模型=真名（假名不出厂）+零 gradient（家族默认关）',
                    !!sub && Array.isArray(sub.configOptions) && subModel.currentValue === 'glm-5.3-flash' && subModel.gradient === undefined,
                    JSON.stringify(sub && sub.configOptions));
                const tf0 = thinkFrames();
                ck('B(off)2 V1：新会话官方 default（glm-5.3-flash=max）只显示预选——零 thinking_effort ACP 帧（s104/V1：官方默认档不上 wire 不发帧；user default 上 wire 由 modelcaps R2j5b/w1 A7u 承担）',
                    tf0.length === 0,
                    JSON.stringify(tf0.map(j => j.params.value)));
                // 档位可调：goose 回包遮蔽成 ["off"]，但 caps 声明 low/high/max——thinkDomain 放行（否则顶栏=假旋钮）
                ws.send({ type: 'set_think', sessionId: sid, value: 'high' });
                const ts = await waitFrame(frames, f => f.sys === 'think_set' && f.value === 'high', 8000);
                ck('B(off)3 set_think high（官方值域内）→ok:true + ACP 帧落地（显式选择照旧全链；goose 1.50 对 glm masked-accept，回执 ok=s104/V2 红证）',
                    !!(ts && ts.ok === true) && thinkFrames().length === 1 && thinkFrames()[0].params.value === 'high',
                    JSON.stringify({ ts: ts && { ok: ts.ok, err: ts.err }, t: thinkFrames().map(j => j.params.value) }));
                ws.send({ type: 'set_think', sessionId: sid, value: 'medium' });
                const ts2 = await waitFrame(frames, f => f.sys === 'think_set' && f.value !== 'high', 8000);
                ck('B(off)4 set_think medium（∉官方值域 {low,high,max}）→ok:false 人话+零帧（诚实拒，不装成功）',
                    !!(ts2 && ts2.ok === false && ts2.err === '当前模型不支持调思考力度') && thinkFrames().length === 1,
                    JSON.stringify(ts2));
                ws.send({ type: 'switch_model', model: 'glm-5.3' });
                const ms1 = await waitFrame(frames, f => f.sys === 'model_switched' && f.model === 'glm-5.3', 8000);
                const ms1Model = ms1 && (ms1.configOptions.find(o => o.id === 'model') || {});
                await sleep(300);
                const mfOff = modelFrames();
                ck('B(off)5 切模型：真名直写 goose（无家族分流，末条 model 帧=目标真名）+回执零 gradient',
                    !!ms1 && ms1.provider === 'think-grad-fake' && ms1Model.currentValue === 'glm-5.3' && ms1Model.gradient === undefined &&
                    mfOff.length >= 1 && mfOff[mfOff.length - 1].params.value === 'glm-5.3',
                    JSON.stringify({ cur: ms1 && ms1Model.currentValue, m: mfOff.map(j => j.params.value) }));
                ck('B(off)6 全程 ws 帧零别名出厂（家族关后假名更无来源）', !frames.some(f => JSON.stringify(f).includes('gpt-5-forge')));
            } else {
                // ---- 强制开（W4 验收④绿臂对照）：老形态——别名入 goose、gradient 两档在场 ----
                const subThink = sub && (sub.configOptions.find(o => o.id === 'thinking_effort') || {});
                ck('B(on)1 subscribed：真名+gradient 附着+五档在场（家族兜底形态，仅 env 强制开启时出现）',
                    !!sub && Array.isArray(sub.configOptions) && subModel.currentValue === 'no-lv-flash' &&
                    subModel.gradient && subModel.gradient.family === 'no-lv' && subModel.gradient.fast === 'no-lv-flash' && subModel.gradient.deep === 'no-lv' &&
                    Array.isArray(subThink.options) && subThink.options.map(o => o.value).join(',') === 'off,low,medium,high,max',
                    JSON.stringify(sub && sub.configOptions));
                const mf0 = modelFrames(), tf0 = thinkFrames();
                ck('B(on)2 V1 wire：会话钉别名（spawn env 同款）→零 set_config_option(model) 写帧（P3-1 废帧跳过）+零预置档 ACP 帧（s104/V1：家族预置同属桥填充不发帧——首回合档位由 prompt 前对账兜底 :4989）',
                    mf0.length === 0 && tf0.length === 0,
                    JSON.stringify({ m: mf0.map(j => j.params.value), t: tf0.map(j => j.params.value) }));
                ws.send({ type: 'switch_model', model: 'no-lv' });
                const ms1 = await waitFrame(frames, f => f.sys === 'model_switched' && f.model === 'no-lv', 8000);
                await sleep(300);
                const mf1 = modelFrames(), tf1 = thinkFrames();
                const ms1Model = ms1 && (ms1.configOptions.find(o => o.id === 'model') || {});
                ck('B(on)3 选深→model_switched 真名回执+gradient 维持；零 model 写帧（家族单条目=别名）+set_think max（显式选择全链）',
                    !!ms1 && ms1.provider === 'think-grad-fake' && ms1Model.currentValue === 'no-lv' && ms1Model.gradient &&
                    mf1.length === 0 && tf1.length === 1 && tf1[0].params.value === 'max' && tf1[0].params.sessionId === sid,
                    JSON.stringify({ cur: ms1 && ms1Model.currentValue, m: mf1.map(j => j.params.value), t: tf1.map(j => j.params.value) }));
                ws.send({ type: 'switch_model', model: 'no-lv-flash' });
                const ms2 = await waitFrame(frames, f => f.sys === 'model_switched' && f.model === 'no-lv-flash', 8000);
                await sleep(300);
                const mf2 = modelFrames(), tf2 = thinkFrames();
                ck('B(on)4 选快→切回：零 model 写帧+set_think low（往返对称）',
                    !!ms2 && mf2.length === 0 && tf2.length === 2 && tf2[1].params.value === 'low' && tf2[1].params.sessionId === sid,
                    JSON.stringify({ m: mf2.map(j => j.params.value), t: tf2.map(j => j.params.value) }));
                ck('B(on)5 全程 ws 帧零别名出厂（假名只在 goose 眼里）', !frames.some(f => JSON.stringify(f).includes('gpt-5-forge')),
                    frames.filter(f => JSON.stringify(f).includes('gpt-5-forge')).map(f => JSON.stringify(f).slice(0, 120)).join(' | '));
            }
            try { ws.close(); } catch {}
        } finally {
            try { child.kill(); } catch {}
            await sleep(300);
            try { fs.rmSync(SB, { recursive: true, force: true }); } catch {}
        }
    }
}

(async () => {
    console.log('--- Part A: DOM 四态矩阵（' + path.basename(TPL_HTML) + '）---');
    try { partA(fs.readFileSync(TPL_HTML, 'utf8')); } catch (e) { ck('A 探针异常', false, e.message); }
    console.log('--- Part B: 沙箱真桥 + 桩 goose ACP（' + path.basename(TPL_BRIDGE) + '）---');
    try { await partB(); } catch (e) { ck('B 探针异常', false, e.message); try { fs.rmSync(SB, { recursive: true, force: true }); } catch {} }
    console.log('==============================');
    console.log('think-grad-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})();
