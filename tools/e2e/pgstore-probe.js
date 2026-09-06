// s73 切片1（裁决 2026-09-06-pg-forge-backend）: 存储层「pg 不可达→回落文件」黑盒探针。
// 方法：拉起第二个桥实例（PF_PG_PORT=1 不可路由端口，不真停 pg/不动共享状态——探针无 stats bump 即不写 stats 文件），
// 断言：healthz 秒级就绪（启动绝不等待 PG）、30s 重探触发首连、connecting→file ≤4s（connect_timeout 2s，research/10 实测 2004ms）、
// 回落后 healthz 仍 200 且 /api/stats pg=file。结束 taskkill /T 杀整棵进程树（含 acp 子进程，防孤儿）。
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const ROOT = path.resolve(__dirname, '..', '..', 'forge');
const NODE = path.join(ROOT, 'bin', 'node-v22', 'node-v22.21.1-win-x64', 'node.exe');
const PROBE_PORT = Number(process.env.PF_PROBE_PORT || 18790);

function portFree(p) {
    return new Promise(res => {
        const s = net.connect(p, '127.0.0.1');
        s.on('error', () => res(true));
        s.on('connect', () => { s.destroy(); res(false); });
    });
}
function httpJson(p, path_) {
    return new Promise(res => {
        const s = net.connect(p, '127.0.0.1', () => {
            s.write('GET ' + path_ + ' HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n'); // HTTP/1.0：禁 chunked，close 即全文
        });
        let b = '';
        s.on('data', d => b += d);
        s.on('error', () => res(null));
        s.on('close', () => {
            const m = b.match(/\r\n\r\n([\s\S]*)$/);
            if (!m) return res(null);
            try { res({ code: Number((b.match(/^HTTP\/1\.\d (\d+)/) || [])[1] || 0), body: m[1] }); }
            catch { res(null); }
        });
        setTimeout(() => { s.destroy(); res(null); }, 3000);
    });
}

(async () => {
    if (!(await portFree(PROBE_PORT))) { console.log('probe port busy, skip'); process.exit(0); } // 不与真栈抢端口：让位而非误报
    const t0 = Date.now();
    const child = spawn(NODE, [path.join(ROOT, 'bin', 'chat-bridge.js')], {
        env: { ...process.env, FORGE_ROOT: ROOT, PORT: String(PROBE_PORT), PF_PG_PORT: '1', NO_PROXY: '127.0.0.1,localhost' },
        stdio: 'ignore',
    });
    const cleanup = () => { try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
    process.on('exit', cleanup);
    let fail = '';
    try {
        // 1) healthz 秒级（启动不等 PG——PF_PG_PORT=1 若在启动路径上必超时拖延）
        let tHealthz = 0;
        for (let i = 0; i < 100; i++) {
            const r = await httpJson(PROBE_PORT, '/healthz');
            if (r && r.code === 200) { tHealthz = Date.now() - t0; break; }
            await new Promise(r => setTimeout(r, 200));
        }
        if (!tHealthz) throw new Error('healthz not ready in 20s');
        console.log('PASS healthz ready in ' + tHealthz + 'ms (boot does not wait for PG)');
        if (tHealthz > 10000) throw new Error('healthz too slow: ' + tHealthz + 'ms');

        // 2) 模式机：等 30s 重探首连（connecting）→ file（≤4s：connect_timeout 2s + 余量）
        let tConnecting = 0, tFile = 0;
        for (let i = 0; i < 220; i++) { // 上限 55s
            const r = await httpJson(PROBE_PORT, '/api/stats');
            let mode = '';
            try { mode = JSON.parse(r && r.body || '{}').pg || ''; } catch {}
            if (!tConnecting && mode === 'connecting') { tConnecting = Date.now(); console.log('connecting at +' + (tConnecting - t0) + 'ms (probe tick)'); }
            if (mode === 'file') { tFile = Date.now(); break; }
            await new Promise(r => setTimeout(r, 250));
        }
        if (!tFile) throw new Error('never reached file mode in 55s');
        const dt = tConnecting ? tFile - tConnecting : 0;
        console.log('PASS fallback to file at +' + (tFile - t0) + 'ms' + (dt ? ', connect attempt lasted ' + dt + 'ms' : ' (refusal instant, connecting unsampleable)'));
        if (tFile - t0 > 40000) throw new Error('fallback too slow: ' + (tFile - t0) + 'ms (30s tick + 2s timeout + margin)'); // ECONNREFUSED 即时回落；CONNECT_TIMEOUT 路径 ≤2s 由 research/10 实测+本切片复测兜底
        if (dt > 4000) throw new Error('connect attempt too slow: ' + dt + 'ms (expect <=2s timeout + margin)');

        // 3) 回落态桥活着的最终断言
        const h = await httpJson(PROBE_PORT, '/healthz');
        const s = await httpJson(PROBE_PORT, '/api/stats');
        const mode = JSON.parse(s.body).pg;
        if (!(h && h.code === 200)) throw new Error('healthz not 200 after fallback');
        if (mode !== 'file') throw new Error('pg mode is ' + mode + ', expected file');
        console.log('PASS degraded state: healthz 200, pg=file');
        console.log('PROBE-OK');
    } catch (e) {
        fail = e.message;
        console.log('FAIL: ' + fail);
    } finally {
        cleanup();
        setTimeout(() => process.exit(fail ? 1 : 0), 500); // 给 taskkill 一拍
    }
})();
