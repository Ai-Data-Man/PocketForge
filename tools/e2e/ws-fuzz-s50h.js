// s50h FIND-2/4 探针：WS subscribe sid 白名单 + prompt 绑定/非空/长度上限
// 纯 WS 协议断言，不碰真实 LLM（全部在被上游消费前短路）。用法：node ws-fuzz-s50h.js
const http = require('http'), crypto = require('crypto');
const PORT = 8790;
let pass = 0, fail = 0;
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
