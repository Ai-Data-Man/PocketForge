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

const MIME = { '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json','.csv':'text/csv; charset=utf-8' };

// ---- 制品版本管理（ADR-0007）：每会话一个工作区目录，isomorphic-git(MIT)，仓库在各自工作区内 ----
const ART_DIR = path.join(ROOT, 'data', 'artifacts');
const fsp = require('fs').promises;
const FSS = require('fs');

// v2→v3 一次性迁移：旧版散落文件 + 根级 .git → ws-imported/（历史保留）
(function migrateV3() {
    try {
        FSS.mkdirSync(ART_DIR, { recursive: true });
        const mark = path.join(ART_DIR, '.migrated-v3');
        if (FSS.existsSync(mark)) return;
        const entries = FSS.readdirSync(ART_DIR).filter(n => !n.startsWith('.') && !n.startsWith('ws-'));
        if (entries.length || FSS.existsSync(path.join(ART_DIR, '.git'))) {
            const dst = path.join(ART_DIR, 'ws-imported');
            FSS.mkdirSync(dst, { recursive: true });
            for (const n of entries) { try { FSS.renameSync(path.join(ART_DIR, n), path.join(dst, n)); } catch {} }
            try { if (FSS.existsSync(path.join(ART_DIR, '.git'))) FSS.renameSync(path.join(ART_DIR, '.git'), path.join(dst, '.git')); } catch {}
            console.log('migrated legacy artifacts ->', 'data/artifacts/ws-imported');
        }
        FSS.writeFileSync(mark, new Date().toISOString());
    } catch (e) { console.error('artifact migrate failed:', e.message); }
})();

function wsValidId(id) { return /^ws-[0-9]{4}-[0-9]{6}[a-z]*$/.test(String(id || '')) || String(id || '') === 'ws-imported'; }
function wsDir(id) { return path.join(ART_DIR, id); }
function wsNewId() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    let id = 'ws-' + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    while (FSS.existsSync(wsDir(id))) id += 'x';
    return id;
}
const WSMAP_FILE = path.join(ROOT, 'data', 'workspace-map.json');
function readWsMap() { try { return JSON.parse(FSS.readFileSync(WSMAP_FILE, 'utf8')); } catch { return {}; } }
function writeWsMap(m) { FSS.mkdirSync(path.dirname(WSMAP_FILE), { recursive: true }); FSS.writeFileSync(WSMAP_FILE, JSON.stringify(m, null, 2)); }

