// s50c copy_artifact 实测（桥为自实现 WS：需 Origin 头 + masked 客户端帧，故手写而非用全局 WebSocket）
// 用法：node ws-copy-test.js <artifact-relative-path>
const http = require('http'), crypto = require('crypto');
const name = process.argv[2];
const key = crypto.randomBytes(16).toString('base64');
const req = http.request({ host: '127.0.0.1', port: 8790, path: '/ws', headers: {
    Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
    Origin: 'http://127.0.0.1:8790' } });
req.end();
const done = (code, why) => { console.log(why || ''); process.exit(code); };
const timer = setTimeout(() => done(1, 'TIMEOUT waiting copied response'), 8000);
req.on('upgrade', (res, socket) => {
    socket.write(clientFrame(JSON.stringify({ type: 'copy_artifact', name })));
    let buf = Buffer.alloc(0);
    socket.on('data', d => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
            const op = buf[0] & 0x0f;
            let len = buf[1] & 0x7f, off = 2;
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            if (buf.length < off + len) return;
            const msg = JSON.parse(buf.slice(off, off + len).toString('utf8'));
            buf = buf.slice(off + len);
            if (msg.sys === 'copied') { clearTimeout(timer); return done(0, 'RESPONSE: ' + JSON.stringify(msg)); }
            if (msg.sys === 'error') { clearTimeout(timer); return done(1, 'RESPONSE-ERROR: ' + JSON.stringify(msg)); }
        }
    });
    socket.on('error', e => done(1, 'SOCKET-ERROR: ' + e.message));
});
req.on('error', e => done(1, 'HTTP-ERROR: ' + e.message));
function clientFrame(str) {
    const payload = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
