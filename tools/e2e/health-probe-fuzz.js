// fuzz 面1（22732d1/e9f04ee/166607a）：provider 健康探测 /models 畸形响应矩阵——四态判定不崩不错判。
// 沙盒自建（pfr21 同款）：假 provider /models 按 mode 播控 + 命中台账；桥 WS 触发 providers save 失效重探
// （save 无副字段=纯失效+重探，零换档零重启）。广播只在态变化时全员发 → 每例先翻基线态再进被测态（ok 态例以
// down 为基线，其余以 ok 为基线）。入站面：health 探测无客户端入站消息面——畸形 sys/providers 帧只钉「不崩」。
// 覆盖：非 JSON/真相非数组 data/5000 条超长列表/重复 id/含 \0 换行模型名（列表侧+锚侧）/302 自环（不跟随）/9s 慢响应
// （8s 超时判 down）/6s 慢响应（不误判）/空体/418/401/403/j.models 备用形状/畸形态下后续探测自愈。
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORGE = path.resolve(__dirname, '..', '..', 'forge');
const ROOT = path.join(__dirname, '..', '..', 'tmp', 'pfr22-fuzz-' + process.pid);
function freePort() { return new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
let BRIDGE_PORT = 0, PROV_PORT = 0;
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok ? '' : (why ? '  << ' + why : ''))); ok ? pass++ : fail++; };

// ---- 假 provider：/models 按 mode 播控（进程内闭包直读，含命中台账）----
let mode = 'ok';           // 初始 ok：首连探针（带 reply）落 ok 基线
let modelsHits = 0;        // 每次 setMode 清零——重定向例断言「零跟随」用
const WEIRD_TARGET = 'weird\u0000mod\nel'; // 锚侧控制字符（providers.json 池首）
function modelsBody(m) {
    switch (m) {
        case 'ok': return { body: JSON.stringify({ data: [{ id: 'fake-model' }, { id: 'other' }] }), code: 200 };
        case 'okmodels': return { body: JSON.stringify({ models: [{ name: 'fake-model' }] }), code: 200 }; // j.models 备用形状
        case 'nonjson': return { body: '<html>gateway scramble</html>', code: 200 };
        case 'dataobj': return { body: JSON.stringify({ data: {} }), code: 200 };        // 真相非数组（truthy 对象）
        case 'datastr': return { body: JSON.stringify({ data: 'fake-model' }), code: 200 }; // 真相非数组（字符串）
        case 'biglist': { const a = []; for (let i = 0; i < 4999; i++) a.push({ id: 'filler-' + i }); a.push({ id: 'fake-model' }); return { body: JSON.stringify({ data: a }), code: 200 }; }
        case 'dup': return { body: JSON.stringify({ data: [{ id: 'fake-model' }, { id: 'fake-model' }, { id: 'fake-model' }] }), code: 200 };
        case 'weirdok': return { body: JSON.stringify({ data: [{ id: 'm\nx' }, { id: 'm\u0000y' }, { id: 'fake-model' }] }), code: 200 }; // 列表侧控制字符+目标在列
        case 'weirdstale': return { body: JSON.stringify({ data: [{ id: 'm\nx' }, { id: 'm\u0000y' }] }), code: 200 }; // 全怪名不含目标
        case 'nulmodel': return { body: JSON.stringify({ data: [{ id: WEIRD_TARGET }, { id: 'x' }] }), code: 200 };    // 锚=控制字符且命中
        case 'empty200': return { body: '', code: 200 };
        case 'unauth401': return { body: '{"error":"bad key"}', code: 401 };
        case 'forbidden403': return { body: '{"error":"no"}', code: 403 };
        case 'teapot418': return { body: 'teapot', code: 418 };
        case 'redirect': return { body: '', code: 302, loc: '/models' }; // 自环 Location：http.get 不跟随 → 应恰 1 次命中判 down
        case 'slow6': return { body: JSON.stringify({ data: [{ id: 'fake-model' }] }), code: 200, delay: 6000 }; // 8s 内 → ok 不误判
        case 'slow9': return { body: JSON.stringify({ data: [{ id: 'fake-model' }] }), code: 200, delay: 9000 }; // 超时 → down
        default: return { body: JSON.stringify({ data: [{ id: 'fake-model' }] }), code: 200 };
    }
}
function startProvider() {
    const srv = http.createServer((req, res) => {
        if (req.url.startsWith('/__mode')) { // 探针控制面：GET 读 {mode,hits}；POST {mode} 设定并清零台账
            if (req.method === 'POST') { let b = ''; req.on('data', c => b += c); req.on('end', () => { mode = JSON.parse(b).mode; modelsHits = 0; res.writeHead(200); res.end('ok'); }); }
            else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ mode, hits: modelsHits })); }
            return;
        }
        if (req.url.startsWith('/models')) { // 被测面：健康探测 GET（零 token）+ goose boot 直查
            modelsHits++;
            const mb = modelsBody(mode);
            const emit = () => { if (mb.code === 302) { res.writeHead(302, { location: mb.loc }); res.end(); } else { res.writeHead(mb.code, { 'content-type': 'application/json' }); res.end(mb.body); } };
            if (mb.delay) setTimeout(emit, mb.delay); else emit();
            return;
        }
        // /chat/completions：goose boot/keepalive 用，最简 SSE
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
            const chunk = (delta, fin) => 'data: ' + JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'fake-model', choices: [{ index: 0, delta, finish_reason: fin }] }) + '\n\n';
            res.write(chunk({ role: 'assistant', content: '收到，已记录。' }, null));
            res.write(chunk({}, 'stop'));
            res.write('data: [DONE]\n\n');
            res.end();
        });
    });
    return new Promise(r => srv.listen(PROV_PORT, '127.0.0.1', () => r(srv)));
}

