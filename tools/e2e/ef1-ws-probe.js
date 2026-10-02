// s108/ef1 沙盒验收探针（WS 协议级「妻子面」等价物）
// 子命令：
//   configure <key>                       配流保存（UI 同款 add 帧）+ 等回执
//   panelopen                             面板纯打开帧（无 save）
//   converge-arm <key>                    G2：配流→桥被换（converge）+events 行+收敛闭环（再存同值零换桥）
//   corearm <key> <swap|noswap> [none|dangling]   E1 核心臂：agent 跑 forge-register 回合
//   killturn <dangling|none> <midturn|done>       G4/G5：pc process restart chat-bridge
//   samesave                              G7：同定义改档（models 追加，env 三键不变）→ 零换桥
// 输出人话行 + JSON 结论行 RESULT={...}；退出码 0=断言全过。
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), cp = require('child_process');
const PORT = 8790;
const SB = process.env.PF_SB || 'C:/PF-TEST/ef1';
const pcExe = SB + '/bin/pc/process-compose.exe';
function pcPort() { try { return fs.readFileSync(SB + '/data/pc.port', 'utf8').trim() || '8099'; } catch { return '8099'; } }
function pc() { return cp.spawnSync(pcExe, ['-p', pcPort()].concat([].slice.call(arguments)), { timeout: 20000, windowsHide: true, encoding: 'utf8' }); }
function pcJson(name) {
    const r = pc('process', 'list', '-o', 'json');
    const s = (r.stdout || '') + '';
    const i = s.indexOf('[');
    if (i < 0) return null;
    try { const a = JSON.parse(s.slice(i)); return (Array.isArray(a) ? a : []).find(x => x && x.name === name) || null; } catch { return null; }
}
function bridgePid() { const j = pcJson('chat-bridge'); return j && j.pid ? j.pid : 0; }
function healthz() { return new Promise(res => { const q = http.get('http://127.0.0.1:' + PORT + '/healthz', r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res(r.statusCode === 200 && b.includes('ok'))); }); q.on('error', () => res(false)); q.setTimeout(2000, () => { q.destroy(); res(false); }); }); }
async function waitHealthz(ms) { const end = Date.now() + ms; while (Date.now() < end) { if (await healthz()) return true; await sleep(500); } return false; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 极简 WS 客户端（桥为自实现 WS：Origin 头 + masked 帧）----
function clientFrame(str) {
    const payload = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
function wsConnect(onMsg, onOpen, onClose) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:8790' } });
        req.setTimeout(8000, () => { req.destroy(new Error('upgrade timeout')); });
        req.on('upgrade', (res, sock) => {
            let buf = Buffer.alloc(0);
            sock.on('data', d => {
                buf = Buffer.concat([buf, d]);
                while (buf.length >= 2) {
                    let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
                    else if (len === 127) { if (buf.length < 10) return; off = 10; }
                    if (buf.length < off + len) return;
                    const txt = buf.slice(off, off + len).toString('utf8');
                    buf = buf.slice(off + len);
                    let m; try { m = JSON.parse(txt); } catch { continue; }
                    // smart_approve 自动应卡（ws-fuzz-s50h 先例）：allow_once 优先
                    if (m.agent && m.agent.method === 'session/request_permission') {
                        const opts = (m.agent.params && m.agent.params.options) || [];
                        const opt = opts.find(o => o.kind === 'allow_once') || opts[0];
                        sock.write(clientFrame(JSON.stringify({ type: 'acp_reply', callId: m.agent.id, option: opt && opt.optionId })));
                        permCards++;
                    }
                    onMsg(m, sock);
                }
            });
            sock.on('close', () => onClose && onClose());
            sock.on('error', () => onClose && onClose());
            resolve(sock);
            onOpen && onOpen(sock);
        });
        req.on('error', e => reject(e));
        req.end();
    });
}
let permCards = 0;
function send(sock, obj) { sock.write(clientFrame(JSON.stringify(obj))); }
function eventsGrep(re) { try { return fs.readFileSync(SB + '/data/logs/events.log', 'utf8').split('\n').filter(l => re.test(l)); } catch { return []; } }

