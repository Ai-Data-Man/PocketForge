// s78 e2e 20：双 subscribed 乱序竞态（qa s78-qa-report P1-A）+ 串台面负断言（P2-B 同族①②）。
// 沙盒自建：FORGE_ROOT=tmp/pfr20-e2e-<pid>（goose 硬链接进沙盒 bin/），桥/假 provider 端口运行期自选（避开本机占用），
// 绝不碰 dev 树 :8790 活体会话。场景转正自 tmp/s78-qa-race.js（QA 复现脚本）。
// 修前行为：页面加载 subscribe(null) 在飞（session/new ~2s 往返）期间 subscribe(sidA) → 迟到的 subscribed(新空会话)
// 把 wsSession 翻绑，oracle prompt{sessionId:sidA,text:''} 回「这场对话已经不在了」而非「不能是空的」（RACE_CONFIRMED）。
// 修后断言：代际守卫丢弃迟到绑定（孤儿会话 close 回收）+ bindWs 摘旧成员籍 + 带 sid 的事件只发该会话订阅者。
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORGE = path.resolve(__dirname, '..', '..', 'forge');
const ROOT = path.join(__dirname, '..', '..', 'tmp', 'pfr20-e2e-' + process.pid);
function freePort() { return new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
let BRIDGE_PORT = 0, PROV_PORT = 0;
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok ? '' : (why ? '  << ' + why : ''))); ok ? pass++ : fail++; };

// ---- 假 provider（pfr18c 同款精简 + /__log 请求台账，供 X3 证明 turn 真的飞过） ----
const provSeen = [];
function startProvider() {
    const srv = http.createServer((req, res) => {
        if (req.url && req.url.includes('/__log')) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(provSeen));
            return;
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            let j = null; try { j = JSON.parse(body); } catch {}
            const us = ((j && j.messages) || []).filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : '');
            provSeen.push(us[us.length - 1] || '');
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
            const chunk = (delta, fin) => 'data: ' + JSON.stringify({ id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 1700000000, model: 'fake-model', choices: [{ index: 0, delta, finish_reason: fin }] }) + '\n\n';
            res.write(chunk({ role: 'assistant', content: '收到，已记录。' }, null));
            res.write(chunk({}, 'stop'));
            res.write('data: [DONE]\n\n');
            res.end();
        });
    });
    return new Promise(r => srv.listen(PROV_PORT, '127.0.0.1', () => r(srv)));
}
const provSaw = mk => new Promise(r => http.get({ host: '127.0.0.1', port: PROV_PORT, path: '/__log' }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r(JSON.parse(b).some(t => String(t).includes(mk)))); }));

