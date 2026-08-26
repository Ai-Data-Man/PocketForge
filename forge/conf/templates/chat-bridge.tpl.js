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

// 断电安全写：临时文件+rename，杜绝截断归零（审查 I7）
function atomicWrite(file, data) {
    const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
    FSS.writeFileSync(tmp, data);
    FSS.renameSync(tmp, file);
}

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

// 会话库护栏：调度任务会话只留最新 20 条（s14 教训：daily-mem cron 误配 */2 刷出 1700+ 条，把真实对话挤出列表）
(function pruneScheduled() {
    try {
        const dbf = path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db');
        if (!FSS.existsSync(dbf)) return;
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(dbf);
        db.prepare("DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE session_type='scheduled' AND id NOT IN (SELECT id FROM sessions WHERE session_type='scheduled' ORDER BY created_at DESC LIMIT 20))").run();
        db.prepare("DELETE FROM sessions WHERE session_type='scheduled' AND id NOT IN (SELECT id FROM sessions WHERE session_type='scheduled' ORDER BY created_at DESC LIMIT 20)").run();
        db.close();
    } catch (e) { console.error('prune scheduled failed:', e.message); }
})();
// 清掉旧约定残留的空 uploads/ 目录（P29b：上传位置由用户定，默认根目录）
(function pruneEmptyUploads() {
    try {
        for (const ent of FSS.readdirSync(ART_DIR, { withFileTypes: true })) {
            if (!ent.isDirectory() || !wsValidId(ent.name)) continue;
            const u = path.join(ART_DIR, ent.name, 'uploads');
            try { if (FSS.existsSync(u) && FSS.readdirSync(u).length === 0) FSS.rmdirSync(u); } catch {}
        }
    } catch {}
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
function writeWsMap(m) { FSS.mkdirSync(path.dirname(WSMAP_FILE), { recursive: true }); atomicWrite(WSMAP_FILE, JSON.stringify(m, null, 2)); }

// ---- 工作区元数据(.forge,ADR-0008):附件身份等语义信息与存放路径解耦 ----
function forgeFile(ws) { return path.join(wsDir(ws), '.forge'); }
function readForgeMeta(ws) { try { return JSON.parse(FSS.readFileSync(forgeFile(ws), 'utf8')); } catch { return {}; } }
function writeForgeMeta(ws, meta) { try { atomicWrite(forgeFile(ws), JSON.stringify(meta, null, 2)); } catch {} }

// ---- 会话归档(data/session-archive.json):纯 UI 生命周期态 ----
const ARCH_FILE = path.join(ROOT, 'data', 'session-archive.json');
function readArch() { try { return JSON.parse(FSS.readFileSync(ARCH_FILE, 'utf8')); } catch { return {}; } }
function writeArch(m) { FSS.mkdirSync(path.dirname(ARCH_FILE), { recursive: true }); atomicWrite(ARCH_FILE, JSON.stringify(m, null, 2)); }
function wsState(id, map, arch) {
    const sid = (map[id] || {}).sid;
    if (!sid) return 'orphan';
    if (arch[sid]) return 'archived';
    return 'active';
}

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
function writeProviders(list) { atomicWrite(PROV_FILE, JSON.stringify(list, null, 2)); };
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
            else if (w.ws && w.ws.alive) {
                // I8: 带回客户端关联 id
                const out = { rpc: msg };
                if (w.__cid !== undefined) out.rpc.__cid = w.__cid;
                w.ws.send(out);
            }
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
    // M6(审查s15): 清 waiting 前先 reject 在途请求，否则前端 spinner 永挂
    for (const [, w] of waiting) { if (w.reject) { try { w.reject(new Error('provider switching')); } catch {} } }
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
            // I2(审查s15): 防环——目标不得是 artifacts 本身或其上级（否则遍历成环）
            const tReal = FSS.realpathSync(target);
            const aReal = FSS.realpathSync(ART_DIR);
            if (tReal === aReal || aReal.startsWith(tReal + path.sep)) throw new Error('这个文件夹包含工作区本身，不能链接进来');
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
                // I4(审查s15): 已删除的文件也能恢复——数据在 git 对象库里，不要求工作树存在该文件
                FSS.mkdirSync(path.dirname(full), { recursive: true });
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
        // I5(审查s15): 名字进 cmd shell 前先过黑名单——拒绝引号与 cmd 元字符，杜绝注入
        if (name.includes('..') || ['"', '%', '^', '&', '|', '<', '>', '!'].some(ch => name.includes(ch))) { res.writeHead(400); res.end(JSON.stringify({ok:false, err:'bad name'})); return; }
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
            const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
            // R2-C1: html/svg 内联打开=同源脚本，穿透 Origin 白名单外带 key——强制下载
            if (['.html', '.htm', '.svg', '.xml'].includes(ext)) {
                headers['content-disposition'] = "attachment; filename*=UTF-8''" + encodeURIComponent(path.basename(f));
            }
            res.writeHead(200, headers);
            res.end(buf);
        });
    }
    else if (url === '/api/workspaces') {
        // 全局工作区视角：所有工作区 + 元信息 + 生命周期状态（active/archived/orphan）
        const map = readWsMap();
        const arch = readArch();
        const out = [];
        try {
            for (const ent of FSS.readdirSync(ART_DIR, { withFileTypes: true })) {
                if (!ent.isDirectory() || ent.name.startsWith('.') || !wsValidId(ent.name)) continue;
                let files = 0, bytes = 0, mtime = 0;
                // I2(审查s15): lstat 跳过 junction + 节点预算——链接外部大目录不再全盘扫描
                (function walk(d, b) {
                    try {
                        for (const f of FSS.readdirSync(d)) {
                            if (f === '.git' || f === '.forge') continue;
                            const full = path.join(d, f);
                            const st = FSS.lstatSync(full);
                            if (st.isSymbolicLink()) continue;
                            if (st.isDirectory()) { if (--b.n > 0) walk(full, b); }
                            else { files++; bytes += st.size; if (st.mtimeMs > mtime) mtime = st.mtimeMs; }
                        }
                    } catch {}
                })(path.join(ART_DIR, ent.name), { n: 2000 });
                out.push({ id: ent.name, files, bytes, mtime, sid: (map[ent.name] || {}).sid || null, state: wsState(ent.name, map, arch) });
            }
        } catch {}
        out.sort((a, b) => b.mtime - a.mtime);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
    }
    else if (url === '/api/sessions/archive') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        if (req.method === 'POST') {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                try {
                    const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if (!b.sid) throw new Error('缺 sid');
                    const arch = readArch();
                    if (b.archived) arch[b.sid] = Date.now(); else delete arch[b.sid];
                    writeArch(arch);
                    res.end(JSON.stringify({ ok: true }));
                } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
            });
        } else {
            res.end(JSON.stringify({ ok: true, arch: readArch() }));
        }
    }
    else if (url === '/api/ws/tree') {
        // 工作区真目录树：dir/file/link 三型；附件身份来自 .forge（与路径解耦）
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        if (!wsValidId(ws)) { res.writeHead(400); res.end(); return; }
        const att = new Set(readForgeMeta(ws).attachments || []);
        const budget = { n: 400 };
        function build(d, prefix) {
            const out = [];
            let ents = [];
            try { ents = FSS.readdirSync(d, { withFileTypes: true }); } catch {}
            for (const ent of ents) {
                if (ent.name.startsWith('.') || ent.name.startsWith('_')) continue;
                if (budget.n-- <= 0) break;
                const rel = (prefix ? prefix + '/' : '') + ent.name;
                const full = path.join(d, ent.name);
                let st; try { st = FSS.lstatSync(full); } catch { continue; }
                if (st.isSymbolicLink()) {
                    let tgt = ''; try { tgt = FSS.readlinkSync(full); } catch {}
                    const node = { name: ent.name, path: rel, type: 'link', target: tgt };
                    try { if (FSS.statSync(full).isDirectory()) node.children = build(full, rel); } catch {}
                    out.push(node);
                }
                else if (st.isDirectory()) out.push({ name: ent.name, path: rel, type: 'dir', children: build(full, rel) });
                else out.push({ name: ent.name, path: rel, type: 'file', size: st.size, mtime: st.mtimeMs, att: att.has(rel) });
            }
            out.sort((a, b) => ((a.type === 'file') - (b.type === 'file')) || a.name.localeCompare(b.name, 'zh'));
            return out;
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, root: { name: ws, path: '', type: 'dir', children: build(wsDir(ws), '') }, attachments: [...att] }));
    }
    else if (url === '/api/ws/link' && req.method === 'POST') {
        // 把另一个工作区以 junction 形式引入当前工作区（相对引用语义，物理为绝对路径）
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (!wsValidId(b.ws) || !FSS.existsSync(wsDir(b.ws))) throw new Error('当前工作区不存在');
                if (!wsValidId(b.target) || !FSS.existsSync(wsDir(b.target))) throw new Error('目标工作区不存在');
                if (b.target === b.ws) throw new Error('不能把工作区引进它自己');
                let label = String(b.label || '').replace(/[\\/:*?"<>|.\s]/g, '-').slice(0, 40);
                if (!label) label = b.target;
                const dest = path.join(wsDir(b.ws), label);
                if (FSS.existsSync(dest)) throw new Error('已存在同名「' + label + '」，换个名字');
                const tReal = FSS.realpathSync(wsDir(b.target));
                const wReal = FSS.realpathSync(wsDir(b.ws));
                if (wReal === tReal || wReal.startsWith(tReal + path.sep)) throw new Error('不能把工作区引进它的内部（会成环）');
                FSS.symlinkSync(tReal, dest, 'junction');
                console.log('ws link:', b.ws + '/' + label, '->', b.target);
                res.end(JSON.stringify({ ok: true, name: label }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/ws/unlink' && req.method === 'POST') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                const rel = vcsSafeRel(b.path);
                if (!wsValidId(b.ws) || !rel || rel.includes('/')) throw new Error('参数不完整');
                const dest = path.join(wsDir(b.ws), rel.split('/').join(path.sep));
                const st = FSS.lstatSync(dest);
                if (!st.isSymbolicLink()) throw new Error('那不是一个链接');
                FSS.rmSync(dest);
                console.log('ws unlink:', b.ws + '/' + rel);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/ws/delete' && req.method === 'POST') {
        // 删除整个工作区：仅孤儿或绑定归档会话的区允许；被任何活跃区链接引用时拒绝
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', async () => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (!wsValidId(b.ws)) throw new Error('参数不完整');
                const map = readWsMap(), arch = readArch();
                const stt = wsState(b.ws, map, arch);
                if (stt === 'active') throw new Error('该工作区还绑着活跃对话，请先归档那个对话');
                const tReal = FSS.realpathSync(wsDir(b.ws));
                for (const ent of FSS.readdirSync(ART_DIR, { withFileTypes: true })) {
                    if (!ent.isDirectory() || !wsValidId(ent.name) || ent.name === b.ws) continue;
                    for (const ch of FSS.readdirSync(path.join(ART_DIR, ent.name), { withFileTypes: true })) {
                        if (!ch.isSymbolicLink()) continue;
                        try {
                            const lp = FSS.readlinkSync(path.join(ART_DIR, ent.name, ch.name));
                            if (FSS.realpathSync(lp) === tReal) throw new Error('正被活跃工作区「' + ent.name + '」引用，先在那里取消引入');
                        } catch (e2) { if (String(e2.message).includes('引用')) throw e2; }
                    }
                }
                FSS.rmSync(wsDir(b.ws), { recursive: true, force: true });
                delete map[b.ws]; writeWsMap(map);
                console.log('ws deleted:', b.ws);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/fs/new' && req.method === 'POST') {
        // 轻量文件管理：新建文件/目录（IDE 能力的最小集）
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                const rel = vcsSafeRel(b.path);
                if (!wsValidId(b.ws) || !rel) throw new Error('参数不完整');
                if (/^(?:[^/]*\/)?\./.test(rel.split('/').pop())) throw new Error('名字不能以点开头');
                const full = path.join(wsDir(b.ws), rel.split('/').join(path.sep));
                if (FSS.existsSync(full)) throw new Error('已经存在同名文件或文件夹');
                if (b.type === 'dir') FSS.mkdirSync(full, { recursive: true });
                else { FSS.mkdirSync(path.dirname(full), { recursive: true }); FSS.writeFileSync(full, ''); }
                console.log('fs new:', b.type, b.ws + '/' + rel);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/fs/rename' && req.method === 'POST') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', async () => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                const rel = vcsSafeRel(b.path);
                const name = String(b.name || '').trim();
                if (!wsValidId(b.ws) || !rel || !name) throw new Error('参数不完整');
                if (/[\\/:*?"<>|]/.test(name) || name.startsWith('.') || name.startsWith('_')) throw new Error('名字含非法字符');
                const root = wsDir(b.ws);
                const full = path.join(root, rel.split('/').join(path.sep));
                if (!FSS.existsSync(full)) throw new Error('原文件不存在');
                if (FSS.lstatSync(full).isSymbolicLink()) throw new Error('链接请在「浏览全部」里管理');
                const nrel = rel.split('/').slice(0, -1).concat(name).join('/');
                const nfull = path.join(root, nrel.split('/').join(path.sep));
                if (FSS.existsSync(nfull)) throw new Error('已存在同名');
                try { await vcsSnapshot(root, rel, '重命名前自动保存'); } catch {}
                FSS.renameSync(full, nfull);
                try { await ig().remove({ fs: fsp, dir: root, filepath: rel }); await vcsSnapshot(root, nrel, '重命名：' + rel.slice(rel.lastIndexOf('/') + 1) + ' → ' + name); } catch {}
                // 附件元数据跟随改名
                const meta = readForgeMeta(b.ws);
                if (meta.attachments && meta.attachments.includes(rel)) meta.attachments = meta.attachments.map(p => p === rel ? nrel : p);
                writeForgeMeta(b.ws, meta);
                res.end(JSON.stringify({ ok: true, path: nrel }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
    }
    else if (url === '/api/fs/delete' && req.method === 'POST') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', async () => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            try {
                const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                const rel = vcsSafeRel(b.path);
                if (!wsValidId(b.ws) || !rel) throw new Error('参数不完整');
                const root = wsDir(b.ws);
                const full = path.join(root, rel.split('/').join(path.sep));
                const st = FSS.lstatSync(full);
                if (!st.isSymbolicLink() && st.isFile()) { try { await vcsSnapshot(root, rel, '删除前自动保存'); } catch {} }
                // I3(审查s15): 目录删除前对其内文件逐个快照(上限80)，否则整棵消失无副本
                if (!st.isSymbolicLink() && st.isDirectory()) {
                    const files = [];
                    (function w2(d, b) {
                        let ents; try { ents = FSS.readdirSync(d); } catch { return; }
                        for (const f of ents) {
                            if (files.length >= 80 || b.n <= 0) return;
                            if (f === '.git' || f === '.forge' || f.startsWith('.')) continue;
                            const fp = path.join(d, f);
                            let s2; try { s2 = FSS.lstatSync(fp); } catch { continue; }
                            if (s2.isDirectory()) w2(fp, { n: --b.n });
                            else if (s2.isFile()) files.push(fp);
                        }
                    })(full, { n: 80 });
                    for (const fp of files) {
                        const r2 = path.relative(root, fp).split(path.sep).join('/');
                        try { await vcsSnapshot(root, r2, '删除文件夹前自动保存'); } catch {}
                    }
                }
                FSS.rmSync(full, { recursive: true, force: true });
                const meta = readForgeMeta(b.ws);
                if (meta.attachments) { meta.attachments = meta.attachments.filter(p => p !== rel && !p.startsWith(rel + '/')); writeForgeMeta(b.ws, meta); }
                console.log('fs delete:', b.ws + '/' + rel);
                res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
        });
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
        FSS.mkdirSync(wsDir(id), { recursive: true });
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
        function listDir(d, prefix, b) {
            let out = [];
            try {
                for (const f of FSS.readdirSync(d)) {
                    if (f.startsWith('.') || f.startsWith('_')) continue;
                    b.n--; // R2-I1: 预算要真的递减，否则形同虚设
                    if (b.n <= 0) return out;
                    const full = path.join(d, f);
                    let st; try { st = FSS.lstatSync(full); } catch { continue; }
                    // I2(审查s15): 跳过 junction，预算封顶
                    if (st.isSymbolicLink()) { out.push({ name: (prefix ? prefix + '/' : '') + f + '/', size: 0 }); continue; }
                    if (st.isDirectory()) out.push.apply(out, listDir(full, prefix ? prefix + '/' + f : f, b));
                    else out.push({ name: (prefix ? prefix + '/' : '') + f, size: st.size });
                }
            } catch {}
            return out;
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(listDir(wsDir(ws), '', { n: 500 })));
    }
    else if (url.startsWith('/api/upload') && req.method === 'POST') {
        const qs = new URL(req.url, 'http://x').searchParams;
        const ws = qs.get('ws') || '';
        if (!wsValidId(ws)) { res.writeHead(400); res.end(JSON.stringify({ ok: false, err: '缺工作区' })); return; }
        // 落点由用户在树上选中的目录决定（dir 缺省=根），身份只记进 .forge
        let dir = vcsSafeRel(qs.get('dir') || '');
        if (dir === null) dir = '';
        const fname = (qs.get('name') || ('upload-' + Date.now())).replace(/[\\/:*?"<>|]/g, '_');
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            try {
                const tdir = path.join(wsDir(ws), dir.split('/').join(path.sep));
                FSS.mkdirSync(tdir, { recursive: true });
                let finalName = fname;
                const extM = fname.match(/(\.[^.]+)$/);
                const base = extM ? fname.slice(0, fname.length - extM[1].length) : fname;
                const ext = extM ? extM[1] : '';
                let n = 1;
                while (FSS.existsSync(path.join(tdir, finalName))) { finalName = base + '-v' + (++n) + ext; }
                FSS.writeFileSync(path.join(tdir, finalName), Buffer.concat(chunks));
                const meta = readForgeMeta(ws);
                meta.attachments = meta.attachments || [];
                const rp = (dir ? dir + '/' : '') + finalName;
                if (!meta.attachments.includes(rp)) { meta.attachments.push(rp); if (meta.attachments.length > 1000) meta.attachments = meta.attachments.slice(-1000); }
                writeForgeMeta(ws, meta);
                console.log('uploaded:', ws + '/' + rp);
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, name: rp }));
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
    // C1(审查s15): 任意网页可连本机WS(CSWSH)——只接受本页面origin，否则API key可经test_model外带
    const origin = req.headers.origin || '';
    if (origin !== 'http://127.0.0.1:' + PORT) return socket.destroy();
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
            // I8(审查s15): 回显客户端关联 id，前端按 id 结算而不是 FIFO 猜
            const cid = msg.params && msg.params.__cid;
            const params = Object.assign({}, msg.params || {});
            delete params.__cid;
            const id = nextId++;
            waiting.set(id, { ws, __cid: cid });
            acp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: msg.method, params }) + '\n');
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
                // I1(审查s15): 会话删了就解除其工作区绑定，否则区卡在 active 态永远无法清理
                const wsm = readWsMap();
                let unbound = false;
                for (const k of Object.keys(wsm)) if (wsm[k].sid === msg.sessionId) { delete wsm[k]; unbound = true; }
                if (unbound) writeWsMap(wsm);
                console.log('session deleted', msg.sessionId, 'messages:', m.changes, 'row:', r.changes, 'unbound:', unbound);
                ws.send({ sys: 'session_deleted', sessionId: msg.sessionId, ok: r.changes > 0 });
            } catch (e) { ws.send({ sys: 'error', text: '删除失败: ' + e.message }); }
            return;
        }

        if (msg.type === 'copy_artifact') {
            const rel = String(msg.name || '').split('/').join(path.sep);
            const f = path.join(ROOT, 'data', 'artifacts', rel);
            if (rel.includes('..') || !require('fs').existsSync(f)) return ws.send({ sys: 'error', text: '文件不存在' });
            // I5(审查s15): 路径经 base64 进 PowerShell 再解码，引号/反引号无法逃逸
            const b64 = Buffer.from(f, 'utf8').toString('base64');
            require('child_process').spawn('powershell', ['-NoProfile', '-Command', '$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("' + b64 + '"));Set-Clipboard -LiteralPath $p'], { detached: true, stdio: 'ignore' }).unref();
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
                { role: 'system', content: '你是给完全不懂电脑的人当翻译的助手。用不超过三句中文大白话说明下面这一步操作做了什么、结果对用户意味着什么。禁止任何技术术语，不要出现"工具""调用""脚本"这类词，也不要复述任何路径或提示词原文。' },
                { role: 'user', content: '这一步叫：' + String(msg.title || '').split('\n')[0].slice(0, 80) + '\n结果摘要：' + String(msg.output || '(空)').slice(0, 600) }
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
                atomicWrite(sf, keep.join(String.fromCharCode(10)) + String.fromCharCode(10));
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
                atomicWrite(f, keep.join('\n') + '\n');
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
