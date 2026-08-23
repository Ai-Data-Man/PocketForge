// PocketForge chat bridge v2: goose ACP (stdio JSON-RPC) <-> WebSocket browser client.
// Channel model: client `rpc` messages pass through to ACP; all ACP notifications
// broadcast to clients (tagged with sessionId). Plus convenience: session registry
// maps ws<->acp session for prompt routing. Zero deps (node built-ins).
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.FORGE_ROOT || path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8790);
const GOOSE = path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe');
const PAGE = path.join(ROOT, 'conf', 'templates', 'chat.tpl.html');

function readSecrets(file) {
    const out = {};
    try {
        const raw = require('fs').readFileSync(file, 'utf8');
        for (const rawLine of raw.split('\n')) {
            const line = rawLine.trim();
            const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (m && m[2] !== '') out[m[1]] = m[2];
        }
    } catch {}
    return out;
}
const secrets = readSecrets(path.join(ROOT, 'data', 'secrets.env'));

// ---- provider profiles (data/providers.json v2): [{name,host,key,models[],active}] ----
const PROV_FILE = path.join(ROOT, 'data', 'providers.json');
function readProviders() {
    let list = [];
    try { list = JSON.parse(require('fs').readFileSync(PROV_FILE, 'utf8')); } catch { return []; }
    // v1->v2 迁移：model(单值) -> models(数组)
    for (const p of list) {
        if (!Array.isArray(p.models)) p.models = p.model ? [p.model] : [];
        delete p.model;
    }
    return list;
}
function writeProviders(list) { require('fs').writeFileSync(PROV_FILE, JSON.stringify(list, null, 2)); }
function activeProvider() {
    const list = readProviders();
    return list.find(p => p.active) || null;
}

let acp = null;
let acpBuf = '';
let nextId = 1;
const waiting = new Map();
const allClients = new Set();
const sessionClients = new Map();
const wsSession = new WeakMap();

function spawnAcp() {
    const act = activeProvider();
    const env = {
        ...process.env,
        GOOSE_PATH_ROOT: path.join(ROOT, 'conf', 'goose'),
        GOOSE_DISABLE_KEYRING: '1',
        GOOSE_TELEMETRY_ENABLED: 'false',
        GOOSE_MODE: 'auto',
        GOOSE_PROVIDER: 'openai',
        GOOSE_MODEL: (act && act.models && act.models[0]) || secrets.GOOSE_MODEL_NAME || 'myopencode/glm-5.2',
        OPENAI_API_KEY: (act && act.key) || secrets.FORGE_AGENT_API_KEY || process.env.OPENAI_API_KEY,
        OPENAI_HOST: (act && act.host) || secrets.FORGE_AGENT_HOST || process.env.OPENAI_HOST,
        OPENAI_BASE_PATH: 'chat/completions',
    };
    const child = spawn(GOOSE, ['acp'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => onAcpData(chunk));
    child.stderr.on('data', d => process.stderr.write('[acp] ' + d));
    child.on('exit', c => {
        console.log('acp exited', c);
        if (child === acp) process.exit(1);
    });
    return child;
}
acp = spawnAcp();

function onAcpData(chunk) {
    acpBuf += chunk.toString('utf8');
    let idx;
    while ((idx = acpBuf.indexOf('\n')) !== -1) {
        const line = acpBuf.slice(0, idx).trim();
        acpBuf = acpBuf.slice(idx + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && waiting.has(msg.id)) {
            const w = waiting.get(msg.id); waiting.delete(msg.id);
            if (w.resolve) { w.resolve(msg.result !== undefined ? msg.result : msg); }
            else if (w.ws && w.ws.alive) w.ws.send({ rpc: msg });
            continue;
        }
        if (msg.method) {
            const sid = msg.params && msg.params.sessionId;
            const set = sid ? sessionClients.get(sid) : null;
            const obj = { agent: msg };
            if (set && set.size) for (const ws of set) ws.send(obj);
            else for (const ws of allClients) ws.send(obj);
        }
    }
}

async function init() {
    acpBuf = '';
    const res = await new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { ws: null, resolve, reject });
        acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } } }) + '\n');
        setTimeout(() => reject(new Error('initialize timeout')), 20000);
    });
    acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n');
    console.log('ACP initialized:', res.agentInfo && res.agentInfo.name, '| provider:', (activeProvider() || {}).name || 'secrets.env', '| model:', env0Model());
    acpCaps = res;
}
function env0Model() {
    const act = activeProvider();
    return (act && act.models && act.models[0]) || secrets.GOOSE_MODEL_NAME || '';
}
let acpCaps = null;
init().catch(e => { console.error('init failed', e); process.exit(1); });

