// fuzz 面2（6d94f3a 代际守卫）：并发多客户端交错 subscribe(null)/subscribe(sid)/unsubscribe 乱序轰炸。
// 沙盒自建（pfr20 同款）：20 客户端 × 随机 3-6 操作 × 随机 delay 0-2000ms，部分客户端中途毁线（刷新窗口），
// 两个既有会话 sidA/sidB 全程在池。断言三面：无错绑（空 prompt oracle——末次订阅 sid 与绑定一致才回「不能是空的」）、
// 无迟到绑定（settle 后零新增 subscribed 帧）、无串台（sidA 直播帧只到最终绑定=sidA 的客户端）、无泄漏（轰炸后桥存活
// + 日志零 TypeError 族）。种子化 LCG 可复现（输出打印 seed）。
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORGE = path.resolve(__dirname, '..', '..', 'forge');
const ROOT = path.join(__dirname, '..', '..', 'tmp', 'pfr23-fuzz-' + process.pid);
function freePort() { return new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
let BRIDGE_PORT = 0, PROV_PORT = 0;
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok ? '' : (why ? '  << ' + why : ''))); ok ? pass++ : fail++; };
const SEED = Number(process.env.PF_FUZZ_SEED || 20260913);
let rngState = SEED;
const rnd = () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; }; // LCG：确定性可复现

// ---- 假 provider（pfr20 同款 + SLOWCTX 5s 延迟保 turn 在飞穿越轰炸窗口）----
function startProvider() {
    const srv = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            let j = null; try { j = JSON.parse(body); } catch {}
            const us = ((j && j.messages) || []).filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : '');
            const last = us[us.length - 1] || '';
            const emit = () => {
                res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
                const chunk = (delta, fin) => 'data: ' + JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'fake-model', choices: [{ index: 0, delta, finish_reason: fin }] }) + '\n\n';
                res.write(chunk({ role: 'assistant', content: '收到，已记录。' }, null));
                res.write(chunk({}, 'stop'));
                res.write('data: [DONE]\n\n');
                res.end();
            };
            if (last.includes('SLOWCTX')) setTimeout(emit, 5000); else emit();
        });
    });
    return new Promise(r => srv.listen(PROV_PORT, '127.0.0.1', () => r(srv)));
}

// ---- 裸 WS 客户端（ws-subscribe-race-probe 同款）----
function mkClient(port) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + port } });
        req.on('upgrade', (res, socket, head) => {
            const c = { socket, inbox: [], waiters: [], dead: false };
            c.send = o => socket.write(frame(o));
            c.waitUntil = (pred, ms, tag) => new Promise((res2, rej2) => {
                for (let i = 0; i < c.inbox.length; i++) if (pred(c.inbox[i])) { return res2(c.inbox.splice(i, 1)[0]); }
                const w = { pred, res: res2, rej: rej2, timer: setTimeout(() => { const ix = c.waiters.indexOf(w); if (ix >= 0) c.waiters.splice(ix, 1); rej2(new Error('timeout: ' + tag)); }, ms || 30000) };
                c.waiters.push(w);
            });
            const dispatch = m => { for (let i = 0; i < c.waiters.length; i++) { if (c.waiters[i].pred(m)) { const w = c.waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.res(m); return; } } c.inbox.push(m); };
            let buf = Buffer.from(head || []);
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
            socket.on('close', () => { c.dead = true; for (const w of c.waiters.splice(0)) { clearTimeout(w.timer); try { w.rej(new Error('socket closed')); } catch {} } });
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
const healthz = () => new Promise(r => http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path: '/healthz' }, res => { res.resume(); res.on('end', () => r(res.statusCode === 200)); }).on('error', () => r(false)));

