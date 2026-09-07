// 断点①回归钉子（research/18 Z1，s76b 修复）：删当天最新会话→新建（goose 当日_MAX(库内序号)+1 号段回退，
// 复用已 close 的 sid）→prompt。修复前=error 帧被桥当成功 resolve→「秒回空、零报错」僵尸（Z1 三次活体复现）；
// 修复后=必须非静默：救援成功（新 sid 正常回答）/人话错误帧/直连正常回答三者其一，静默空 stop=红。
// REUSED=false 说明本机环境未触发号段回退（如并发建会话），此时只验证非静默不变量，救援路径未被演练（日志可见）。
// 遗留：探针会留 1-2 个含测试文本的会话行（故意不删最新行——再删会重造号段回退陷阱）；桥启动自清 >1 天空会话。
// 依赖 LLM 连通（真实回答路径）；权限卡不触发（纯文本 prompt）。
const http = require('http'), crypto = require('crypto');
const PORT = process.env.PF_BRIDGE_PORT || 8790;
let stage = 'connecting', sidA = null, sidB = null, text = '', sysErr = null, deleted = false, reused = false, path = 'none';
const done = (code, why) => {
    console.log('SID_A(deleted)=' + sidA, 'SID_B(final)=' + sidB, 'REUSED=' + reused, 'PATH=' + path);
    console.log('TEXT=' + JSON.stringify(text.slice(0, 80)), 'SYS_ERR=' + JSON.stringify(sysErr));
    console.log(why);
    setTimeout(() => process.exit(code), 300);
};
const verdict = () => {
    if (text.trim()) { path = path === 'none' ? 'direct' : path; return done(0, 'PASS: prompt got non-empty reply (non-silent)' + (reused ? ' after sid reuse' : ' (no sid reuse this run)')); }
    if (sysErr) return done(0, 'PASS: prompt got human-readable error (non-silent): ' + sysErr.slice(0, 60));
    return done(1, 'FAIL: silent empty reply — the research/18 断点① zombie form');
};
const timer = setTimeout(() => done(1, 'FAIL: hard timeout (stage=' + stage + ')'), 150000);

function wsConnect() {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: {
            Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
            Origin: 'http://127.0.0.1:' + PORT } });
        const t = setTimeout(() => reject(new Error('upgrade timeout')), 15000);
        req.on('upgrade', (res, socket) => { clearTimeout(t); resolve(socket); });
        req.on('error', e => { clearTimeout(t); reject(e); });
        req.end();
    });
}
function frame(str) {
    const p = Buffer.from(str, 'utf8'), m = crypto.randomBytes(4);
    const mk = Buffer.from(p.map((b, i) => b ^ m[i % 4]));
    let h;
    if (p.length < 126) h = Buffer.from([0x81, 0x80 | p.length]);
    else { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0x80 | 126; h.writeUInt16BE(p.length, 2); }
    return Buffer.concat([h, m, mk]);
}
// 服务端帧不 masked：op=首字节低 4 位，仅处理 text 帧
function parser(onMsg) {
    let buf = Buffer.alloc(0);
    return d => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
            const op = buf[0] & 0x0f;
            let len = buf[1] & 0x7f, off = 2;
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (buf.length < off + len) return;
            const pl = buf.slice(off, off + len); buf = buf.slice(off + len);
            if (op !== 0x1) continue;
            onMsg(pl);
        }
    };
}
let sock = null;
function handle(raw) {
    let m; try { m = JSON.parse(raw.toString('utf8')); } catch { return; }
    if (m.sys === 'session_deleted') { deleted = true; console.log('DELETE-RECEIPT ok=' + m.ok + ' sid=' + m.sessionId); return; }
    if (m.sys === 'subscribed') {
        if (stage === 'creating-A') { sidA = m.sessionId; stage = 'deleting-A'; console.log('A=' + sidA + ' -> delete');
            sock.write(frame(JSON.stringify({ type: 'delete_session', sessionId: sidA }))); return; }
        if (stage === 'creating-B') { sidB = m.sessionId; reused = sidA === sidB; stage = 'prompting';
            console.log('B=' + sidB + ' (reuse=' + reused + ') -> prompt');
            setTimeout(() => sock.write(frame(JSON.stringify({ type: 'prompt', text: '这是连通性测试，请只回复两个字：收到' }))), 600); return; }
        if (m.newSession) { path = 'rescue'; sidB = m.sessionId; console.log('RESCUE-SUBSCRIBED newSid=' + m.sessionId); return; }
        return;
    }
    if (m.sys === 'error') { sysErr = m.text; console.log('SYS-ERROR: ' + m.text); return verdict(); }
    if (m.agent) {
        const a = m.agent;
        if (a.method === 'stop' && a.params && a.params.reason === 'end') return verdict();
        const u = a.params && a.params.update;
        if (u && u.sessionUpdate === 'agent_message_chunk' && u.content && u.content.text) text += u.content.text;
    }
}
(async () => {
    const s1 = await wsConnect();
    s1.on('data', parser(handle));
    sock = s1;
    stage = 'creating-A';
    s1.write(frame(JSON.stringify({ type: 'subscribe', sessionId: null })));
    const t0 = Date.now();
    while (!(deleted && Date.now() - t0 > 1200)) { if (Date.now() - t0 > 30000) break; await new Promise(r => setTimeout(r, 300)); }
    const s2 = await wsConnect();
    s2.on('data', parser(handle));
    s2.on('error', () => {});
    sock = s2;
    stage = 'creating-B';
    s2.write(frame(JSON.stringify({ type: 'subscribe', sessionId: null })));
})().catch(e => done(1, 'FAIL: ' + e.message));