// ---- 热重启：切换 provider 档案后重建 acp 子进程（保留会话 DB，客户端 reconnect 后 session/load 恢复） ----
async function hotRestartProvider() {
    const oldChild = acp;
    try { oldChild.removeAllListeners('exit'); oldChild.kill(); } catch {}
    waiting.clear();
    sessionClients.clear();
    acp = spawnAcp();
    await init();
    for (const ws of allClients) ws.send({ sys: 'provider_switched', provider: (activeProvider() || {}).name, model: env0Model() });
}

const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/' ) {
        const html = require('fs').readFileSync(PAGE, 'utf8').replace('__FORGE_ROOT__', ROOT.split(String.fromCharCode(92)).join('/'));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
    } else if (url === '/healthz') { res.writeHead(200); res.end('ok'); }
    else if (url === '/api/skills') {
        // scan .agents/skills/*/SKILL.md (project) + conf/goose/config/skills (global-ish)
        const out = [];
        const dirs = [path.join(ROOT, '.agents', 'skills')];
        for (const d of dirs) {
            try {
                for (const ent of require('fs').readdirSync(d, { withFileTypes: true })) {
                    if (!ent.isDirectory()) continue;
                    const f = path.join(d, ent.name, 'SKILL.md');
                    try {
                        const raw = require('fs').readFileSync(f, 'utf8');
                        const nl = String.fromCharCode(10);
                        const lines = raw.split(nl);
                        let meta = {}; const bodyLines = [];
                        let inFm = false, fmDone = false, fmMulti = null;
                        for (const line of lines) {
                            if (!fmDone && line.trim() === '---') { if (inFm) { fmDone = true; continue; } inFm = true; continue; }
                            if (inFm && !fmDone) {
                                const mm = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
                                if (mm) {
                                    if (mm[2] === '|' || mm[2] === '>') { fmMulti = mm[1]; continue; }
                                    meta[mm[1]] = mm[2];
                                } else if (fmMulti && /^\s+\S/.test(line)) {
                                    meta[fmMulti] = (meta[fmMulti] ? meta[fmMulti] + ' ' : '') + line.trim();
                                } else { fmMulti = null; }
                            } else if (fmDone) bodyLines.push(line);
                        }
                        const body = bodyLines.join(nl).trim();
                        out.push({ name: ent.name, description: (meta.description || '').replace(/^['\"]|['\"]$/g, ''), body: body.slice(0, 4000), path: f });
                    } catch {}
                }
            } catch {}
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
    }
    else { res.writeHead(404); res.end(); }
});

server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return socket.destroy();
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);
    const ws = { socket, send: obj => writeFrame(socket, obj), alive: true };
    allClients.add(ws);
    let buf = Buffer.alloc(0);
    socket.on('data', d => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
            const op = buf[0] & 0x0f;
            const masked = (buf[1] & 0x80) !== 0;
            let len = buf[1] & 0x7f, off = 2;
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            const maskKey = masked ? buf.slice(off, off + 4) : null;
            if (masked) off += 4;
            if (buf.length < off + len) return;
            let payload = buf.slice(off, off + len);
            if (maskKey) payload = Buffer.from(payload.map((b, i) => b ^ maskKey[i % 4]));
            buf = buf.slice(off + len);
            if (op === 0x1) {
                let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch { continue; }
                handleClient(ws, msg);
            } else if (op === 0x8) { drop(ws); socket.destroy(); }
            else if (op === 0x9) writeRaw(socket, 0x8a, payload);
        }
    });
    socket.on('error', () => drop(ws));
    socket.on('close', () => drop(ws));
    ws.send({ sys: 'hello', version: 2, caps: acpCaps ? { modes: true } : {} });
});
function drop(ws) {
    ws.alive = false;
    allClients.delete(ws);
    for (const set of sessionClients.values()) set.delete(ws);
}
function writeRaw(socket, op, payload) {
    const len = payload.length;
    let header;
    if (len < 126) header = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | op; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | op; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    socket.write(Buffer.concat([header, payload]));
}
function writeFrame(socket, obj) { try { writeRaw(socket, 0x1, Buffer.from(JSON.stringify(obj), 'utf8')); } catch {} }

