// s98/P4-3: WS delete_sessions 遍历/类型混淆/混合数组向量（fuzz-chat.sh 调用；HTTP 侧 /api/ws/delete_batch
// 同族向量在 sh 内联）。伪造 sid 均 2020 旧号段且不在归档索引——守卫逐项人话拒（会话标识不对/不是归档状态），
// 零真删；断言=sessions_deleted 回执形状（deleted=0/failed 逐项人话）+ 回执不含路径形态 + 桥存活。
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
const die = (why, code) => { console.error('ws-batch-typefuzz-probe: ' + why); process.exit(code); };
let done = false;
const t = setTimeout(() => { if (!done) die('timeout（未收到回执）', 1); }, 15000);
const key = crypto.randomBytes(16).toString('base64');
const rq = http.request({ host: u.hostname, port: u.port || 80, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://' + u.host } });
rq.on('upgrade', (res, socket) => {
    socket.write(frame({ type: 'delete_sessions', sessionIds: ['../..', 'a/b', 123, null, {}, 'x'.repeat(200), '20200101_777'] }));
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
            if (m.sys !== 'sessions_deleted') continue;
            done = true; clearTimeout(t);
            const raw = JSON.stringify(m);
            if (m.deleted !== 0 || m.skipped !== 0 || !Array.isArray(m.failed) || m.failed.length !== 7) die('回执形状不对: ' + raw, 1);
            for (const f of m.failed) {
                const e = String((f && f.err) || '');
                if (e !== '会话标识不对' && e !== '不是归档状态的对话，先归档再删') die('failed err 非已知人话: ' + raw, 1);
            }
            if (/:[\\\/]/.test(raw) || /C:/i.test(raw) || /\b(?:EBUSY|EPERM|EACCES|ENOENT)\b/.test(raw)) die('回执反射路径/errno: ' + raw, 1);
            socket.destroy();
            http.get('http://' + u.host + '/healthz', r => { // 桥存活
                let b = ''; r.on('data', x => b += x);
                r.on('end', () => { if (r.statusCode === 200 && b === 'ok') { console.log('ws-batch-typefuzz-probe: ok'); process.exit(0); } die('healthz 非 ok: ' + r.statusCode, 1); });
            }).on('error', e2 => die('healthz error: ' + e2.message, 1));
        }
    });
    socket.on('error', () => { if (!done) { done = true; clearTimeout(t); die('socket error', 1); } });
});
rq.on('error', e => { if (!done) { done = true; clearTimeout(t); die('connect error: ' + e.message, 1); } });
rq.end();