// ---- 裸 WS 客户端（ws-rollback-probe.js 同款 + head 首帧坑：101+hello 同包时 hello 在 upgrade 的 head 参数里） ----
function mkClient(port) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + port } });
        req.on('upgrade', (res, socket, head) => {
            const c = { socket, inbox: [], waiters: [] };
            c.send = o => socket.write(frame(o));
            // peek=true：匹配帧照常入队（保留 inbox 顺序供时序断言）；缺省=消费（不进 inbox）
            c.waitUntil = (pred, ms, tag, peek) => new Promise((res2, rej2) => {
                for (let i = 0; i < c.inbox.length; i++) if (pred(c.inbox[i])) { const hit = c.inbox[i]; if (!peek) c.inbox.splice(i, 1); return res2(hit); }
                const w = { pred, peek, res: res2, rej: rej2, timer: setTimeout(() => { const ix = c.waiters.indexOf(w); if (ix >= 0) c.waiters.splice(ix, 1); rej2(new Error('timeout: ' + tag)); }, ms || 30000) };
                c.waiters.push(w);
            });
            const dispatch = m => {
                for (let i = 0; i < c.waiters.length; i++) {
                    if (c.waiters[i].pred(m)) {
                        const w = c.waiters.splice(i, 1)[0];
                        clearTimeout(w.timer);
                        if (w.peek) { c.inbox.push(m); w.res(m); return; }
                        w.res(m); return; // 消费：不进 inbox
                    }
                }
                c.inbox.push(m);
            };
            let buf = Buffer.from(head || []); // 101+hello 同包时 hello 整帧在 head，不会触发 data 事件——必须即刻解析
            const pump = () => {
                while (buf.length >= 2) {
                    const op = buf[0] & 0x0f;
                    let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
                    else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
                    if (buf.length < off + len) return;
                    const pl = buf.slice(off, off + len); buf = buf.slice(off + len);
                    if (op !== 0x1) continue;
                    let m; try { m = JSON.parse(pl.toString('utf8')); } catch { continue; }
                    dispatch(m);
                }
            };
            socket.on('data', d => { buf = Buffer.concat([buf, d]); pump(); });
            pump();
            socket.on('close', () => { for (const w of c.waiters.splice(0)) { clearTimeout(w.timer); try { w.rej(new Error('socket closed')); } catch {} } });
            socket.on('error', () => { });
            c.waitUntil(m => m.sys === 'hello' && m.caps && m.caps.modes, 45000, 'hello/ACP ready').then(() => resolve(c), reject);
        });
        req.on('error', e => reject(e));
        req.end();
    });
}
function frame(obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
const kill = c => { try { if (c && c.socket) c.socket.destroy(); } catch {} };

let bridge = null, prov = null;
let bridgeLog = '';
(async () => {
    // ===== 沙盒搭建 =====
    BRIDGE_PORT = await freePort(); PROV_PORT = await freePort();
    console.log('sandbox ports: bridge=' + BRIDGE_PORT + ' provider=' + PROV_PORT);
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.join(ROOT, 'bin', 'goose', 'goose-package'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.linkSync(path.join(FORGE, 'bin', 'goose', 'goose-package', 'goose.exe'), path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe'));
    fs.writeFileSync(path.join(ROOT, 'data', 'providers.json'), JSON.stringify([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake20', models: ['fake-model'], active: true }]));
    prov = await startProvider();
    bridge = spawn(process.execPath, [path.join(FORGE, 'bin', 'chat-bridge.js')], { env: { ...process.env, FORGE_ROOT: ROOT, PORT: String(BRIDGE_PORT), NO_PROXY: '127.0.0.1,localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
    bridge.stdout.on('data', d => { bridgeLog += d.toString('utf8'); });
    bridge.stderr.on('data', d => process.stderr.write('[bridge] ' + d));
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('bridge healthz 45s 未就绪')), 45000); const ping = () => http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path: '/healthz' }, r => { if (r.statusCode === 200) { clearTimeout(t); res(); } else setTimeout(ping, 500); }).on('error', () => setTimeout(ping, 500)); ping(); });
    ck('S1 沙盒桥起活（healthz 200，不碰 dev 树 8790）', true);

    // ===== 既有会话 sidA（阶段A） =====
    const S = await mkClient(BRIDGE_PORT);
    S.send({ type: 'subscribe', sessionId: null });
    const subA = await S.waitUntil(m => m.sys === 'subscribed' && m.newSession, 45000, 'sidA subscribed');
    const sidA = subA.sessionId;
    ck('S2 既有会话 sidA 建立（sid=' + sidA + '）', !!sidA);

    // ===== P1-A 主矩阵：subscribe(null) 在飞 + gap 后 subscribe(sidA) → 迟到绑定必须被丢弃 =====
    for (const gap of [0, 200, 800, 1600]) {
        const c = await mkClient(BRIDGE_PORT);
        c.send({ type: 'subscribe', sessionId: null });                 // 模拟页面加载自动订阅
        if (gap > 0) await new Promise(r => setTimeout(r, gap));
        c.send({ type: 'subscribe', sessionId: sidA });                 // 模拟用户点进既有对话
        await c.waitUntil(m => m.sys === 'subscribed' && m.sessionId === sidA, 30000, 'gap' + gap + ' subscribed(sidA)', true);
        await new Promise(r => setTimeout(r, 3000));                    // 等迟到的 session/new 回调落地
        const subs = c.inbox.filter(m => m.sys === 'subscribed');
        let lastWanted = -1;
        subs.forEach((m, i) => { if (m.sessionId === sidA) lastWanted = i; });
        const after = subs.slice(lastWanted + 1);
        ck('R-' + gap + 'ms 绑定保持：sidA 确认后零条迟到 subscribed（共 ' + subs.length + ' 条）', lastWanted >= 0 && after.length === 0, JSON.stringify(after.map(m => m.sessionId)));
        c.send({ type: 'prompt', sessionId: sidA, text: '' });          // 无副作用 oracle：绑定==sidA 回「不能是空的」
        const err = await c.waitUntil(m => m.sys === 'error', 15000, 'gap' + gap + ' oracle');
        ck('R-' + gap + 'ms oracle：prompt{sidA,text:\'\'} 回「不能是空的」=绑定仍是 sidA', /不能是空的/.test(err.text || '') && !/不在了/.test(err.text || ''), err.text || '');
        kill(c);
    }
    const discards = (bridgeLog.match(/stale session\/new discarded/g) || []).length;
    ck('R-discard 迟到 session/new 被代际守卫丢弃且孤儿 close（gap=0 必重叠，桥日志 ' + discards + ' 条；快沙盒下 200ms+ 为顺序完成非竞态）', discards >= 1, 'log=' + discards);

    // ===== Ctrl+K 变体：同 tick 两次 subscribe(null) → 只有最后一次生效 =====
    const K = await mkClient(BRIDGE_PORT);
    K.send({ type: 'subscribe', sessionId: null });
    K.send({ type: 'subscribe', sessionId: null });
    const subK = await K.waitUntil(m => m.sys === 'subscribed' && m.newSession, 45000, 'K subscribed', true);
    await new Promise(r => setTimeout(r, 3000));
    const subsK = K.inbox.filter(m => m.sys === 'subscribed');
    const finalK = subsK[subsK.length - 1];
    ck('K1 双 subscribe(null)：仅一条 subscribed（首请求被代际守卫丢弃，共 ' + subsK.length + ' 条）', subsK.length === 1 && finalK && finalK.sessionId === subK.sessionId, JSON.stringify(subsK.map(m => m.sessionId)));
    K.send({ type: 'prompt', sessionId: subK.sessionId, text: '' });
    const errK = await K.waitUntil(m => m.sys === 'error', 15000, 'K oracle');
    ck('K2 oracle：绑定=唯一 subscribed 的会话（回「不能是空的」）', /不能是空的/.test(errK.text || ''), errK.text || '');
    kill(K);

    // ===== unsubscribe 接管：在飞 session/new 不再回绑 =====
    const U = await mkClient(BRIDGE_PORT);
    U.send({ type: 'subscribe', sessionId: null });
    U.send({ type: 'unsubscribe' });
    await new Promise(r => setTimeout(r, 3000));
    ck('U1 退订接管：在飞 session/new 被丢弃（零 subscribed）', U.inbox.filter(m => m.sys === 'subscribed').length === 0);
    U.send({ type: 'prompt', sessionId: sidA, text: '' });
    const errU = await U.waitUntil(m => m.sys === 'error', 15000, 'U oracle');
    ck('U2 未绑定 prompt 回「不在了」（人话拒绝，非翻绑）', /不在了/.test(errU.text || ''), errU.text || '');
    kill(U);
    const discardsAll = (bridgeLog.match(/stale session\/new discarded/g) || []).length;
    ck('U3 确定性代际守卫总账：gap0 + 双null + 退订接管 ≥3 次丢弃（实际 ' + discardsAll + '）', discardsAll >= 3, 'log=' + discardsAll);

    // ===== P2-B ② sid 过滤：A 会话的直播事件不串进 B =====
    const A = await mkClient(BRIDGE_PORT);
    A.send({ type: 'subscribe', sessionId: null });
    const sid1 = (await A.waitUntil(m => m.sys === 'subscribed' && m.newSession, 45000, 'sid1')).sessionId;
    const B = await mkClient(BRIDGE_PORT);
    B.send({ type: 'subscribe', sessionId: null });
    const sid2 = (await B.waitUntil(m => m.sys === 'subscribed' && m.newSession, 45000, 'sid2')).sessionId;
    A.send({ type: 'prompt', text: 'X1 隔离测试' });
    await A.waitUntil(m => m.agent && m.agent.method === 'stop' && m.agent.params && m.agent.params.sessionId === sid1, 60000, 'X1 stop');
    ck('X1 跨会话隔离：A 的 turn 全程 B 零 sid1 agent 帧', B.inbox.filter(m => m.agent && m.agent.params && m.agent.params.sessionId === sid1).length === 0);

    // ===== P2-B ① 成员籍摘除：A 换绑 sid1 后，旧会话 sid2 的直播不再发给 A =====
    A.send({ type: 'subscribe', sessionId: sid1 });
    await A.waitUntil(m => m.sys === 'subscribed' && m.sessionId === sid1, 15000, 'A rebind sid1');
    B.send({ type: 'prompt', text: 'X2 旧会话在飞' });
    await B.waitUntil(m => m.agent && m.agent.method === 'stop', 60000, 'X2 stop');
    ck('X2 双挂摘除：A 换绑后旧会话 sid2 的 turn 零 agent 帧到达 A', A.inbox.filter(m => m.agent && m.agent.params && m.agent.params.sessionId === sid2).length === 0);
    ck('X2b B 自己正常收到直播', B.inbox.filter(m => m.agent && m.agent.params && m.agent.params.update && m.agent.params.update.sessionUpdate === 'agent_message_chunk').length >= 1);

    // ===== P2-B ② 全员广播兜底摘除：turn 在飞时退订 → 无订阅者的事件丢弃，不再全员广播 =====
    const A3 = await mkClient(BRIDGE_PORT);
    A3.send({ type: 'subscribe', sessionId: null });
    const sid3 = (await A3.waitUntil(m => m.sys === 'subscribed' && m.newSession, 45000, 'sid3')).sessionId;
    A3.send({ type: 'prompt', text: 'X3 在飞退订' });
    A3.send({ type: 'unsubscribe' });
    await new Promise(r => setTimeout(r, 2500));
    ck('X3 无订阅者的事件丢弃：B 零 sid3 agent 帧（修前=else 全员广播）', B.inbox.filter(m => m.agent && m.agent.params && m.agent.params.sessionId === sid3).length === 0);
    ck('X3b turn 确实飞过（provider 收到 X3）', await provSaw('X3'));

    kill(S); kill(A); kill(B); kill(A3);
})().catch(e => {
    console.error('PROBE ERROR:', e.message);
    ck('探针自身未异常', false, e.stack && e.stack.split('\n')[0]);
}).finally(() => {
    if (bridge) { try { spawn('taskkill', ['/pid', String(bridge.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {} }
    setTimeout(() => { try { prov && prov.close(); } catch {} try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} }, 1500);
    console.log('ws-subscribe-race-probe: PASS=' + pass + ' FAIL=' + fail);
    if (fail) process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 1800);
});