// ---- 配流（复刻真实 UI 两帧：add 落档 + 勾选模型保存——第二帧才触发旧码 hotRestart 给 acp 真 key）----
// 新码 add 帧即触发 converge 换桥——两帧各自用独立连接，帧间等桥稳定（PID 双采样不变 + healthz）。
async function waitBridgeStable(totalMs) {
    const end = Date.now() + totalMs;
    await sleep(1200); // 换桥窗口先让一拍
    while (Date.now() < end) {
        if (!(await healthz())) { await sleep(500); continue; }
        const a = bridgePid(); await sleep(1500);
        if (!(await healthz())) continue;
        const b = bridgePid();
        if (a && a === b) return true;
    }
    return false;
}
async function doConfigure(key) {
    let done = false, done2 = false;
    const sock = await wsConnect(m => { if (m.sys === 'providers') done = true; });
    send(sock, { type: 'providers', save: true, add: { name: '自家中转', host: 'http://127.0.0.1:20128/v1', key, models: ['glm-5.3-flash'] } });
    const t = Date.now();
    while (!done && Date.now() - t < 15000) await sleep(300);
    try { sock.destroy(); } catch {}
    await waitBridgeStable(25000);
    const s2 = await wsConnect(m => { if (m.sys === 'providers') done2 = true; });
    send(s2, { type: 'providers', save: true, update: { name: '自家中转', models: ['glm-5.3-flash', 'glm-5.3'] } });
    const t2 = Date.now();
    while (!done2 && Date.now() - t2 < 15000) await sleep(300);
    try { s2.destroy(); } catch {}
    console.log((done && done2 ? 'CONFIGURED' : 'TIMEOUT') + ' add=' + done + ' update=' + done2);
    return done && done2;
}
async function doPanelOpen() {
    let done = false;
    const sock = await wsConnect(m => { if (m.sys === 'providers') done = true; });
    send(sock, { type: 'providers' });
    const t = Date.now();
    while (!done && Date.now() - t < 15000) await sleep(300);
    await sleep(700); // 修前会发生的同步回写留窗
    try { sock.destroy(); } catch {}
    return done;
}

// ---- G2 converge 臂 ----
async function convergeArm(key) {
    const r = {};
    const b1 = bridgePid();
    const t0 = Date.now();
    await doConfigure(key);
    // 桥 PID 应在 ~10s 内变化（自杀式 converge）
    let b2 = b1, tSwap = 0;
    while (Date.now() - t0 < 20000) { const p = bridgePid(); if (p && p !== b1) { b2 = p; tSwap = Date.now(); break; } await sleep(700); }
    r.pidBefore = b1; r.pidAfter = b2; r.swapMs = tSwap ? tSwap - t0 : -1;
    r.swap = b2 !== b1;
    r.convergeEvent = eventsGrep(/"ev":"providers_converge"/).length;
    // 收敛闭环：新桥健康后再存同值 → 零换桥
    await waitHealthz(30000);
    await doConfigure(key); // 幂等 add（同名 Object.assign）
    await sleep(4000);
    const b3 = bridgePid();
    r.pidStableAfterResave = b3 === b2;
    console.log(JSON.stringify(r));
    const ok = r.swap && r.convergeEvent >= 1 && r.pidStableAfterResave;
    console.log(ok ? 'GREEN: converge fired once, re-save stable' : 'FAIL: ' + JSON.stringify(r));
    process.exit(ok ? 0 : 1);
}

