// s50e 验证探针：手写 WS 发 prompt 触发真实上游错误，验证 /api/stats upstreamByKind 计数
// 用法：node ws-prompt-probe-s50e.js <message-text> [--expect-perm]
//   s71(G1) 起桥默认 smart_approve：收到 session/request_permission 自动回 allow_once 让链路走完；
//   --expect-perm = 断言卡片链路真实走过（收到卡且回复过），否则以 stop 结束时报 FAIL（S-A 验收 b 用）
const http = require('http'), crypto = require('crypto');
const text = process.argv[2] || 'hi';
const expectPerm = process.argv.includes('--expect-perm');
const key = crypto.randomBytes(16).toString('base64');
const req = http.request({ host: '127.0.0.1', port: 8790, path: '/ws', headers: {
    Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
    Origin: 'http://127.0.0.1:8790' } });
req.end();
let permSeen = false;
const done = (code, why) => {
    console.log('PERM_ROUNDTRIP=' + (permSeen ? 1 : 0));
    console.log('FRAMES=' + [...new Set(seen)].join(','));
    if (toolUpdates.length) console.log('TOOL_UPDATES=' + toolUpdates.join(' | '));
    if (replyTail) console.log('REPLY_TAIL=' + replyTail.slice(-240).replace(/\s+/g, ' '));
    if (code === 0 && expectPerm && !permSeen) { console.log('FAIL: expected permission round-trip, none seen'); process.exit(1); }
    console.log(why || ''); process.exit(code);
};
const timer = setTimeout(() => done(1, 'TIMEOUT waiting stop'), 160000);
let sid = null, seen = [], toolUpdates = [], replyTail = '';
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
                console.log('subscribed', sid, 'mode=' + JSON.stringify(msg.modes && msg.modes.currentModeId));
                socket.write(frame(JSON.stringify({ type: 'prompt', text })));
            } else if (msg.sys === 'error') {
                clearTimeout(timer);
                return done(0, 'SYS-ERROR: ' + msg.text);
            } else if (msg.agent && msg.agent.method === 'session/request_permission') {
                // s71(G1) 探针适配：权限卡自动选「这次可以」（allow_once），PERM_ROUNDTRIP 留卡片链路断言证据
                permSeen = true;
                const tc = msg.agent.params && msg.agent.params.toolCall;
                const ttl = tc && ((tc.toolCallUpdate && tc.toolCallUpdate.title) || tc.title) || '?';
                console.log('PERM: ' + ttl);
                const opts = (msg.agent.params && msg.agent.params.options) || [];
                const opt = opts.find(o => o.kind === 'allow_once') || opts[0];
                socket.write(frame(JSON.stringify({ type: 'acp_reply', callId: msg.agent.id, option: opt && opt.optionId })));
            } else if (msg.agent && msg.agent.method === 'stop') {
                clearTimeout(timer);
                return done(0, 'STOP reason=' + JSON.stringify(msg.agent.params && msg.agent.params.reason));
            } else {
                // 诊断捕获：工具卡状态 + 回复尾部（denial 证据链用）
                const u = msg.agent && msg.agent.params && msg.agent.params.update;
                if (u && u.sessionUpdate === 'tool_call_update') {
                    toolUpdates.push((u.toolCallId || '?') + ':' + (u.status || '?'));
                } else if (u && u.sessionUpdate === 'agent_message_chunk' && u.content && u.content.text) {
                    replyTail += u.content.text;
                    if (replyTail.length > 4096) replyTail = replyTail.slice(-2048);
                }
                seen.push(msg.sys || (msg.agent && msg.agent.method) || '?');
            }
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