function handleClient(ws, msg) {
    try {
        if (msg.sys === 'ping') return ws.send({ sys: 'pong' });

        // generic passthrough: {type:'rpc', method, params} -> ACP request; response routed back to this ws
        if (msg.type === 'rpc') {
            const id = nextId++;
            waiting.set(id, { ws });
            acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: msg.method, params: msg.params || {} }) + '\n');
            return;
        }

        if (msg.type === 'subscribe') {
            // start or attach to a session; msg.sessionId null = new session
            if (msg.sessionId) {
                wsSession.set(ws, msg.sessionId);
                if (!sessionClients.has(msg.sessionId)) sessionClients.set(msg.sessionId, new Set());
                sessionClients.get(msg.sessionId).add(ws);
                ws.send({ sys: 'subscribed', sessionId: msg.sessionId, modes: [], configOptions: [] });
            } else {
                const id = nextId++;
                waiting.set(id, { ws: null, resolve: (res) => {
                    if (res && res.sessionId) {
                        wsSession.set(ws, res.sessionId);
                        if (!sessionClients.has(res.sessionId)) sessionClients.set(res.sessionId, new Set());
                        sessionClients.get(res.sessionId).add(ws);
                        ws.send({ sys: 'subscribed', sessionId: res.sessionId, newSession: true, modes: res.modes || [], configOptions: res.configOptions || [] });
                    }
                }});
                acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'session/new', params: { cwd: ROOT, mcpServers: [] } }) + '\n');
            }
            return;
        }

        if (msg.type === 'unsubscribe') {
            const sid = wsSession.get(ws);
            if (sid) { const set = sessionClients.get(sid); if (set) set.delete(ws); wsSession.delete(ws); }
            return;
        }

        if (msg.type === 'prompt') {
            const sid = wsSession.get(ws) || msg.sessionId;
            if (!sid) return ws.send({ sys: 'error', text: 'no active session' });
            const id = nextId++;
            waiting.set(id, { ws, resolve: () => ws.send({ agent: { method: 'stop', params: { sessionId: sid, reason: 'end' } } }), reject: (e) => ws.send({ sys: 'error', text: 'turn failed: ' + String(e.message || e) }) });
            acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'session/prompt', params: { sessionId: sid, prompt: [{ type: 'text', text: msg.text }] } }) + '\n');
            return;
        }

        if (msg.type === 'cancel') {
            const sid = wsSession.get(ws);
            if (sid) acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: sid } }) + '\n');
            return;
        }

        if (msg.type === 'acp_reply') {
            acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.callId, result: { outcome: { outcome: 'selected', optionId: msg.option } } }) + '\n');
            return;
        }

        if (msg.type === 'list_models') {
            // fetch {host}/models with key; host from secrets or msg.override
            const host = (msg.host || secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
            const key = msg.key || secrets.FORGE_AGENT_API_KEY || '';
            if (!host) return ws.send({ sys: 'error', text: '未配置接口地址' });
            const url = host + '/models';
            require('http').get(url, { headers: { Authorization: 'Bearer ' + key } }, res => {
                let b = '';
                res.on('data', c => b += c);
                res.on('end', () => {
                    try { const j = JSON.parse(b); ws.send({ sys: 'models', models: (j.data || j.models || []).map(m => m.id || m.name || String(m)) }); }
                    catch { ws.send({ sys: 'error', text: 'models 响应解析失败 (HTTP ' + res.statusCode + ')' }); }
                });
            }).on('error', e => ws.send({ sys: 'error', text: '连接失败: ' + e.message }));
            return;
        }

        if (msg.type === 'test_model') {
            const host = (msg.host || secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
            const key = msg.key || secrets.FORGE_AGENT_API_KEY || '';
            const model = msg.model || secrets.GOOSE_MODEL_NAME || '';
            const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'reply with exactly: ok' }], max_tokens: 512 });
            const u = new URL(host + '/chat/completions');
            const reqMod = require(u.protocol === 'https:' ? 'https' : 'http');
            const req = reqMod.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, timeout: 30000 }, res => {
                let b = '';
                res.on('data', c => b += c);
                res.on('end', () => {
                    let txt = '';
                    try { const clean = b.replace(/data:\s*\[DONE\][\s\S]*$/, '').trim(); const j = JSON.parse(clean); const c = j.choices && j.choices[0]; const m = c && c.message; txt = (m && (m.content || m.reasoning_content)) || (c && c.text) || ('HTTP ' + res.statusCode + ' OK'); } catch { txt = b.slice(0, 80); }
                    ws.send({ sys: 'test_result', ok: res.statusCode === 200, http: res.statusCode, reply: String(txt).slice(0, 60), model });
                });
            });
            req.on('error', e => ws.send({ sys: 'test_result', ok: false, http: 0, reply: e.message.slice(0, 80), model }));
            req.on('timeout', () => { req.destroy(); ws.send({ sys: 'test_result', ok: false, http: 0, reply: '30s 超时', model }); });
            req.write(body); req.end();
            return;
        }

        if (msg.type === 'providers') {
            let list = readProviders();
            let needRestart = false;
            if (msg.save) {
                if (msg.activate !== undefined) {
                    const was = (list.find(p => p.active) || {}).name;
                    for (const pr of list) pr.active = pr.name === msg.activate;
                    needRestart = was !== msg.activate;
                }
                if (msg.add) {
                    const ex = list.find(p => p.name === msg.add.name);
                    if (ex) Object.assign(ex, msg.add); else list.push(msg.add);
                    if (list.length === 1) list[0].active = true;
                }
                if (msg.remove) {
                    list = list.filter(pr => pr.name !== msg.remove);
                    if (!list.find(p => p.active) && list[0]) { list[0].active = true; needRestart = true; }
                }
                if (msg.update) {
                    const ex = list.find(p => p.name === msg.update.name);
                    if (ex) {
                        const patch = { ...msg.update };
                        if (!patch.key) delete patch.key;   // key 留空 = 沿用原值（UI 脱敏不回传）
                        Object.assign(ex, patch);
                        needRestart = !!ex.active;
                    }
                }
                writeProviders(list);
            }
            const act = list.find(p => p.active);
            if (act) {
                const sf = path.join(ROOT, 'data', 'secrets.env');
                const lines = require('fs').readFileSync(sf, 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
                const keep = lines.filter(l => !/^(GOOSE_MODEL_NAME|FORGE_AGENT_HOST|FORGE_AGENT_API_KEY)=/.test(l.trim()));
                keep.push('GOOSE_MODEL_NAME=' + (act.models && act.models[0] || ''));
                keep.push('FORGE_AGENT_HOST=' + (act.host || ''));
                keep.push('FORGE_AGENT_API_KEY=' + (act.key || ''));
                require('fs').writeFileSync(sf, keep.join(String.fromCharCode(10)) + String.fromCharCode(10));
            }
            ws.send({ sys: 'providers', list: list.map(pr => ({ name: pr.name, host: pr.host, models: pr.models || [], active: !!pr.active, hasKey: !!pr.key })) });
            if (needRestart) hotRestartProvider().catch(e => console.error('hot restart failed', e));
            return;
        }

        if (msg.type === 'switch_model') {
            // {model} — 可选池内切换：同供应商走 set_config_option，跨供应商热重启 acp
            const list = readProviders();
            const target = list.find(p => (p.models || []).includes(msg.model));
            if (!target) return ws.send({ sys: 'error', text: '该模型不在可选池：' + msg.model });
            if (target.active) {
                const sid = wsSession.get(ws);
                if (!sid) return ws.send({ sys: 'error', text: '先开一个对话再切模型' });
                const id = nextId++;
                acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'session/set_config_option', params: { sessionId: sid, configId: 'model', value: msg.model } }) + '\n');
                waiting.set(id, { ws, resolve: (res) => {
                    if (res && res.configOptions) ws.send({ sys: 'model_switched', model: msg.model, provider: target.name });
                    else ws.send({ sys: 'error', text: '切换失败，试试重开对话' });
                }});
            } else {
                for (const pr of list) pr.active = pr.name === target.name;
                writeProviders(list);
                ws.send({ sys: 'provider_switching', to: target.name, model: msg.model });
                hotRestartProvider().then(() => {
                    ws.send({ sys: 'model_switched', model: msg.model, provider: target.name, restarted: true });
                }).catch(e => ws.send({ sys: 'error', text: '切换供应商失败: ' + e.message }));
            }
            return;
        }

        if (msg.type === 'save_config') {
            // persist model/host/key into data/secrets.env (idempotent rewrite of known keys)
            try {
                const f = path.join(ROOT, 'data', 'secrets.env');
                const lines = require('fs').readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'));
                const keep = lines.filter(l => !/^(GOOSE_MODEL_NAME|FORGE_AGENT_HOST|FORGE_AGENT_API_KEY)=/.test(l.trim()));
                const c = msg.config || {};
                if (c.model) keep.push('GOOSE_MODEL_NAME=' + c.model);
                if (c.host) keep.push('FORGE_AGENT_HOST=' + c.host);
                if (c.key) keep.push('FORGE_AGENT_API_KEY=' + c.key);
                require('fs').writeFileSync(f, keep.join('\n') + '\n');
                console.log('config saved (takes effect after restart):', c.model || '', c.host || '');
                ws.send({ sys: 'saved_config' });
            } catch (e) { ws.send({ sys: 'error', text: '保存失败: ' + e.message }); }
            return;
        }
    } catch (e) {
        ws.send({ sys: 'error', text: String(e.message || e) });
    }
}

server.listen(PORT, '127.0.0.1', () => console.log('chat bridge v2 on http://127.0.0.1:' + PORT));