// ---- E1 核心臂：agent 回合内跑 forge-register ----
const CORE_PROMPT = '请运行命令 bin\\pc\\forge-register.cmd 并带上参数 apps\\hello.yaml（注册一个应用），完成后把结果告诉我。';
function pgPid() { const j = pcJson('pg'); return j && j.pid ? j.pid : 0; }
async function waitPgReady(ms) { const end = Date.now() + ms; while (Date.now() < end) { const j = pcJson('pg'); if (j && j.is_running === true) return true; await sleep(1000); } return false; }
async function coreArm(key, expectSwap, expectNote) {
    await doConfigure(key);
    await waitHealthz(30000);
    await waitPgReady(90000); // R3 断言含 pg 稳定——pg 必须先就位（research/39：initdb 在飞时 update 会误伤）
    await sleep(1500);
    const b1 = bridgePid(), p1 = pgPid();
    let sid = null, gotReplyText = '', tSwap = 0, b2 = 0, wsDied = false, stopFrame = false;
    const chunks = [];
    let sock = await wsConnect(m => {
        if (m.sys === 'subscribed' && m.sessionId) sid = m.sessionId;
        if (m.agent) {
            const u = m.agent.params && m.agent.params.update;
            if (u && u.sessionUpdate === 'agent_message_chunk' && u.content) chunks.push(u.content.text || '');
            if (m.agent.method === 'stop') stopFrame = true;
        }
    }, null, () => { wsDied = true; });
    // 新会话（配流后再开——妻子故事同序）
    send(sock, { type: 'subscribe', sessionId: null, model: 'glm-5.3-flash' });
    const tSub = Date.now();
    while (!sid && Date.now() - tSub < 30000) await sleep(300);
    if (!sid) { console.log('FAIL: no subscribed'); process.exit(2); }
    send(sock, { type: 'prompt', text: CORE_PROMPT });
    const tPrompt = Date.now();
    // 监桥 PID 变化 + 回合终局，最长 180s
    while (Date.now() - tPrompt < 180000) {
        const p = bridgePid();
        if (p && p !== b1 && !tSwap) { tSwap = Date.now(); b2 = p; }
        if (stopFrame) break;
        if (wsDied && tSwap) break;
        await sleep(700);
    }
    gotReplyText = chunks.join('');
    const r = { sid, pidBefore: b1, pidAfter: b2 || bridgePid(), swapped: !!tSwap, swapMs: tSwap ? tSwap - tPrompt : -1, replyLen: gotReplyText.length, replyTail: gotReplyText.slice(-80), permCards, stopFrame, pgBefore: p1, pgAfter: pgPid() };
    r.pgStable = r.pgBefore > 0 && r.pgAfter === r.pgBefore;
    // 换桥后：重连+订阅，观察悬空帧 ≤10s（自 swap 起算，窗口 12s 容探针轮询粒度）；同时计 sys error 帧
    let tNote = 0, noteText = '', sysErr = 0;
    if (r.swapped) {
        await waitHealthz(30000);
        const tEnd = Date.now() + 12000;
        while (Date.now() < tEnd && !tNote) {
            try {
                let sawNote = false;
                const s2 = await wsConnect(m => { if (m.sys === 'dangling_turn') { sawNote = true; noteText = m.text; } if (m.sys === 'error') sysErr++; });
                send(s2, { type: 'subscribe', sessionId: sid });
                const tW = Date.now() + Math.min(3000, tEnd - Date.now());
                while (Date.now() < tW && !sawNote) await sleep(150);
                if (sawNote) { tNote = Date.now(); try { s2.destroy(); } catch {} break; }
                try { s2.destroy(); } catch {}
            } catch {}
            await sleep(400);
        }
        r.noteMs = tNote ? tNote - tSwap : -1;
        r.noteText = noteText.slice(0, 40);
        r.sysErrAfterSwap = sysErr;
    }
    console.log(JSON.stringify(r, null, 0));
    const swapOk = expectSwap === 'swap' ? r.swapped : !r.swapped;
    const noteOk = expectNote === 'dangling' ? (r.noteMs >= 0 && r.noteMs <= 10000) : (r.noteMs === undefined || r.noteMs < 0);
    const replyOk = expectSwap === 'noswap' ? (r.replyLen > 0 && r.stopFrame) : true;
    const ok = swapOk && noteOk && replyOk;
    console.log((ok ? 'PASS' : 'FAIL') + ': swap=' + r.swapped + '(want ' + expectSwap + ') noteMs=' + (r.noteMs !== undefined ? r.noteMs : 'n/a') + '(want ' + expectNote + ') reply=' + r.replyLen + 'B stop=' + r.stopFrame + ' pgStable=' + r.pgStable);
    process.exit(ok ? 0 : 1);
}

