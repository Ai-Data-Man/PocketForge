// s69 冷启六面探针实现（s69 转正自 tmp s69-cold-probe.js + s69-assert.js；入口见 cold-surface-probe.sh）。
// node 直连（禁 curl 纪律），NO_PROXY 进程内硬设；目标树路径/端口参数化，可在任意交付树复跑。
'use strict';
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PF_ROOT = (process.env.PF_ROOT || 'C:/PocketForge-Test').replace(/\\/g, '/').replace(/\/$/, '');
const BRIDGE_PORT = parseInt(process.env.PF_BRIDGE_PORT || '8790', 10);
let PC_PORT = 8099;
try { PC_PORT = parseInt(fs.readFileSync(path.join(PF_ROOT, 'data', 'pc.port'), 'utf8').trim(), 10) || 8099; } catch {}
const PC_EXE = path.join(PF_ROOT, 'bin', 'pc', 'process-compose.exe');

function get(port, p) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 5000 }, res => {
            let b = '';
            res.on('data', c => (b += c));
            res.on('end', () => resolve({ code: res.statusCode, body: b }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}
function pcGet(proc) {
    return new Promise((resolve, reject) => {
        execFile(PC_EXE, ['-p', String(PC_PORT), 'process', 'get', proc],
            { env: { ...process.env, PC_DISABLE_TUI: '1' }, timeout: 20000 },
            (e, stdout) => e ? reject(e) : resolve(stdout));
    });
}
const readText = p => fs.readFileSync(path.join(PF_ROOT, p), 'utf8');
const readJson = p => JSON.parse(readText(p));

let pass = 0, fail = 0;
function ck(name, fn) { try { fn(); console.log('PASS: ' + name); pass++; } catch (e) { console.log('FAIL: ' + name + ' — ' + (e && e.message)); fail++; } }
async function ckA(name, fn) { try { await fn(); console.log('PASS: ' + name); pass++; } catch (e) { console.log('FAIL: ' + name + ' — ' + (e && e.message)); fail++; } }

// config.yaml extensions 块解析（与桥 readExtState 同语义：# 豁免顶格注释行——含注释 config 读取正确的判别器）
function readExtState(raw) {
    const out = {};
    let inExts = false, cur = null;
    for (const line of raw.split(/\r?\n/)) {
        if (/^extensions:\s*$/.test(line)) { inExts = true; continue; }
        if (!inExts) continue;
        if (/^[^\s#]/.test(line)) break; // 下一顶级键
        const extM = line.match(/^ {2}([A-Za-z0-9_\-]+):\s*$/);
        if (extM) { cur = extM[1]; out[cur] = true; continue; }
        if (cur) {
            const enM = line.match(/^ {4}enabled:\s*(true|false)/);
            if (enM) out[cur] = enM[1] === 'true';
        }
    }
    return out;
}
// permission.yaml user: 块解析（2 空格键 + 同缩进 `- item` 列表）
function parseUserBlock(raw) {
    const lines = raw.split(/\r?\n/);
    const ui = lines.findIndex(l => /^user:\s*$/.test(l));
    if (ui < 0) throw new Error('no user: block');
    const keys = {}; let cur = null;
    for (const line of lines.slice(ui + 1)) {
        if (/^[^\s#]/.test(line)) break; // 下一顶级键（如 smart_approve）
        const k = line.match(/^ {2}([a-z_]+):\s*(.*)$/);
        if (k) { cur = k[1]; keys[cur] = k[2] === '[]' ? [] : (keys[cur] || []); continue; }
        const it = line.match(/^ {2}- (.+)$/);
        if (it && cur) keys[cur].push(it[1].trim());
    }
    return keys;
}

(async () => {
    // ---------- 冷启态 ----------
    const t0 = Date.now();
    const hz = await get(BRIDGE_PORT, '/healthz');
    ck('cold: healthz 200 ok (' + (Date.now() - t0) + 'ms)', () => {
        if (hz.code !== 200 || !/ok/.test(hz.body)) throw new Error('code=' + hz.code + ' body=' + hz.body.slice(0, 80));
    });
    const procs = JSON.parse((await get(PC_PORT, '/processes')).body).data;
    const byName = n => procs.find(p => p.name === n);
    ck('cold: pg-init Completed exit=0 restarts=0', () => {
        const p = byName('pg-init');
        if (!p) throw new Error('pg-init absent');
        if (p.status !== 'Completed' || p.exit_code !== 0 || (p.restarts ?? 0) !== 0) throw new Error(JSON.stringify(p));
    });
    ck('cold: pg running restarts=0', () => {
        const p = byName('pg');
        if (!p) throw new Error('pg absent');
        if (!p.is_running || (p.restarts ?? 0) !== 0) throw new Error(JSON.stringify(p));
    });
    await ckA('cold: pg HEALTH Ready (pc process get)', async () => {
        const out = await pcGet('pg');
        if (!/^\S.*\bpg\b.*$/m.test(out) || !/Ready/.test(out)) throw new Error('no Ready in: ' + out.split('\n').slice(-3).join(' | ').slice(0, 200));
    });

    // ---------- ①升级两步向导标记 ----------
    const page = (await get(BRIDGE_PORT, '/')).body;
    ck('S1: page has two-step upgrade wizard ids (upd-zip-file/upd-sha-file/upd-manual-go …)', () => {
        for (const id of ['upd-manual-btn', 'upd-manual', 'upd-zip-file', 'upd-zip-btn', 'upd-zip-status', 'upd-sha-file', 'upd-sha-btn', 'upd-sha-status', 'upd-manual-go'])
            if (!page.includes('id="' + id + '"')) throw new Error('missing #' + id);
    });
    ck('S1: wizard step labels 第 1 步(.zip)/第 2 步(.sha256) present', () => {
        if (!/第 1 步：安装包（\.zip）/.test(page)) throw new Error('step-1 label missing');
        if (!/第 2 步：校验文件（\.sha256）/.test(page)) throw new Error('step-2 label missing');
    });

    // ---------- ②skill-sources 双源首启 ----------
    const ss = readJson('data/config/skill-sources.json');
    ck('S2: skill-sources _schema:2 first-boot defaults with exactly 2 enabled distinct sources', () => {
        if (ss._schema !== 2) throw new Error('_schema=' + ss._schema);
        if (!Array.isArray(ss.sources) || ss.sources.length !== 2) throw new Error('sources=' + JSON.stringify(ss.sources));
        if (!ss.sources.every(s => s.enabled === true && s.repo && s.branch)) throw new Error('not all enabled/valid');
        if (new Set(ss.sources.map(s => s.repo)).size !== 2) throw new Error('repos not distinct');
    });
    console.log('  S2 sources: ' + ss.sources.map(s => s.repo).join(', '));

    // ---------- ③mcp-catalog 3 条 ----------
    // s73 实证：目录文件懒落盘（readMcpCatalog 首次被调才生成；冷启无 UI 交互时不存在）——先走 API 物化再读文件（ENOENT 即红）
    await get(BRIDGE_PORT, '/api/config/market');
    const mc = readJson('data/config/mcp-catalog.json');
    ck('S3: mcp-catalog _schema:1 with exactly 3 fully-formed entries', () => {
        if (mc._schema !== 1) throw new Error('_schema=' + mc._schema);
        if (!Array.isArray(mc.catalog) || mc.catalog.length !== 3) throw new Error('catalog len=' + (mc.catalog || []).length);
        for (const e of mc.catalog)
            for (const f of ['id', 'name', 'desc', 'pkg', 'entry', 'license'])
                if (!e[f]) throw new Error('entry ' + (e.id || '?') + ' missing ' + f);
    });
    console.log('  S3 catalog: ' + mc.catalog.map(e => e.id).join(', '));

    // ---------- ④permission user 三键 + never_allow ----------
    const userKeys = parseUserBlock(readText('conf/goose/config/permission.yaml'));
    ck('S4: permission user block has exactly the 3 keys', () => {
        const got = Object.keys(userKeys).sort();
        if (JSON.stringify(got) !== JSON.stringify(['always_allow', 'ask_before', 'never_allow'])) throw new Error('keys=' + got.join(','));
    });
    ck('S4: user.never_allow contains browser__browser_run_code_unsafe', () => {
        if (!userKeys.never_allow.includes('browser__browser_run_code_unsafe')) throw new Error('never_allow=' + JSON.stringify(userKeys.never_allow));
    });

    // ---------- ⑤CONTEXT_FILE_NAMES + 四扩展关停 ----------
    const cfgRaw = readText('conf/goose/config/config.yaml');
    const extState = readExtState(cfgRaw);
    ck('S5: config CONTEXT_FILE_NAMES is [.goosehints] only', () => {
        if (!/^CONTEXT_FILE_NAMES:\s*\['\.goosehints'\]\s*$/m.test(cfgRaw)) throw new Error('marker not found');
    });
    ck('S5: core four extensions present+enabled (faucet-db/browser/chatrecall/memory)', () => {
        for (const id of ['faucet-db', 'browser', 'chatrecall', 'memory'])
            if (extState[id] !== true) throw new Error(id + '=' + extState[id]);
    });
    ck('S5: four platform extensions parsed disabled despite in-block comments (apps/summon/extensionmanager/analyze)', () => {
        for (const id of ['apps', 'summon', 'extensionmanager', 'analyze'])
            if (extState[id] !== false) throw new Error(id + '=' + extState[id] + '（注释阻断扫描或未关停）');
    });

    // ---------- ⑥mcpEnabled 一致性：能力面板 enabled 与 config 一致 ----------
    const exts = JSON.parse((await get(BRIDGE_PORT, '/api/extensions')).body);
    ck('S6: /api/extensions enabled matches config.yaml for every entry (absent block = true)', () => {
        if (!Array.isArray(exts)) throw new Error('not a list');
        for (const e of exts) {
            const expected = extState[e.id] !== false;
            if (e.enabled !== expected) throw new Error(e.id + ' api=' + e.enabled + ' config=' + expected);
        }
    });
    ck('S6: disabled platform extensions do not surface in capability panel', () => {
        const ids = exts.map(e => e.id);
        for (const id of ['apps', 'summon', 'extensionmanager', 'analyze'])
            if (ids.includes(id)) throw new Error(id + ' surfaced');
    });

    console.log('==============================');
    console.log('cold-surface-probe [' + PF_ROOT + ' bridge:' + BRIDGE_PORT + ' pc:' + PC_PORT + ']: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL: ' + (e && e.message)); process.exit(1); });
