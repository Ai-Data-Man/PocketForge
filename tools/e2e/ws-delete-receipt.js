// One-off probe B (live bridge): subscribe(null) -> get sid -> delete_session ->
// assert session_deleted receipt arrives BEFORE the bridge closes our socket.
// Proves the s62 fix keeps the receipt path working end-to-end.
const http = require('http'), crypto = require('crypto');
const PORT = 8790;
const key = crypto.randomBytes(16).toString('base64');
const req = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: {
    Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
    Origin: 'http://127.0.0.1:' + PORT } });
req.end();
const t0 = Date.now();
const timer = setTimeout(() => { console.log('PROBE-B: FAIL - timeout'); process.exit(1); }, 20000);
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
function frame(obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