// ---- G4/G5：pc process restart chat-bridge（同一硬杀 stopper 路）----
async function killTurn(expect, mode) {
    let sid = null, stopFrame = false;
    const sock = await wsConnect(m => {
        if (m.sys === 'subscribed' && m.sessionId) sid = m.sessionId;
        if (m.agent && m.agent.method === 'stop') stopFrame = true;
    });
    send(sock, { type: 'subscribe', sessionId: null, model: 'glm-5.3-flash' });
    const tSub = Date.now();
    while (!sid && Date.now() - tSub < 30000) await sleep(300);
    if (!sid) { console.log('FAIL: no subscribed'); process.exit(2); }
    const PROMPT = mode === 'midturn' ? '用三句话介绍一下你能帮我做什么。' : '只回复两个字：收到';
    send(sock, { type: 'prompt', text: PROMPT });
    if (mode === 'midturn') { await sleep(1500); } // 流在飞（忙碌条在场形态）
    else { const t = Date.now(); while (!stopFrame && Date.now() - t < 60000) await sleep(300); await sleep(500); } // 正常完成（负检查③：标记已清）
    const markerBefore = readMarker();
    const t0 = Date.now();
    pc('process', 'restart', 'chat-bridge'); // 硬杀+新化身（与 project update 同一 stopProcess 路）
    try { sock.destroy(); } catch {}
    // 重连+订阅，观察悬空帧
    await waitHealthz(30000);
    let tNote = 0, noteText = '', s2 = null, sysErr = 0, stop2 = false, chunks2 = 0;
    const tEnd = Date.now() + 12000;
    while (Date.now() < tEnd && !tNote) {
        try {
            let sawNote = false;
            s2 = await wsConnect(m => { if (m.sys === 'dangling_turn') { sawNote = true; noteText = m.text; } if (m.sys === 'error') sysErr++; if (m.agent && m.agent.method === 'stop') stop2 = true; if (m.agent && m.agent.params && m.agent.params.update && m.agent.params.update.sessionUpdate === 'agent_message_chunk') chunks2++; });
            send(s2, { type: 'subscribe', sessionId: sid });
            const tW = Date.now() + Math.min(3000, tEnd - Date.now());
            while (Date.now() < tW && !sawNote) await sleep(150);
            if (sawNote) { tNote = Date.now(); break; }
            try { s2.destroy(); } catch {} s2 = null;
        } catch {}
        await sleep(400);
    }
    const markerAfter = readMarker();
    let resendOk = false, secondNote = false, resendStop = false, resendErr = 0;
    if (tNote && s2) {
        // 「再问一次」协议等价物：重发该会话最后一条用户消息（前端钮同款路径）→ 新回合应正常完成
        send(s2, { type: 'prompt', text: PROMPT });
        const tR = Date.now();
        while (!stop2 && Date.now() - tR < 90000) await sleep(300);
        resendOk = true; resendStop = stop2; resendErr = sysErr;
        await sleep(8000); // 二订检查窗：无二次悬空
        try {
            let saw2 = false;
            const s3 = await wsConnect(m => { if (m.sys === 'dangling_turn') saw2 = true; });
            send(s3, { type: 'subscribe', sessionId: sid });
            await sleep(2500);
            secondNote = saw2;
            try { s3.destroy(); } catch {}
        } catch {}
    }
    const r = { sid, mode, noteMs: tNote ? tNote - t0 : -1, noteText: noteText.slice(0, 30), markerHad: sid in markerBefore, markerAfter: JSON.stringify(markerAfter), eventsDangling: eventsGrep(/"ev":"dangling_notify"/).length, resendOk, resendStop, resendErr, secondNote };
    console.log(JSON.stringify(r));
    const ok = expect === 'dangling'
        ? (r.noteMs >= 0 && r.noteMs <= 10000 && noteText.includes('再问一次') && noteText.includes('没有完成') && r.markerHad && !(sid in markerAfter) && !r.secondNote && r.resendStop && r.resendErr === 0)
        : (r.noteMs < 0 && !(sid in markerAfter));
    console.log((ok ? 'PASS' : 'FAIL') + ': expect=' + expect + ' noteMs=' + r.noteMs + ' resendStop=' + r.resendStop);
    process.exit(ok ? 0 : 1);
}
function readMarker() { try { return JSON.parse(fs.readFileSync(SB + '/data/turns-inflight.json', 'utf8')).sids || {}; } catch { return {}; } }