let bridge = null, prov = null;
let bridgeLog = '';
(async () => {
    BRIDGE_PORT = await freePort(); PROV_PORT = await freePort();
    console.log('sandbox ports: bridge=' + BRIDGE_PORT + ' provider=' + PROV_PORT + ' seed=' + SEED);
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.join(ROOT, 'bin', 'goose', 'goose-package'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.linkSync(path.join(FORGE, 'bin', 'goose', 'goose-package', 'goose.exe'), path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe'));
    fs.writeFileSync(path.join(ROOT, 'data', 'providers.json'), JSON.stringify([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake23', models: ['fake-model'], active: true }]));
    prov = await startProvider();
    bridge = spawn(process.execPath, [path.join(FORGE, 'bin', 'chat-bridge.js')], { env: { ...process.env, FORGE_ROOT: ROOT, PORT: String(BRIDGE_PORT), NO_PROXY: '127.0.0.1,localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
    bridge.stdout.on('data', d => { bridgeLog += d.toString('utf8'); });
    bridge.stderr.on('data', d => { bridgeLog += d.toString('utf8'); });
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('bridge healthz 45s 未就绪')), 45000); const ping = () => http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path: '/healthz' }, r => { if (r.statusCode === 200) { clearTimeout(t); res(); } else setTimeout(ping, 500); }).on('error', () => setTimeout(ping, 500)); ping(); });
    ck('G1 沙盒桥起活（healthz 200，不碰 dev 树 8790）', true);

    // ===== 两个既有会话 sidA/sidB（各自订阅者常驻）=====
    const SA = await mkClient(BRIDGE_PORT);
    SA.send({ type: 'subscribe', sessionId: null });
    const sidA = (await SA.waitUntil(m => m.sys === 'subscribed' && m.newSession, 45000, 'sidA')).sessionId;
    const SB = await mkClient(BRIDGE_PORT);
    SB.send({ type: 'subscribe', sessionId: null });
    const sidB = (await SB.waitUntil(m => m.sys === 'subscribed' && m.newSession, 45000, 'sidB')).sessionId;
    ck('G2 既有会话 sidA/sidB 建立', !!sidA && !!sidB);

    // ===== 轰炸：20 客户端 × 随机脚本；SLOWCTX turn 在飞穿越窗口 =====
    const ops = ['subNull', 'subA', 'subB', 'unsub'];
    const weights = [0.3, 0.25, 0.25, 0.2];
    const pick = () => { const x = rnd(); let acc = 0; for (let i = 0; i < ops.length; i++) { acc += weights[i]; if (x < acc) return ops[i]; } return 'unsub'; };
    SA.send({ type: 'prompt', text: 'SLOWCTX 轰炸窗口在飞 turn' }); // 5s 慢回：直播帧穿越整个乱序窗口
    const clients = [];
    const scripts = [];
    const N = 20;
    const runners = [];
    for (let i = 0; i < N; i++) {
        const c = await mkClient(BRIDGE_PORT);
        clients.push(c);
        const script = [];
        const nOps = 3 + Math.floor(rnd() * 4); // 3-6 操作
        for (let k = 0; k < nOps; k++) script.push({ op: pick(), delay: Math.floor(rnd() * 2000) });
        scripts.push(script);
        runners.push((async () => {
            for (const step of script) {
                await new Promise(r => setTimeout(r, step.delay));
                if (c.dead) return;
                if (step.op === 'subNull') c.send({ type: 'subscribe', sessionId: null });
                else if (step.op === 'subA') c.send({ type: 'subscribe', sessionId: sidA });
                else if (step.op === 'subB') c.send({ type: 'subscribe', sessionId: sidB });
                else c.send({ type: 'unsubscribe' });
            }
        })());
    }
    // 每 5 个客户端 1 个中途毁线（500-5000ms 随机时刻=刷新窗口/在飞 session/new 被 drop）
    const killers = [];
    for (let i = 0; i < N; i += 5) killers.push(new Promise(r => setTimeout(() => { kill(clients[i]); r(); }, 500 + Math.floor(rnd() * 4500))));
    await Promise.all(runners);
    await Promise.all(killers);
    await SA.waitUntil(m => m.agent && m.agent.method === 'stop' && m.agent.params && m.agent.params.sessionId === sidA, 60000, 'SLOWCTX stop');
    await new Promise(r => setTimeout(r, 3000)); // 等迟到 session/new 回调全部落地
    ck('G3 轰炸完成（20 客户端×' + N + ' 脚本+毁线窗）后桥存活', await healthz());

    // ===== 无迟到绑定：settle 后 2.5s 内零新增 subscribed 帧 =====
    // subNull 末操作客户端的 session/new 慢落地（风暴下 goose 排队）是合法绑定非守卫失败——只对
    // 末操作=subA/subB/unsub（已被确定重绑/退订）的客户端计迟到帧为失败。
    const finalOp = s => s[s.length - 1].op;
    const lastSubOf = c => { const subs = c.inbox.filter(m => m.sys === 'subscribed'); return subs.length ? subs[subs.length - 1].sessionId : null; };
    const subsCount = c => c.inbox.filter(m => m.sys === 'subscribed').length;
    const before = clients.map(subsCount);
    await new Promise(r => setTimeout(r, 2500));
    const after = clients.map(subsCount);
    const lateIdx = [];
    for (let i = 0; i < N; i++) if (!clients[i].dead && after[i] !== before[i] && finalOp(scripts[i]) !== 'subNull') lateIdx.push(i);
    ck('G4 无迟到绑定：确定重绑/退订客户端 settle 后零新增 subscribed 帧（代际守卫全覆盖）', lateIdx.length === 0, 'late clients=' + JSON.stringify(lateIdx));

    // ===== 无错绑：每客户端末操作语义 oracle（空 prompt 无副作用）=====
    const badBind = [], bindResults = [];
    for (let i = 0; i < N; i++) {
        const c = clients[i];
        if (c.dead) continue;
        const fo = finalOp(scripts[i]);
        let ok = true, why = '';
        if (fo === 'subA' || fo === 'subB') {
            const want = fo === 'subA' ? sidA : sidB;
            const got = lastSubOf(c);
            if (got !== want) { ok = false; why = 'lastSub=' + got + ' want=' + want; }
            else {
                c.send({ type: 'prompt', sessionId: want, text: '' });
                const err = await c.waitUntil(m => m.sys === 'error', 15000, 'oracle-' + i).catch(e => null);
                if (!err || !/不能是空的/.test(err.text || '')) { ok = false; why = 'oracle=' + (err && err.text); }
            }
        } else if (fo === 'unsub') {
            c.send({ type: 'prompt', sessionId: sidA, text: '' });
            const err = await c.waitUntil(m => m.sys === 'error', 15000, 'oracle-' + i).catch(e => null);
            if (!err || !/不在了/.test(err.text || '')) { ok = false; why = 'oracle=' + (err && err.text); }
        } else { // subNull：绑定=最后 subscribed 的 sid（若有）——错绑检出靠 oracle 对账
            const got = lastSubOf(c);
            if (got) {
                c.send({ type: 'prompt', sessionId: got, text: '' });
                const err = await c.waitUntil(m => m.sys === 'error', 15000, 'oracle-' + i).catch(e => null);
                if (!err || !/不能是空的/.test(err.text || '')) { ok = false; why = 'oracle=' + (err && err.text); }
            } else {
                c.send({ type: 'prompt', sessionId: sidA, text: '' });
                const err = await c.waitUntil(m => m.sys === 'error', 15000, 'oracle-' + i).catch(e => null);
                if (!err || !/不在了/.test(err.text || '')) { ok = false; why = 'oracle(未绑定)=' + (err && err.text); }
            }
        }
        bindResults.push(fo);
        if (!ok) badBind.push({ i, fo, why });
    }
    ck('G5 无错绑：全部存活客户端绑定=末操作语义（' + bindResults.filter(x => x === 'subA').length + 'A/' + bindResults.filter(x => x === 'subB').length + 'B/' + bindResults.filter(x => x === 'subNull').length + 'null/' + bindResults.filter(x => x === 'unsub').length + 'unsub）', badBind.length === 0, JSON.stringify(badBind));

    // ===== 无串台：轰炸后 sidA 新 turn 只到最终绑定=sidA 的客户端 =====
    const mark = clients.map(c => c.inbox.length);
    SA.send({ type: 'prompt', text: 'PING-CTX 串台检查' });
    await SA.waitUntil(m => m.agent && m.agent.method === 'stop' && m.agent.params && m.agent.params.sessionId === sidA, 60000, 'PING-CTX stop');
    await new Promise(r => setTimeout(r, 500));
    const boundTo = c => { const fo = finalOp(scripts[clients.indexOf(c)]); if (fo === 'subA') return sidA; if (fo === 'subB') return sidB; if (fo === 'unsub') return null; const got = lastSubOf(c); return got; };
    const leak = [];
    for (let i = 0; i < N; i++) {
        const c = clients[i];
        if (c.dead) continue;
        const frames = c.inbox.slice(mark[i]).filter(m => m.agent && m.agent.params && m.agent.params.sessionId === sidA);
        if (frames.length > 0 && boundTo(c) !== sidA) leak.push({ i, boundTo: boundTo(c), frames: frames.length });
    }
    ck('G6 无串台：sidA 新 turn 零泄漏到非 sidA 绑定客户端', leak.length === 0, JSON.stringify(leak));
    const selfFrames = SA.inbox.slice().filter(m => m.agent && m.agent.params && m.agent.params.sessionId === sidA).length;
    ck('G7 正对照：sidA 订阅者自己全程收到直播帧（≥2 turn）', selfFrames >= 2, 'frames=' + selfFrames);

    // ===== 无泄漏：桥日志零未捕获异常族 + 迟到丢弃台账 =====
    const typeErr = (bridgeLog.match(/TypeError|ReferenceError|AssertionError|ERR_UNHANDLED/g) || []).length;
    ck('G8 无泄漏：桥日志零 TypeError/ReferenceError/未捕获族（' + typeErr + ' 条）', typeErr === 0);
    const discards = (bridgeLog.match(/stale session\/new discarded/g) || []).length;
    console.log('  (info) stale session/new discarded × ' + discards + '；SLOWCTX/PING-CTX turn 各 1 次完成');
    ck('G9 收尾：轰炸后 healthz 仍 200', await healthz());

    for (const c of clients) kill(c); kill(SA); kill(SB);
})().catch(e => {
    console.error('PROBE ERROR:', e.message);
    ck('探针自身未异常', false, e.stack && e.stack.split('\n')[0]);
}).finally(() => {
    if (bridge) { try { spawn('taskkill', ['/pid', String(bridge.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {} }
    setTimeout(() => { try { prov && prov.close(); } catch {} try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} }, 1500);
    console.log('ws-genesis-fuzz: PASS=' + pass + ' FAIL=' + fail);
    if (fail) process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 1800);
});
