// fuzz 面5（6d94f3a P2-A / 367b57a C3 llmStreamOnce）：mock SSE 畸形流矩阵——重试不失控不双发。
// 沙盒自建（pfr21 同款）：假 provider /chat/completions 按 marker 播控畸形 SSE；explain_tool 驱动（optimize 同孪生
// 共用 llmStreamOnce，不重复造面）。每例断言三件：provider 调用次数恰达预期（400 降级/length 空回重试各至多一次）、
// 该请求恰一个 done 终局帧（不双发）、终局形态正确（正文/空回人话/错误措辞）。畸形形态：中途断流/无 [DONE]/delta
// 非对象/finish_reason 乱值×4/length 边界（1 字正文不重试、双空重试一次用尽）/[DONE] 前置/[DONE] 后垃圾/SSE 内嵌
// error 帧（fuzz 批 P3-3 修后：终局透传 upstream 人话——server 族「解释失败: 消息」/key 族 TURN_KEY_TEXT 口径，
// 不再吞成空回「它没说出什么来」误导重复撞墙；error 帧后同流迟到 delta 丢弃）/HTTP 500 JSON 错误体/200 非 JSON/
// CRLF+event+注释行/100KB 巨帧/400 降级重试阶梯。
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORGE = path.resolve(__dirname, '..', '..', 'forge');
const ROOT = path.join(__dirname, '..', '..', 'tmp', 'pfr24-fuzz-' + process.pid);
function freePort() { return new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
let BRIDGE_PORT = 0, PROV_PORT = 0;
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok ? '' : (why ? '  << ' + why : ''))); ok ? pass++ : fail++; };
const EX_EMPTY_TEXT = '它没说出什么来，再点一次试试';