// ---- G7 同定义改档 ----
async function sameSave() {
    await waitHealthz(15000);
    const b1 = bridgePid();
    const evBefore = eventsGrep(/"ev":"providers_converge"/).length;
    let done = false;
    const sock = await wsConnect(m => { if (m.sys === 'providers') done = true; });
    // models 追加一个成员（env 三键的 model=models[0] 不变；host/key 不带=沿用）
    send(sock, { type: 'providers', save: true, update: { name: '自家中转', models: ['glm-5.3-flash', 'glm-5.3'] } });
    const t = Date.now();
    while (!done && Date.now() - t < 15000) await sleep(300);
    try { sock.destroy(); } catch {}
    await sleep(4000);
    const b2 = bridgePid();
    const evAfter = eventsGrep(/"ev":"providers_converge"/).length;
    const r = { pidStable: b2 === b1, convergeEvents: evAfter - evBefore, saveReplied: done };
    console.log(JSON.stringify(r));
    const ok = r.pidStable && r.convergeEvents === 0 && done;
    console.log(ok ? 'GREEN: same-def profile save, zero bridge swap' : 'FAIL: ' + JSON.stringify(r));
    process.exit(ok ? 0 : 1);
}

// ---- G9 升级臂：标记会话重开恰一次通知；干净会话重开零通知 ----
async function danglingOne(markedSid) {
    // 先拿一个干净 sid（无标记）：新建会话即可
    let cleanSid = null;
    const s0 = await wsConnect(m => { if (m.sys === 'subscribed' && m.sessionId) cleanSid = m.sessionId; });
    send(s0, { type: 'subscribe', sessionId: null, model: 'glm-5.3-flash' });
    const t0 = Date.now();
    while (!cleanSid && Date.now() - t0 < 30000) await sleep(300);
    try { s0.destroy(); } catch {}
    const probeSid = async (sid, ms) => {
        let saw = false, txt = '';
        const s = await wsConnect(m => { if (m.sys === 'dangling_turn') { saw = true; txt = m.text; } });
        send(s, { type: 'subscribe', sessionId: sid });
        await sleep(ms);
        try { s.destroy(); } catch {}
        return { saw, txt };
    };
    const marked = markedSid ? await probeSid(markedSid, 3000) : { saw: false, txt: '' };
    // 二订同 sid：不得二次提示
    const again = markedSid ? await probeSid(markedSid, 2000) : { saw: false, txt: '' };
    const clean = cleanSid ? await probeSid(cleanSid, 2000) : { saw: true, txt: '' };
    const r = { markedSid, cleanSid, markedGot: marked.saw, markedText: marked.txt.slice(0, 24), secondNote: again.saw, cleanGot: clean.saw, eventsDangling: eventsGrep(/"ev":"dangling_notify"/).length };
    console.log(JSON.stringify(r));
    const ok = marked.saw && !again.saw && !clean.saw && marked.txt.includes('再问一次');
    console.log((ok ? 'PASS' : 'FAIL') + ': one-time note on marked sid, none on clean sid');
    process.exit(ok ? 0 : 1);
}

(async () => {
    const cmd = process.argv[2];
    if (cmd === 'configure') process.exit((await doConfigure(process.argv[3])) ? 0 : 1);
    if (cmd === 'panelopen') process.exit((await doPanelOpen()) ? 0 : 1);
    if (cmd === 'converge-arm') return convergeArm(process.argv[3]);
    if (cmd === 'corearm') return coreArm(process.argv[3], process.argv[4] || 'noswap', process.argv[5] || 'none');
    if (cmd === 'killturn') return killTurn(process.argv[3] || 'dangling', process.argv[4] || 'midturn');
    if (cmd === 'samesave') return sameSave();
    if (cmd === 'danglingone') return danglingOne(process.argv[3] || null);
    console.error('usage: ef1-ws-probe.js configure|panelopen|converge-arm|corearm|killturn|samesave|danglingone ...');
    process.exit(64);
})().catch(e => { console.error('PROBE-ERROR:', e.message); process.exit(2); });
