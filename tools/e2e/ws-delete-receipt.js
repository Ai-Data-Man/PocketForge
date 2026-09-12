// One-off probe B (live bridge): subscribe(null) -> get sid -> delete_session ->
// assert session_deleted receipt arrives BEFORE the bridge closes our socket.
// Proves the s62 fix keeps the receipt path working end-to-end.
const http = require('http'), crypto = require('crypto');
const PORT = 8790;
const key = crypto.randomBytes(16).toString('base64');
const req = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: {
    Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
    Origin: 'http://127.0.0.1:' + PORT } });
// req.end() 推迟到 ACP 就绪门通过后（research/15）；req 对象创建惰性，不 end 不落网
(async () => {
    await awaitAcpReady();   // research/15 就绪门：healthz 200 ≠ ACP 就绪，先等 hello.caps.modes 再放行探针
    const t0 = Date.now();
    // s78: 断言契约=回执先于 close 的顺序，不是速度；20s 在套件负载下两度误红（subscribe→session/new 偶发 >20s），放宽到 45s 语义不变
    const timer = setTimeout(() => { console.log('PROBE-B: FAIL - timeout'); process.exit(1); }, 45000);
    let gotDeletedAt = null, closedAt = null, sid = null;
req.on('upgrade', (res, socket) => {
    socket.write(frame({ type: 'subscribe', sessionId: null }));
    let buf = Buffer.alloc(0);
    socket.on('data', d => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
            const op = buf[0] & 0x0f;
            let len = buf[1] & 0x7f, off = 2;
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (buf.length < off + len) return;
            if (op !== 0x1) { buf = buf.slice(off + len); continue; }
            const msg = JSON.parse(buf.slice(off, off + len).toString('utf8'));
            buf = buf.slice(off + len);
            if (msg.sys === 'subscribed' && msg.newSession) {
                sid = msg.sessionId;
                socket.write(frame({ type: 'delete_session', sessionId: sid }));
            } else if (msg.sys === 'session_deleted') {
                gotDeletedAt = Date.now();
                console.log('PROBE-B: receipt', JSON.stringify(msg), '@', gotDeletedAt - t0, 'ms');
            } else if (msg.sys === 'error') {
                clearTimeout(timer); console.log('PROBE-B: FAIL - bridge error:', JSON.stringify(msg)); process.exit(1);
            }
        }
    });
    socket.on('close', () => {
        closedAt = Date.now();
        clearTimeout(timer);
        if (gotDeletedAt && closedAt >= gotDeletedAt) {
            console.log('PROBE-B: PASS - session_deleted delivered, socket closed ' + (closedAt - gotDeletedAt) + 'ms later (sid=' + sid + ')');
        } else { console.log('PROBE-B: FAIL - closed=' + !!closedAt + ' receipt=' + !!gotDeletedAt); process.exit(1); }
    });
    socket.on('error', e => { console.log('PROBE-B: socket error:', e.message); });
});
req.on('error', e => { clearTimeout(timer); console.log('PROBE-B: FAIL -', e.message); process.exit(1); });
req.end();
})();
// research/15 就绪门（同 ws-fuzz-s50h.js）：连 WS 只读 hello 帧，caps.modes 在（桥 acpCaps 信号）才放行；
// 未就绪/连接拒 500ms 起步 ×2 退避重连，deadline 45s 超门人话失败退出。
async function awaitAcpReady() {
    const t0 = Date.now();
    for (let delay = 500; ;) {
        const left = 45000 - (Date.now() - t0);
        if (left <= 0) { console.error('PROBE-B: FAIL - 桥 ACP 45s 未就绪（hello 无 caps.modes）'); process.exit(1); }
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
function frame(obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
