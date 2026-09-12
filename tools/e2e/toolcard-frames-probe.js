// 工具卡帧双形态回归钉子（e4a 批，r19 R1-R5 修复；spec=docs/research/19-explain-tool-quality.md §4）
// 手法同 ui-logic-probe：从 chat.tpl.html 原文逐字提取 toolCard 整函数（锚点=稳定标记正则，非行号），
// DOM 桩沙盒执行——模板漂移显式 NOT FOUND 报错，不误报。
// 钉住的失效家族（修复前=_out 恒空 → 工具卡输出区从上线起从未显示过 + explain 恒拿「(空)」捏造结果，r19 §2）：
//   1) goose v1.46 数组形态 content:[{type:'content',content:{type:'text',text}}] 解析（真帧 #4/#8 原样内嵌）
//   2) 旧对象形态 content.raw 兜底不删（双形态兼容）
//   3) rawOutput-only 形态（acp-aware 成功工具只发 rawOutput 不发 content）
//   4) live_output 帧不得污染 _out
//   5) explain 载荷喂料扩容：rawInput/status/exitCode/toolName/trunc 进载荷；增强 title 形态下 toolName 不从 title 反推
//   6) 桥侧 explain_tool 喂料措辞静态钉：旧「(空)」歧义措辞不得回潮，新字段进缓存键
// 无桥无网络，秒级。已挂 e2e-chat.sh 第 19 节；也可单跑 node tools/e2e/toolcard-frames-probe.js
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat.tpl.html'), 'utf8');
const bridgeSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat-bridge.tpl.js'), 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n); ok ? pass++ : fail++; };
const die = (msg) => { console.error(msg); process.exit(1); };

// ---- 从模板原文提取 toolCard（提取失败=模板漂移，红） ----
function extractToolCard(src) {
    const m = src.match(/function toolCard\(upd\)\{[\s\S]*?\n\}/);
    if (!m) die('NOT FOUND: toolCard（模板结构漂移，先改探针）');
    return m[0];
}

// ---- 最小 DOM 桩 ----
function el(tag) {
    const e = { tag, children: [], className: '', textContent: '', disabled: false, title: '', onclick: null, style: {} };
    e.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    e.appendChild = c => { e.children.push(c); return c; };
    e.querySelector = sel => qsel(e, sel);
    // card.innerHTML='<summary><span class="ttl">…' 建树：只认开/闭标签+class，足够本探针
    Object.defineProperty(e, 'innerHTML', {
        set(v) {
            e.children = [];
            const stack = [];
            const re = /<(\/?)(\w+)(?:\s+class="([^"]*)")?\s*>/g;
            let m;
            while ((m = re.exec(v))) {
                if (m[1]) { stack.pop(); continue; }
                const c = el(m[2]); c.className = m[3] || '';
                (stack.length ? stack[stack.length - 1] : e).appendChild(c);
                stack.push(c);
            }
        },
        get() { return ''; }
    });
    return e;
}
function qsel(root, sel) {
    for (const c of root.children || []) {
        if (sel[0] === '.' ? (c.className || '').split(/\s+/).includes(sel.slice(1)) : c.tag === sel) return c;
        const r = qsel(c, sel); if (r) return r;
    }
    return null;
}
function runFrames(frames) {
    const sent = [];
    const chat = el('div');
    const ctx = {
        document: { createElement: t => el(t) },
        nearBottom: () => false,
        toolCards: new Map(),
        chat,
        endStream() {},
        wssend: m => sent.push(m),
        lastKnownModel: 'probe-model',
        showExpPop() {},
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}
    };
    const make = new Function('document', 'nearBottom', 'toolCards', 'chat', 'endStream', 'wssend', 'lastKnownModel', 'showExpPop', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        extractToolCard(html) + '\nreturn toolCard;');
    const toolCard = make(ctx.document, ctx.nearBottom, ctx.toolCards, ctx.chat, ctx.endStream, ctx.wssend, ctx.lastKnownModel, ctx.showExpPop, ctx.setTimeout, ctx.clearTimeout, ctx.setInterval, ctx.clearInterval);
    for (const u of frames) toolCard(u);
    return { cards: ctx.toolCards, sent, chat };
}

