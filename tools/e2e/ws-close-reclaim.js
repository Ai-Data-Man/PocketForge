// s75 regression probe (research/17): delete_session must send ACP session/close and the
// per-session extension process tree must be reclaimed. Self-relative assertion:
// count descendants of the BRIDGE's acp pid -> create session (count grows) ->
// delete via WS -> count returns to baseline. No absolute process counts (robust to
// concurrent stack state); polls are 1s bounded (no big sleeps).
const http = require('http'), crypto = require('crypto'), { execFile } = require('child_process');
const PORT = 8790;
// readiness gate (research/15) + probe body share the WS framing helpers of ws-delete-receipt.js
(async () => {
    await awaitAcpReady();
    const timer = setTimeout(() => { console.log('PROBE-C: FAIL - timeout'); process.exit(1); }, 60000);
    const acpPid = await findBridgeAcpPid();
    if (!acpPid) { clearTimeout(timer); console.log('PROBE-C: FAIL - bridge acp process not found'); process.exit(1); }
    console.log('PROBE-C: bridge acp pid=' + acpPid);
    const n0 = await treeCount(acpPid);
    console.log('PROBE-C: baseline descendants=' + n0);
    let sid = null;
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: {
        Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
        Origin: 'http://127.0.0.1:' + PORT } });
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
                    console.log('PROBE-C: session ' + sid + ' created, waiting for extension processes');
                    waitFor(async c => c > n0, 20, acpPid).then(async ok => { // s80 research/29：10→20s 吸收真冷机 EDR/IO 偶发拉爆 spawn（实测热机 1.4-1.8s，19 跑 0 复现判瞬态）
                        if (!ok) { clearTimeout(timer); console.log('PROBE-C: FAIL - extension processes did not appear in 20s (count stuck at ' + n0 + ')'); try { socket.destroy(); } catch {} process.exit(1); }
                        const n1 = await treeCount(acpPid);
                        console.log('PROBE-C: with-session descendants=' + n1 + ' (baseline ' + n0 + ')');
                        socket.write(frame({ type: 'delete_session', sessionId: sid }));
                    });
                } else if (msg.sys === 'session_deleted') {
                    console.log('PROBE-C: deleted ok=' + msg.ok + ', waiting for process reclamation');
                    waitFor(async c => c <= n0, 20, acpPid).then(ok => { // 同上：回收门同步放宽（总 60s 门仍罩得住）
                        clearTimeout(timer);
                        try { socket.destroy(); } catch {}
                        if (ok) console.log('PROBE-C: PASS - extension tree reclaimed to baseline after delete_session');
                        else { console.log('PROBE-C: FAIL - processes still above baseline after 10s'); process.exit(1); }
                    });
                } else if (msg.sys === 'error') {
                    clearTimeout(timer); console.log('PROBE-C: FAIL - bridge error:', JSON.stringify(msg)); try { socket.destroy(); } catch {} process.exit(1);
                }
            }
        });
        socket.on('error', e => { /* post-delete destroy is expected */ });
    });
    req.on('error', e => { clearTimeout(timer); console.log('PROBE-C: FAIL -', e.message); process.exit(1); });
    req.end();
})();
// poll `cond(count)` every 1s up to `cap`s; resolves true/false
async function waitFor(cond, cap, acpPid) {
    for (let i = 0; i < cap; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const c = await treeCount(acpPid);
        if (await cond(c)) return true;
    }
    return false;
}
// the bridge's acp = goose.exe running 'acp' whose parent is node.exe running chat-bridge.js
// (excludes goose-scheduler, the other acp managed by pc)
function findBridgeAcpPid() {
    return new Promise((resolve) => {
        execFile('powershell', ['-NoProfile', '-Command',
            '$p=Get-CimInstance Win32_Process|Select-Object ProcessId,ParentProcessId,Name,CommandLine;' +
            '$p|ConvertTo-Json -Compress -Depth 2'], { timeout: 30000 }, (err, stdout) => {
            if (err) return resolve(null);
            let arr; try { arr = JSON.parse(stdout); } catch { return resolve(null); }
            if (!Array.isArray(arr)) arr = [arr];
            const bridgeNode = arr.find(x => x && x.Name === 'node.exe' && /chat-bridge\.js/.test(x.CommandLine || ''));
            if (!bridgeNode) return resolve(null);
            const acp = arr.find(x => x && x.Name === 'goose.exe' && /goose\.exe\s+acp/.test(x.CommandLine || '') && !/enable-scheduler/.test(x.CommandLine || '') && Number(x.ParentProcessId) === Number(bridgeNode.ProcessId));
            resolve(acp ? Number(acp.ProcessId) : null);
        });
    });
}
// count live processes whose ancestor chain reaches rootPid (descendant tree of the acp)
function treeCount(rootPid) {
    return new Promise((resolve) => {
        execFile('powershell', ['-NoProfile', '-Command',
            '$p=Get-CimInstance Win32_Process|Select-Object ProcessId,ParentProcessId;' +
            '$p|ConvertTo-Json -Compress -Depth 2'], { timeout: 30000 }, (err, stdout) => {
            if (err) return resolve(-1);
            let arr; try { arr = JSON.parse(stdout); } catch { return resolve(-1); }
            if (!Array.isArray(arr)) arr = [arr];
            const byPid = new Map();
            for (const x of arr) if (x && x.ProcessId) byPid.set(Number(x.ProcessId), Number(x.ParentProcessId));
            let n = 0;
            for (const [pid] of byPid) {
                let cur = pid, hops = 0, reached = false;
                while (cur !== undefined && hops < 20) {
                    if (cur === rootPid) { reached = true; break; }
                    cur = byPid.get(cur); hops++;
                }
                if (reached && pid !== rootPid) n++;
            }
            resolve(n);
        });
    });
}
// research/15 readiness gate (same as ws-delete-receipt.js)
async function awaitAcpReady() {
    const t0 = Date.now();
    for (let delay = 500; ;) {
        const left = 45000 - (Date.now() - t0);
        if (left <= 0) { console.error('PROBE-C: FAIL - 桥 ACP 45s 未就绪（hello 无 caps.modes）'); process.exit(1); }
        if (await readHelloOnce(left < 5000 ? left : 5000)) return;
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
            try { if (sock) sock.destroy(); } catch {}
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
                    else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
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
