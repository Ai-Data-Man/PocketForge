// s98/P4-2: 删除回执 err 人话门回归探针（红绿件——修前 HEAD 上 V3 锁定文件向量红：EBUSY message 含绝对路径）。
// 四向量全打批量/单删真实拒删路径（引用拒删/活跃拒删/占用拒删/会话库锁），断言回执 failed[].err：
//   ①非空人话（无 errno 令牌）②不含 ':\' 或 ':/' 路径形态 ③桥存活（healthz）。
// fixture 全部自建自清：data/artifacts 下 ws-9999-* 三个目录（远未来号段不撞真区）+ workspace-map/
// session-archive 备份字节级还原；文件锁经子进程 PowerShell FileShare.None 持有（node 句柄带
// FILE_SHARE_DELETE 拦不住 rmSync，锁必须来自另一进程），marker 文件握手防竞态。
'use strict';
const http = require('http'), path = require('path'), fs = require('fs'), cp = require('child_process');
const B = process.argv[2] || 'http://127.0.0.1:8790';
const u = new URL(B);
const FR = path.resolve(__dirname, '..', '..', 'forge');
const ART = path.join(FR, 'data', 'artifacts');
// id 必须过 wsValidId（^ws-\d{4}-\d{6}[a-z]*$）：9999 年远未来号段不撞真区
const WS_TG = 'ws-9999-010001', WS_RF = 'ws-9999-020001', WS_AC = 'ws-9999-030001', WS_LK = 'ws-9999-040001';
const MAP = path.join(FR, 'data', 'workspace-map.json');
const ARCH = path.join(FR, 'data', 'session-archive.json');
const DB = path.join(FR, 'conf', 'goose', 'data', 'sessions', 'sessions.db');
let PASS = 0, FAIL = 0;
const ck = (name, ok, detail) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + name + (ok ? '' : '  <<< ' + detail)); ok ? PASS++ : FAIL++; };
const pathish = e => {
    const s = String(e || '');
    return /:[\\\/]/.test(s) || /C:/i.test(s) || /\b(?:EBUSY|EPERM|EACCES|ENOENT)\b/.test(s);
};
function post(body) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(JSON.stringify(body), 'utf8');
        const rq = http.request({ host: u.hostname, port: u.port || 80, path: '/api/ws/delete_batch', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length, Origin: 'http://' + u.host } }, r => {
            let b = ''; r.on('data', d => b += d); r.on('end', () => { try { resolve({ code: r.statusCode, body: JSON.parse(b) }); } catch (e) { reject(new Error('bad json: ' + b.slice(0, 120))); } });
        });
        rq.on('error', reject); rq.setTimeout(10000, () => rq.destroy(new Error('timeout'))); rq.end(data);
    });
}
function healthz() {
    return new Promise(resolve => {
        http.get(B + '/healthz', r => { let b = ''; r.on('data', d => b += d); r.on('end', () => resolve(r.statusCode === 200 && b === 'ok')); }).on('error', () => resolve(false));
    });
}
function psHold(file, marker) { // 另一进程持 FileShare.None 锁；marker 出现=锁已生效
    const script = "$f=[IO.File]::Open('" + file + "','Open','ReadWrite','None');Set-Content -Path '" + marker + "' -Value 1;Start-Sleep -Seconds 60;$f.Close()";
    const ch = cp.spawn('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
    ch.unref();
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        (function poll() {
            if (fs.existsSync(marker)) return resolve(ch);
            if (Date.now() - t0 > 15000) { try { ch.kill(); } catch {} return reject(new Error('lock holder not ready in 15s')); }
            setTimeout(poll, 100);
        })();
    });
}
function psJunction(link, target) {
    cp.spawnSync('powershell', ['-NoProfile', '-Command', "New-Item -ItemType Junction -Path '" + link + "' -Target '" + target + "' | Out-Null"], { stdio: 'ignore' });
}
// 最小 WS 客户端（同 ws-batchcap-probe；仅 delete_sessions 向量用）
const crypto = require('crypto');
function wsSend(obj, wantSys) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(JSON.stringify(obj), 'utf8'), mask = crypto.randomBytes(4);
        const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
        let header;
        if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
        else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
        const key = crypto.randomBytes(16).toString('base64');
        const rq = http.request({ host: u.hostname, port: u.port || 80, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://' + u.host } });
        const to = setTimeout(() => { try { rq.destroy(); } catch {} reject(new Error('ws timeout')); }, 12000);
        rq.on('upgrade', (res, socket) => {
            socket.write(Buffer.concat([header, mask, masked]));
            let buf = Buffer.alloc(0);
            socket.on('data', d => {
                buf = Buffer.concat([buf, d]);
                while (buf.length >= 2) {
                    const op = buf[0] & 0x0f; let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
                    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
                    if (buf.length < off + len) break;
                    const p = buf.slice(off, off + len); buf = buf.slice(off + len);
                    if (op !== 0x1) continue;
                    let m; try { m = JSON.parse(p.toString('utf8')); } catch { continue; }
                    if (m.sys === wantSys) { clearTimeout(to); try { socket.destroy(); } catch {} resolve(m); }
                }
            });
            socket.on('error', () => { clearTimeout(to); reject(new Error('socket error')); });
        });
        rq.on('error', e => { clearTimeout(to); reject(e); });
        rq.end();
    });
}
(async () => {
    if (!await healthz()) { console.error('ws-del-err-probe: bridge not healthy'); process.exit(1); }
    const mapBak = fs.readFileSync(MAP, 'utf8'), archBak = fs.existsSync(ARCH) ? fs.readFileSync(ARCH, 'utf8') : null;
    let lockHolder = null;
    const mkws = (id, file) => { const d = path.join(ART, id); fs.mkdirSync(d, { recursive: true }); if (file) fs.writeFileSync(path.join(d, file), 'p42'); return d; };
    try {
        // fixture：目标区(带文件)/引用区/活跃区(带文件+map 绑定假 sid)/锁定区(带被锁文件)
        const dTg = mkws(WS_TG, 'a.txt'), dRf = mkws(WS_RF), dAc = mkws(WS_AC, 'a.txt'), dLk = mkws(WS_LK, 'held.txt');
        psJunction(path.join(dRf, 'lnk'), dTg);
        const map = JSON.parse(mapBak); map[WS_AC] = { sid: '20200101_123', boundAt: Date.now() };
        fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
        // 假归档 sid（V4 会话库锁向量用；不落 sessions.db，硬删只会 failed 不会真删）
        const arch = JSON.parse(archBak || '{}'); arch['20200101_777'] = Date.now();
        fs.writeFileSync(ARCH, JSON.stringify(arch, null, 2));

        // V1 引用拒删：junction 引用 → 人话句、零路径
        let r = await post({ ws: [WS_TG], sid: '' });
        ck('V1 junction-refused: ok/deleted=0/1 failed', r.code === 200 && r.body.ok === true && r.body.deleted === 0 && r.body.failed.length === 1, JSON.stringify(r.body).slice(0, 200));
        ck('V1 junction-refused: err 人话+零路径', r.body.failed[0] && r.body.failed[0].err.includes('引用') && !pathish(r.body.failed[0].err), r.body.failed[0] && r.body.failed[0].err);
        ck('V1 target dir untouched', fs.existsSync(dTg), '');

        // V2 活跃拒删：map 绑定+带文件 → 人话句、零路径
        r = await post({ ws: [WS_AC], sid: '' });
        ck('V2 active-refused: ok/deleted=0/1 failed', r.code === 200 && r.body.ok === true && r.body.deleted === 0 && r.body.failed.length === 1, JSON.stringify(r.body).slice(0, 200));
        ck('V2 active-refused: err 人话+零路径', r.body.failed[0] && r.body.failed[0].err.includes('先归档或删对话再清理') && !pathish(r.body.failed[0].err), r.body.failed[0] && r.body.failed[0].err);
        ck('V2 active dir untouched', fs.existsSync(dAc), '');

        // V3 占用拒删（修前红件）：FileShare.None 锁 held.txt → rmSync 抛 EBUSY(含路径) → 回执必须人话
        const marker = path.join(FR, 'data', 'p42-lock.marker');
        try {
            lockHolder = await psHold(path.join(dLk, 'held.txt'), marker);
            r = await post({ ws: [WS_LK], sid: '' });
            ck('V3 lock-refused: ok/deleted=0/1 failed', r.code === 200 && r.body.ok === true && r.body.deleted === 0 && r.body.failed.length === 1, JSON.stringify(r.body).slice(0, 300));
            ck('V3 lock-refused: err 人话+零路径（P4-2 红绿位）', r.body.failed[0] && !pathish(r.body.failed[0].err), r.body.failed[0] && r.body.failed[0].err);
            ck('V3 locked dir untouched', fs.existsSync(dLk), '');
        } finally {
            if (lockHolder) { try { lockHolder.kill(); } catch {} }
            try { fs.unlinkSync(marker); } catch {}
        }

        // V4 会话批删异常路径：sessions.db 被锁 → hardDeleteSession 抛 → failed[].err 人话、零路径
        const marker2 = path.join(FR, 'data', 'p42-dblock.marker');
        try {
            lockHolder = await psHold(DB, marker2);
            const m = await wsSend({ type: 'delete_sessions', sessionIds: ['20200101_777'] }, 'sessions_deleted');
            const f0 = (m.failed || [])[0];
            ck('V4 db-locked: receipt deleted=0/1 failed', m.sys === 'sessions_deleted' && m.deleted === 0 && (m.failed || []).length === 1, JSON.stringify(m).slice(0, 300));
            ck('V4 db-locked: err 人话+零路径', f0 && !pathish(f0.err), f0 && f0.err);
        } finally {
            if (lockHolder) { try { lockHolder.kill(); } catch {} }
            try { fs.unlinkSync(marker2); } catch {}
        }

        ck('bridge alive after vectors', await healthz(), '');
        // 清场：junction 先摘链接再删目录；map/arch 字节级还原
        try { fs.rmdirSync(path.join(dRf, 'lnk')); } catch {}
        for (const d of [dTg, dRf, dAc, dLk]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
    } finally {
        fs.writeFileSync(MAP, mapBak);
        if (archBak !== null) fs.writeFileSync(ARCH, archBak);
        else { try { fs.unlinkSync(ARCH); } catch {} }
    }
    console.log('ws-del-err-probe: PASS=' + PASS + ' FAIL=' + FAIL);
    process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('ws-del-err-probe: ' + e.message); process.exit(1); });