// ---- 内嵌帧（形态逐字取自 tmp/r19-frames.jsonl 真帧 #1/#3/#4/#8，树输出截短） ----
const gitCall = { sessionUpdate: 'tool_call', toolCallId: 'call_00_git', title: 'shell · git --version', rawInput: { command: 'git --version' }, _meta: { goose: { toolCall: { toolName: 'shell', extensionName: 'developer' } } } };
const gitLive = { sessionUpdate: 'tool_call_update', toolCallId: 'call_00_git', status: 'in_progress', _meta: { toolNotification: { type: 'live_output', params: { sequence: 1, chunks: [{ stream: 'stdout', output: 'git version 2.53.0.windows.1\n' }], truncated: false } } } };
const gitDone = { sessionUpdate: 'tool_call_update', toolCallId: 'call_00_git', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'git version 2.53.0.windows.1' } }], rawOutput: { stdout: 'git version 2.53.0.windows.1', stderr: '', exit_code: 0 } };
const failDone = { sessionUpdate: 'tool_call_update', toolCallId: 'call_01_fail', status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'ϵͳ找不到指定的文件。\r\n\nCommand exited with code 1' } }], rawOutput: { stdout: 'ϵͲ找到指定的文件。\r', stderr: '', exit_code: 1 } };
const rawOnly = { sessionUpdate: 'tool_call_update', toolCallId: 'call_02_acp', status: 'completed', rawOutput: { stdout: 'rows=3', stderr: '', exit_code: 0 } }; // acp-aware 成功工具只发 rawOutput（r19 §1.3）
const legacy = { sessionUpdate: 'tool_call_update', toolCallId: 'call_03_legacy', status: 'completed', content: { raw: 'legacy-raw-text' } }; // 旧对象形态
const enrichCall = { sessionUpdate: 'tool_call', toolCallId: 'call_04_enrich', title: 'tree · data', rawInput: { path: 'data', depth: 1 }, _meta: { goose: { toolCall: { toolName: 'tree', extensionName: 'developer' } } } };
const enrichTitle = { sessionUpdate: 'tool_call_update', toolCallId: 'call_04_enrich', title: 'listing files in data directory', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'artifacts/\nbackups/' } }], rawOutput: { stdout: '', stderr: '', exit_code: 0 } };
const longDone = { sessionUpdate: 'tool_call_update', toolCallId: 'call_05_long', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'x'.repeat(700) } }] };
const emptyDone = { sessionUpdate: 'tool_call_update', toolCallId: 'call_06_empty', status: 'completed' }; // 无 content 无 rawOutput

function clickExplain(card) {
    const summary = card.querySelector('summary');
    const btn = (summary.children || []).find(c => (c.className || '').includes('expbtn'));
    if (!btn) die('NOT FOUND: expbtn（按钮未挂上，完成态处理漂移）');
    btn.onclick({ stopPropagation() {} });
}