// ---- 裸 WS 客户端（ws-subscribe-race-probe 同款：head 首帧即刻解析）----
function mkClient(port) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + port } });
        req.on('upgrade', (res, socket, head) => {
            const c = { socket, inbox: [], waiters: [] };
            c.send = o => socket.write(frame(o));
            c.waitUntil = (pred, ms, tag) => new Promise((res2, rej2) => {
                for (let i = 0; i < c.inbox.length; i++) if (pred(c.inbox[i])) { return res2(c.inbox.splice(i, 1)[0]); }
                const w = { pred, res: res2, rej: rej2, timer: setTimeout(() => { const ix = c.waiters.indexOf(w); if (ix >= 0) c.waiters.splice(ix, 1); rej2(new Error('timeout: ' + tag)); }, ms || 30000) };
                c.waiters.push(w);
            });
            const dispatch = m => { for (let i = 0; i < c.waiters.length; i++) { if (c.waiters[i].pred(m)) { const w = c.waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.res(m); return; } } c.inbox.push(m); };
            let buf = Buffer.from(head || []);
            const pump = () => {
                while (buf.length >= 2) {
                    const op = buf[0] & 0x0f;
                    let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
                    else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
                    if (buf.length < off + len) return;
                    const pl = buf.slice(off, off + len); buf = buf.slice(off + len);
                    if (op !== 0x1) continue;
                    let m; try { m = JSON.parse(pl.toString('utf8')); } catch { continue; }
                    dispatch(m);
                }
            };
            socket.on('data', d => { buf = Buffer.concat([buf, d]); pump(); });
            pump();
            socket.on('close', () => { for (const w of c.waiters.splice(0)) { clearTimeout(w.timer); try { w.rej(new Error('socket closed')); } catch {} } });
            socket.on('error', () => { });
            c.waitUntil(m => m.sys === 'hello' && m.caps && m.caps.modes, 45000, 'hello/ACP ready').then(() => resolve(c), reject);
        });
        req.on('error', e => reject(e));
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

