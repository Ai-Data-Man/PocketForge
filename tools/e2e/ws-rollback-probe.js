// 主线5 e2e 18c：撤回重写全链探针（补篇裁决 2026-09-08 §5 验收 1/2/3/4/7 + §1.1-2 空会话探针）。
// 沙盒自建：FORGE_ROOT=tmp/pfr18c-e2e-<pid>（goose 硬链接进沙盒 bin/），桥 18791，假 provider 18332（SLOW/PROBE_ALL）。
// 绝不碰 dev 树 GOOSE_PATH_ROOT 的活体会话——手术只发生在沙盒库。
// 覆盖：B 型截断 DB 断言（U2 轮消失/U1 原样/usage 逐位不变）/load 重放无原句/改写后上下文=前轮+改写文（PROBE_ALL 回显）/
// 失败分支（tombstone 写失败注入/边界 id 不存在→DB 逐位原样）/busy 门（流式拒绝+收尾后成功）/tombstone 恢复演练（tools/rollback-restore.js）/
// keep-3/双客户端广播刷新/未订阅拒绝/空会话撤回 load 不砖。
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const FORGE = path.resolve(__dirname, '..', '..', 'forge');
const ROOT = path.join(__dirname, '..', '..', 'tmp', 'pfr18c-e2e-' + process.pid);
const U1 = '18c-U1 我最喜欢的颜色是石榴红', U2 = '18c-U2 我的宠物是一只叫煤球的黑猫', U3 = '18c-U3 我明天要坐高铁去杭州';
const REWRITE = '18c-改写 我明天要坐飞机去苏州，不是杭州';
// 端口运行期自选（本机可能有他人占用的历史探针/沙盒——不杀不明进程，换端口即可）
function freePort() { return new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
let BRIDGE_PORT = 0, PROV_PORT = 0;
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok ? '' : (why ? '  << ' + why : ''))); ok ? pass++ : fail++; };

// ---- 假 provider（pfr21 fake-openai 同款 + SLOW18C 延迟 4s）----
function startProvider() {
    const users = j => ((j && j.messages) || []).filter(m => m.role === 'user').map(m => {
        const c = m.content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) return c.filter(b => b && b.type === 'text').map(b => b.text).join('\n');
        return '';
    });
    const srv = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            let j = null; try { j = JSON.parse(body); } catch {}
            const us = users(j), last = us[us.length - 1] || '';
            let reply = '收到，已记录。';
            if (last.includes('PROBE_ALL')) reply = 'ALL_USER_MSGS=' + JSON.stringify(us);
            const emit = () => {
                if (j && j.stream) {
                    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
                    const chunk = (delta, fin) => 'data: ' + JSON.stringify({ id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 1700000000, model: 'fake-model', choices: [{ index: 0, delta, finish_reason: fin }] }) + '\n\n';
                    res.write(chunk({ role: 'assistant', content: reply }, null));
                    res.write(chunk({}, 'stop'));
                    res.write('data: [DONE]\n\n');
                    res.end();
                } else {
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ id: 'chatcmpl-fake', object: 'chat.completion', created: 1700000000, model: 'fake-model', choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
                }
            };
            if (last.includes('SLOW18C')) setTimeout(emit, 4000); else emit();
        });
    });
    return new Promise(r => srv.listen(PROV_PORT, '127.0.0.1', () => r(srv)));
}

