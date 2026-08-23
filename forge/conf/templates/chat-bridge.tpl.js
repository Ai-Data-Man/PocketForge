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

const acp = spawn(GOOSE, ['acp'], {
    env: {
        ...process.env,
        GOOSE_PATH_ROOT: path.join(ROOT, 'conf', 'goose'),
        GOOSE_DISABLE_KEYRING: '1',
        GOOSE_TELEMETRY_ENABLED: 'false',
        GOOSE_MODE: 'auto',
        GOOSE_PROVIDER: 'openai',
        GOOSE_MODEL: secrets.GOOSE_MODEL_NAME || 'myopencode/glm-5.2',
        OPENAI_API_KEY: secrets.FORGE_AGENT_API_KEY || process.env.OPENAI_API_KEY,
        OPENAI_HOST: secrets.FORGE_AGENT_HOST || process.env.OPENAI_HOST,
        OPENAI_BASE_PATH: 'chat/completions',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
});
let acpBuf = '';
let nextId = 1;
const waiting = new Map();      // rpc id -> {ws, resolve, reject}
const allClients = new Set();   // all connected ws
const sessionClients = new Map(); // acp sessionId -> Set(ws) that loaded it
const wsSession = new WeakMap();  // ws -> active acp sessionId

acp.stdout.on('data', chunk => {
    acpBuf += chunk.toString('utf8');
    let idx;
    while ((idx = acpBuf.indexOf('\n')) !== -1) {
        const line = acpBuf.slice(0, idx).trim();
        acpBuf = acpBuf.slice(idx + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        // responses: resolve waiters (subscribe/prompt use resolve); rpc passthrough forwards raw
        if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && waiting.has(msg.id)) {
            const w = waiting.get(msg.id); waiting.delete(msg.id);
            if (w.resolve) { w.resolve(msg.result !== undefined ? msg.result : msg); }
            else if (w.ws && w.ws.alive) w.ws.send({ rpc: msg });
            continue;
        }
        // notifications -> broadcast to session subscribers (or everyone if no sid)
        if (msg.method) {
            const sid = msg.params && msg.params.sessionId;
            const set = sid ? sessionClients.get(sid) : null;
            const obj = { agent: msg };
            if (set && set.size) for (const ws of set) ws.send(obj);
            else for (const ws of allClients) ws.send(obj);
        }
    }
});
acp.stderr.on('data', d => process.stderr.write('[acp] ' + d));
acp.on('exit', c => { console.log('acp exited', c); process.exit(1); });

async function init() {
    const res = await new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { ws: null, resolve, reject });
        acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } } }) + '\n');
    });
    acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n');
    console.log('ACP initialized:', res.agentInfo && res.agentInfo.name);
    acpCaps = res;
}
let acpCaps = null;
init().catch(e => { console.error('init failed', e); process.exit(1); });

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(require('fs').readFileSync(PAGE));
    } else if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); }
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
