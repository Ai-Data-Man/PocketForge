// qa s98 P4-1: WS delete_sessions 超限向量（fuzz-chat.sh 调用；HTTP 侧 /api/ws/delete_batch 同门向量在 sh 内联）。
// 201 条 sessionIds → 桥整体拒绝：人话 error（含「200」）且不出现 sessions_deleted 执行回执（零部分执行）。
// 只连不发其他消息；伪造 sid 均 2020 旧号段（修前无守卫时也只是逐条 failed，不删任何真数据）。
'use strict';
const http = require('http'), crypto = require('crypto');
const u = new URL(process.argv[2] || 'http://127.0.0.1:8790');
function frame(obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
const die = (why, code) => { console.error('ws-batchcap-probe: ' + why); process.exit(code); };
let done = false;
const t = setTimeout(() => { if (!done) die('timeout（未收到回执）', 1); }, 15000);
const key = crypto.randomBytes(16).toString('base64');
const rq = http.request({ host: u.hostname, port: u.port || 80, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://' + u.host } });
rq.on('upgrade', (res, socket) => {
    socket.write(frame({ type: 'delete_sessions', sessionIds: Array.from({ length: 201 }, (_, i) => '20200101_' + i) }));
    let buf = Buffer.alloc(0);
    socket.on('data', d => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
            const op = buf[0] & 0x0f; let len = buf[1] & 0x7f, off = 2;
            if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (buf.length < off + len) break;
            const payload = buf.slice(off, off + len); buf = buf.slice(off + len);
            if (op !== 0x1) continue;
            let m; try { m = JSON.parse(payload.toString('utf8')); } catch { continue; }
            if (m.sys === 'sessions_deleted') { done = true; clearTimeout(t); die('超限批被执行（出现 sessions_deleted）', 1); }
            if (m.sys === 'error') {
                done = true; clearTimeout(t);
                const ok = String(m.text || '').includes('200');
                die((ok ? '整体拒绝人话: ' : '回执不含上限人话: ') + m.text, ok ? 0 : 1);
            }
        }
    });
    socket.on('error', () => { if (!done) { done = true; clearTimeout(t); die('socket error', 1); } });
});
rq.on('error', e => { if (!done) { done = true; clearTimeout(t); die('connect error: ' + e.message, 1); } });
rq.end();