// ---- 裸 WS 客户端（ws-delete-receipt.js 同款帧法 + 收件箱/waitUntil）----
let rpcSeq = 0;
function mkClient(port) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + port } });
        req.on('upgrade', (res, socket) => {
            const c = { socket, inbox: [], waiters: [], tap: null, dead: false, sent: 0 };
            c.send = o => { c.sent++; socket.write(frame(o)); };
            c.waitUntil = (pred, ms, tag) => new Promise((res2, rej2) => {
                for (let i = 0; i < c.inbox.length; i++) if (pred(c.inbox[i])) { res2(c.inbox.splice(i, 1)[0]); return; }
                const w = { pred, res: res2, rej: rej2, timer: setTimeout(() => { const ix = c.waiters.indexOf(w); if (ix >= 0) c.waiters.splice(ix, 1); rej2(new Error('timeout: ' + tag)); }, ms || 30000) };
                c.waiters.push(w);
            });
            c.rpc = async (method, params) => {
                const id = ++rpcSeq;
                c.send({ type: 'rpc', method, params: Object.assign({ __cid: id }, params || {}) });
                const r = await c.waitUntil(m => m.rpc && m.rpc.__cid === id, 45000, 'rpc ' + method);
                return r.rpc;
            };
            let buf = Buffer.alloc(0);
            socket.on('data', d => {
                buf = Buffer.concat([buf, d]);
                while (buf.length >= 2) {
                    const op = buf[0] & 0x0f;
                    let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
                    else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
                    if (buf.length < off + len) return;
                    const pl = buf.slice(off, off + len); buf = buf.slice(off + len);
                    if (op !== 0x1) continue;
                    let m; try { m = JSON.parse(pl.toString('utf8')); } catch { continue; }
                    if (m.sys === 'error') console.log('[ws-error port ' + port + ']', JSON.stringify(m).slice(0, 300));
                    if (c.tap) { try { c.tap(m); } catch {} }
                    let done = false;
                    for (let i = 0; !done && i < c.waiters.length; i++) {
                        if (c.waiters[i].pred(m)) { const w = c.waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.res(m); done = true; }
                    }
                    if (!done) c.inbox.push(m);
                }
            });
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

// ---- 沙盒 DB 只读助手 ----
const dbFile = () => path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db');
function sessRow(sid) { const db = new DatabaseSync(dbFile(), { readOnly: true }); const r = db.prepare('SELECT * FROM sessions WHERE id=?').get(sid); db.close(); return r; }
function msgRows(sid) { const db = new DatabaseSync(dbFile(), { readOnly: true }); const r = db.prepare('SELECT id,message_id,role,created_timestamp,content_json,metadata_json FROM messages WHERE session_id=? ORDER BY created_timestamp,id').all(sid); db.close(); return r; }
function textOf(cj) { try { return JSON.parse(cj).filter(b => b.type === 'text').map(b => b.text).join('|'); } catch { return '(bad)'; } }
const tombDir = () => path.join(ROOT, 'data', 'rewrite-tombstones');
const tombFiles = sid => { try { return fs.readdirSync(tombDir()).filter(f => new RegExp('^' + sid + '-\\d+\\.jsonl$').test(f)).sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1])); } catch { return []; } };

