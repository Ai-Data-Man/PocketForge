// s94 F-2 探针（裁决 s94 findings F-2，主控修复批）：list_models/test_model 回落链 + 非 200 诚实报错。
// 沙盒自建（ws-subscribe-race-probe 同款骨架）：假 provider 播控 /models 状态 + 桥独立端口 spawn，绝不碰 dev 树 :8790。
// 背景（ia1 实锤）：新装机「保存→拉取」= 恒 0 个模型——表单 key 被清（安全设计）、secrets 是启动快照没跟上、
// 401 错误体无 data 字段被映射成空 models 假成功。修后断言：
//   M1 无 host/key → 回落盘上活跃档案 → models 帧有货
//   M2 host 带 key:''（前端实际形态）→ 回落档案 key → models 帧
//   M3 显式坏 key + 401 → sys:error 拉取失败：HTTP 401（不再伪装成 0 个模型）
//   M4 200 但 data 非数组 → sys:error 解析失败（仅 200+数组才发 models 帧）
//   M5 j.models 备用形状 → models 帧
//   M6 secrets 快照档（无 providers.json）→ 仍能拉（三级回落末段不回归）
//   M7/M8 test_model 回落链同款 + 坏 key 诚实 ok:false
//   B1/B2 模板锚（F-4a spawnAcp NO_PROXY 注入——机理=hyper-util 0.1.20 matcher from_system 先读 env NO_PROXY
//        再叠注册表代理、intercept 首查 no.contains；ia1 实锤 goose 默认吃 IE 代理）
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORGE = path.resolve(__dirname, '..', '..', 'forge');
const ROOT = path.join(__dirname, '..', '..', 'tmp', 's94-e2e-mf-' + process.pid);
function freePort() { return new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
let BRIDGE_PORT = 0, PROV_PORT = 0;
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok ? '' : (why ? '  << ' + why : ''))); ok ? pass++ : fail++; };

let mode = 'ok';
function startProvider() {
    const srv = http.createServer((req, res) => {
        if (req.url.startsWith('/__mode')) {
            if (req.method === 'POST') { let b = ''; req.on('data', c => b += c); req.on('end', () => { mode = JSON.parse(b).mode; res.writeHead(200); res.end('ok'); }); }
            else { res.writeHead(200); res.end(mode); }
            return;
        }
        const auth = req.headers.authorization || '';
        if (req.url.startsWith('/models')) {
            if (mode === 'unauth401' || auth === 'Bearer sk-bad') { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"invalid api key"}'); return; }
            if (mode === 'dataobj') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"data":{}}'); return; }
            if (mode === 'okmodels') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"models":[{"name":"fake-model"}]}'); return; }
            res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"data":[{"id":"fake-model"},{"id":"other"}]}');
            return;
        }
        // /chat/completions：SSE（坏 key 401——test_model 诚实报码用）
        if (auth === 'Bearer sk-bad') { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"invalid api key"}'); return; }
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
            const chunk = (delta, fin) => 'data: ' + JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'fake-model', choices: [{ index: 0, delta, finish_reason: fin }] }) + '\n\n';
            res.write(chunk({ role: 'assistant', content: 'ok' }, null));
            res.write(chunk({}, 'stop'));
            res.write('data: [DONE]\n\n');
            res.end();
        });
    });
    return new Promise(r => srv.listen(PROV_PORT, '127.0.0.1', () => r(srv)));
}
const setMode = m => new Promise(r => { const q = http.request({ host: '127.0.0.1', port: PROV_PORT, path: '/__mode', method: 'POST' }, res => { res.resume(); res.on('end', () => r()); }); q.end(JSON.stringify({ mode: m })); });