let _git = null;
function ig() {
    if (!_git) _git = require(path.join(ROOT, 'bin', 'vendor', 'artifact-vcs', 'node_modules', 'isomorphic-git'));
    return _git;
}
function vcsRepoReady(root) {
    try { FSS.statSync(path.join(root, '.git')); return true; } catch { return false; }
}
async function vcsEnsureRepo(root) {
    if (!(await vcsRepoReady(root))) await ig().init({ fs: fsp, dir: root, defaultBranch: 'main' });
}
function vcsSafeRel(p) {
    const rel = String(p || '').split(String.fromCharCode(92)).join('/');
    if (!rel || rel.includes('..') || rel.includes(':') || rel.startsWith('/')) return null;
    return rel;
}
async function vcsSnapshot(root, rel, msg) {
    await vcsEnsureRepo(root);
    await ig().add({ fs: fsp, dir: root, filepath: rel });
    return ig().commit({ fs: fsp, dir: root, message: msg || ('更新 ' + rel), author: { name: '小forge', email: 'forge@local' } });
}
async function vcsLog(root, rel) {
    if (!(await vcsRepoReady(root))) return [];
    try {
        const logs = await ig().log({ fs: fsp, dir: root, filepath: rel });
        return logs.map(l => ({ oid: l.oid.slice(0, 10), msg: String(l.commit.message || '').trim().split('\n')[0], ts: l.commit.author.timestamp }));
    } catch { return []; }
}
async function vcsFullOid(root, oid) {
    if (String(oid).length === 40) return oid;
    return ig().expandOid({ fs: fsp, dir: root, oid });
}
function vcsTime(ts) {
    const d = new Date(ts * 1000), p = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

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

async function handleHttp(req, res) {
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
    else if (url.startsWith('/vendor/')) {
        const name = decodeURIComponent(url.slice('/vendor/'.length));
        if (name.includes('..')) { res.writeHead(400); res.end(); return; }
        const f = path.join(ROOT, 'conf', 'web-assets', 'vendor', name);
        require('fs').readFile(f, (e, buf) => {
            if (e) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'max-age=86400' });
            res.end(buf);
        });
    }
    else if (url.startsWith('/preview/')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(require('fs').readFileSync(path.join(ROOT, 'conf', 'web-assets', 'preview.html')));
    }
    else if (url === '/api/link') {
        // 外部目录接入：NTFS junction（无需管理员权限），链进 <工作区>/<label>
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        try {
            if (!wsValidId(ws)) throw new Error('缺工作区');
            const target = (qs.get('target') || '').trim();
            let label = (qs.get('label') || '').replace(/[\\/:*?"<>|.\s]/g, '-').slice(0, 40);
            if (!label) label = 'link-' + Date.now();
            if (!/^[a-zA-Z]:[\\/]/.test(target)) throw new Error('请填完整路径，比如 C:\\Users\\你\\Desktop\\报表');
            let st; try { st = FSS.statSync(target); } catch { throw new Error('找不到这个文件夹，检查一下路径'); }
            if (!st.isDirectory()) throw new Error('这是一个文件，请填文件夹的路径');
            const dest = path.join(wsDir(ws), label);
            if (FSS.existsSync(dest)) throw new Error('这个工作区里已经有叫「' + label + '」的文件夹了，换个名字或先删掉旧的');
            FSS.symlinkSync(target, dest, 'junction');
            console.log('linked external dir:', target, '->', ws + '/' + label);
            res.end(JSON.stringify({ ok: true, name: label }));
        } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
    }
    else if (url === '/api/vcs/log') {
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        const rel = vcsSafeRel(qs.get('file'));
        if (!wsValidId(ws) || !rel) { res.writeHead(400); res.end(); return; }
        const versions = (await vcsLog(wsDir(ws), rel)).map(v => ({ oid: v.oid, msg: v.msg, time: vcsTime(v.ts), ts: v.ts }));
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, versions }));
    }
    else if (url === '/api/vcs/blob') {
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        const rel = vcsSafeRel(qs.get('file'));
        const oid = (qs.get('oid') || '').replace(/[^0-9a-f]/g, '');
        if (!wsValidId(ws) || !rel || !oid) { res.writeHead(400); res.end(); return; }
        try {
            const b = await ig().readBlob({ fs: fsp, dir: wsDir(ws), oid: await vcsFullOid(wsDir(ws), oid), filepath: rel });
            const ext = path.extname(rel).toLowerCase();
            res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
            res.end(Buffer.from(b.blob));
        } catch { res.writeHead(404); res.end(); }
    }
    else if (url === '/api/vcs/restore' && req.method === 'POST') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', async () => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                const ws = body.ws || '';
                const rel = vcsSafeRel(body.file);
                const oid = String(body.oid || '').replace(/[^0-9a-f]/g, '');
                if (!wsValidId(ws) || !rel || !oid) throw new Error('参数不完整');
                const root = wsDir(ws);
                const full = path.join(root, rel.split('/').join(path.sep));
                if (!FSS.existsSync(full)) throw new Error('文件不存在');
                // 先把当前内容存一版（防手滑丢数据），再写入旧版并记录
                try { await vcsSnapshot(root, rel, '恢复前自动保存当前版'); } catch {}
                const b = await ig().readBlob({ fs: fsp, dir: root, oid: await vcsFullOid(root, oid), filepath: rel });
                await fsp.writeFile(full, Buffer.from(b.blob));
                await vcsSnapshot(root, rel, '已恢复到 ' + oid.slice(0, 6) + ' 那一版');
                console.log('restored:', ws + '/' + rel, '->', oid);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url.startsWith('/open/')) {
        // 用系统默认程序打开本地文件（cmd start）
        const name = decodeURIComponent(url.slice('/open/'.length));
        if (name.includes('..')) { res.writeHead(400); res.end(); return; }
        const f = path.join(ROOT, 'data', 'artifacts', name);
        if (!require('fs').existsSync(f)) { res.writeHead(404); res.end(JSON.stringify({ok:false, err:'not found'})); return; }
        require('child_process').exec('start "" "' + f + '"', { shell: 'cmd.exe' }, () => {});
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ok:true}));
    }
    else if (url.startsWith('/artifact/')) {
        // 制品服务：/artifact/<文件名> -> data/artifacts/<文件名>（禁止路径穿越）
        const name = decodeURIComponent(url.slice('/artifact/'.length)).split(String.fromCharCode(92)).join('/');
        if (name.includes('..') || name.includes(':')) { res.writeHead(400); res.end(); return; }
        const f = path.join(ROOT, 'data', 'artifacts', name.split('/').join(path.sep));
        require('fs').readFile(f, (e, buf) => {
            if (e) { res.writeHead(404); res.end(); return; }
            const ext = path.extname(f).toLowerCase();
            res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
            res.end(buf);
        });
    }
    else if (url === '/api/workspaces') {
        // 全局工作区视角：所有工作区 + 元信息 + 会话绑定（孤儿 = 绑定的会话已删除）
        const map = readWsMap();
        const out = [];
        try {
            for (const ent of FSS.readdirSync(ART_DIR, { withFileTypes: true })) {
                if (!ent.isDirectory() || ent.name.startsWith('.') || !wsValidId(ent.name)) continue;
                let files = 0, bytes = 0, mtime = 0;
                (function walk(d) {
                    try {
                        for (const f of FSS.readdirSync(d)) {
                            if (f === '.git') continue;
                            const full = path.join(d, f);
                            const st = FSS.statSync(full);
                            if (st.isDirectory()) walk(full);
                            else { files++; bytes += st.size; if (st.mtimeMs > mtime) mtime = st.mtimeMs; }
                        }
                    } catch {}
                })(path.join(ART_DIR, ent.name));
                out.push({ id: ent.name, files, bytes, mtime, sid: (map[ent.name] || {}).sid || null });
            }
        } catch {}
        out.sort((a, b) => b.mtime - a.mtime);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
    }
    else if (url === '/api/ws/new') {
        const qs = new URL(req.url, 'http://x').searchParams;
        const sid = qs.get('sid') || '';
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        if (!sid) { res.end(JSON.stringify({ ok: false, err: '缺 sid' })); return; }
        const map = readWsMap();
        const mine = Object.keys(map).find(w => map[w].sid === sid && FSS.existsSync(wsDir(w)));
        if (mine) { res.end(JSON.stringify({ ok: true, ws: mine, existed: true })); return; }
        const id = wsNewId();
        FSS.mkdirSync(path.join(wsDir(id), 'uploads'), { recursive: true });
        map[id] = { sid, boundAt: Date.now() };
        writeWsMap(map);
        console.log('workspace created:', id, '<->', sid.slice(0, 8));
        res.end(JSON.stringify({ ok: true, ws: id }));
    }
    else if (url === '/api/ws/bind') {
        // 「引入」：把一个已有工作区绑到当前会话（强保证 = 之后 @ 引用的完整路径 agent 一定能读）
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (!wsValidId(b.ws) || !FSS.existsSync(wsDir(b.ws))) throw new Error('工作区不存在');
                if (!b.sid) throw new Error('缺 sid');
                const map = readWsMap();
                map[b.ws] = { sid: b.sid, boundAt: Date.now(), introduced: true };
                writeWsMap(map);
                console.log('workspace introduced:', b.ws, '->', String(b.sid).slice(0, 8));
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/artifacts') {
        // 某个工作区的文件列表（递归，跳过 .git）
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        if (!wsValidId(ws)) { res.writeHead(400); res.end(); return; }
        function listDir(d, prefix) {
            let out = [];
            try {
                for (const f of FSS.readdirSync(d)) {
                    if (f.startsWith('.') || f.startsWith('_')) continue;
                    const full = path.join(d, f);
                    let st; try { st = FSS.statSync(full); } catch { continue; }
                    if (st.isDirectory()) out.push.apply(out, listDir(full, prefix ? prefix + '/' + f : f));
                    else out.push({ name: (prefix ? prefix + '/' : '') + f, size: st.size });
                }
            } catch {}
            return out;
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(listDir(wsDir(ws), '')));
    }
    else if (url.startsWith('/api/upload') && req.method === 'POST') {
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        if (!wsValidId(ws)) { res.writeHead(400); res.end(JSON.stringify({ ok: false, err: '缺工作区' })); return; }
        const fname = (qs.get('name') || ('upload-' + Date.now())).replace(/[\\/:*?"<>|]/g, '_');
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            try {
                const dir = path.join(wsDir(ws), 'uploads');
                FSS.mkdirSync(dir, { recursive: true });
                let finalName = fname;
                const extM = fname.match(/(\.[^.]+)$/);
                const base = extM ? fname.slice(0, fname.length - extM[1].length) : fname;
                const ext = extM ? extM[1] : '';
                let n = 1;
                while (FSS.existsSync(path.join(dir, finalName))) { finalName = base + '-v' + (++n) + ext; }
                FSS.writeFileSync(path.join(dir, finalName), Buffer.concat(chunks));
                console.log('uploaded:', ws + '/uploads/' + finalName);
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, name: 'uploads/' + finalName }));
            } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else { res.writeHead(404); res.end(); }
}
// 任何路由异常都不许挂死连接：统一回 500 JSON
const server = http.createServer((req, res) => Promise.resolve(handleHttp(req, res)).catch(e => {
    console.error('http error', req.url, e.message);
    try { res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, err: String(e.message || e) })); } catch {}
}));

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

        if (msg.type === 'delete_session') {
            // ACP session/close 不删记录；硬删 sessions.db（messages + sessions 行）
            try {
                const { DatabaseSync } = require('node:sqlite');
                const db = new DatabaseSync(path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db'));
                const m = db.prepare('DELETE FROM messages WHERE session_id = ?').run(msg.sessionId);
                const r = db.prepare('DELETE FROM sessions WHERE id = ?').run(msg.sessionId);
                db.close();
                console.log('session deleted', msg.sessionId, 'messages:', m.changes, 'row:', r.changes);
                ws.send({ sys: 'session_deleted', sessionId: msg.sessionId, ok: r.changes > 0 });
            } catch (e) { ws.send({ sys: 'error', text: '删除失败: ' + e.message }); }
            return;
        }

        if (msg.type === 'copy_artifact') {
            const rel = String(msg.name || '').split('/').join(path.sep);
            const f = path.join(ROOT, 'data', 'artifacts', rel);
            if (rel.includes('..') || !require('fs').existsSync(f)) return ws.send({ sys: 'error', text: '文件不存在' });
            require('child_process').spawn('powershell', ['-NoProfile', '-Command', 'Set-Clipboard -LiteralPath "' + f + '"'], { detached: true, stdio: 'ignore' }).unref();
            ws.send({ sys: 'copied', name: msg.name });
            return;
        }

        if (msg.type === 'explain_tool') {
            // 用当前会话的模型直调一次 chat completion，向小白解释这次工具调用；不进会话历史
            const act = activeProvider();
            const host = ((act && act.host) || secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
            const key = (act && act.key) || secrets.FORGE_AGENT_API_KEY || '';
            const model = msg.model || (act && act.models && act.models[0]) || secrets.GOOSE_MODEL_NAME || '';
            const reply = t => ws.send({ sys: 'tool_explanation', id: msg.id, text: String(t).slice(0, 500) });
            if (!host || !model) return reply('现在连不上模型，等连接好了再试。');
            const body = JSON.stringify({ model, max_tokens: 300, messages: [
                { role: 'system', content: '你是给完全不懂电脑的人当翻译的助手。用不超过三句中文大白话说明下面这一步操作做了什么、结果对用户意味着什么。禁止任何技术术语，不要出现"工具""调用""脚本"这类词。' },
                { role: 'user', content: '这一步叫：' + (msg.title || '') + '\n内容摘要：' + String(msg.content || '(空)').slice(0, 1200) }
            ]});
            try {
                const u = new URL(host + '/chat/completions');
                const reqMod = require(u.protocol === 'https:' ? 'https' : 'http');
                const rq = reqMod.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, timeout: 30000 }, res => {
                    let b = '';
                    res.on('data', c => b += c);
                    res.on('end', () => {
                        try { const j = JSON.parse(b.replace(/data:\s*\[DONE\][\s\S]*$/, '').trim()); const c0 = j.choices && j.choices[0]; const m0 = c0 && c0.message; reply((m0 && (m0.content || m0.reasoning_content)) || '它没说出什么来'); }
                        catch { reply('解释失败（服务返回异常）'); }
                    });
                });
                rq.on('error', e => reply('解释失败: ' + e.message));
                rq.on('timeout', () => { rq.destroy(); reply('解释超时了'); });
                rq.write(body); rq.end();
            } catch (e) { reply('解释失败: ' + e.message); }
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
                const doSet = (sessionId) => {
                    const id = nextId++;
                    acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'session/set_config_option', params: { sessionId, configId: 'model', value: msg.model } }) + '\n');
                    waiting.set(id, { ws, resolve: (res) => {
                        if (res && res.configOptions) ws.send({ sys: 'model_switched', model: msg.model, provider: target.name });
                        else ws.send({ sys: 'error', text: '切换失败，试试重开对话' });
                    }});
                };
                const sid = wsSession.get(ws);
                if (sid) { doSet(sid); }
                else {
                    // 无活动会话（桥重启丢状态/新窗口）：自动开新会话再切，用户无感
                    const nid = nextId++;
                    waiting.set(nid, { ws, resolve: (res) => {
                        if (res && res.sessionId) {
                            wsSession.set(ws, res.sessionId);
                            if (!sessionClients.has(res.sessionId)) sessionClients.set(res.sessionId, new Set());
                            sessionClients.get(res.sessionId).add(ws);
                            ws.send({ sys: 'subscribed', sessionId: res.sessionId, modes: res.modes || [], configOptions: res.configOptions || [] });
                            doSet(res.sessionId);
                        } else ws.send({ sys: 'error', text: '开新对话失败，稍后再试' });
                    }});
                    acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: nid, method: 'session/new', params: { cwd: ROOT, mcpServers: [] } }) + '\n');
                }
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