// ---- 假 provider：marker 播控 + 请求台账 ----
const MARKERS = ['L1MID', 'L2NODONE', 'L3DELTA', 'L4A', 'L4B', 'L4C', 'L4D', 'L5LEN1', 'L6LEN2', 'L7DONE0', 'L8DBLDONE', 'L9ERRDATA', 'L9KEY', 'L10HTTP500', 'L11NOTJSON', 'L12CRLF', 'L13HUGE', 'L14RE400'];
const calls = {}; // marker -> [{maxTok, re}]
function startProvider() {
    const srv = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            let j = null; try { j = JSON.parse(body); } catch {}
            const us = ((j && j.messages) || []).filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : '');
            const um = us[us.length - 1] || '';
            const mk = MARKERS.find(k => um.includes(k)) || '(nomarker)';
            (calls[mk] = calls[mk] || []).push({ maxTok: j && j.max_tokens, re: j && j.reasoning_effort === 'none' });
            const n = calls[mk].length;
            const sseHead = () => res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
            const chunk = (delta, fin) => 'data: ' + JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'fake-model', choices: [{ index: 0, delta, finish_reason: fin }] }) + '\n\n';
            const sseText = (text, fin) => { sseHead(); res.write(chunk({ role: 'assistant', content: text }, null)); res.write(chunk({}, fin)); res.write('data: [DONE]\n\n'); res.end(); };
            switch (mk) {
                case 'L1MID': // 中途断流：1 delta 后毁 socket，无 [DONE] 无 end —— 消费方 res error→finish，部分文即答不重试
                    sseHead(); res.write(chunk({ role: 'assistant', content: 'L1 部分正文' }, null));
                    setTimeout(() => res.socket.destroy(), 200); return;
                case 'L2NODONE': // 干净收尾但没有 [DONE] —— res end→finish 正常结算
                    sseHead(); res.write(chunk({ role: 'assistant', content: 'L2 无DONE正文' }, null)); res.write(chunk({}, 'stop')); res.end(); return;
                case 'L3DELTA': // delta 非对象族混入（字符串/数字/数组/null）后真 delta
                    sseHead();
                    res.write('data: "just a string"\n\n'); res.write('data: 42\n\n'); res.write('data: [1,2]\n\n'); res.write('data: null\n\n');
                    res.write(chunk({ role: 'assistant', content: 'L3 正文' }, null)); res.write(chunk({}, 'stop')); res.write('data: [DONE]\n\n'); res.end(); return;
                case 'L4A': sseText('', 'banana'); return;      // finish_reason 乱值：字符串
                case 'L4B': sseText('', 42); return;            // 数字
                case 'L4C': sseText('', { weird: 1 }); return;  // 对象
                case 'L4D': sseText('', true); return;          // 布尔
                case 'L5LEN1': sseText('x', 'length'); return;  // length 但正文 1 字（truthy）→ 不重试
                case 'L6LEN2': sseText('', 'length'); return;   // 双空：重试一次（1600）仍空 → 人话（两轮同 marker 计数）
                case 'L7DONE0': sseHead(); res.write('data: [DONE]\n\n'); res.end(); return; // [DONE] 前置零 chunk
                case 'L8DBLDONE': // 双 [DONE]+其后垃圾帧 —— 单终局不双发
                    sseHead(); res.write(chunk({ role: 'assistant', content: 'L8 正文' }, null)); res.write('data: [DONE]\n\n');
                    res.write(chunk({ content: '迟到垃圾' }, null)); res.write('data: [DONE]\n\n'); res.end(); return;
                case 'L9ERRDATA': // SSE 内嵌 error 对象帧（P3-3 修后终局透传 upstream 人话）+ 其后迟到 delta（应被丢弃）+ [DONE]
                    sseHead(); res.write('data: ' + JSON.stringify({ error: { message: 'quota out' } }) + '\n\n');
                    res.write(chunk({ role: 'assistant', content: '迟到垃圾' }, null)); res.write('data: [DONE]\n\n'); res.end(); return;
                case 'L9KEY': // SSE 内嵌 error 帧 message 含 key → key 族人话（TURN_KEY_TEXT 口径）
                    sseHead(); res.write('data: ' + JSON.stringify({ error: { message: 'Incorrect API key provided: sk-xxx' } }) + '\n\n'); res.write('data: [DONE]\n\n'); res.end(); return;
                case 'L10HTTP500': res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: '配额用光' } })); return;
                case 'L11NOTJSON': res.writeHead(200, { 'content-type': 'application/json' }); res.end('<html>not json</html>'); return;
                case 'L12CRLF': // CRLF 行尾 + event: 行 + 注释行
                    sseHead();
                    res.write(': keep-alive comment\r\n\r\n');
                    res.write('event: message\r\n');
                    res.write(Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: { role: 'assistant', content: 'L12 正文' }, finish_reason: null }] }) + '\r\n\r\n'));
                    res.write(Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\r\n\r\n'));
                    res.write('data: [DONE]\r\n\r\n'); res.end(); return;
                case 'L13HUGE': sseHead(); res.write(chunk({ role: 'assistant', content: 'H'.repeat(100000) }, null)); res.write(chunk({}, 'stop')); res.write('data: [DONE]\n\n'); res.end(); return;
                case 'L14RE400': if (n === 1) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'unknown field reasoning_effort' } })); return; } sseText('L14 降级后正文', 'stop'); return;
                default: sseText('收到，已记录。', 'stop'); return;
            }
        });
    });
    return new Promise(r => srv.listen(PROV_PORT, '127.0.0.1', () => r(srv)));
}
const nCalls = mk => (calls[mk] || []).length;
const toks = mk => (calls[mk] || []).map(c => c.maxTok);
const res_ = mk => (calls[mk] || []).map(c => c.re);

