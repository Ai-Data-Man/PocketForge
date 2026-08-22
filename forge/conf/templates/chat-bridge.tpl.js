// PocketForge chat bridge: goose ACP (stdio JSON-RPC) <-> WebSocket browser client.
// Zero deps (node built-ins only). Runs with bundled node under pc management.
// Env: FORGE_ROOT, PORT (default 8790), GOOSE_* passthrough for the acp child.
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.FORGE_ROOT || path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8790);
const GOOSE = path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe');
const PAGE = path.join(ROOT, 'conf', 'templates', 'chat.tpl.html');

// ---------- ACP child ----------
// secrets.env 是唯一可信源（pc 环境快照不可靠，bridge 自取）
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
const acpEnv = {
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
};
const acp = spawn(GOOSE, ['acp'], { env: acpEnv, stdio: ['pipe', 'pipe', 'pipe'] });
let acpBuf = '';
const pending = new Map(); // ws clients by session
const sessions = new Map(); // acpSessionId -> Set(ws)

acp.stdout.on('data', chunk => {
    acpBuf += chunk.toString('utf8');
    let idx;
    while ((idx = acpBuf.indexOf('\n')) !== -1) {
        const line = acpBuf.slice(0, idx).trim();
        acpBuf = acpBuf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        handleAcp(msg);
    }
});
acp.stderr.on('data', d => process.stderr.write('[acp] ' + d));
acp.on('exit', c => { console.log('acp exited', c); process.exit(1); });

// ---------- protocol state ----------
let initialized = false;
let nextId = 1;
const waiting = new Map(); // id -> {resolve, reject}
function call(method, params) {
    return new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
}
function notify(method, params) {
    acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
function handleAcp(msg) {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && waiting.has(msg.id)) {
        const w = waiting.get(msg.id);
        waiting.delete(msg.id);
        msg.error ? w.reject(new Error(JSON.stringify(msg.error))) : w.resolve(msg.result);
        return;
    }
    // notifications from agent -> broadcast to clients of that session
    if (msg.method && msg.params) {
        const sid = msg.params.sessionId;
        const set = (sid && sessions.get(sid)) || null;
        const obj = { agent: msg };
        if (set) for (const ws of set) ws.send(obj);
        else for (const ws of allClients) ws.send(obj);
    }
}

// initialize handshake once
async function init() {
    const res = await call('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });
    notify('initialized', {});
    initialized = true;
    console.log('ACP initialized:', res.agentInfo && res.agentInfo.name, res.agentInfo && res.agentInfo.version);
}
init().catch(e => { console.error('init failed', e); process.exit(1); });

// ---------- WebSocket (hand-rolled: no deps) ----------
const allClients = new Set();
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(require('fs').readFileSync(PAGE));
    } else if (req.url === '/healthz') {
        res.writeHead(200); res.end('ok');
    } else {
        res.writeHead(404); res.end();
    }
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
        // parse frames (client->server masked)
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
            if (op === 0x1 || op === 0x2 || op === 0x0) {
                const text = payload.toString('utf8');
                let msg; try { msg = JSON.parse(text); } catch { continue; }
                handleClient(ws, msg);
            } else if (op === 0x8) { // close
                allClients.delete(ws);
                for (const set of sessions.values()) set.delete(ws);
                socket.destroy();
            } else if (op === 0x9) { // ping -> pong
                writeRaw(socket, 0x8a, payload);
            }
        }
    });
    socket.on('error', () => { allClients.delete(ws); for (const set of sessions.values()) set.delete(ws); try { socket.destroy(); } catch {} });
    socket.on('close', () => { allClients.delete(ws); for (const set of sessions.values()) set.delete(ws); });
    // hello
    ws.send({ sys: 'hello', version: 1 });
});

function writeRaw(socket, op, payload) {
    const len = payload.length;
    let header;
    if (len < 126) { header = Buffer.from([0x80 | op, len]); }
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | op; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | op; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    socket.write(Buffer.concat([header, payload]));
}
function writeFrame(socket, obj) { writeRaw(socket, 0x1, Buffer.from(JSON.stringify(obj), 'utf8')); }

// ---------- client messages ----------
async function handleClient(ws, msg) {
    try {
        if (msg.sys === 'ping') return ws.send({ sys: 'pong' });

        if (msg.type === 'new_session') {
            const res = await call('session/new', {
                cwd: ROOT,
                mcpServers: [],
            });
            ws.acpSessionId = res.sessionId;
            if (!sessions.has(res.sessionId)) sessions.set(res.sessionId, new Set());
            sessions.get(res.sessionId).add(ws);
            return ws.send({ sys: 'session', sessionId: res.sessionId });
        }

        if (msg.type === 'prompt') {
            const sid = ws.acpSessionId || (msg.sessionId);
            if (!sid) return ws.send({ sys: 'error', text: '先开一个会话' });
            const rid = nextId++;
            acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method: 'session/prompt', params: { sessionId: sid, prompt: [{ type: 'text', text: msg.text }] } }) + String.fromCharCode(10));
            // turn result arrives as response; notify client via 'stop'
            const onResp = (val) => ws.send({ agent: { method: 'stop', params: { sessionId: sid, reason: 'end' } } });
            waiting.set(rid, { resolve: onResp, reject: (e) => ws.send({ sys: 'error', text: 'turn failed: ' + String(e.message || e) }) });
            return;
        }

        if (msg.type === 'cancel' && ws.acpSessionId) {
            notify('session/cancel', { sessionId: ws.acpSessionId });
            return;
        }

        if (msg.type === 'acp_reply') {
            // permission response from UI: {callId, option}
            acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.callId, result: { outcome: { outcome: 'selected', optionId: msg.option } } }) + '\n');
            return;
        }
    } catch (e) {
        ws.send({ sys: 'error', text: String(e.message || e) });
    }
}

server.listen(PORT, '127.0.0.1', () => console.log('chat bridge on http://127.0.0.1:' + PORT));
