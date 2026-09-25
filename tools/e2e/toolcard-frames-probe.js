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
//   9) endStream 错误卡读健康帧（research/26 R1/R3）：stale-model/down+key/down 三档 + 无帧/ok 原链不动
// 无桥无网络，秒级。已挂 e2e-chat.sh 第 19 节；也可单跑 node tools/e2e/toolcard-frames-probe.js
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat.tpl.html'), 'utf8');
const bridgeSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat-bridge.tpl.js'), 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n); ok ? pass++ : fail++; };
const die = (msg) => { console.error(msg); process.exit(1); };

// ---- 从模板原文提取 toolCard / maskKeys（提取失败=模板漂移，红） ----
function extractToolCard(src) {
    const m = src.match(/function toolCard\(upd\)\{[\s\S]*?\n\}/);
    if (!m) die('NOT FOUND: toolCard（模板结构漂移，先改探针）');
    return m[0];
}
function extractMaskKeys(src) { // s78 主线测试 P4: 显示层密钥掩码函数——工具卡参数区引用它，随工具卡一并进桩
    const m = src.match(/function maskKeys\(s\)\{[\s\S]*?\n\}/);
    if (!m) die('NOT FOUND: maskKeys（模板结构漂移，先改探针）');
    return m[0];
}
function extractZombieToolcards(src) { // s95/F-3: 回合中断终态收口（桥 acp 退出帧 / ws.onclose 两路共用）
    const m = src.match(/function zombieToolcards\(\)\{[\s\S]*?\n\}/);
    if (!m) die('NOT FOUND: zombieToolcards（模板结构漂移，先改探针）');
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
        extractMaskKeys(html) + '\n' + extractToolCard(html) + '\nreturn toolCard;');
    const toolCard = make(ctx.document, ctx.nearBottom, ctx.toolCards, ctx.chat, ctx.endStream, ctx.wssend, ctx.lastKnownModel, ctx.showExpPop, ctx.setTimeout, ctx.clearTimeout, ctx.setInterval, ctx.clearInterval);
    const makeZ = new Function('toolCards', extractZombieToolcards(html) + '\nreturn zombieToolcards;');
    const zombieToolcards = makeZ(ctx.toolCards);
    for (const u of frames) toolCard(u);
    return { cards: ctx.toolCards, sent, chat, zombieToolcards, toolCard };
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
// s78 主线测试 P4: agent 直查 faucet 的 shell 命令带 X-API-Key/Bearer——参数区显示层掩码（前6后4）
const keyCall = { sessionUpdate: 'tool_call', toolCallId: 'call_07_key', title: 'shell · curl faucet', rawInput: { command: 'curl -s -H "X-API-Key: faucet_1a2b3c4d5e6f7g8h" -H "Authorization: Bearer sk-proj-abcdefgh1234567890" http://127.0.0.1:7800/api/services' }, _meta: { goose: { toolCall: { toolName: 'shell', extensionName: 'developer' } } } };
const keyDone = { sessionUpdate: 'tool_call_update', toolCallId: 'call_07_key', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: '[]' } }] };

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

    // 7) s78 P4 参数区密钥掩码：显示层掩码（前6后4），_inp 喂料与 explain 载荷保持原文
    const r7 = runFrames([keyCall, keyDone]);
    const k = r7.cards.get('call_07_key');
    const secK = k.querySelector('.body').children[0];
    const kPre = (((secK.children || []).find(c => c.tag === 'pre') || {}).textContent || '');
    ck('参数区 X-API-Key 掩码形态（前6后4）', kPre.includes('X-API-Key: faucet****7g8h'));
    ck('参数区 Authorization Bearer 掩码形态（前6后4）', kPre.includes('Authorization: Bearer sk-pro****7890'));
    ck('完整密钥零泄露（两种头部全检）', !kPre.includes('faucet_1a2b3c4d5e6f7g8h') && !kPre.includes('sk-proj-abcdefgh1234567890'));
    ck('URL 与命令其余部分不受掩码影响', kPre.includes('http://127.0.0.1:7800/api/services'));
    ck('card._inp 保持原文（explain 喂料语义不动）', (k._inp || '').includes('faucet_1a2b3c4d5e6f7g8h'));
    clickExplain(k);
    ck('explain 载荷 rawInput 带原文密钥（桥侧数据不改，显示层专属掩码）', r7.sent[0].rawInput.includes('faucet_1a2b3c4d5e6f7g8h'));

    // 7b) s78c P3-2: JSON 引号形态（qa 终轮泄漏矩阵 5 形态）——修复前值首引号不在 token 字符类内=正则整段失配全裸奔
    //     ①②JSON 单行两族 ③rawInput 对象经 JSON.stringify(,null,1)（工具卡主真实形态）④shell（§7 已钉）⑤裸头对照
    const Kj = 'faucet_1a2b3c4d5e6f7g8h', Bj = 'sk-proj-abcdefgh1234567890';
    const rJ = runFrames([
        { sessionUpdate: 'tool_call', toolCallId: 'call_08_json1', title: 'shell · curl api', rawInput: JSON.stringify({ 'X-API-Key': Kj, 'Authorization': 'Bearer ' + Bj }), _meta: { goose: { toolCall: { toolName: 'shell', extensionName: 'developer' } } } },
        { sessionUpdate: 'tool_call', toolCallId: 'call_09_json2', title: 'mcp · fetch headers', rawInput: { headers: { 'X-API-Key': Kj, 'Authorization': 'Bearer ' + Bj } }, _meta: { goose: { toolCall: { toolName: 'fetch', extensionName: 'mcp' } } } },
        { sessionUpdate: 'tool_call', toolCallId: 'call_10_bare', title: 'shell · bare headers', rawInput: 'X-API-Key: ' + Kj + '\nAuthorization: Bearer ' + Bj, _meta: { goose: { toolCall: { toolName: 'shell', extensionName: 'developer' } } } },
    ]);
    const preOf = (id) => { const c = rJ.cards.get(id); const sec = c.querySelector('.body').children[0]; return (((sec.children || []).find(x => x.tag === 'pre') || {}).textContent || ''); };
    const p8 = preOf('call_08_json1'), p9 = preOf('call_09_json2'), p10 = preOf('call_10_bare');
    ck('①JSON 单行 X-API-Key 掩码（掩码直抵结构位尾引号，无残段）', p8.includes('"X-API-Key":"faucet****7g8h"'));
    ck('②JSON 单行 Authorization Bearer 掩码（掩码直抵结构位尾引号，无残段）', p8.includes('"Authorization":"Bearer sk-pro****7890"'));
    ck('①②完整密钥零泄露（JSON 单行两族全检）', !p8.includes(Kj) && !p8.includes(Bj));
    let jv = null; try { jv = JSON.parse(p8); } catch {}
    ck('①②掩码后 JSON 结构完好（尾引号留在结构位，parse 可回读掩码值）', !!jv && jv['X-API-Key'] === 'faucet****7g8h' && jv['Authorization'] === 'Bearer sk-pro****7890');
    ck('③JSON.stringify 对象形态（工具卡主真实形态）X-API-Key 掩码', p9.includes('"X-API-Key": "faucet****7g8h"'));
    ck('③JSON.stringify 对象形态 Authorization Bearer 掩码', p9.includes('"Authorization": "Bearer sk-pro****7890"'));
    ck('③对象形态完整密钥零泄露 + card._inp 原文喂料不动', !p9.includes(Kj) && !p9.includes(Bj) && (rJ.cards.get('call_09_json2')._inp || '').includes(Kj));
    ck('⑤裸头形态不回归（对照）', p10.includes('X-API-Key: faucet****7g8h') && p10.includes('Authorization: Bearer sk-pro****7890'));

    // 8) 桥侧静态钉（chat-bridge.tpl.js 喂料措辞与缓存键；活体路径由 e2e 真桥覆盖，此处防措辞回潮）
    ck('桥侧旧「(空)」歧义措辞未回潮', !bridgeSrc.includes("'\\n结果摘要：' + (msg.output ? o0 : '(空)')"));
    ck('桥侧空输出无歧义措辞在场', bridgeSrc.includes('（该步骤没有返回文字输出）'));
    ck('桥侧缓存键含 model+新喂料字段+\\0 安全分隔（s78 P3-A 换模型不吃旧解释；防旧键碰撞/跨字段拼接碰撞）', /update\(\[model, t0, o0, i0, stt, ec, String\(msg\.toolName \|\| ''\)\]\.join\('\\u0000'\)\)/.test(bridgeSrc));
    ck('桥侧 user 消息改用拼装 um（rawInput/status/exit_code/toolName 入料）', bridgeSrc.includes("{ role: 'user', content: um }"));

    // 9) research/26 R1/R3: endStream 错误卡读健康帧三档——stale-model=换模型出路（等也不会好）；down+key=Key 口径；
    //    down=补时间预期（R3）；无帧/ok=原链不动。提取前端 endStream 原文跑，健康帧=healthSync 维护的 lastHealthFrame 桩注入
    {
        const mES = html.match(/function endStream\(\)\{ if\(streamEl\)\{[\s\S]*?\n\} \}/);
        if (!mES) die('NOT FOUND: endStream（模板结构漂移，先改探针）');
        const mkES = new Function('streamEl', 'mdRender', 'msgButtons', 'chat', 'lastOrig', 'providerList', 'lastHealthFrame', 'document', 'wssend', 'addInfo', 'pendingRetry', 'busy', 'txt', 'submit', mES[0] + '\nreturn endStream;');
        const runES = (streamText, hf) => {
            const streamEl = el('div'); streamEl.dataset = {}; streamEl.textContent = streamText;
            const chat = el('div');
            mkES(streamEl, t => t, () => el('div'), chat, '帮我做个表', [], hf, { createElement: t => el(t) }, () => {}, () => {}, null, false, { value: '' }, () => {})();
            const info = (chat.children || []).filter(c => (c.className || '').split(/\s+/).includes('info'));
            return { text: (info[0] || {}).textContent || '', n: info.length };
        };
        const S26TXT = 'Ran into this error: Provider request failed with status 404: model not found.'; // provider_err 段不含 401/key 令牌，文本链必落 down 族
        const a = runES(S26TXT, { state: 'stale-model' });
        ck('R1a 前端 stale-model → 换模型出路（不含「等一两分钟」安慰）', a.n === 1 && a.text.startsWith('💡 你正在用的模型已被服务商下架') && a.text.includes('拉取') && !a.text.includes('等一两分钟'));
        const b = runES(S26TXT, { state: 'down', kind: 'key' });
        ck('R1b 前端 down+key → Key 口径', b.n === 1 && b.text.includes('这家服务商的 Key 没配上或不对'));
        const c = runES(S26TXT, { state: 'down' });
        ck('R3a 前端 down → 补时间预期半句', c.n === 1 && c.text.includes('一般几分钟内恢复；顶部提醒条消失就是好了'));
        const d = runES(S26TXT, null);
        ck('R1c 前端无健康帧 → 原链不动（无时间预期半句）', d.n === 1 && d.text.includes('等一两分钟') && !d.text.includes('一般几分钟内恢复'));
        const e2 = runES(S26TXT, { state: 'ok' });
        ck('R1d 前端健康 ok → 原链不动（ok 态不劫持错误文本）', e2.n === 1 && e2.text.includes('等一两分钟') && !e2.text.includes('一般几分钟内恢复'));
        const g = runES('Ran into this error: 401 Unauthorized: api key invalid', null);
        ck('R1e 前端 401 文本无健康帧 → 既有 Key 分支保持', g.n === 1 && g.text.includes('这家服务商的 Key 没配上或不对'));
    }

    // 10) s95/F-3: 回合中断终态收口——桥发中断错误帧 / ws.onclose 之后，未收尾的工具卡必须收口（修前永久 in_progress）
    //     s103/S9 随迁：断线≠失败——收口态从「失败」翻红改中性「连接断了，这一步的结果不确定」+ _status=unknown（桥/栈重启场景未失败，不许撒谎）
    {
        const r10 = runFrames([gitCall, gitLive, gitDone, failDone]); // call_00=completed / call_01=failed（对照：已收尾卡不许动）
        const gz = r10.cards.get('call_00_git'), fz = r10.cards.get('call_01_fail');
        const gSt = gz.querySelector('.st'), fSt = fz.querySelector('.st');
        const gBefore = { cls: gSt.className, txt: gSt.textContent };
        const fBefore = { cls: fSt.className, txt: fSt.textContent };
        const stuck = { sessionUpdate: 'tool_call_update', toolCallId: 'call_20_stuck', status: 'in_progress', title: 'shell · 热注册' };
        r10.toolCard(stuck); // 同一沙盒里补一张在飞卡（挂在 live_output 后不收尾=真实现场形态）
        const sz = r10.cards.get('call_20_stuck'), sSt = sz.querySelector('.st');
        ck('F3a 在飞工具卡 = 非终态（前置对照，否则本组无判别力）', sSt.textContent === 'in_progress' && !sSt.className.includes('err'));
        r10.zombieToolcards();
        ck('F3b 未收尾工具卡置中性收口态（s103/S9：人话「连接断了，这一步的结果不确定」+不翻红无「失败」字）', sSt.textContent === '连接断了，这一步的结果不确定' && sSt.className === 'st' && sz._status === 'unknown');
        ck('F3c 已完成的卡零触碰（对照）', gSt.className === gBefore.cls && gSt.textContent === gBefore.txt && gz._status === 'completed');
        ck('F3d 已失败的卡零触碰（幂等/对照）', fSt.className === fBefore.cls && fSt.textContent === fBefore.txt && fz._status === 'failed');
        r10.zombieToolcards();
        ck('F3e 二次调用幂等（不重复改写/不崩，中性态同样幂等）', sSt.textContent === '连接断了，这一步的结果不确定' && sSt.className === 'st');
        ck('F3f 模板两处接线在场：错误帧分支 + 断线重连分支（静态钉，撤线即红）', /if\(m\.sys==='error'\)\{[\s\S]{0,600}?zombieToolcards\(\);/.test(html) && /if\(busy\)\{ setBusy\(false\); endStream\(\); zombieToolcards\(\); \}/.test(html));
    }

    console.log('toolcard-frames-probe PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
}

module.exports = { extractToolCard, runFrames, el };