// ---- 裸 WS 客户端（pfr21 同款）----
function mkClient(port) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + port } });
        req.on('upgrade', (res, socket, head) => {
            const c = { socket, inbox: [], waiters: [] };
            c.send = o => socket.write(frame(o));
            c.waitUntil = (pred, ms, tag, peek) => new Promise((res2, rej2) => {
                for (let i = 0; i < c.inbox.length; i++) if (pred(c.inbox[i])) { const hit = c.inbox[i]; if (!peek) c.inbox.splice(i, 1); return res2(hit); }
                const w = { pred, peek, res: res2, rej: rej2, timer: setTimeout(() => { const ix = c.waiters.indexOf(w); if (ix >= 0) c.waiters.splice(ix, 1); rej2(new Error('timeout: ' + tag)); }, ms || 30000) };
                c.waiters.push(w);
            });
            const dispatch = m => { for (let i = 0; i < c.waiters.length; i++) { if (c.waiters[i].pred(m)) { const w = c.waiters.splice(i, 1)[0]; clearTimeout(w.timer); if (w.peek) { c.inbox.push(m); w.res(m); return; } w.res(m); return; } } c.inbox.push(m); };
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

// explain 请求 + 双发检查：peek 收首个 done 帧后等 600ms 数同 id 的 done 帧总数
let seq = 0;
async function explainOnce(C, marker, wantCalls, why) {
    const id = 'lz-' + (++seq);
    C.send({ type: 'explain_tool', id, title: marker + ' 标题', output: marker + ' 输出', rawInput: '', status: 'completed', exitCode: 0, toolName: 'shell' });
    const done = await C.waitUntil(m => m.sys === 'tool_explanation' && m.id === id && m.done, 45000, 'explain ' + marker, true);
    await new Promise(r => setTimeout(r, 600));
    const doneFrames = C.inbox.filter(m => m.sys === 'tool_explanation' && m.id === id && m.done).length;
    const okCalls = nCalls(marker) === wantCalls;
    const okSingle = doneFrames === 1;
    ck(why + '（调用 ' + nCalls(marker) + '/' + wantCalls + '，终局帧 ' + doneFrames + '）', okCalls && okSingle,
        'calls=' + JSON.stringify(calls[marker]) + ' done=' + doneFrames);
    return done;
}

const healthz = () => new Promise(r => http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path: '/healthz' }, res => { res.resume(); res.on('end', () => r(res.statusCode === 200)); }).on('error', () => r(false)));