if (require.main === module) {
    // 1) 数组形态解析（修复前：upd.content.raw 在数组上恒 undefined → _out 恒空）
    const r1 = runFrames([gitCall, gitLive, gitDone]);
    const g = r1.cards.get('call_00_git');
    ck('数组形态 content → _out 拿到真文本（真帧 #4 形态）', g._out === 'git version 2.53.0.windows.1');
    ck('live_output 帧未污染 _out（无 content/rawOutput 帧 _out 不变）', !g._out.includes('\n'));
    ck('工具卡输出区（.sec-o）渲染出内容（修复前从未显示过）', (g.querySelector('.sec-o') || {}).textContent === 'git version 2.53.0.windows.1');
    ck('exit_code 捕获（rawOutput.exit_code=0）', g._exit === 0);
    ck('status 捕获（completed）', g._status === 'completed');
    ck('toolName 捕获（_meta.goose.toolCall）', g._tool === 'developer · shell');
    ck('rawInput 捕获（命令原文）', (g._inp || '').includes('git --version'));
    const secP = g.querySelector('.body').children[0];
    const preP = (secP.children || []).find(c => c.tag === 'pre');
    ck('参数区渲染 rawInput', ((preP || {}).textContent || '').includes('git --version'));

    // 2) explain 载荷喂料（R2/R3/R4/R5）
    clickExplain(g);
    const p = r1.sent[0];
    ck('explain 载荷带 rawInput', !!p && p.rawInput.includes('git --version'));
    ck('explain 载荷带 status=completed', !!p && p.status === 'completed');
    ck('explain 载荷带 exitCode=0', !!p && p.exitCode === 0);
    ck('explain 载荷带 toolName（不从 title 反推）', !!p && p.toolName === 'developer · shell');
    ck('explain 载荷 output 非空 + trunc=false', !!p && p.output === 'git version 2.53.0.windows.1' && p.trunc === false);

    // 3) 失败调用（真帧 #8 形态）
    const r3 = runFrames([failDone]);
    const f = r3.cards.get('call_01_fail');
    ck('失败调用 _out 含报错与退出码行', f._out.includes('Command exited with code 1'));
    ck('失败调用 exit_code=1 / status=failed', f._exit === 1 && f._status === 'failed');
    clickExplain(f);
    ck('失败调用载荷带失败信号（status+exitCode）', r3.sent[0].status === 'failed' && r3.sent[0].exitCode === 1);

    // 4) rawOutput-only（acp-aware 成功工具）与旧对象形态兜底
    const r4 = runFrames([rawOnly, legacy]);
    ck('rawOutput-only 形态 → _out 取 stdout', (r4.cards.get('call_02_acp')._out || '') === 'rows=3');
    ck('旧对象形态 content.raw 兜底仍在', r4.cards.get('call_03_legacy')._out === 'legacy-raw-text');

    // 5) 增强 title 形态（R5：title 变英文短语丢参数，toolName 仍来自首帧 _meta）
    const r5 = runFrames([enrichCall, enrichTitle]);
    const e5 = r5.cards.get('call_04_enrich');
    clickExplain(e5);
    ck('增强 title 形态：载荷 title=增强短语且 toolName 保持首帧真名', r5.sent[0].title === 'listing files in data directory' && r5.sent[0].toolName === 'developer · tree');

    // 6) 截断与空输出（R4 前置信号）
    const r6 = runFrames([longDone, emptyDone]);
    clickExplain(r6.cards.get('call_05_long'));
    clickExplain(r6.cards.get('call_06_empty'));
    ck('超长输出：payload.output 截 600 且 trunc=true', r6.sent[0].output.length === 600 && r6.sent[0].trunc === true);
    ck('空输出：payload.output 空串且 trunc=false（桥端据此说「没有返回文字」而非「(空)」）', r6.sent[1].output === '' && r6.sent[1].trunc === false);

    // 7) 桥侧静态钉（chat-bridge.tpl.js 喂料措辞与缓存键；活体路径由 e2e 真桥覆盖，此处防措辞回潮）
    ck('桥侧旧「(空)」歧义措辞未回潮', !bridgeSrc.includes("'\\n结果摘要：' + (msg.output ? o0 : '(空)')"));
    ck('桥侧空输出无歧义措辞在场', bridgeSrc.includes('（该步骤没有返回文字输出）'));
    ck('桥侧缓存键含 model+新喂料字段+\\0 安全分隔（s78 P3-A 换模型不吃旧解释；防旧键碰撞/跨字段拼接碰撞）', /update\(\[model, t0, o0, i0, stt, ec, String\(msg\.toolName \|\| ''\)\]\.join\('\\u0000'\)\)/.test(bridgeSrc));
    ck('桥侧 user 消息改用拼装 um（rawInput/status/exit_code/toolName 入料）', bridgeSrc.includes("{ role: 'user', content: um }"));

    console.log('toolcard-frames-probe PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
}

module.exports = { extractToolCard, runFrames, el };
