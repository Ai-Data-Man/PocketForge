// s50h FIND-2/4 探针：WS subscribe sid 白名单 + prompt 绑定/非空/长度上限
// 纯 WS 协议断言，不碰真实 LLM（全部在被上游消费前短路）。用法：node ws-fuzz-s50h.js
const http = require('http'), crypto = require('crypto');
const PORT = 8790;
let pass = 0, fail = 0;
const created = [];   // QA s80g 跟进：本探针 5 处 subscribe(null) 各建一会话，收尾逐个 delete_session 自清
function assert(name, cond, detail) {
    if (cond) { pass++; console.log('PASS: ' + name); }
    else { fail++; console.log('FAIL: ' + name + (detail ? ' — ' + detail : '')); }
}
// 单连接：先发 first，收到 subscribed 后再发 then()（同一 socket，保住 wsSession 绑定）
function wsSession(steps, timeoutMs, pred) {
    return new Promise((resolve) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: {
            Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
            Origin: 'http://127.0.0.1:' + PORT } });
        let buf = Buffer.alloc(0), inbox = [], closed = false, secondSent = false;
        function finish() {
            if (closed) return; closed = true; clearTimeout(timer);
            try { req.destroy(); } catch {}
            resolve({ inbox });
        }
        const timer = setTimeout(finish, timeoutMs);
        req.on('upgrade', (res, socket) => {
            socket.write(clientFrame(JSON.stringify(steps.first)));
            socket.on('data', d => {
                buf = Buffer.concat([buf, d]);
                while (buf.length >= 2) {
                    const op = buf[0] & 0x0f;
                    let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
                    if (buf.length < off + len) return;
                    const payload = buf.slice(off, off + len); buf = buf.slice(off + len);
                    if (op !== 0x1) continue;
                    let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch { continue; }
                    inbox.push(msg);
                    // s71(G1) 探针适配：smart_approve 下真 prompt 可能弹卡——自动回 allow_once，
                    // 防止 goose turn 挂死在无人应答的权限请求上（本探针只测本地门，不判卡片）
                    if (msg.agent && msg.agent.method === 'session/request_permission') {
                        const opts = (msg.agent.params && msg.agent.params.options) || [];
                        const opt = opts.find(o => o.kind === 'allow_once') || opts[0];
                        socket.write(clientFrame(JSON.stringify({ type: 'acp_reply', callId: msg.agent.id, option: opt && opt.optionId })));
                    }
                    if (msg.sys === 'subscribed' && msg.newSession && msg.sessionId) created.push(msg.sessionId);
                    if (msg.sys === 'subscribed' && !secondSent && steps.then) {
                        secondSent = true;
                        socket.write(clientFrame(JSON.stringify(steps.then())));
                        continue;
                    }
                    if (pred && pred(msg)) finish();
                }
            });
            socket.on('error', () => finish());
            socket.on('close', () => finish());
        });
        req.on('error', () => finish());
        req.end();
    });
}
(async () => {
    await awaitAcpReady();   // research/15 就绪门：healthz 200 ≠ ACP 就绪，先等 hello.caps.modes 再跑矩阵
    // FIND-2: 畸形 sid → error，不是 subscribed
    // 注：数字 12345 按规格 String() 归一后过白名单（宽限），且 prompt 只信 wsSession 绑定故无实害
    const badSids = ["x' OR 1=1--", '../../../etc/passwd', '5'.repeat(500), { evil: 1 }, 'sid with space'];
    for (const bs of badSids) {
        const r = await wsSession({ first: { type: 'subscribe', sessionId: bs } }, 6000,
            m => m.sys === 'subscribed' || m.sys === 'error');
        const got = r.inbox.find(m => m.sys === 'subscribed' || m.sys === 'error');
        assert('subscribe rejects bad sid ' + JSON.stringify(String(JSON.stringify(bs)).slice(0, 24)),
            got && got.sys === 'error' && /会话标识不对/.test(got.text || ''),
            JSON.stringify(got));
    }
    // FIND-2 回归：subscribe(null) 新会话语义必须活着（收到 subscribed）
    const rn = await wsSession({ first: { type: 'subscribe', sessionId: null } }, 10000,
        m => m.sys === 'subscribed' || m.sys === 'error');
    const sub = rn.inbox.find(m => m.sys === 'subscribed');
    assert('subscribe(null) still creates session', sub && sub.sessionId, JSON.stringify(rn.inbox.map(m => m.sys)));
    // FIND-4a: ghost sid prompt（未订阅直接 prompt 且带 sid）→ error 人话
    const rg = await wsSession({ first: { type: 'prompt', sessionId: 'ghost-sid-1', text: 'hi' } }, 6000,
        m => m.sys === 'subscribed' || m.sys === 'error');
    const ge = rg.inbox.find(m => m.sys === 'error');
    assert('ghost sid prompt gets friendly error', ge && /这场对话已经不在了/.test(ge.text || ''), JSON.stringify(ge));
    // FIND-4b: 已订阅但 sessionId 不一致 → 同样拒绝（同 socket：订阅 resolve 后再发）
    const rm = await wsSession(
        { first: { type: 'subscribe', sessionId: null }, then: () => ({ type: 'prompt', sessionId: 'different-sid', text: 'hi' }) },
        10000, m => m.sys === 'error');
    const me = rm.inbox.find(m => m.sys === 'error');
    assert('mismatched sessionId prompt refused', !!me && /这场对话已经不在了/.test(me.text || ''), JSON.stringify(me));
    // FIND-4c: 空 text → error 人话（先订阅成功再 prompt）
    const re = await wsSession(
        { first: { type: 'subscribe', sessionId: null }, then: () => ({ type: 'prompt', text: '   ' }) },
        10000, m => m.sys === 'error');
    const ee = re.inbox.find(m => m.sys === 'error');
    assert('empty/whitespace text refused', ee && /不能是空的/.test(ee.text || ''), JSON.stringify(ee));
    // FIND-4d: 1MB text → error 人话
    const big = 'x'.repeat(1024 * 1024);
    const rb = await wsSession(
        { first: { type: 'subscribe', sessionId: null }, then: () => ({ type: 'prompt', text: big }) },
        10000, m => m.sys === 'error');
    const be = rb.inbox.find(m => m.sys === 'error');
    assert('1MB text refused', be && /太长了/.test(be.text || ''), JSON.stringify(be));
    // FIND-4 回归：正常订阅后 prompt(text) 不被本地校验拦（进入上游才算通过本地门）。
    // 不等上游 turn 完成——见到任何非 error 的推进帧即算过本地校验门。
    const rnor = await wsSession(
        { first: { type: 'subscribe', sessionId: null }, then: () => ({ type: 'prompt', text: '只测试连通' }) },
        20000, m => m.sys === 'error' || m.agent);
    const nerr = rnor.inbox.find(m => m.sys === 'error');
    assert('normal prompt passes local gate', !nerr, JSON.stringify(nerr));
    // QA s80g 跟进：探针自建会话自清。复用桥侧 acpCloseSession（s81 出生门控延迟 close）语义——
    // 探针只发 delete_session、收 session_deleted 回执即算（幼龄延迟窗/树回收是桥侧职责，探针不等）。
    // 桥回执后自断请求方 socket，故一会话一连接。
    // 取走自建清单：下方烧号建的会话不得进入删除清单（删烧号顶行=号段回退=重新布雷）。
    const burnPlan = created.splice(0);
    const num = s => { const m = /_(\d+)$/.exec(String(s)); return m ? +m[1] : NaN; };
    const preMax = Math.max(...burnPlan.map(num));
    for (const sid of burnPlan) await wsDeleteSession(sid);
    console.log('[cleanup] deleted ' + burnPlan.length + ' self-created session(s)');
    // s83b 烧号（tmp/s83b-appcap-regression.md 修复建议·首选，620ea97 五连删回归的测试侧修复）：
    // 叠删当日顶号 ≥2 必烧穿桥单次救援——删行致 goose 号段回退、closed 集留号，下个真会话复用
    // closed 号 → prompt 撞守卫 → 救援又拿下一个 closed 号 → TURN_LOST 连环（appcap run7/8 形态）。
    // 烧号 = 删 N 个再 subscribe(null) N 次（=桥发 session/new，只建不发 prompt），把当日 MAX 顶回
    // 删除前水平，closed 号全部沉到 MAX 之下。烧号会话即弃（桥侧闲置会话本就滞留至桥重启，不新增
    // 负担）；只建不删，桥「session/new 前冲刷 pending close」语义不受影响。
    // 断言取 ≥ 而非 =：rnor 真模型 turn 在删除后才迟到 reject（Failed to load session）会触发桥单次
    // 救援 session/new，中途多顶 1 个号（s83c 实测 pc.log：burn 序列 177,179,180,181,182，178 被救援
    // 吃掉）；救援只增 MAX 不减，方向上只会更安全。烧/救援会话均不发 prompt，不踩 closed 守卫。
    const burned = [];
    for (let i = 0; i < burnPlan.length; i++) {
        const rb = await wsSession({ first: { type: 'subscribe', sessionId: null } }, 10000,
            m => m.sys === 'subscribed' || m.sys === 'error');
        const bs = rb.inbox.find(m => m.sys === 'subscribed' && m.newSession);
        if (bs && bs.sessionId) burned.push(bs.sessionId);
    }
    const postMax = burned.length ? Math.max(...burned.map(num)) : NaN;
    console.log('[burn] pre-delete daily MAX=' + preMax + ', post-burn MAX=' + postMax +
        ', burned ' + burned.length + '/' + burnPlan.length + ' session(s)');
    assert('burn sinks closed sids below daily top (post-burn MAX >= pre-delete MAX)', !burnPlan.length ||
        (burned.length === burnPlan.length && postMax >= preMax),
        'pre=' + preMax + ' post=' + postMax + ' burned=[' + burned.join(',') + ']');
    console.log('==============================');
    console.log('ws-fuzz-s50h: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})();
function clientFrame(str) {
    const payload = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
    return Buffer.concat([header, mask, masked]);
}
// 收尾自清：单连接发 delete_session 等 session_deleted 回执（≤5s 兜底；delete 无需先 subscribe，桥 handleClient 直收）
function wsDeleteSession(sid) {
    return new Promise((resolve) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: {
            Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
            Origin: 'http://127.0.0.1:' + PORT } });
        let buf = Buffer.alloc(0), settled = false, sock = null;
        function finish(why) {
            if (settled) return; settled = true; clearTimeout(timer);
            try { if (sock) sock.destroy(); } catch {}
            try { req.destroy(); } catch {}
            console.log('[cleanup] delete_session ' + sid + ' -> ' + why);
            resolve();
        }
        const timer = setTimeout(() => finish('timeout 5s'), 5000);
        req.on('upgrade', (res, socket) => {
            sock = socket;
            socket.write(clientFrame(JSON.stringify({ type: 'delete_session', sessionId: sid })));
            socket.on('data', d => {
                buf = Buffer.concat([buf, d]);
                while (buf.length >= 2) {
                    const op = buf[0] & 0x0f;
                    let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
                    if (buf.length < off + len) return;
                    const payload = buf.slice(off, off + len); buf = buf.slice(off + len);
                    if (op !== 0x1) continue;
                    let m; try { m = JSON.parse(payload.toString('utf8')); } catch { continue; }
                    if (m.sys === 'session_deleted') finish('receipt ok=' + m.ok);
                    else if (m.sys === 'error') finish('bridge error: ' + (m.text || ''));
                }
            });
            socket.on('error', () => finish('socket error'));
            socket.on('close', () => finish('socket closed (no receipt seen)'));
        });
        req.on('error', () => finish('connect error'));
        req.end();
    });
}
// research/15 就绪门：桥 listen/healthz 先于 goose ACP initialize 完成，矩阵的 session/new 依赖断言会撞 10s 超时。
// 连 WS 只读 hello 帧（桥 ：2428，caps.modes 在 = acpCaps 就绪），零副作用不 subscribe；未就绪/连接拒
// 500ms 起步 ×2 退避重连，deadline 45s 超门人话失败退出（独立于断言红）。
async function awaitAcpReady() {
    const t0 = Date.now();
    for (let delay = 500; ;) {
        const left = 45000 - (Date.now() - t0);
        if (left <= 0) { console.error('FAIL: 桥 ACP 45s 未就绪（hello 无 caps.modes），矩阵未跑'); process.exit(1); }
        if (await readHelloOnce(left < 5000 ? left : 5000)) return;
        console.error('[gate] ACP 未就绪/连接拒，' + delay + 'ms 后重连');
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
    }
}
function readHelloOnce(timeoutMs) {
    return new Promise((resolve) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: {
            Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
            Origin: 'http://127.0.0.1:' + PORT } });
        let buf = Buffer.alloc(0), settled = false, sock = null;
        function finish(v) {
            if (settled) return; settled = true; clearTimeout(timer);
            try { if (sock) sock.destroy(); } catch {}   // upgrade 后 socket 脱离 req 托管，必须显式销毁否则进程挂住
            try { req.destroy(); } catch {}
            resolve(v);
        }
        const timer = setTimeout(() => finish(false), timeoutMs);
        req.on('upgrade', (res, socket) => {
            sock = socket;
            socket.on('data', d => {
                buf = Buffer.concat([buf, d]);
                while (buf.length >= 2) {
                    const op = buf[0] & 0x0f;
                    let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
                    if (buf.length < off + len) return;
                    const payload = buf.slice(off, off + len); buf = buf.slice(off + len);
                    if (op !== 0x1) continue;
                    let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch { continue; }
                    if (msg.sys === 'hello') { finish(!!(msg.caps && msg.caps.modes)); return; }
                }
            });
            socket.on('error', () => finish(false));
            socket.on('close', () => finish(false));
        });
        req.on('error', () => finish(false));
        req.end();
    });
}