let bridge = null, prov = null, C = null;
(async () => {
    BRIDGE_PORT = await freePort(); PROV_PORT = await freePort();
    console.log('sandbox ports: bridge=' + BRIDGE_PORT + ' provider=' + PROV_PORT);
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.join(ROOT, 'bin', 'goose', 'goose-package'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.linkSync(path.join(FORGE, 'bin', 'goose', 'goose-package', 'goose.exe'), path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe'));
    fs.writeFileSync(path.join(ROOT, 'data', 'providers.json'), JSON.stringify([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake24', models: ['fake-model'], active: true }]));
    prov = await startProvider();
    bridge = spawn(process.execPath, [path.join(FORGE, 'bin', 'chat-bridge.js')], { env: { ...process.env, FORGE_ROOT: ROOT, PORT: String(BRIDGE_PORT), NO_PROXY: '127.0.0.1,localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
    bridge.stderr.on('data', d => process.stderr.write('[bridge] ' + d));
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('bridge healthz 45s 未就绪')), 45000); const ping = () => http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path: '/healthz' }, r => { if (r.statusCode === 200) { clearTimeout(t); res(); } else setTimeout(ping, 500); }).on('error', () => setTimeout(ping, 500)); ping(); });
    ck('L1 沙盒桥起活（healthz 200，不碰 dev 树 8790）', true);
    C = await mkClient(BRIDGE_PORT);

    const r1 = await explainOnce(C, 'L1MID', 1, 'L2 中途断流：部分文即答不重试');
    ck('L2b 断流终局=部分正文（非人话非报错）', r1.text === 'L1 部分正文', JSON.stringify(r1.text));
    const r2 = await explainOnce(C, 'L2NODONE', 1, 'L3 无 [DONE] 干净收尾：正常结算');
    ck('L3b 终局正文到达', r2.text === 'L2 无DONE正文', JSON.stringify(r2.text));
    const r3 = await explainOnce(C, 'L3DELTA', 1, 'L4 delta 非对象族（串/数/组/null）忽略不崩');
    ck('L4b 终局正文到达（垃圾帧零污染）', r3.text === 'L3 正文', JSON.stringify(r3.text));
    await explainOnce(C, 'L4A', 1, 'L5 finish_reason=字符串乱值：不重试→空回人话');
    await explainOnce(C, 'L4B', 1, 'L6 finish_reason=数字乱值：不重试→空回人话');
    await explainOnce(C, 'L4C', 1, 'L7 finish_reason=对象乱值：不重试→空回人话');
    await explainOnce(C, 'L4D', 1, 'L8 finish_reason=布尔乱值：不重试→空回人话');
    const r5 = await explainOnce(C, 'L5LEN1', 1, 'L9 length+1字正文：truthy 不重试');
    ck('L9b 终局=该 1 字正文', r5.text === 'x', JSON.stringify(r5.text));
    const r6 = await explainOnce(C, 'L6LEN2', 2, 'L10 length 双空：重试一次用尽（800→1600）');
    ck('L10b 预算阶梯 800→1600 且两轮都带 RE', JSON.stringify(toks('L6LEN2')) === JSON.stringify([800, 1600]) && res_('L6LEN2').every(Boolean), JSON.stringify(calls['L6LEN2']));
    ck('L10c 双空终局=空回人话', r6.text === EX_EMPTY_TEXT, JSON.stringify(r6.text));
    const r7 = await explainOnce(C, 'L7DONE0', 1, 'L11 [DONE] 前置零 chunk：空回人话不挂死');
    ck('L11b 终局=空回人话', r7.text === EX_EMPTY_TEXT, JSON.stringify(r7.text));
    const r8 = await explainOnce(C, 'L8DBLDONE', 1, 'L12 双 [DONE]+迟到垃圾帧：单终局不双发');
    ck('L12b 终局正文=首段（迟到垃圾不进正文）', r8.text === 'L8 正文', JSON.stringify(r8.text));
    const r9 = await explainOnce(C, 'L9ERRDATA', 1, 'L13 SSE 内嵌 error 帧：终局透传不重试（不触发 1600 阶梯）');
    const lateDelta = C.inbox.filter(m => m.sys === 'tool_explanation_delta' && m.id === r9.id && String(m.text || '').includes('迟到垃圾')).length;
    ck('L13b 终局=解释失败+上游消息（error 帧人话，不再空回误导重复撞墙）+迟到 delta 丢弃', r9.text === '解释失败: quota out' && lateDelta === 0, JSON.stringify(r9.text) + ' late=' + lateDelta);
    const r9k = await explainOnce(C, 'L9KEY', 1, 'L13c SSE error 帧 401/key 族：key 人话不裸英文');
    ck('L13c 终局=key 族人话（解释失败+Key 指引，classifyUpstream unauthorized 映射）', r9k.text === '解释失败: 这家服务商的 Key 没配上或不对。到 ⚙️ 设置 → 服务商档案，填好 Key 再发一次。', JSON.stringify(r9k.text));
    const r10 = await explainOnce(C, 'L10HTTP500', 1, 'L14 HTTP500 JSON 错误体：upstream 措辞透传');
    ck('L14b 终局=解释失败+上游消息', /^解释失败: 配额用光/.test(r10.text || ''), JSON.stringify(r10.text));
    const r11 = await explainOnce(C, 'L11NOTJSON', 1, 'L15 200 非 JSON：parse 措辞稳定');
    ck('L15b 终局=解释失败（服务返回异常）', r11.text === '解释失败（服务返回异常）', JSON.stringify(r11.text));
    const r12 = await explainOnce(C, 'L12CRLF', 1, 'L16 CRLF+event+注释行：正文照收');
    ck('L16b 终局正文到达', r12.text === 'L12 正文', JSON.stringify(r12.text));
    const r13 = await explainOnce(C, 'L13HUGE', 1, 'L17 100KB 单帧 delta：不崩不丢');
    ck('L17b 终局截 500 字符边界（reply slice 上限）', r13.text === 'H'.repeat(500), 'len=' + (r13.text || '').length);
    const r14 = await explainOnce(C, 'L14RE400', 2, 'L18 首轮 400：RE 降级重试一次（同预算）');
    ck('L18b 降级阶梯 800→800 且次轮 RE 关闭', JSON.stringify(toks('L14RE400')) === JSON.stringify([800, 800]) && res_('L14RE400')[0] === true && res_('L14RE400')[1] === false, JSON.stringify(calls['L14RE400']));
    ck('L18c 降级后终局正文到达', r14.text === 'L14 降级后正文', JSON.stringify(r14.text));
    ck('L19 全矩阵收尾：桥存活', await healthz());

    try { C.socket.destroy(); } catch {}
})().catch(e => {
    console.error('PROBE ERROR:', e.message);
    ck('探针自身未异常', false, e.stack && e.stack.split('\n')[0]);
}).finally(() => {
    if (bridge) { try { spawn('taskkill', ['/pid', String(bridge.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {} }
    setTimeout(() => { try { prov && prov.close(); } catch {} try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} }, 1500);
    console.log('sse-ladder-fuzz: PASS=' + pass + ' FAIL=' + fail);
    if (fail) process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 1800);
});