function mkClient(port) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + port } });
        req.on('upgrade', (res, socket, head) => {
            const c = { socket, inbox: [], waiters: [] };
            c.send = o => socket.write(frame(o));
            c.waitUntil = (pred, ms, tag) => new Promise((res2, rej2) => {
                for (let i = 0; i < c.inbox.length; i++) if (pred(c.inbox[i])) return res2(c.inbox.splice(i, 1)[0]);
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
const kill = c => { try { if (c && c.socket) c.socket.destroy(); } catch {} };
const nextModelsOrError = (c, tag) => c.waitUntil(m => m.sys === 'models' || m.sys === 'error', 15000, tag);
const nextTestResult = (c, tag) => c.waitUntil(m => m.sys === 'test_result' || m.sys === 'error', 20000, tag);

let bridge = null, prov = null;
const spawnBridge = (port) => spawn(process.execPath, [path.join(FORGE, 'bin', 'chat-bridge.js')], { env: { ...process.env, FORGE_ROOT: ROOT, PORT: String(port), NO_PROXY: '127.0.0.1,localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
const waitHealthz = (port) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('bridge healthz 45s 未就绪')), 45000); const ping = () => http.get({ host: '127.0.0.1', port, path: '/healthz' }, r => { if (r.statusCode === 200) { clearTimeout(t); res(); } else setTimeout(ping, 500); }).on('error', () => setTimeout(ping, 500)); ping(); });

(async () => {
    BRIDGE_PORT = await freePort(); PROV_PORT = await freePort();
    console.log('sandbox ports: bridge=' + BRIDGE_PORT + ' provider=' + PROV_PORT);
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.join(ROOT, 'bin', 'goose', 'goose-package'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.linkSync(path.join(FORGE, 'bin', 'goose', 'goose-package', 'goose.exe'), path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe'));
    fs.writeFileSync(path.join(ROOT, 'data', 'providers.json'), JSON.stringify([{ name: 'fake', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-fake22', models: ['fake-model'], active: true }]));
    prov = await startProvider();
    bridge = spawnBridge(BRIDGE_PORT);
    bridge.stderr.on('data', d => process.stderr.write('[bridge] ' + d));
    await waitHealthz(BRIDGE_PORT);
    ck('S1 沙盒桥起活（healthz 200，不碰 dev 树 8790）', true);
    const C = await mkClient(BRIDGE_PORT);

    // M1 无 host/key → 回落盘上活跃档案（ia1 缺陷主形态：保存后表单 key 空 + secrets 快照旧）
    C.send({ type: 'list_models' });
    let f = await nextModelsOrError(C, 'M1 models');
    ck('M1 list_models 无 host/key → 回落盘上档案 → models 帧有货', f.sys === 'models' && Array.isArray(f.models) && f.models.includes('fake-model'), JSON.stringify(f).slice(0, 120));

    // M2 host 显式 + key 空串（前端实际发的形态）→ 回落档案 key
    C.send({ type: 'list_models', host: 'http://127.0.0.1:' + PROV_PORT, key: '' });
    f = await nextModelsOrError(C, 'M2 models');
    ck('M2 list_models key 空串 → 回落档案 key → models 帧有货', f.sys === 'models' && f.models.includes('fake-model'), JSON.stringify(f).slice(0, 120));

    // M3 显式坏 key → 401 → sys:error 拉取失败：HTTP 401（修前：401 体无 data → models:[] 假成功）
    await setMode('ok');
    C.send({ type: 'list_models', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-bad' });
    f = await nextModelsOrError(C, 'M3 401 error');
    ck('M3 坏 key 401 → 诚实报「拉取失败：服务商回了 HTTP 401」', f.sys === 'error' && f.text === '拉取失败：服务商回了 HTTP 401', JSON.stringify(f).slice(0, 120));

    // M3b 服务商侧 401（mode 播控，key 正常走档案）→ 同样诚实报
    await setMode('unauth401');
    C.send({ type: 'list_models' });
    f = await nextModelsOrError(C, 'M3b 401 error');
    ck('M3b 服务商 401（档案 key 打过去被拒）→ 同款诚实报错', f.sys === 'error' && f.text === '拉取失败：服务商回了 HTTP 401', JSON.stringify(f).slice(0, 120));
    await setMode('ok');

    // M4 200 但 data 非数组 → 解析失败错误（仅 200+data/models 数组才发 models 帧）
    await setMode('dataobj');
    C.send({ type: 'list_models' });
    f = await nextModelsOrError(C, 'M4 dataobj');
    ck('M4 200 data 非数组 → 报解析失败不发空 models', f.sys === 'error' && /解析失败/.test(f.text), JSON.stringify(f).slice(0, 120));
    await setMode('ok');

    // M5 j.models 备用形状
    await setMode('okmodels');
    C.send({ type: 'list_models' });
    f = await nextModelsOrError(C, 'M5 okmodels');
    ck('M5 j.models 备用形状 → models 帧', f.sys === 'models' && f.models.includes('fake-model'), JSON.stringify(f).slice(0, 120));
    await setMode('ok');

    // M7/M8 test_model 回落链 + 诚实报码
    C.send({ type: 'test_model' });
    let t = await nextTestResult(C, 'M7 test_result');
    ck('M7 test_model 无 host/key/model → 回落档案（model=池首）→ ok:true', t.sys === 'test_result' && t.ok === true && t.model === 'fake-model', JSON.stringify(t).slice(0, 140));
    C.send({ type: 'test_model', host: 'http://127.0.0.1:' + PROV_PORT, key: 'sk-bad', model: 'fake-model' });
    t = await nextTestResult(C, 'M8 test_result');
    ck('M8 test_model 坏 key → ok:false + http 401 诚实报码', t.sys === 'test_result' && t.ok === false && t.http === 401, JSON.stringify(t).slice(0, 140));
    kill(C);

    // M6 secrets 快照档：清掉 providers.json、预写 secrets.env，另起一座桥（secrets 是启动快照，须先写盘再 spawn）
    fs.rmSync(path.join(ROOT, 'data', 'providers.json'), { force: true });
    fs.writeFileSync(path.join(ROOT, 'data', 'secrets.env'), 'FORGE_AGENT_API_KEY=sk-fake22\nFORGE_AGENT_HOST=http://127.0.0.1:' + PROV_PORT + '\nGOOSE_MODEL_NAME=fake-model\n');
    const P2 = await freePort();
    const bridge2 = spawnBridge(P2);
    bridge2.stderr.on('data', d => process.stderr.write('[bridge2] ' + d));
    await waitHealthz(P2);
    const C2 = await mkClient(P2);
    C2.send({ type: 'list_models' });
    f = await nextModelsOrError(C2, 'M6 models');
    ck('M6 无档案 → secrets 快照档回落不回归 → models 帧有货', f.sys === 'models' && f.models.includes('fake-model'), JSON.stringify(f).slice(0, 120));
    kill(C2);
    try { bridge2.kill(); } catch {}

    // M9（qa s94 复审 P4-5）：退化档（空 host/key 回落 secrets）保存去重——sig2 若用裸档案值就与
    // spawnAcp 落地 env（三级回落后的值）恒分叉，该档每次保存都白热重启一次（provider_switched 广播）；
    // 修后 sig2 与 lastSpawnEnv 同源，两连保存零重启
    fs.writeFileSync(path.join(ROOT, 'data', 'providers.json'), JSON.stringify([{ name: 'degraded', host: '', key: '', models: ['fake-model'], active: true }]));
    const P3 = await freePort();
    const bridge3 = spawnBridge(P3);
    bridge3.stderr.on('data', d => process.stderr.write('[bridge3] ' + d));
    await waitHealthz(P3);
    const C3 = await mkClient(P3);
    let restarts = 0;
    for (let i = 0; i < 2; i++) {
        C3.send({ type: 'providers', save: 1, update: { name: 'degraded', host: '', models: ['fake-model'] } });
        const f = await C3.waitUntil(m => m.sys === 'provider_switched', 12000, 'M9 settle').catch(() => null);
        if (f) restarts++;
    }
    ck('M9 退化档（空 host/key 回落 secrets）两连保存零热重启（env 指纹同源去重）', restarts === 0, 'provider_switched=' + restarts);
    kill(C3);
    try { bridge3.kill(); } catch {}

    // ===== 模板锚（静态）=====
    const bridgeSrc = fs.readFileSync(path.join(FORGE, 'conf', 'templates', 'chat-bridge.tpl.js'), 'utf8');
    ck('B1 F-4a spawnAcp 注入 NO_PROXY（env 优先于注册表代理的机理：hyper-util from_system 先读 env NO_PROXY）', /let noProxy = \(process\.env\.NO_PROXY \|\| process\.env\.no_proxy \|\| ''\)\.trim\(\);/.test(bridgeSrc) && /env\.no_proxy = noProxy;/.test(bridgeSrc));
    ck('B2 F-4a hostIsRemote 本机域不注入 + F-4c 探测代理旗远端收窄', /function hostIsRemote\(hn\)/.test(bridgeSrc) && /hostIsRemote\(probeHn\)/.test(bridgeSrc) && /hostIsRemote\(hn\)/.test(bridgeSrc));

    console.log('model-fallback-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('model-fallback-probe: FATAL', e.message); process.exit(1); });
process.on('exit', () => { try { if (bridge) bridge.kill(); } catch {} try { if (prov) prov.close(); } catch {} try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });
