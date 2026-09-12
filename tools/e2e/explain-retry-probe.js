// s78 e2e 21：解释/✨优化 SSE 空回重试桩测（qa s78-qa-report P2-A）+ explain 缓存键补 model（P3-A）。
// 沙盒自建（同 pfr18c/pfr20 模式）：假 provider 按 marker 播控 SSE——finish=length 空文（模拟 deepseek 隐形推理
// 耗尽 max_tokens）/重试成功/双空/纯 reasoning+stop；桥行为断言：调用次数、预算阶梯 800→1600、reasoning 不算正文、
// 空回人话、人话不入缓存、缓存键含 model。explain_tool/optimize_prompt 不进会话历史，零 goose 副作用。
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORGE = path.resolve(__dirname, '..', '..', 'forge');
const ROOT = path.join(__dirname, '..', '..', 'tmp', 'pfr21-e2e-' + process.pid);
function freePort() { return new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
let BRIDGE_PORT = 0, PROV_PORT = 0;
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok ? '' : (why ? '  << ' + why : ''))); ok ? pass++ : fail++; };
const EX_EMPTY_TEXT = '它没说出什么来，再点一次试试';
const OP_EMPTY_TEXT = '模型没说出什么来，再点一次 ✨ 试试。';

// ---- 假 provider：marker 播控 + 请求台账 ----
const MARKERS = ['E1OK', 'E2EMPTY1', 'E3EMPTY2', 'E5REASON', 'E6MODEL', 'E7CACHE', 'O1OK', 'O2EMPTY1', 'O3EMPTY2', 'O4REASON'];
const calls = {}; // marker -> [{maxTok, re, model}]
function startProvider() {
    const srv = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            let j = null; try { j = JSON.parse(body); } catch {}
            const us = ((j && j.messages) || []).filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : '');
            const um = us[us.length - 1] || '';
            const mk = MARKERS.find(k => um.includes(k)) || '(nomarker)';
            (calls[mk] = calls[mk] || []).push({ maxTok: j && j.max_tokens, re: !!(j && j.reasoning_effort === 'none'), model: j && j.model });
            const n = calls[mk].length;
            const chunk = (delta, fin) => 'data: ' + JSON.stringify({ id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 1700000000, model: 'fake-model', choices: [{ index: 0, delta, finish_reason: fin }] }) + '\n\n';
            const sse = text => {
                res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
                if (text) { res.write(chunk({ role: 'assistant', content: text.slice(0, 5) }, null)); if (text.length > 5) res.write(chunk({ content: text.slice(5) }, null)); }
                res.write(chunk({}, 'stop'));
                res.write('data: [DONE]\n\n');
                res.end();
            };
            // s78 P2-A 根因形态：隐形推理（reasoning_content 增量、content 恒空）吃光 max_tokens → finish=length
            const sseLenEmpty = () => {
                res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
                res.write(chunk({ role: 'assistant', content: null, reasoning_content: '(隐形推理……)' }, null));
                res.write(chunk({}, 'length'));
                res.write('data: [DONE]\n\n');
                res.end();
            };
            const sseReasonStop = () => {
                res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
                res.write(chunk({ role: 'assistant', content: null, reasoning_content: '(只有推理没正文)' }, null));
                res.write(chunk({}, 'stop'));
                res.write('data: [DONE]\n\n');
                res.end();
            };
            switch (mk) {
                case 'E1OK': sse('E1 解释正文一句话'); break;
                case 'E2EMPTY1': n === 1 ? sseLenEmpty() : sse('E2 重试成功解释'); break;
                case 'E3EMPTY2': sseLenEmpty(); break;
                case 'E5REASON': sseReasonStop(); break;
                case 'E6MODEL': sse('E6 解释 by ' + (j && j.model)); break;
                case 'E7CACHE': sse('E7 缓存解释'); break;
                case 'O1OK': sse('<optimized>O1 优化稿</optimized><changes>O1 改了一条</changes>'); break;
                case 'O2EMPTY1': n === 1 ? sseLenEmpty() : sse('<optimized>O2 重试稿</optimized><changes>O2 一条</changes>'); break;
                case 'O3EMPTY2': sseLenEmpty(); break;
                case 'O4REASON': sseReasonStop(); break;
                default: sse('收到，已记录。'); break;
            }
        });
    });
    return new Promise(r => srv.listen(PROV_PORT, '127.0.0.1', () => r(srv)));
}
const nCalls = mk => (calls[mk] || []).length;
const toks = mk => (calls[mk] || []).map(c => c.maxTok);

// ---- 裸 WS 客户端（pfr20 同款） ----
function mkClient(port) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + port } });
        req.on('upgrade', (res, socket, head) => {
            const c = { socket, inbox: [], waiters: [] };
            c.send = o => socket.write(frame(o));
            c.waitUntil = (pred, ms, tag) => new Promise((res2, rej2) => {
                for (let i = 0; i < c.inbox.length; i++) if (pred(c.inbox[i])) { return res2(c.inbox.splice(i, 1)[0]); }
                const w = { pred, res: res2, rej: rej2, timer: setTimeout(() => { const ix = c.waiters.indexOf(w); if (ix >= 0) c.waiters.splice(ix, 1); rej2(new Error('timeout: ' + tag)); }, ms || 30000) };
                c.waiters.push(w);
            });
            const dispatch = m => {
                for (let i = 0; i < c.waiters.length; i++) {
                    if (c.waiters[i].pred(m)) { const w = c.waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.res(m); return; }
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
// explain 请求助手：payload 固定形状，title 首行=marker
const explain = (c, id, title, model) => { c.send({ type: 'explain_tool', id, title: title + ' 标题', output: title + ' 输出', rawInput: '', status: 'completed', exitCode: 0, toolName: 'shell', model }); return c.waitUntil(m => m.sys === 'tool_explanation' && m.id === id && m.done, 60000, 'explain ' + title); };
const optimize = (c, id, text) => { c.send({ type: 'optimize_prompt', id, text, context: '' }); return c.waitUntil(m => m.sys === 'optimize_result' && m.id === id && m.done, 60000, 'optimize ' + text.slice(0, 8)); };

let bridge = null, prov = null, C = null;
(async () => {
    BRIDGE_PORT = await freePort(); PROV_PORT = await freePort();
    console.log('sandbox ports: bridge=' + BRIDGE_PORT + ' provider=' + PROV_PORT);
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.join(ROOT, 'bin', 'goose', 'goose-package'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.linkSync(path.join(FORGE, 'bin', 'goose', 'goose-package', 'goose.exe'), path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe'));
    fs.writeFileSync(path.join(ROOT, 'data', 'providers.json'), JSON.stringify([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake21', models: ['fake-model', 'fake-model-b'], active: true }]));
    prov = await startProvider();
    bridge = spawn(process.execPath, [path.join(FORGE, 'bin', 'chat-bridge.js')], { env: { ...process.env, FORGE_ROOT: ROOT, PORT: String(BRIDGE_PORT), NO_PROXY: '127.0.0.1,localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
    bridge.stderr.on('data', d => process.stderr.write('[bridge] ' + d));
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('bridge healthz 45s 未就绪')), 45000); const ping = () => http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path: '/healthz' }, r => { if (r.statusCode === 200) { clearTimeout(t); res(); } else setTimeout(ping, 500); }).on('error', () => setTimeout(ping, 500)); ping(); });
    ck('S1 沙盒桥起活（healthz 200）', true);
    C = await mkClient(BRIDGE_PORT);

    // ===== explain_tool =====
    const r1 = await explain(C, 'x1', 'E1OK');
    ck('E1 正常解释：一次调用、预算 800、正文到达', nCalls('E1OK') === 1 && toks('E1OK')[0] === 800 && r1.text === 'E1 解释正文一句话', JSON.stringify({ n: nCalls('E1OK'), t: r1.text }));
    const r2 = await explain(C, 'x2', 'E2EMPTY1');
    ck('E2 length 空文→自动重试一次：2 调用、预算 800→1600、重试正文到达', nCalls('E2EMPTY1') === 2 && toks('E2EMPTY1')[0] === 800 && toks('E2EMPTY1')[1] === 1600 && r2.text === 'E2 重试成功解释', JSON.stringify({ n: nCalls('E2EMPTY1'), t: toks('E2EMPTY1'), x: r2.text }));
    ck('E2b 两轮都带 reasoning_effort:none', (calls['E2EMPTY1'] || []).every(c => c.re));
    const r3 = await explain(C, 'x3', 'E3EMPTY2');
    ck('E3 双空：重试用尽→人话「再点一次试试」', nCalls('E3EMPTY2') === 2 && r3.text === EX_EMPTY_TEXT, JSON.stringify({ n: nCalls('E3EMPTY2'), x: r3.text }));
    const r3b = await explain(C, 'x3b', 'E3EMPTY2');
    ck('E4 人话不入缓存（再打仍真调 2 次）', nCalls('E3EMPTY2') === 4 && r3b.text === EX_EMPTY_TEXT, 'n=' + nCalls('E3EMPTY2'));
    const r5 = await explain(C, 'x5', 'E5REASON');
    ck('E5 纯 reasoning+stop：不重试（1 调用）、推理不算正文→人话', nCalls('E5REASON') === 1 && r5.text === EX_EMPTY_TEXT, JSON.stringify({ n: nCalls('E5REASON'), x: r5.text }));
    const r6a = await explain(C, 'x6a', 'E6MODEL', 'fake-model');
    const r6b = await explain(C, 'x6b', 'E6MODEL', 'fake-model-b');
    ck('E6 缓存键含 model：换模型各真调 1 次、结果随模型', nCalls('E6MODEL') === 2 && r6a.text === 'E6 解释 by fake-model' && r6b.text === 'E6 解释 by fake-model-b', JSON.stringify({ n: nCalls('E6MODEL'), a: r6a.text, b: r6b.text }));
    const r7a = await explain(C, 'x7a', 'E7CACHE', 'fake-model');
    const r7b = await explain(C, 'x7b', 'E7CACHE', 'fake-model');
    ck('E7 同载荷+同模型：缓存命中（共 1 次真调、文本一致）', nCalls('E7CACHE') === 1 && r7a.text === r7b.text && r7b.text === 'E7 缓存解释', 'n=' + nCalls('E7CACHE'));

    // ===== optimize_prompt（同族孪生） =====
    const o1 = await optimize(C, 'o1', 'O1OK 原稿');
    ck('O1 正常优化：一次调用、预算 800、双段式到达', nCalls('O1OK') === 1 && toks('O1OK')[0] === 800 && !o1.err && /<optimized>O1 优化稿<\/optimized>/.test(o1.text || ''), JSON.stringify({ n: nCalls('O1OK'), x: o1.text }));
    const o2 = await optimize(C, 'o2', 'O2EMPTY1 原稿');
    ck('O2 length 空文→重试一次：2 调用、800→1600、重试稿到达', nCalls('O2EMPTY1') === 2 && toks('O2EMPTY1')[0] === 800 && toks('O2EMPTY1')[1] === 1600 && !o2.err && /O2 重试稿/.test(o2.text || ''), JSON.stringify({ n: nCalls('O2EMPTY1'), t: toks('O2EMPTY1') }));
    const o3 = await optimize(C, 'o3', 'O3EMPTY2 原稿');
    ck('O3 双空：重试用尽→err 人话', nCalls('O3EMPTY2') === 2 && o3.err === true && o3.text === OP_EMPTY_TEXT, JSON.stringify({ n: nCalls('O3EMPTY2'), x: o3.text }));
    const o4 = await optimize(C, 'o4', 'O4REASON 原稿');
    ck('O4 纯 reasoning+stop：不重试、推理不算正文→err 人话', nCalls('O4REASON') === 1 && o4.err === true && o4.text === OP_EMPTY_TEXT, JSON.stringify({ n: nCalls('O4REASON'), x: o4.text }));

    try { C.socket.destroy(); } catch {}
})().catch(e => {
    console.error('PROBE ERROR:', e.message);
    ck('探针自身未异常', false, e.stack && e.stack.split('\n')[0]);
}).finally(() => {
    if (bridge) { try { spawn('taskkill', ['/pid', String(bridge.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {} }
    setTimeout(() => { try { prov && prov.close(); } catch {} try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} }, 1500);
    console.log('explain-retry-probe: PASS=' + pass + ' FAIL=' + fail);
    if (fail) process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 1800);
});