const setMode = m => new Promise(r => { const q = http.request({ host: '127.0.0.1', port: PROV_PORT, path: '/__mode', method: 'POST' }, res => { res.resume(); res.on('end', () => r()); }); q.end(JSON.stringify({ mode: m })); });
const getHits = () => new Promise(r => http.get({ host: '127.0.0.1', port: PROV_PORT, path: '/__mode' }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r(JSON.parse(b).hits)); }));
const saveTrigger = c => c.send({ type: 'providers', save: true }); // 无副字段=纯失效+重探（模板 :3485）
const expectFrame = async (c, state, kind, tag, ms) => { const f = await c.waitUntil(m => m.sys === 'health' && m.state === state && (kind ? m.kind === kind : m.kind === undefined), ms || 25000, 'health ' + tag); return f; };
// 广播只在态变化时发（态不变仅 reply 触发方，save 失效重探无 reply）→ 被测态若与当前态相同须先翻到相异态再进被测态。
let curState = null; // {state, kind} 最近一次确认帧
async function probeCase(C, m, state, kind, tag, extra) {
    const want = JSON.stringify({ state, kind: kind || null });
    if (JSON.stringify(curState) === want) {
        const base = (state === 'ok') ? 'teapot418' : 'ok';
        await setMode(base); saveTrigger(C);
        await expectFrame(C, base === 'ok' ? 'ok' : 'down', null, 'baseline-' + tag);
    }
    await setMode(m); const t0 = Date.now(); saveTrigger(C);
    const f = await expectFrame(C, state, kind, tag, extra && extra.ms);
    curState = { state, kind: kind || null };
    ck(tag + '（state=' + f.state + (f.kind ? '+key' : '') + '）', true);
    const el = Date.now() - t0;
    if (extra && extra.maxMs) ck(tag + '（耗时 ' + el + 'ms 有界）', el < extra.maxMs, 'elapsed=' + el);
    if (extra && extra.hits === 1) { const h = await getHits(); ck(tag + '（/models 恰 1 次命中，零跟随零循环）', h === 1, 'hits=' + h); }
}

const PROV_FILE = () => path.join(ROOT, 'data', 'providers.json');
const writeProv = list => fs.writeFileSync(PROV_FILE(), JSON.stringify(list, null, 2));
const healthz = () => new Promise(r => http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path: '/healthz' }, res => { res.resume(); res.on('end', () => r(res.statusCode === 200)); }).on('error', () => r(false)));

