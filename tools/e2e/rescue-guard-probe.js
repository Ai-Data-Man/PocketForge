// 救援判据守卫桩测（qa s76 P2-A 转正，原 tmp/qa-s76-rescue-extract.js）：从桥模板原文切 SESSION_NF_RE..rescueSession 块，
// 注入 mock（waiting/nextId/turnText/acp/statsBump）后逐场景断言。零网络、零进程副作用。
// 覆盖：null/字符串/空对象 reject 载荷（null 守卫）、救援去重、ws.alive 门、首轮门、非 NF 失败三档人话（s76 遗留⑦：未归类/unauthorized/S26 命中）。
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../forge/conf/templates/chat-bridge.tpl.js', 'utf8');
const start = src.indexOf('const SESSION_NF_RE');
const end = src.indexOf('async function init()');
if (start < 0 || end < 0 || end <= start) { console.log('FAIL: extraction anchors not found'); process.exit(1); }
const block = src.slice(start, end);

let pass = 0, fail = 0;
const ck = (n, ok) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n); ok ? pass++ : fail++; };

function makeEnv(s26re, classify) { // s76c: 可注入 S26 正则/归类桩（默认永不命中/'unknown'），供非 NF 三档人话分支覆盖
    const acp = { stdin: { writes: [], write(s) { const o = JSON.parse(s); this.writes.push(o); return true; } } };
    const env = {
        waiting: new Map(),
        nextId: 1,
        turnText: new Map(),
        S26_ERR_RE: s26re || /(?!)/,
        classifyUpstream: classify || (() => 'unknown'),
        statsCalls: [],
        statsBump(k) { this.statsCalls.push(k); },
        acp,
        wsSession: new WeakMap(),
        sessionClients: new Map(),
        console: { log() {}, error() {} },
    };
    const factory = new Function('waiting', '__nid', 'turnText', 'S26_ERR_RE', 'classifyUpstream', 'statsBump', 'acp', 'console', 'ROOT', 'wsSession', 'sessionClients',
        block.replace(/nextId\+\+/g, '__nid()') + '\nreturn { sendTurn, rescueSession };');
    const api = factory(env.waiting, () => env.nextId++, env.turnText, env.S26_ERR_RE, env.classifyUpstream, k => env.statsBump(k), env.acp, env.console, 'C:/PF-ROOT', env.wsSession, env.sessionClients);
    return { env, api };
}
const mkWs = () => ({ alive: true, sends: [], send(o) { this.sends.push(o); } });
const subsOf = ws => ws.sends.filter(m => m.sys === 'subscribed');
const errsOf = ws => ws.sends.filter(m => m.sys === 'error').map(m => m.text);
const promptsFor = (env, sid) => env.acp.stdin.writes.filter(w => w.method === 'session/prompt' && w.params.sessionId === sid);
const newsCount = env => env.acp.stdin.writes.filter(w => w.method === 'session/new').length;
const NF = { message: 'resource_not_found', data: 'Session not found: SID' };

