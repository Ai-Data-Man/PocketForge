// s50e 验证探针：手写 WS 发 prompt 触发真实上游错误，验证 /api/stats upstreamByKind 计数
// 用法：node ws-prompt-probe-s50e.js <message-text>
const http = require('http'), crypto = require('crypto');
const text = process.argv[2] || 'hi';
const key = crypto.randomBytes(16).toString('base64');
const req = http.request({ host: '127.0.0.1', port: 8790, path: '/ws', headers: {
    Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
    Origin: 'http://127.0.0.1:8790' } });
req.end();
const done = (code, why) => { console.log(why || ''); process.exit(code); };
const timer = setTimeout(() => done(1, 'TIMEOUT waiting stop'), 160000);
let sid = null, seen = [];
req.on('upgrade', (res, socket) => {
    socket.write(frame(JSON.stringify({ type: 'subscribe', sessionId: null })));
    let buf = Buffer.alloc(0);
    socket.on('data', d => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
            let len = buf[1] & 0x7f, off = 2;
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (buf.length < off + len) return;
            let msg; try { msg = JSON.parse(buf.slice(off, off + len).toString('utf8')); } catch { buf = []; return; }
            buf = buf.slice(off + len);
            if (msg.sys === 'subscribed') {
                sid = msg.sessionId;
                console.log('subscribed', sid);
                socket.write(frame(JSON.stringify({ type: 'prompt', text })));
            } else if (msg.sys === 'error') {
                clearTimeout(timer);
                return done(0, 'SYS-ERROR: ' + msg.text);
            } else if (msg.agent && msg.agent.method === 'stop') {
                clearTimeout(timer);
                return done(0, 'STOP reason=' + JSON.stringify(msg.agent.params && msg.agent.params.reason));
            } else { seen.push(msg.sys || (msg.agent && msg.agent.method) || '?'); }
        }
    });
    socket.on('error', e => done(1, 'SOCKET-ERROR: ' + e.message));
});
req.on('error', e => done(1, 'HTTP-ERROR: ' + e.message));
// 桥服务端帧不 masked；客户端必须发 masked 帧
function frame(str) {
    const payload = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