let bridge = null, prov = null, C = null;
(async () => {
    BRIDGE_PORT = await freePort(); PROV_PORT = await freePort();
    console.log('sandbox ports: bridge=' + BRIDGE_PORT + ' provider=' + PROV_PORT);
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.join(ROOT, 'bin', 'goose', 'goose-package'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.linkSync(path.join(FORGE, 'bin', 'goose', 'goose-package', 'goose.exe'), path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe'));
    writeProv([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake22', models: ['fake-model'], active: true }]);
    prov = await startProvider();
    bridge = spawn(process.execPath, [path.join(FORGE, 'bin', 'chat-bridge.js')], { env: { ...process.env, FORGE_ROOT: ROOT, PORT: String(BRIDGE_PORT), NO_PROXY: '127.0.0.1,localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
    bridge.stderr.on('data', d => process.stderr.write('[bridge] ' + d));
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('bridge healthz 45s 未就绪')), 45000); const ping = () => http.get({ host: '127.0.0.1', port: BRIDGE_PORT, path: '/healthz' }, r => { if (r.statusCode === 200) { clearTimeout(t); res(); } else setTimeout(ping, 500); }).on('error', () => setTimeout(ping, 500)); ping(); });
    ck('F1 沙盒桥起活（healthz 200，不碰 dev 树 8790）', true);
    C = await mkClient(BRIDGE_PORT);
    const f0 = await C.waitUntil(m => m.sys === 'health', 30000, 'initial health frame');
    curState = { state: 'ok', kind: null };
    ck('F2 首连探测必答（e9f04ee P1-1 reply 必答）：初始 ok 帧到达', f0.state === 'ok', JSON.stringify(f0));

    // ===== /models 畸形响应 → 四态判定矩阵 =====
    await probeCase(C, 'nonjson', 'down', null, 'F3 非 JSON 体 200 判 down 不崩');
    await probeCase(C, 'dataobj', 'down', null, 'F4 data 为对象（真相非数组）判 down 不崩');
    await probeCase(C, 'datastr', 'down', null, 'F5 data 为字符串（真相非数组）判 down 不崩');
    await probeCase(C, 'biglist', 'ok', null, 'F6 5000 条超长列表命中判 ok（尾位目标不丢）');
    await probeCase(C, 'dup', 'ok', null, 'F7 重复 id 列表判 ok');
    await probeCase(C, 'weirdok', 'ok', null, 'F8 列表含 \\0/换行名+目标在列判 ok');
    await probeCase(C, 'weirdstale', 'stale-model', null, 'F9 列表全怪名不含目标判 stale-model');
    await probeCase(C, 'empty200', 'down', null, 'F10 空体 200 判 down');
    await probeCase(C, 'teapot418', 'down', null, 'F11 418 判 down（无 key 档）');
    await probeCase(C, 'unauth401', 'down', 'key', 'F12 401 判 down+key');
    await probeCase(C, 'forbidden403', 'down', 'key', 'F13 403 判 down+key');
    await probeCase(C, 'okmodels', 'ok', null, 'F14 j.models 备用形状判 ok');
    await probeCase(C, 'redirect', 'down', null, 'F15 302 自环判 down（不跟随）', { hits: 1 });
    await probeCase(C, 'slow9', 'down', null, 'F16 9s 慢响应按 8s 超时判 down', { ms: 30000, maxMs: 20000 });
    await probeCase(C, 'slow6', 'ok', null, 'F17 6s 慢响应（8s 内）判 ok 不误判', { ms: 30000, maxMs: 15000 });
    // 锚侧控制字符：providers 池首含 \0/换行 → 精确匹配不崩不错判
    writeProv([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake22', models: [WEIRD_TARGET], active: true }]);
    await probeCase(C, 'nulmodel', 'ok', null, 'F18 锚模型含 \\0/换行且列表精确命中判 ok');
    writeProv([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake22', models: ['fake-model'], active: true }]);

    // ===== 入站面：探测无客户端入站消息面——畸形 sys/health 与 providers 保存垃圾只钉「不崩+可自愈」=====
    C.send({ sys: 'health' }); C.send({ sys: 'health', state: 'ok', kind: 'key' }); C.send({ sys: 42 }); C.send({ type: 42 });
    await new Promise(r => setTimeout(r, 800));
    ck('F19 畸形入站 sys/health 帧被忽略不崩（无入站探测面钉子）', await healthz());
    C.send({ type: 'providers', save: true, add: 'garbage-string' });
    C.send({ type: 'providers', save: true, add: 42 });
    C.send({ type: 'providers', save: true, add: { name: 42, host: 1, models: 'x' } });
    C.send({ type: 'providers', save: true, update: 'str' });
    C.send({ type: 'providers', save: true, remove: [1] });
    await new Promise(r => setTimeout(r, 1500));
    ck('F20 providers 保存垃圾形态不崩（add/update/remove 类型混淆）', await healthz());
    // 自愈：脏档落盘后恢复干净档 + save 失效重探 → ok 帧照常到达
    await setMode('ok');
    writeProv([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake22', models: ['fake-model'], active: true }]);
    saveTrigger(C);
    const f21 = await C.waitUntil(m => m.sys === 'health' && m.state === 'ok', 25000, 'heal ok');
    ck('F21 脏档后恢复+重探自愈：ok 帧到达（畸形态不留死档）', f21.state === 'ok');

    try { C.socket.destroy(); } catch {}
})().catch(e => {
    console.error('PROBE ERROR:', e.message);
    ck('探针自身未异常', false, e.stack && e.stack.split('\n')[0]);
}).finally(() => {
    if (bridge) { try { spawn('taskkill', ['/pid', String(bridge.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {} }
    setTimeout(() => { try { prov && prov.close(); } catch {} try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} }, 1500);
    console.log('health-probe-fuzz: PASS=' + pass + ' FAIL=' + fail);
    if (fail) process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 1800);
});