// S1 新鲜死 sid 首轮 → 恰一次救援：session/new + resolve 后 subscribed(newSession)+重放
{
    const { env, api } = makeEnv(); const wsA = mkWs();
    api.sendTurn(wsA, 'D1', 'hi', true);
    ck('S1a prompt 已写 acp', promptsFor(env, 'D1').length === 1);
    const rejId = env.acp.stdin.writes[0].id;
    env.waiting.get(rejId).reject({ ...NF, data: NF.data.replace('SID', 'D1') });
    ck('S1b 拒绝后恰一次 session/new', newsCount(env) === 1);
    const newId = env.acp.stdin.writes[1].id;
    env.waiting.get(newId).resolve({ sessionId: 'N1', modes: [1], configOptions: {} });
    ck('S1c subscribed(newSession) 回发', subsOf(wsA).length === 1 && subsOf(wsA)[0].sessionId === 'N1' && subsOf(wsA)[0].newSession === true);
    ck('S1d 重放 prompt 到新 sid 且不救援', promptsFor(env, 'N1').length === 1);
}
// S2 同死 sid 第二客户端 → 去重人话，零新会话
{
    const { env, api } = makeEnv(); const wsA = mkWs(), wsB = mkWs();
    api.sendTurn(wsA, 'D1', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[0].id).reject({ ...NF, data: 'Session not found: D1' });
    const before = newsCount(env);
    api.sendTurn(wsB, 'D1', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[env.acp.stdin.writes.length - 1].id).reject({ ...NF, data: 'Session not found: D1' });
    ck('S2a 第二客户端零新 session/new', newsCount(env) === before);
    ck('S2b 人话死端文案', errsOf(wsB).length === 1 && errsOf(wsB)[0].startsWith('这个对话的通道已失效'));
    ck('S2c 首客户端不受影响', errsOf(wsA).length === 0);
}
// S3 去重后新 sid 不在集合 → 照常救援（点＋新对话再发消息正常）
{
    const { env, api } = makeEnv(); const wsA = mkWs(), wsB = mkWs();
    api.sendTurn(wsA, 'D1', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[0].id).reject({ ...NF, data: 'Session not found: D1' });
    api.sendTurn(wsB, 'N9', 'hi', true); // 新会话号撞死（另一死 sid）——不在集合
    env.waiting.get(env.acp.stdin.writes[env.acp.stdin.writes.length - 1].id).reject({ ...NF, data: 'Session not found: N9' });
    ck('S3 新 sid 独立救援（各一次 session/new×2）', newsCount(env) === 2);
}
// S4 救援失败（session/new 被拒）→ TURN_LOST 人话；重试同 sid → 去重人话（有人话出口、非静默）
{
    const { env, api } = makeEnv(); const wsC = mkWs();
    api.sendTurn(wsC, 'D2', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[0].id).reject({ ...NF, data: 'Session not found: D2' });
    env.waiting.get(env.acp.stdin.writes[1].id).reject({ message: 'acp busy' });
    const e1 = errsOf(wsC);
    api.sendTurn(wsC, 'D2', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[env.acp.stdin.writes.length - 1].id).reject({ ...NF, data: 'Session not found: D2' });
    const e2 = errsOf(wsC);
    ck('S4a 救援失败走成因中立文案', e1.length === 1 && e1[0].startsWith('这一轮没能完成'));
    ck('S4b 重试同 sid 得去重人话', e2.length === 2 && e2[1].startsWith('这个对话的通道已失效'));
}
// S5 ws.alive 门：resolve 时客户端已断 → 零回发、零重放，sessionsCreated 仍计（会话已建语义）
{
    const { env, api } = makeEnv(); const wsD = mkWs();
    api.sendTurn(wsD, 'D3', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[0].id).reject({ ...NF, data: 'Session not found: D3' });
    wsD.alive = false;
    env.waiting.get(env.acp.stdin.writes[1].id).resolve({ sessionId: 'N5' });
    ck('S5a 无 subscribed 回发', subsOf(wsD).length === 0);
    ck('S5b 无重放 prompt', promptsFor(env, 'N5').length === 0);
    ck('S5c sessionsCreated 恰计一次', env.statsCalls.filter(k => k === 'sessionsCreated').length === 1);
}
// S6 中轮（allowRescue=false）死 sid → 直接人话，不进救援不记集合
{
    const { env, api } = makeEnv(); const wsE = mkWs();
    api.sendTurn(wsE, 'D4', 'hi', false);
    env.waiting.get(env.acp.stdin.writes[0].id).reject({ ...NF, data: 'Session not found: D4' });
    const afterFirst = newsCount(env);
    api.sendTurn(wsE, 'D4', 'hi', true); // 随后首轮仍可救援（集合未被中轮污染）
    env.waiting.get(env.acp.stdin.writes[env.acp.stdin.writes.length - 1].id).reject({ ...NF, data: 'Session not found: D4' });
    ck('S6 中轮不救援不记集合，后续首轮仍救援', afterFirst === 0 && errsOf(wsE)[0].startsWith('这一轮没能完成') && newsCount(env) === 1);
}
// S7 救援同步抛错（acp 写失败）→ fail 人话；同 sid 重试 → 去重人话
{
    const { env, api } = makeEnv(); const wsF = mkWs();
    api.sendTurn(wsF, 'D5', 'hi', true);
    env.acp.stdin.write = () => { throw new Error('EPIPE'); }; // 先装抛错器，再触发救援
    env.waiting.get(env.acp.stdin.writes[0].id).reject({ ...NF, data: 'Session not found: D5' });
    const got = errsOf(wsF).some(t => t.startsWith('这一轮没能完成'));
    env.acp.stdin.write = function (s) { const o = JSON.parse(s); this.writes.push(o); return true; }; // 恢复
    api.sendTurn(wsF, 'D5', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[env.acp.stdin.writes.length - 1].id).reject({ ...NF, data: 'Session not found: D5' });
    ck('S7 同步抛错得人话非崩溃，重试撞去重', got && errsOf(wsF).some(t => t.startsWith('这个对话的通道已失效')));
}
// S8 类型混淆 reject 载荷：null / 缺 message 但 data 带 NF → 不崩、判据走 etxt 拼接
{
    const { env, api } = makeEnv(); const wsG = mkWs();
    api.sendTurn(wsG, 'D7', 'hi', true);
    let crashed = null;
    try { env.waiting.get(env.acp.stdin.writes[0].id).reject(null); } catch (e) { crashed = e; }
    ck('S8a reject(null) 不崩（etxt 构造处 null 守卫）且走通用人话', crashed === null && errsOf(wsG).length === 1 && errsOf(wsG)[0] === '这一轮没完成，请再发一次试试。');
    if (crashed) console.log('   S8a crash: ' + crashed.message);
    api.sendTurn(wsG, 'D8', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[env.acp.stdin.writes.length - 1].id).reject({ data: 'Session not found: D8' });
    ck('S8b data 单独携 NF 命中救援', newsCount(env) === 1);
    // s76c: qa 建议的 fuzz 矩阵补案——字符串载荷与空对象
    api.sendTurn(wsG, 'D8s', 'hi', true);
    let crashed2 = null;
    try { env.waiting.get(env.acp.stdin.writes[env.acp.stdin.writes.length - 1].id).reject('Session not found: D8s'); } catch (e) { crashed2 = e; }
    ck('S8c 字符串载荷不崩且 NF 命中救援', crashed2 === null && newsCount(env) === 2);
    api.sendTurn(wsG, 'D8e', 'hi', true);
    let crashed3 = null;
    try { env.waiting.get(env.acp.stdin.writes[env.acp.stdin.writes.length - 1].id).reject({}); } catch (e) { crashed3 = e; }
    const e8 = errsOf(wsG); // S8a 已产 1 条通用人话，S8b/S8c 走救援零报错——此处必须恰为第 2 条（防 .some 被 S8a 顶包）
    ck('S8d 空对象载荷不崩走通用人话', crashed3 === null && e8.length === 2 && e8[1] === '这一轮没完成，请再发一次试试。');
}
// S9-S11 非 NF 上游错误三档人话（s76 遗留⑦：不再 'turn failed: '+英文原文透传）；归类桩注入，覆盖未归类/unauthorized/S26 命中三分支
// S9 未归类（S26 不命中、归类非 unauthorized）→ 通用重发人话，英文原文零透出，不救援
{
    const { env, api } = makeEnv(); const wsH = mkWs();
    api.sendTurn(wsH, 'D9', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[0].id).reject({ message: 'provider switching' });
    const t9 = errsOf(wsH)[0] || '';
    ck('S9 非 NF 未归类走通用人话，不透英文原文', t9 === '这一轮没完成，请再发一次试试。' && !/provider switching|turn failed/.test(t9) && newsCount(env) === 0);
}
// S10 归类 unauthorized → Key 指引人话（S26 正则本不含 401，归类门先于 S26 门才能命中）
{
    const { env, api } = makeEnv(undefined, () => 'unauthorized'); const wsI = mkWs();
    api.sendTurn(wsI, 'D10', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[0].id).reject({ message: 'Request failed: 401 Unauthorized' });
    const t10 = errsOf(wsI)[0] || '';
    ck('S10 unauthorized 走 Key 指引人话，不透英文', t10.startsWith('这家服务商的 Key 没配上或不对') && !/401|Unauthorized/.test(t10) && newsCount(env) === 0);
}
// S11 S26 命中且归类 timeout（rate/server 同分支）→ 服务商暂时不通人话
{
    const { env, api } = makeEnv(/timed? out|rate limit|Server error/i, () => 'timeout'); const wsJ = mkWs();
    api.sendTurn(wsJ, 'D11', 'hi', true);
    env.waiting.get(env.acp.stdin.writes[0].id).reject({ message: 'upstream request timed out' });
    const t11 = errsOf(wsJ)[0] || '';
    ck('S11 timeout 走服务商暂时不通人话，不透英文', t11.startsWith('看起来是大模型服务商那边暂时不通') && !/timed out/.test(t11) && newsCount(env) === 0);
}
console.log('rescue-guard-probe: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