let bridge = null, prov = null, A = null, B = null, C = null;
(async () => {
    // ===== 沙盒搭建 =====
    BRIDGE_PORT = await freePort(); PROV_PORT = await freePort();
    console.log('sandbox ports: bridge=' + BRIDGE_PORT + ' provider=' + PROV_PORT);
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.join(ROOT, 'bin', 'goose', 'goose-package'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.linkSync(path.join(FORGE, 'bin', 'goose', 'goose-package', 'goose.exe'), path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe'));
    fs.writeFileSync(path.join(ROOT, 'data', 'providers.json'), JSON.stringify([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake18c', models: ['fake-model'], active: true }]));
    prov = await startProvider();
    bridge = spawn(process.execPath, [path.join(FORGE, 'bin', 'chat-bridge.js')], { env: { ...process.env, FORGE_ROOT: ROOT, PORT: String(BRIDGE_PORT), NO_PROXY: '127.0.0.1,localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
    bridge.stderr.on('data', d => process.stderr.write('[bridge] ' + d));
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('bridge healthz 45s 未就绪')), 45000); const ping = () => http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path: '/healthz' }, r => { if (r.statusCode === 200) { clearTimeout(t); res(); } else setTimeout(ping, 500); }).on('error', () => setTimeout(ping, 500)); ping(); });
    ck('S1 沙盒桥起活（healthz 200，不碰 dev 树 8790）', true);

    // ===== 三轮直播 + s77 不变量（直播零 user 帧）=====
    A = await mkClient(BRIDGE_PORT);
    A.send({ type: 'subscribe', sessionId: null });
    const sub = await A.waitUntil(m => m.sys === 'subscribed' && m.newSession, 30000, 'subscribed');
    const sid = sub.sessionId;
    ck('S2 新会话订阅成功（sid=' + sid + '）', !!sid);
    const liveUserFrames = [];
    A.tap = m => { const u = m.agent && m.agent.params && m.agent.params.update; if (u && u.sessionUpdate === 'user_message_chunk') liveUserFrames.push(String(u.content && u.content.text)); };
    for (const p of [U1, U2, U3]) {
        A.send({ type: 'prompt', text: p });
        await A.waitUntil(m => m.agent && m.agent.method === 'stop' && m.agent.params && m.agent.params.sessionId === sid, 60000, 'stop ' + p.slice(0, 8));
    }
    ck('S3 三轮 prompt 全部收尾（stop reason=end）', true);
    ck('S4 直播零 user_message_chunk 帧（s77 不变量，经桥转发路径）', liveUserFrames.length === 0, 'frames=' + liveUserFrames.length);

    // ===== 回放取 id（透传方案 A：帧 id 与 DB message_id 全等）=====
    const replay = [];
    A.tap = m => { const u = m.agent && m.agent.params && m.agent.params.update; if (u && u.sessionUpdate === 'user_message_chunk' && u.content) replay.push({ text: u.content.text, mid: u.messageId || (u._meta && u._meta.goose && u._meta.goose.messageId) }); };
    const lr = await A.rpc('session/load', { sessionId: sid, cwd: ROOT, mcpServers: [] });
    await new Promise(r => setTimeout(r, 600));
    A.tap = null;
    ck('S5 回放 3 条 user 帧且都带 messageId', replay.length === 3 && replay.every(r => r.mid), JSON.stringify(replay.map(r => [r.text.slice(0, 8), !!r.mid])));
    const u2 = replay.find(r => r.text === U2);
    const dbMids = msgRows(sid).map(r => r.message_id);
    ck('S6 帧 messageId 与 DB message_id 全等（透传落地）', replay.every(r => dbMids.includes(r.mid)) && !!u2);

    // ===== 手术：rollback(U2) =====
    B = await mkClient(BRIDGE_PORT);
    B.send({ type: 'subscribe', sessionId: sid });
    await B.waitUntil(m => m.sys === 'subscribed' && m.sessionId === sid, 30000, 'B subscribed');
    const sessBefore = JSON.stringify(sessRow(sid));
    A.send({ type: 'rollback_rewrite', sessionId: sid, messageId: u2.mid });
    const receipt = await A.waitUntil(m => m.sys === 'rollback_done', 45000, 'rollback_done');
    ck('S7 回执 ok:true removed=6（U2 轮+U3 轮各 3 行）', receipt.ok === true && receipt.removed === 6, JSON.stringify(receipt));
    const bRefresh = await B.waitUntil(m => m.sys === 'session_rolled_back' && m.sessionId === sid, 15000, 'B session_rolled_back').catch(() => null);
    ck('S8 双客户端：B 收到广播刷新指令', !!bRefresh);
    const aRefresh = await A.waitUntil(m => m.sys === 'session_rolled_back' && m.sessionId === sid, 5000, 'A session_rolled_back').catch(() => null);
    ck('S8b 请求者 A 也收到广播（回执先到→预填，本帧后到→重绘）', !!aRefresh);
    const rows1 = msgRows(sid);
    ck('S9 DB：剩 3 行=U1 轮完整（正文+turn-context+assistant），U2/U3 文本不在', rows1.length === 3 && textOf(rows1[0].content_json) === U1 && rows1.some(r => r.role === 'user' && /turn-context/.test(textOf(r.content_json))) && rows1.some(r => r.role === 'assistant') && !rows1.some(r => textOf(r.content_json).includes('煤球') || textOf(r.content_json).includes('杭州')), JSON.stringify(rows1.map(r => textOf(r.content_json).slice(0, 30))));
    ck('S10 sessions 行逐位不变（usage 累计列不修，补篇 §4）', JSON.stringify(sessRow(sid)) === sessBefore);
    const t1 = tombFiles(sid);
    ck('S11 tombstone：1 文件 6 行、全 9 列、按 id 升序、sid 一致', t1.length === 1 && (() => { const lines = fs.readFileSync(path.join(tombDir(), t1[0]), 'utf8').trim().split('\n'); if (lines.length !== 6) return false; const objs = lines.map(l => JSON.parse(l)); const need = ['id', 'message_id', 'session_id', 'role', 'content_json', 'created_timestamp', 'timestamp', 'tokens', 'metadata_json']; return objs.every(o => need.every(k => o[k] !== undefined) && o.session_id === sid) && objs.every((o, i) => i === 0 || o.id > objs[i - 1].id); })());

    // ===== load 重放无 U2 原句 =====
    const replay2 = [];
    A.tap = m => { const u = m.agent && m.agent.params && m.agent.params.update; if (u && u.sessionUpdate === 'user_message_chunk' && u.content) replay2.push(u.content.text); };
    await A.rpc('session/load', { sessionId: sid, cwd: ROOT, mcpServers: [] });
    await new Promise(r => setTimeout(r, 600));
    A.tap = null;
    ck('S12 load 重放：仅 U1，无 U2/U3 原句', replay2.length === 1 && replay2[0] === U1, JSON.stringify(replay2.map(t => t.slice(0, 10))));

    // ===== 改写发送 → 模型上下文=U1+改写文（PROBE_ALL 回显）=====
    A.send({ type: 'prompt', text: REWRITE });
    await A.waitUntil(m => m.agent && m.agent.method === 'stop', 60000, 'stop rewrite');
    let provReply = '';
    A.tap = m => { const u = m.agent && m.agent.params && m.agent.params.update; if (u && u.sessionUpdate === 'agent_message_chunk' && u.content) provReply += u.content.text; };
    A.send({ type: 'prompt', text: 'PROBE_ALL 请原样列出你收到的所有用户消息' });
    await A.waitUntil(m => m.agent && m.agent.method === 'stop', 60000, 'stop probe');
    A.tap = null;
    let ctxUsers = null; try { ctxUsers = JSON.parse(provReply.slice(provReply.indexOf('ALL_USER_MSGS=') + 14)); } catch {}
    const ctxJoined = (ctxUsers || []).join('\n');
    const nU1 = (ctxJoined.match(/石榴红/g) || []).length, nRW = (ctxJoined.match(/坐飞机去苏州/g) || []).length;
    ck('S13 模型上下文=U1+改写文（无 U2 原句、无 U3、无重复轮；turn-context 折叠不敏感性断言）', !!ctxUsers && ctxUsers.some(u => u.includes('石榴红')) && ctxUsers.some(u => u.includes('坐飞机去苏州')) && !ctxJoined.includes('煤球') && !ctxJoined.includes('坐高铁去杭州') && nU1 === 1 && nRW === 1, provReply.slice(0, 200));

    // ===== 失败分支 1：边界 id 不存在 =====
    const before2 = msgRows(sid);
    A.send({ type: 'rollback_rewrite', sessionId: sid, messageId: 'msg_nonexistent-18c' });
    const r1 = await A.waitUntil(m => m.sys === 'rollback_done', 30000, 'receipt f1');
    ck('S14 边界 id 不存在：ok:false 人话「没找到」，不猜边界', r1.ok === false && /没找到/.test(r1.text || ''), JSON.stringify(r1));
    ck('S15 DB 逐位原样（失败分支零触碰）', JSON.stringify(msgRows(sid)) === JSON.stringify(before2));

    // ===== 失败分支 2：tombstone 写失败注入（目录换同名普通文件）=====
    fs.renameSync(tombDir(), tombDir() + '.bak18c');
    fs.writeFileSync(tombDir(), 'not-a-dir');
    A.send({ type: 'rollback_rewrite', sessionId: sid }); // 缺省边界=最后一条 user
    const r2 = await A.waitUntil(m => m.sys === 'rollback_done', 30000, 'receipt f2');
    ck('S16 tombstone 写失败：ok:false 人话「备份没写成」→ROLLBACK', r2.ok === false && /备份没写成/.test(r2.text || ''), JSON.stringify(r2));
    ck('S17 DB 逐位原样（fail closed）', JSON.stringify(msgRows(sid)) === JSON.stringify(before2));
    fs.unlinkSync(tombDir()); fs.renameSync(tombDir() + '.bak18c', tombDir());
    // 失败恢复（补篇 §2：失败手术已 close→由 load 复活，G6）——镜像前端 !ok 回执后的 openSession 重跑
    await A.rpc('session/load', { sessionId: sid, cwd: ROOT, mcpServers: [] });
    await new Promise(r => setTimeout(r, 400));

    // ===== busy 门：流式中拒绝 / 收尾后成功 =====
    const preBusy = msgRows(sid).map(r => r.id); // SLOW 轮开始即持久化 user 行——判据=「零删除」（超集），不是逐位冻结
    A.send({ type: 'prompt', text: 'SLOW18C 慢一点回复' });
    await new Promise(r => setTimeout(r, 800)); // 确认 turn 在飞
    A.send({ type: 'rollback_rewrite', sessionId: sid });
    const r3 = await A.waitUntil(m => m.sys === 'rollback_done', 30000, 'receipt busy');
    ck('S18 busy 门：流式中发起→拒绝+人话「还在进行中」', r3.ok === false && /还在进行中/.test(r3.text || ''), JSON.stringify(r3));
    const curIds = msgRows(sid).map(r => r.id);
    ck('S19 busy 拒绝零删除（preBusy 行全在；SLOW 轮在飞期间自写的新行允许出现，判据=零消失非零出现）', preBusy.every(id => curIds.includes(id)));
    await A.waitUntil(m => m.agent && m.agent.method === 'stop', 60000, 'stop slow');
    A.send({ type: 'rollback_rewrite', sessionId: sid }); // 收尾后：缺省边界=SLOW 轮
    const r4 = await A.waitUntil(m => m.sys === 'rollback_done', 45000, 'receipt after busy');
    ck('S20 busy 门：流式收尾后发起→成功（removed=3，SLOW 轮被撤）', r4.ok === true && r4.removed === 3, JSON.stringify(r4));
    await A.waitUntil(m => m.sys === 'session_rolled_back', 10000, 'refresh after slow').catch(() => {});
    await A.rpc('session/load', { sessionId: sid, cwd: ROOT, mcpServers: [] }); // 失败/成功手术后都由 load 复活（镜像前端广播→openSession）
    await new Promise(r => setTimeout(r, 400));

    // ===== keep-3：再种 2 次手术（总 4 次）→ 第 1 个文件被清 =====
    for (const t of ['18c-K1 第一年', '18c-K2 第二年']) {
        A.send({ type: 'prompt', text: t });
        await A.waitUntil(m => m.agent && m.agent.method === 'stop', 60000, 'stop ' + t.slice(0, 8));
        A.send({ type: 'rollback_rewrite', sessionId: sid });
        const rr = await A.waitUntil(m => m.sys === 'rollback_done', 45000, 'receipt keep3');
        if (!rr.ok) { ck('S21 keep-3 前置手术成功', false, JSON.stringify(rr)); break; }
        await A.waitUntil(m => m.sys === 'session_rolled_back', 10000, 'refresh').catch(() => {});
        await A.rpc('session/load', { sessionId: sid, cwd: ROOT, mcpServers: [] }); // 手术后复活，下轮 prompt 才有落点
        await new Promise(r => setTimeout(r, 400));
    }
    const tf = tombFiles(sid);
    ck('S21 keep-3：4 次手术后只剩 3 文件且序号 1 被清', tf.length === 3 && !tf.includes(sid + '-1.jsonl') && tf.includes(sid + '-4.jsonl'), tf.join(','));

    // ===== tombstone 恢复演练（tools/rollback-restore.js 修复路径）=====
    A.send({ type: 'prompt', text: '18c-DRILL 恢复演练暗号' });
    await A.waitUntil(m => m.agent && m.agent.method === 'stop', 60000, 'stop drill');
    A.send({ type: 'rollback_rewrite', sessionId: sid });
    const r5 = await A.waitUntil(m => m.sys === 'rollback_done', 45000, 'receipt drill');
    ck('S22 演练前置：DRILL 轮被撤（第 5 次手术，tomb=序号 5）', r5.ok === true && r5.removed === 3 && tombFiles(sid).includes(sid + '-5.jsonl'), JSON.stringify(r5) + tombFiles(sid).join(','));
    await A.waitUntil(m => m.sys === 'session_rolled_back', 10000, 'refresh drill').catch(() => {});
    ck('S22b 撤后 DB 无 DRILL 文本', !msgRows(sid).some(r => textOf(r.content_json).includes('DRILL')));
    let restoreOut = '';
    try { restoreOut = execFileSync(process.execPath, [path.resolve(__dirname, '..', 'rollback-restore.js'), ROOT, sid, '5'], { encoding: 'utf8', env: { ...process.env, NO_PROXY: '127.0.0.1,localhost' } }); }
    catch (e) { restoreOut = 'EXIT-' + e.status + ' ' + (e.stdout || '') + (e.stderr || ''); }
    ck('S23 恢复脚本 exit 0 且报告行数', /已按原 id 序恢复 3 行/.test(restoreOut), restoreOut.slice(0, 120));
    const replay3 = [];
    A.tap = m => { const u = m.agent && m.agent.params && m.agent.params.update; if (u && u.sessionUpdate === 'user_message_chunk' && u.content) replay3.push(u.content.text); };
    const lr3 = await A.rpc('session/load', { sessionId: sid, cwd: ROOT, mcpServers: [] });
    await new Promise(r => setTimeout(r, 600));
    A.tap = null;
    ck('S24 load 恢复原史：重放含 DRILL 原文（回执无 error）', !(lr3 && lr3.error) && replay3.some(t => t.includes('DRILL')), JSON.stringify(replay3.map(t => t.slice(0, 12))));

    // ===== 未订阅门 =====
    C = await mkClient(BRIDGE_PORT);
    C.send({ type: 'rollback_rewrite', sessionId: sid, messageId: u2.mid });
    const r6 = await C.waitUntil(m => m.sys === 'rollback_done', 30000, 'receipt unbound');
    ck('S25 未订阅 WS 发起：ok:false 人话（只信绑定）', r6.ok === false && /不在了/.test(r6.text || ''), JSON.stringify(r6));

    // ===== 空会话撤回（补篇 §1.1-2 探针：唯一 user 轮撤光 → load 不砖）=====
    C.send({ type: 'subscribe', sessionId: null });
    const sub2 = await C.waitUntil(m => m.sys === 'subscribed' && m.newSession, 30000, 'C subscribed');
    const sid2 = sub2.sessionId;
    C.send({ type: 'prompt', text: '18c-EMPTY 唯一一轮' });
    await C.waitUntil(m => m.agent && m.agent.method === 'stop', 60000, 'stop empty');
    C.send({ type: 'rollback_rewrite', sessionId: sid2 });
    const r7 = await C.waitUntil(m => m.sys === 'rollback_done', 45000, 'receipt empty');
    ck('S26 撤回唯一 user 轮：ok removed=3（撤回首条允许，无需降级守卫）', r7.ok === true && r7.removed === 3, JSON.stringify(r7));
    ck('S27 空会话 DB 零行', msgRows(sid2).length === 0);
    const lr4 = await C.rpc('session/load', { sessionId: sid2, cwd: ROOT, mcpServers: [] });
    ck('S28 空会话 load 不砖（response 带 modes，无 error）', lr4 && lr4.result && lr4.result.modes && !lr4.error, JSON.stringify(lr4 && (lr4.error || 'ok')).slice(0, 80));
    C.send({ type: 'prompt', text: '空会话后的第一句' });
    const st = await C.waitUntil(m => m.agent && m.agent.method === 'stop', 60000, 'stop after empty');
    ck('S29 空会话后可继续对话（全程不砖）', !!st);
})().catch(e => {
    console.error('PROBE ERROR:', e.message);
    ck('探针自身未异常', false, e.stack && e.stack.split('\n')[0]);
}).finally(() => {
    try { if (A && A.socket) A.socket.destroy(); } catch {}
    try { if (B && B.socket) B.socket.destroy(); } catch {}
    try { if (C && C.socket) C.socket.destroy(); } catch {}
    if (bridge) { try { spawn('taskkill', ['/pid', String(bridge.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {} }
    setTimeout(() => { try { prov && prov.close(); } catch {} try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} }, 1500);
    console.log('ws-rollback-probe: PASS=' + pass + ' FAIL=' + fail);
    if (fail) process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 1800);
});
