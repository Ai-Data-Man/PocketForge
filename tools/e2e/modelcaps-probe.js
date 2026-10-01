// [s107/f6 入库] 用途：模型能力注册表（data/model-caps.json）：缺省条目派生=官方预置表值域/家族激活/别名出站真名
// 用法：node tools/e2e/modelcaps-probe.js（env 覆盖：PF_TPL/PF_BRIDGE/PF_PRESETS/PF_GOOSE_BIN 等见体内；自建沙箱桥本地口，不碰 dev 栈 8790）
// 来源：s98-s101 各批 forge/tmp 同名探针（AGENTS §8.2 触桥清单成员；s106 留痕「探针入库义务」的补账，s107/f6 落库）
// s98/llm-proxy C2 探针：模型能力注册表（data/model-caps.json）。s100/T2 随迁（裁决 2026-09-22-capability-config-v2 §2.3）
// + s101/W2 随迁（裁决 2026-09-23 §2.1）：
//   R1 缺省条目派生（池 fixture 单测）：-flash+去后缀兄弟→variant 家族（**档位集自 W2 起读官方预置表值域**，
//      glm-5.3={low,high,max} 零 off、glm-5.3-flash 能看图、deepseek 四档含 none、glm-5.2 走厂系正则 high/max、
//      claude 别名 ccp/ 前缀经去前缀层命中官方；未收录=诚实缺省 levels=[] unknown:true source:guess）。
//   R2 读写往返+校验门：POST /api/modelcaps set→GET 反映；坏 JSON 文件→兜底重生成；非法 patch 人话拒；跨站 Origin
//      POST→403（全局门）；R2f variant 拒写新红（桥自管门）+R2g/R2g2/R2g3 levels/default 写通道重开（s101/W3 裁决
//      §2.2 字段级 user 标记；红对照=改前桥 levels 整包拒）+R2h mode 拒收新红。
//   R2i 字段级 user 语义红绿对照（W3 核心）：改 levels 后官方表刷新（表版本升）**不动它**、未改字段（context_len）
//      照刷新；用户改过的字段永不覆写。
//   R2j 消费面闭环 wire 实证（W3 验收核心）：改 caps.levels → 别名出站可发档位集合随之变化（normalizeEffort 读
//      caps.levels）；改 caps.thinking.default → 出站随动（s104/V1 语义：user 改过的 default 上 wire=无显式档出站
//      reasoning_effort 随之；官方默认档不上 wire，subscribe 桥填充默认档零 ACP 帧）。
//   R3 家族重指向读路径零改：user API 改 variant→拒（新红）；重指向=文件层桥内写模拟→下一别名请求即时跟随
//      （别名不变 fast 锚定、官方思考参数随行——值=归一后档，档位集来自官方表）。
//   R4 providers 帧 caps 只加不破（既有键原样+caps 键在场+source 三态字段随行）。
//   R5 用户改过（user 标记/source=user）不被官方表覆写；家族解散（mode→none）改由文件层桥内写模拟。
//   R6 schema v3 迁移自测（ADR-0009）：旧文件 1→2（levels 归一）+2→3（user 条目标 source=user 保原样；
//      非 user 条目清空→按官方表重生成）→重启桥→_schema:3+读回等价+家族不丢（迁移留档+活体翻译）。
// 红绿：node tmp/modelcaps-probe.js —— 改前桥跑= R2f/R2h/R3a/R6 臂红（无门无迁移；R2h=改前接受 mode:'none'）。
// **探针须随包复制 conf/model-presets.json 进沙箱**（出厂形态：预置表随包落 conf/，桥运行时直读）。
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const FORGE = path.join(__dirname, '..', '..', 'forge'); // 入库 s107/f6：自 forge/tmp 迁 tools/e2e，深度随迁
const TPL_BRIDGE = process.env.PF_BRIDGE || path.join(FORGE, 'conf', 'templates', 'chat-bridge.tpl.js');
const SB = path.join(FORGE, 'tmp', 'modelcaps-sb');
const MOCK_PORT = 20893, PORT = 20793;
const ALIAS = 'gpt-5-forge-no-lv-flash'; // s98: 家族别名锚定 fast 成员名（deep 重指向别名不变，存量会话不失联）
// s101/W4：家族降为兜底且默认关——本探针测家族读路径，故桥以 FORGE_VARIANT_FAMILY=1 起（强制开），
// 且家族载体改用**官方表未收录的 no-lv 对**（官方有档位的 glm 走参数路线、不配对=验收④形态）。
const FAM_FAST = 'no-lv-flash', FAM_DEEP = 'no-lv';
function postAlias(tag, model) { // 别名请求（家族翻译消费面唯一入口）：/llmproxy 上游打 tag 一条，返回 {status, body}
    return new Promise((resolve, reject) => {
        const data = Buffer.from(JSON.stringify({ model: model || ALIAS, reasoning_effort: 'max', stream: true, messages: [{ role: 'user', content: tag }] }), 'utf8');
        const rq = http.request({ host: '127.0.0.1', port: PORT, path: '/llmproxy/chat/completions', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length } }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        });
        rq.on('error', reject); rq.setTimeout(15000, () => rq.destroy(new Error('timeout')));
        rq.write(data); rq.end();
    });
}
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok || !why ? '' : ' — ' + String(why))); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- mock 上游（同 proxythink 形态，最小 SSE） ----------
const upstream = [];
const mock = http.createServer((req, res) => {
    let buf = '';
    req.on('data', c => { buf += c; });
    req.on('end', () => {
        const rec = { url: req.url, raw: buf };
        try { rec.body = JSON.parse(buf); } catch {}
        upstream.push(rec);
        if (req.method === 'GET' && req.url.includes('models')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ object: 'list', data: ['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'deepseek-v4.1-flash', 'ccp/claude-sonnet-5'].map(id => ({ id, object: 'model' })) }));
            return;
        }
        const model = (rec.body && rec.body.model) || 'x';
        const tag = (rec.body && rec.body.messages && rec.body.messages[0] && rec.body.messages[0].content) || '';
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: ' + JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta: { role: 'assistant', content: tag }, finish_reason: null }] }) + '\n\n');
        res.write('data: ' + JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
        res.end('data: [DONE]\n\n');
    });
});
function httpJson(method, p, body, headers) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
        const rq = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: Object.assign(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}, headers || {}) }, res => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode, json: j, text: b }); });
        });
        rq.on('error', reject);
        rq.setTimeout(15000, () => rq.destroy(new Error('timeout')));
        if (data) rq.write(data);
        rq.end();
    });
}
function wsFrame(str) {
    const payload = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
function wsConnect(onFrame) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const rq = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + PORT } });
        rq.end();
        const timer = setTimeout(() => reject(new Error('ws upgrade timeout')), 8000);
        rq.on('upgrade', (res, socket) => {
            clearTimeout(timer);
            const api = { send: o => socket.write(wsFrame(JSON.stringify(o))), close: () => { try { socket.destroy(); } catch {} } };
            let buf = Buffer.alloc(0);
            socket.on('data', d => {
                buf = Buffer.concat([buf, d]);
                while (buf.length >= 2) {
                    let len = buf[1] & 0x7f, off = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
                    if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
                    if (buf.length < off + len) return;
                    let msg; try { msg = JSON.parse(buf.slice(off, off + len).toString('utf8')); } catch { buf = buf.slice(off + len); continue; }
                    buf = buf.slice(off + len);
                    if (msg) onFrame(msg);
                }
            });
            socket.on('error', () => {});
            socket.on('close', () => {});
            resolve(api);
        });
        rq.on('error', e => { clearTimeout(timer); reject(e); });
    });
}
async function waitFrame(frames, pred, ms) {
    const t0 = Date.now();
    for (;;) {
        const f = frames.find(pred);
        if (f) return f;
        if (Date.now() - t0 > ms) return null;
        await sleep(120);
    }
}
async function waitHealth() {
    const t0 = Date.now();
    for (;;) {
        const ok = await new Promise(res => {
            const r = http.get({ host: '127.0.0.1', port: PORT, path: '/healthz', timeout: 1000 }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b === 'ok')); }).on('error', () => res(false));
            r.on('timeout', () => { r.destroy(); res(false); });
        });
        if (ok) return true;
        if (Date.now() - t0 > 30000) return false;
        await sleep(300);
    }
}

(async () => {
    await new Promise(r => mock.listen(MOCK_PORT, '127.0.0.1', r));
    let bridge = null, berr = '';
    const WIRE = path.join(SB, 'wire.jsonl'); // s101/W3: 消费面闭环 wire 实证（桥→ACP set_config_option 帧落盘）
    const rdWire = () => { try { return fs.readFileSync(WIRE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
    const startBridge = () => { // s100/T2 R6 迁移臂需要重启：spawn/health 收口成函数（同一沙盒同一端口）
        bridge = spawn(process.execPath, [path.join(SB, 'bridge-patched.js')], {
            env: Object.assign({}, process.env, { FORGE_ROOT: SB, PORT: String(PORT), PF_ACP_STUB: path.join(SB, 'goose-stub.js'), PF_STUB_WIRE: WIRE, FORGE_VARIANT_FAMILY: '1', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' }),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        berr = '';
        bridge.stderr.on('data', d => { berr += d; });
        return waitHealth();
    };
    const stopBridge = () => {
        if (!bridge) return;
        try { require('child_process').execSync('taskkill /PID ' + bridge.pid + ' /T /F', { stdio: 'ignore' }); } catch { try { bridge.kill(); } catch {} }
        bridge = null;
    };
    try {
        try { fs.rmSync(SB, { recursive: true, force: true }); } catch {}
        for (const d of ['conf/goose/config', 'conf/goose/data/sessions', 'data/logs', 'data/stats']) fs.mkdirSync(path.join(SB, ...d.split('/')), { recursive: true });
        fs.copyFileSync(path.join(FORGE, 'conf', 'model-presets.json'), path.join(SB, 'conf', 'model-presets.json')); // s101/W2：官方预置表随包落 conf/（真桥现读）
        fs.writeFileSync(path.join(SB, 'VERSION'), '9.9.9-modelcaps-probe');
        fs.writeFileSync(path.join(SB, 'conf', 'goose', 'config', 'config.yaml'), 'GOOSE_PROVIDER: openai\nGOOSE_DISABLE_UPDATE_CHECK: true\nextensions: {}\n');
        fs.writeFileSync(path.join(SB, 'data', 'providers.json'), JSON.stringify([
            { name: 'probe家', host: 'http://127.0.0.1:' + MOCK_PORT + '/v1', models: ['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'deepseek-v4.1-flash', 'ccp/claude-sonnet-5', FAM_FAST, FAM_DEEP], key: 'probe-key', active: true }
        ], null, 2));
        fs.writeFileSync(path.join(SB, 'data', 'secrets.env'), 'PC_TOKEN=probe\n'); // providers 帧路径会 rewriteSecretsEnv——缺文件即抛错吞帧
        const src = fs.readFileSync(TPL_BRIDGE, 'utf8');
        const GOOSE_ANCHOR = "const child = spawn(GOOSE, ['acp'], {";
        if (src.split(GOOSE_ANCHOR).length - 1 !== 1) { ck('W0 桥模板 spawnAcp 锚点恰一处（可桩化）', false, 'anchor count != 1'); process.exit(1); }
        fs.writeFileSync(path.join(SB, 'bridge-patched.js'), src.replace(GOOSE_ANCHOR, "const child = spawn(process.execPath, [process.env.PF_ACP_STUB || GOOSE, 'acp'], {"));
        fs.writeFileSync(path.join(SB, 'goose-stub.js'), `
const fs = require('fs');
const WIRE = process.env.PF_STUB_WIRE;
let buf = ''; let seq = 0;
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => {
  buf += c; let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    try { if (WIRE) fs.appendFileSync(WIRE, JSON.stringify(j) + '\\n'); } catch {}
    if (j.id === undefined || j.id === null) continue;
    let result = {};
    if (j.method === 'initialize') result = { agentInfo: { name: 'goose-probe', version: '1.50.0-probe' }, protocolVersion: 1 };
    else if (j.method === 'session/new') result = { sessionId: '20260920_' + (++seq), configOptions: [
      { id: 'model', currentValue: process.env.PF_STUB_MODEL || 'glm-5.3-flash', options: [{ value: process.env.PF_STUB_MODEL || 'glm-5.3-flash', name: 'm' }] },
      { id: 'thinking_effort', category: 'thought_level', type: 'select', currentValue: 'low', options: ['none','off','low','medium','high','max'].map(v => ({ value: v, name: v })) },
    ], modes: { availableModes: [], currentModeId: null } };
    else if (j.method === 'session/set_config_option') result = { configOptions: [] };
    else if (j.method === 'session/load') result = { sessionId: (j.params || {}).sessionId, configOptions: [], updates: [] };
    else if (j.method === 'session/prompt') result = { stopReason: 'end' };
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: j.id, result }) + '\\n');
  }
});
process.stdin.on('end', () => process.exit(0));
const t = setTimeout(() => process.exit(0), 120000); if (t.unref) t.unref();
`);
        if (!await startBridge()) { ck('W0 沙箱桥启动（healthz）', false, berr.slice(-300)); process.exit(1); }
        ck('W0 沙箱桥启动（healthz）', true);
        await sleep(600);
        const CAPS_FILE = path.join(SB, 'data', 'model-caps.json');

        // ---- R1 缺省条目派生（s101/W2：官方预置表优先，未收录=诚实缺省；s101/W4：家族配对仅官方无档位者）----
        const capsAfter = JSON.parse(fs.readFileSync(CAPS_FILE, 'utf8'));
        const caps = capsAfter.caps || {};
        const v = caps[FAM_FAST] && caps[FAM_FAST].thinking || {};
        ck('R1a 官方无档位的 -flash+去后缀兄弟→variant 家族（fast/deep 镜像）；官方有档位的 glm 走参数路线（mode:native，零 variant）',
            v.mode === 'variant' && v.variant && v.variant.fast === FAM_FAST && v.variant.deep === FAM_DEEP &&
            caps[FAM_DEEP] && caps[FAM_DEEP].thinking.mode === 'variant' && caps[FAM_DEEP].thinking.variant.deep === FAM_DEEP &&
            caps['glm-5.3'] && caps['glm-5.3'].thinking.mode === 'native' && !caps['glm-5.3'].thinking.variant &&
            JSON.stringify(caps['glm-5.3'].thinking.levels) === JSON.stringify(['low', 'high', 'max']),
            JSON.stringify(v));
        ck('R1b 官方表命中：glm-5.3/5.3-flash/deepseek 三池内模型 source=official；claude 别名(cpp/claude-sonnet-5)亦官方收录',
            caps['glm-5.3'].source === 'official' && caps['glm-5.3-flash'].source === 'official' &&
            caps['deepseek-v4.1-flash'].source === 'official' && caps['ccp/claude-sonnet-5'] && caps['ccp/claude-sonnet-5'].source === 'official',
            JSON.stringify([caps['glm-5.3'].source, caps['deepseek-v4.1-flash'].source, caps['ccp/claude-sonnet-5'] && caps['ccp/claude-sonnet-5'].source]));
        const unknown = caps['glm-5.2'];
        ck('R1c 官方表未收录族系：glm-5.2 走厂系默认（source=official, high/max）；看图/上下文=官方真值（glm-5.3-flash 能看图, 1M 非估计）；W4：官方无档位的 no-lv 对诚实缺省',
            unknown && unknown.source === 'official' && Array.isArray(unknown.thinking.levels) && unknown.thinking.levels.join(',') === 'high,max' &&
            caps['glm-5.3-flash'].multimodal === true && caps['glm-5.3-flash'].context_len === 1000000 && caps['glm-5.3-flash'].context_est === false &&
            caps[FAM_DEEP].source === 'guess' && Array.isArray(caps[FAM_DEEP].thinking.levels) && caps[FAM_DEEP].thinking.levels.length === 0,
            JSON.stringify({ a: unknown && unknown.thinking, f: caps['glm-5.3-flash'] }));

        // ---- R2 读写往返 + 校验门 + Origin 门 ----
        const s1 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { context_len: 131072, multimodal: true } });
        ck('R2a set 往返：上下文+看图改写落盘', s1.status === 200 && s1.json && s1.json.ok === true, s1.text.slice(0, 120));
        const g1 = await httpJson('GET', '/api/modelcaps');
        const gc = g1.json && g1.json.caps && g1.json.caps['glm-5.3'] || {};
        ck('R2b GET 反映改值+user 标记（启发式不再覆写）', gc.context_len === 131072 && gc.multimodal === true && gc.user === true, JSON.stringify(gc));
        const bads = [
            ['mode 枚举外', { op: 'set', model: 'glm-5.3', patch: { thinking: { mode: 'magic' } } }],
            ['deep ∉ 池', { op: 'set', model: 'glm-5.3-flash', patch: { thinking: { mode: 'variant', variant: { fast: 'glm-5.3-flash', deep: 'no-such-model' } } } }],
            ['负 context_len', { op: 'set', model: 'glm-5.3', patch: { context_len: -5 } }],
            ['非布尔 multimodal', { op: 'set', model: 'glm-5.3', patch: { multimodal: 'yes' } }],
            ['模型 ∉ 池', { op: 'set', model: 'no-such-model', patch: { multimodal: true } }],
            ['op 枚举外', { op: 'nuke', model: 'glm-5.3' }],
        ];
        let badOk = true, why = '';
        for (const [n, body] of bads) {
            const r = await httpJson('POST', '/api/modelcaps', body);
            if (!(r.status === 200 && r.json && r.json.ok === false)) { badOk = false; why = n + '→' + r.status + ':' + r.text.slice(0, 60); break; }
        }
        ck('R2c 非法 patch 六臂人话拒（ok:false，零落盘）', badOk, why);
        const xorigin = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { multimodal: false } }, { Origin: 'http://evil.example' });
        ck('R2d 跨站 Origin POST→403（全局门）', xorigin.status === 403, xorigin.status + ':' + xorigin.text.slice(0, 60));
        // 坏 JSON 兜底：写坏文件→GET 触发重生成（不炸、可自愈）
        fs.writeFileSync(CAPS_FILE, '{broken json!!');
        const g2 = await httpJson('GET', '/api/modelcaps');
        ck('R2e 坏 JSON 文件→兜底重生成（预置表条目回来，用户改丢但桥不炸+诚实可改）',
            g2.status === 200 && g2.json && g2.json.caps && g2.json.caps['glm-5.3'] && g2.json.caps['glm-5.3'].thinking.mode === 'native',
            g2.text.slice(0, 120));

        // ---- R2f variant 拒收新红（s100/T2 桥自管门；红对照=改前桥此臂 ok:true 必红）+ R2g levels 档位集写通道 ----
        const gpre = await httpJson('GET', '/api/modelcaps');
        const preFam = JSON.stringify((gpre.json.caps['glm-5.3-flash'] || {}).thinking);
        const rv1 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3-flash', patch: { thinking: { variant: { fast: 'glm-5.3-flash', deep: 'glm-5.3' } } } });
        const gpre2 = await httpJson('GET', '/api/modelcaps');
        ck('R2f user patch 携带 thinking.variant →拒（人话=家族配对由系统自动管理，不用您操心）+注册表零变',
            rv1.status === 200 && rv1.json && rv1.json.ok === false && rv1.json.err === '家族配对由系统自动管理，不用您操心' &&
            JSON.stringify((gpre2.json.caps['glm-5.3-flash'] || {}).thinking) === preFam,
            rv1.text.slice(0, 100));
        const gpreG = await httpJson('GET', '/api/modelcaps');
        const preLcG = JSON.stringify((gpreG.json.caps['glm-5.2'] || {}).thinking);
        const preUserG = !!(gpreG.json.caps['glm-5.2'] || {}).user;
        const sl = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.2', patch: { thinking: { levels: ['off', 'low', 'high', 'max'] } } });
        const gl = await httpJson('GET', '/api/modelcaps');
        const lc = (gl.json.caps['glm-5.2'] || {}).thinking || {};
        const lcUser = (gl.json.caps['glm-5.2'] || {}).user_fields || [];
        // s101/W3（裁决 2026-09-23 §2.2）：levels 写通道重开（s100/P3-4 整体关撤销）——字段级 user 标记，改过即永不覆写
        ck('R2g levels 用户写重开（W3）+字段级 user 标记（user_fields 含 thinking.levels，未改字段不列）',
            !!(sl.json) && sl.json.ok === true && JSON.stringify(lc.levels) === JSON.stringify(['off', 'low', 'high', 'max']) &&
            lc.unknown === false && lcUser.indexOf('thinking.levels') >= 0 && lcUser.indexOf('context_len') < 0 &&
            (gl.json.caps['glm-5.2'] || {}).source === 'user' &&
            JSON.stringify(lc) !== preLcG && !!(gl.json.caps['glm-5.2'] || {}).user === true,
            sl.text.slice(0, 100) + ' | ' + JSON.stringify(lc));
        // W3 非法/重复档位人话拒（裁决 §2.2「非空/字符串/去重/有序兜底」）
        const gpreB = await httpJson('GET', '/api/modelcaps');
        const preThB = JSON.stringify((gpreB.json.caps['glm-5.2'] || {}).thinking);
        const badLv = [
            ['空档位集', { thinking: { levels: [] } }],
            ['非字符串档', { thinking: { levels: ['low', 5] } }],
            ['重复档位', { thinking: { levels: ['low', 'low'] } }],
            ['默认档越界', { thinking: { default: 'ultra' } }], // glm-5.2 用户值域 off/low/high/max 不含 ultra
        ];
        let lvBadOk = true, lvBadWhy = '';
        for (const [n, patch] of badLv) {
            const r = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.2', patch });
            if (!(r.status === 200 && r.json && r.json.ok === false && typeof r.json.err === 'string' && r.json.err)) { lvBadOk = false; lvBadWhy = n + ':' + r.text.slice(0, 80); break; }
        }
        const gpostB = await httpJson('GET', '/api/modelcaps');
        ck('R2g2 非法/重复档位与越界默认档四臂人话拒+注册表零变（红对照=改前桥 levels 写整包拒但拒因恒「快慢档位由系统自动管理」）',
            lvBadOk && JSON.stringify((gpostB.json.caps['glm-5.2'] || {}).thinking) === preThB, lvBadWhy);
        // W3 input/context_len/max_output 字段级写 + thinking.default 合法写
        const sd = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.2', patch: { thinking: { default: 'low' } } });
        const gd = await httpJson('GET', '/api/modelcaps');
        ck('R2g3 thinking.default 合法写落盘（值域内）+user_fields 含 thinking.default',
            sd.json && sd.json.ok === true && gd.json.caps['glm-5.2'].thinking.default === 'low' &&
            (gd.json.caps['glm-5.2'].user_fields || []).indexOf('thinking.default') >= 0, sd.text.slice(0, 100));

        // ---- W6 复位语义（s101/W6，QA s101 P3-1 闭环「反单向棘轮」）：patch 收 reset:'official'/字段列表 ——
        //     清 user_fields 条目+从官方表重取值；官方未收录=诚实缺省（零编造）；非法值人话拒。
        //     红对照=改前桥：reset 键不在白名单（thinking 下只收 levels/default）→ 恒『参数不合法』，本批全臂红。
        {
            const gW0 = await httpJson('GET', '/api/modelcaps');
            const preGlm = JSON.stringify(gW0.json.caps['glm-5.3']);
            // ① 改 levels+default → user_fields 两字段；reset:'official' → 回官方三档且 user_fields 清空
            const sw1 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { levels: ['low'], default: null } } });
            const gw1 = await httpJson('GET', '/api/modelcaps');
            const u1 = gw1.json.caps['glm-5.3'];
            const preUser = (u1.user_fields || []).slice();
            const rw1 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { reset: 'official' } });
            const gw2 = await httpJson('GET', '/api/modelcaps');
            const u2 = gw2.json.caps['glm-5.3'];
            ck('W6a reset:\'official\' 复位：levels 回官方三档+default 回官方 max+user_fields 清空+source 回 official（红对照=改前桥 reset 键=参数不合法）',
                sw1.json && sw1.json.ok === true && preUser.indexOf('thinking.levels') >= 0 && preUser.indexOf('thinking.default') >= 0 &&
                rw1.json && rw1.json.ok === true &&
                JSON.stringify(u2.thinking.levels) === JSON.stringify(['low', 'high', 'max']) && u2.thinking.default === 'max' &&
                !u2.user_fields && !u2.user && u2.source === 'official' &&
                Array.isArray(u2.official_levels) && u2.official_levels.length === 3,
                rw1.text.slice(0, 120) + ' | ' + JSON.stringify({ lv: u2.thinking.levels, d: u2.thinking.default, uf: u2.user_fields, s: u2.source }));
            // ② 字段级 reset：只复位列出字段，其余 user 字段照留
            const sw2 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { context_len: 500000, thinking: { levels: ['low', 'high'] } } });
            const rw2 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { reset: ['context_len'] } });
            const gw3 = await httpJson('GET', '/api/modelcaps');
            const u3 = gw3.json.caps['glm-5.3'];
            ck('W6b 字段级 reset:[\'context_len\']：该字段回官方 1000000（context_est=false）+user_fields 去掉它，thinking.levels 用户标记照留（source 仍 user=部分复位不误翻态）',
                sw2.json && sw2.json.ok === true &&
                rw2.json && rw2.json.ok === true && u3.context_len === 1000000 && u3.context_est === false &&
                (u3.user_fields || []).indexOf('context_len') < 0 && (u3.user_fields || []).indexOf('thinking.levels') >= 0 &&
                u3.source === 'user' && u3.user === true &&
                JSON.stringify(u3.thinking.levels) === JSON.stringify(['low', 'high']),
                rw2.text.slice(0, 120) + ' | ' + JSON.stringify({ ctx: u3.context_len, uf: u3.user_fields, s: u3.source }));
            // ③ 官方未收录模型复位=诚实缺省（不编造）：no-lv 用户加档→复位→levels=[]+unknown+source=guess
            const sw3 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: FAM_DEEP, patch: { thinking: { levels: ['minimal'] } } });
            const rw3 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: FAM_DEEP, patch: { reset: 'official' } });
            const gw4 = await httpJson('GET', '/api/modelcaps');
            const u4 = gw4.json.caps[FAM_DEEP];
            ck('W6c 官方未收录模型复位=诚实缺省：levels 回 []+unknown:true+source=guess（零编造数字/档位）',
                sw3.json && sw3.json.ok === true && rw3.json && rw3.json.ok === true &&
                Array.isArray(u4.thinking.levels) && u4.thinking.levels.length === 0 && u4.thinking.unknown === true &&
                u4.source === 'guess' && !u4.user_fields && u4.context_len === null,
                rw3.text.slice(0, 120) + ' | ' + JSON.stringify({ lv: u4.thinking.levels, s: u4.source, ctx: u4.context_len }));
            // ④ 非法 reset 值人话拒 + 注册表零变
            const gW5 = await httpJson('GET', '/api/modelcaps');
            const preW5 = JSON.stringify(gW5.json.caps);
            const badR = [
                ['reset 枚举外', { reset: 'magic' }],
                ['reset 空列表', { reset: [] }],
                ['reset 未知字段', { reset: ['nope'] }],
                ['reset 非字符串元素', { reset: [5] }],
                ['reset 与其它修改混发', { reset: 'official', context_len: 123 }],
                ['已干净条目复位', { reset: 'official' }], // ccp/claude-sonnet-5 未改过→「这条没改过什么」
                ['字段级但该字段未改过', { reset: ['max_output'] }], // glm-5.3 未改过 max_output→「这条没改过什么」
            ];
            let rOk = true, rWhy = '';
            for (const [n, patch] of badR) {
                const md = n === '已干净条目复位' ? 'ccp/claude-sonnet-5' : 'glm-5.3';
                const r = await httpJson('POST', '/api/modelcaps', { op: 'set', model: md, patch });
                if (!(r.status === 200 && r.json && r.json.ok === false && typeof r.json.err === 'string' && r.json.err)) { rOk = false; rWhy = n + ':' + r.text.slice(0, 80); break; }
            }
            const gW6 = await httpJson('GET', '/api/modelcaps');
            ck('W6d 非法 reset 七臂人话拒（枚举外/空列表/未知字段/非字符串/混发/已干净条目/未改过的字段）+注册表零变',
                rOk && JSON.stringify(gW6.json.caps) === preW5, rWhy);
        }

        // ---- R2h mode 拒收新红（s100/P3-a：user 面 mode 写可拆家族且无恢复入口→user patch 携带即拒。
        // 红对照=改前桥 mode:'none' 此臂 ok:true（兼容写放行）必红；mode:'magic' 改前也拒但拒因不同，故用 none 钉差异）----
        const gpreH = await httpJson('GET', '/api/modelcaps');
        const preThH = JSON.stringify((gpreH.json.caps['glm-5.3'] || {}).thinking);
        const rh1 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { mode: 'none' } } });
        const rh2 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { mode: 'native', levels: ['low'] } } });
        const gpostH = await httpJson('GET', '/api/modelcaps');
        ck('R2h user patch 携带 thinking.mode（none/native 皆拒）→人话=快慢识别由系统自动管理，不用您操心+注册表零变',
            rh1.status === 200 && rh1.json && rh1.json.ok === false && rh1.json.err === '快慢识别由系统自动管理，不用您操心' &&
            rh2.status === 200 && rh2.json && rh2.json.ok === false && rh2.json.err === '快慢识别由系统自动管理，不用您操心' &&
            JSON.stringify((gpostH.json.caps['glm-5.3'] || {}).thinking) === preThH,
            rh1.text.slice(0, 100) + ' | ' + rh2.text.slice(0, 100));

        // ---- R3 家族重指向=读路径零改（s100/T2：variant=桥自管字段，user API 拒写；重指向改由文件层桥内写模拟。
        //      s101/W4：载体=官方无档位的 no-lv 对（官方有档位的 glm 不再配对、无 variant 可重指向）） ----
        const s2 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: FAM_FAST, patch: { thinking: { variant: { fast: FAM_FAST, deep: 'glm-5.2' } } } });
        ck('R3a user API 重指向 variant →拒（红对照=改前桥 ok:true 落盘）', s2.status === 200 && s2.json && s2.json.ok === false && s2.json.err === '家族配对由系统自动管理，不用您操心', s2.text.slice(0, 120));
        const rdCaps = () => JSON.parse(fs.readFileSync(CAPS_FILE, 'utf8'));
        const wrCaps = j => fs.writeFileSync(CAPS_FILE, JSON.stringify(j, null, 2));
        { const j = rdCaps(); j.caps[FAM_FAST].thinking.variant.deep = 'glm-5.2'; j.caps[FAM_DEEP].thinking.variant.deep = 'glm-5.2'; wrCaps(j); } // 桥内写模拟（双侧对称=capsDefault 同族判定）
        const before = upstream.length;
        const r3 = await postAlias('R3-deep-redirect');
        const rec3 = upstream.slice(before).filter(x => x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === 'R3-deep-redirect').pop();
        ck('R3b 下一请求即时跟随：别名不变（fast 锚定）+上游 model=新 deep（glm-5.2）且思考参数随行（s101/W1）',
            !!rec3 && rec3.body.model === 'glm-5.2' && rec3.body.reasoning_effort === 'max' && r3.body.includes('"' + ALIAS + '"'),
            rec3 ? 'model=' + rec3.body.model + ' re=' + rec3.body.reasoning_effort : 'no record');
        { const j = rdCaps(); j.caps[FAM_FAST].thinking.variant.deep = FAM_DEEP; j.caps[FAM_DEEP].thinking.variant.deep = FAM_DEEP; wrCaps(j); } // 改回默认（文件层桥内写）

        // ---- R4 providers 帧 caps 只加不破 ----
        const frames = [];
        const ws = await wsConnect(f => frames.push(f));
        ws.send({ type: 'providers' });
        const pf = await waitFrame(frames, f => f.sys === 'providers', 10000);
        const entry = pf && pf.list && pf.list.find(p => p.name === 'probe家');
        ck('R4 providers 帧既有键原样+caps 只加（model→{context_len,context_est,multimodal,thinking}）',
            !!entry && entry.name === 'probe家' && Array.isArray(entry.models) && entry.active === true && typeof entry.hasKey === 'boolean' &&
            entry.caps && entry.caps[FAM_FAST] && entry.caps[FAM_FAST].thinking.mode === 'variant' &&
            typeof entry.caps[FAM_FAST].multimodal === 'boolean' && 'context_len' in entry.caps[FAM_FAST],
            JSON.stringify(entry && Object.keys(entry)));

        // ---- R5 用户改过不被启发式覆写；改成 none→家族不生成 ----
        const g5 = await httpJson('GET', '/api/modelcaps');
        await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'deepseek-v4.1-flash', patch: { multimodal: true } });
        const g5b = await httpJson('GET', '/api/modelcaps');
        ck('R5a 用户改过（user 标记）后启发式不覆写', g5b.json.caps['deepseek-v4.1-flash'].multimodal === true && g5b.json.caps['deepseek-v4.1-flash'].user === true, JSON.stringify(g5b.json.caps['deepseek-v4.1-flash']));
        // s100/P3-a: user 面 mode 写通道已关（R2h 同拒因）——家族解散改文件层桥内写模拟（同 R3 先例），消费面断言不变
        const rm5 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: FAM_FAST, patch: { thinking: { mode: 'none' } } });
        ck('R5 家族条目 mode user 写→拒（P3-a 关门；红对照=改前桥 ok:true 落盘拆家族）',
            rm5.status === 200 && rm5.json && rm5.json.ok === false && rm5.json.err === '快慢识别由系统自动管理，不用您操心', rm5.text.slice(0, 120));
        { const j = rdCaps(); j.caps[FAM_FAST].thinking.mode = 'none'; j.caps[FAM_DEEP].thinking.mode = 'none'; wrCaps(j); } // 桥内写模拟（mode 仅桥内写）
        const n0 = upstream.length;
        await postAlias('R5-noFamily');
        const rec5 = upstream.slice(n0).filter(x => x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === 'R5-noFamily').pop();
        ck('R5b 家族被用户改成 none→别名不再翻译（透传，deep 参数保留不剥）——家族解散诚实面',
            !!rec5 && rec5.body.model === ALIAS && 'reasoning_effort' in rec5.body,
            rec5 ? 'model=' + rec5.body.model : 'no record');
        // s100/T2: 旧「恢复 variant 供复跑」两连 API 已随 variant 拒写关闭——家族复原由 R6 迁移臂种子文件承担（桥内写）

        // ---- R2i 字段级 user 语义红绿对照（W3 核心）：官方表刷新只动未改字段 ----
        {
            const g0 = await httpJson('GET', '/api/modelcaps');
            const u0 = g0.json.caps['glm-5.2'];
            ck('R2i0 前置：glm-5.2 有 user_fields=[thinking.levels] 且 context_len 未标 user（官方真值 null）',
                (u0.user_fields || []).includes('thinking.levels') && !(u0.user_fields || []).includes('context_len'),
                JSON.stringify(u0.user_fields));
            const preLv = JSON.stringify(u0.thinking.levels);
            const preDef = u0.thinking.default;
            // 表版本升级仿真：SB 预置表 rev 改 + glm-5.2 的 context_len/max_output 给官方数字（未改字段应随刷新）
            const pj = JSON.parse(fs.readFileSync(path.join(SB, 'conf', 'model-presets.json'), 'utf8'));
            pj.rev = 'probe-bump-' + Date.now();
            for (const e of pj.entries) if (e.match && e.match.model_regex === '^glm-5(\\.2|\\.1)?$') { e.context_len = 250000; e.max_output = 50000; e.thinking.default = 'high'; e.thinking.levels = ['high', 'max']; }
            fs.writeFileSync(path.join(SB, 'conf', 'model-presets.json'), JSON.stringify(pj, null, 2));
            stopBridge(); await sleep(400);
            if (!await startBridge()) { ck('R2i 表版本升级臂桥重启（healthz）', false, berr.slice(-200)); return; }
            const g1 = await httpJson('GET', '/api/modelcaps');
            const u1 = g1.json.caps['glm-5.2'];
            ck('R2i 表版本升级：用户改过的 thinking.levels/default 逐字节不动（永不覆写）',
                JSON.stringify(u1.thinking.levels) === preLv && u1.thinking.default === preDef && (u1.user_fields || []).includes('thinking.levels'),
                JSON.stringify({ lv: u1.thinking.levels, d: u1.thinking.default }));
            ck('R2i2 同一批刷新：未改字段（context_len/max_output）随官方表更新（官方 null→250000/50000）+source 仍 user',
                u1.context_len === 250000 && u1.max_output === 50000 && u1.context_est === false && u1.source === 'user',
                JSON.stringify({ c: u1.context_len, m: u1.max_output, s: u1.source }));
            ck('R2i3 红绿对照：官方整条刷新（levels [high,max]+default high+context 有值）而用户改过的 levels/default 保持原值，未改字段照更新（整条 user:true 旧语义会全冻）',
                JSON.stringify(u1.thinking.levels) === preLv && preLv !== JSON.stringify(['high', 'max']) &&
                u1.thinking.default === preDef && u1.context_len === 250000,
                'user=' + preLv + ' ctx=' + u1.context_len);
            // ---- W6e 复位后重新归官方管辖（W2 字段级保鲜闭环，验收④）：R2i 已把官方 glm-5.2 档位改成
            //      ['high','max']（表 bump 态）。此时 reset 该字段→立刻取到 **bump 后的**官方值（不是旧用户值）；
            //      再 bump 一次→重启→该字段随官方再变（证明复位后确实回到「跟官方表走」）----
            {
                const rw = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.2', patch: { reset: ['thinking.levels'] } });
                const gr = await httpJson('GET', '/api/modelcaps');
                const ur = gr.json.caps['glm-5.2'];
                ck('W6e 复位到当前官方值（表 bump 态 ['+"'high','max'"+']）+user_fields 去掉 levels+default 仍留用户标记',
                    rw.json && rw.json.ok === true && JSON.stringify(ur.thinking.levels) === JSON.stringify(['high', 'max']) &&
                    (ur.user_fields || []).indexOf('thinking.levels') < 0 && (ur.user_fields || []).indexOf('thinking.default') >= 0,
                    rw.text.slice(0, 120) + ' | ' + JSON.stringify(ur.thinking.levels));
                const pj2 = JSON.parse(fs.readFileSync(path.join(SB, 'conf', 'model-presets.json'), 'utf8'));
                pj2.rev = 'probe-bump2-' + Date.now();
                for (const e of pj2.entries) if (e.match && e.match.model_regex === '^glm-5(\\.2|\\.1)?$') e.thinking.levels = ['low', 'high', 'max'];
                fs.writeFileSync(path.join(SB, 'conf', 'model-presets.json'), JSON.stringify(pj2, null, 2));
                stopBridge(); await sleep(400);
                if (!await startBridge()) { ck('W6e2 二次官方表升级臂桥重启（healthz）', false, berr.slice(-200)); return; }
                const g2 = await httpJson('GET', '/api/modelcaps');
                ck('W6e2 复位字段再次随官方表刷新（['+"'high','max'"+']→['+"'low','high','max'"+']=闭合「改哪项哪项转手动」反向出口）',
                    JSON.stringify(g2.json.caps['glm-5.2'].thinking.levels) === JSON.stringify(['low', 'high', 'max']),
                    JSON.stringify(g2.json.caps['glm-5.2'].thinking.levels));
            }
        }

        // ---- R2j 消费面闭环 wire 实证（W3 验收核心）：改 levels→出站可发档位集变化；改 default→新会话首档随动 ----
        {
            // R2i 已重启桥——旧 ws 随之失效；本臂自建连接（帧与 wire 游标同源）
            const frames2 = [];
            const ws2 = await wsConnect(f => frames2.push(f));
            // ① 改 levels 去掉 max → 出站 effort=max 被越界拦（上游零 reasoning_effort）；加回 → 上游收到 max。
            //    s101/W4：glm-5.3 走**参数路线**（真名请求，家族已关）——消费点在 applyParamRoute。
            const s1 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { levels: ['low', 'high'] } } });
            const g1 = await httpJson('GET', '/api/modelcaps');
            ck('R2j1 前置：glm-5.3 用户值域去掉 max（落盘 ok+user_fields 含 levels）',
                s1.json && s1.json.ok === true && JSON.stringify(g1.json.caps['glm-5.3'].thinking.levels) === JSON.stringify(['low', 'high']) &&
                (g1.json.caps['glm-5.3'].user_fields || []).includes('thinking.levels'),
                JSON.stringify(g1.json.caps['glm-5.3'].thinking.levels));
            const nA = upstream.length;
            await postAlias('R2j-shrunk', 'glm-5.3');
            const recA = upstream.slice(nA).filter(x => x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === 'R2j-shrunk').pop();
            ck('R2j2 消费面闭环①：改 levels 去 max → effort=max 越界停发（参数路线真名直发，wire 无 reasoning_effort）',
                !!recA && recA.body.model === 'glm-5.3' && !('reasoning_effort' in recA.body),
                recA ? 'model=' + recA.body.model + ' re=' + recA.body.reasoning_effort : 'no record');
            const s2 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { thinking: { levels: ['low', 'high', 'max'] } } });
            const nB = upstream.length;
            await postAlias('R2j-restored', 'glm-5.3');
            const recB = upstream.slice(nB).filter(x => x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === 'R2j-restored').pop();
            ck('R2j3 消费面闭环①green：levels 加回 max → 同一请求上游复现 reasoning_effort=max（改档位集即改出站集合）',
                s2.json && s2.json.ok === true && !!recB && recB.body.reasoning_effort === 'max',
                recB ? 're=' + recB.body.reasoning_effort : 'no record');
            // ② 改 default → 消费面闭环（s104/V1 期望随迁：官方默认档不上 wire——**user 改过的 default 才上**；
            //    桥填充默认档不再发 ACP 帧/不记账，验证点从「subscribe 发 thinking_effort ACP 帧」迁到
            //    「无显式档出站（goose 真名实况，goose 恒不带 effort）→ reasoning_effort 随 user default」）。
            // 用非家族模型（deepseek-v4.1-flash）：家族成员的首档=家族配对预置（W4 降级范围，本切片不动）
            const postBare = (tag, model) => new Promise((resolve, reject) => { // goose 真名实况形态：零思考键直发 /llmproxy
                const data = Buffer.from(JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: tag }] }), 'utf8');
                const rq = http.request({ host: '127.0.0.1', port: PORT, path: '/llmproxy/chat/completions', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length } }, res => {
                    const chunks = [];
                    res.on('data', c => chunks.push(c));
                    res.on('end', () => resolve({ status: res.statusCode }));
                });
                rq.on('error', reject); rq.setTimeout(15000, () => rq.destroy(new Error('timeout')));
                rq.write(data); rq.end();
            });
            const s3 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'deepseek-v4.1-flash', patch: { thinking: { default: 'high' } } });
            const g3 = await httpJson('GET', '/api/modelcaps');
            ck('R2j4 前置：deepseek-v4.1-flash 默认档改为 high（落盘 ok+user_fields 含 thinking.default）',
                s3.json && s3.json.ok === true && (g3.json.caps['deepseek-v4.1-flash'].user_fields || []).includes('thinking.default'),
                s3.text.slice(0, 80));
            const nW = rdWire().length;
            ws2.send({ type: 'subscribe', sessionId: null, model: 'deepseek-v4.1-flash' });
            await waitFrame(frames2, f => f.sys === 'subscribed' && f.newSession, 10000);
            await sleep(400);
            const newTh = rdWire().slice(nW).filter(j => j.method === 'session/set_config_option' && j.params && j.params.configId === 'thinking_effort');
            ck('R2j5a V1：subscribe 无显式档 → 零 thinking_effort ACP 帧（桥填充默认档只回显不发帧不上账）',
                newTh.length === 0,
                JSON.stringify(newTh.map(j => j.params.value)));
            const nA5 = upstream.length;
            await postBare('R2j5-wire', 'deepseek-v4.1-flash');
            const rec5 = upstream.slice(nA5).filter(x => x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === 'R2j5-wire').pop();
            ck('R2j5b V1 消费面闭环②：改 default=high → 无显式档出站 reasoning_effort=high（user default 上 wire，非假旋钮）',
                !!rec5 && rec5.body.reasoning_effort === 'high',
                rec5 ? 're=' + rec5.body.reasoning_effort : 'no record');
            const s4 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'deepseek-v4.1-flash', patch: { thinking: { default: 'none' } } });
            const nA6 = upstream.length;
            await postBare('R2j6-wire', 'deepseek-v4.1-flash');
            const rec6 = upstream.slice(nA6).filter(x => x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === 'R2j6-wire').pop();
            ck('R2j6 V1 消费面闭环②green：default 改回 none → 出站 reasoning_effort=none（随动实证，改默认即改出站）',
                s4.json && s4.json.ok === true && !!rec6 && rec6.body.reasoning_effort === 'none',
                rec6 ? 're=' + rec6.body.reasoning_effort : 'no record');
            ws2.close();
        }
        // ---- R6 schema v3 迁移自测（ADR-0009：1→2 levels 归一，2→3 标来源+非 user 条目按官方表重生成。红对照=改前桥 latest:2 零 3 步→本臂全红）----
        stopBridge();
        await sleep(500);
        const V1 = {
            _schema: 1, caps: {
                'no-lv-flash': { context_len: null, context_est: true, multimodal: false, thinking: { mode: 'variant', levels: ['low', 'max'], variant: { fast: 'no-lv-flash', deep: 'no-lv' } }, user: true },
                'no-lv': { context_len: null, context_est: true, multimodal: false, thinking: { mode: 'variant', levels: ['low', 'max'], variant: { fast: 'no-lv-flash', deep: 'no-lv' } }, user: true },
                'glm-5.2': { context_len: 131072, context_est: false, multimodal: true, thinking: { mode: 'native' }, user: true }, // native 无 levels（v1 旧形状）
                'deepseek-v4.1-flash': { context_len: null, context_est: true, multimodal: false, thinking: { mode: 'none' } }, // none 无 levels（非 user→W2 由官方表重生成）
                'ccp/claude-sonnet-5': { context_len: null, context_est: true, multimodal: true, thinking: { mode: 'native' } },
            },
        };
        fs.writeFileSync(CAPS_FILE, JSON.stringify(V1, null, 2));
        if (!await startBridge()) { ck('R6 迁移臂桥重启（healthz）', false, berr.slice(-300)); return; }
        ck('R6 迁移臂桥重启（healthz）', true);
        const mig = JSON.parse(fs.readFileSync(CAPS_FILE, 'utf8'));
        const backups = fs.readdirSync(path.join(SB, 'data')).filter(f => f.startsWith('model-caps.json.pre-migration-'));
        ck('R6a _schema 1→3 落盘+迁移前留档（.pre-migration-*）', mig._schema === 3 && backups.length >= 1, 'schema=' + mig._schema + ' backups=' + backups.length);
        const FIVE = ['off', 'low', 'medium', 'high', 'max'];
        const mc = mig.caps || {};
        ck('R6b user 条目全保留+标 source=user（用户改过的值官方表永不覆写）+levels 经 1→2 步归一=五档',
            mc['glm-5.2'] && mc['glm-5.2'].source === 'user' && mc['glm-5.2'].user === true &&
            JSON.stringify(mc['glm-5.2'].thinking.levels) === JSON.stringify(FIVE) &&
            mc['glm-5.2'].context_len === 131072 && mc['glm-5.2'].multimodal === true,
            JSON.stringify(mc['glm-5.2']));
        ck('R6c 非 user 条目被清空→按官方表重生成（deepseek 官方四档含 none；claude 别名走厂系正则→官方五档）',
            Array.isArray(mc['deepseek-v4.1-flash'].thinking.levels) && mc['deepseek-v4.1-flash'].thinking.levels.join(',') === 'none,low,high,max' &&
            mc['deepseek-v4.1-flash'].source === 'official' && mc['deepseek-v4.1-flash'].context_len === 1000000,
            JSON.stringify(mc['deepseek-v4.1-flash']));
        ck('R6d user 家族条目 variant 保原样（双侧 fast/deep 不动）+user 标记保留',
            JSON.stringify(((mc['no-lv-flash'] || {}).thinking || {}).levels) === JSON.stringify(['low', 'max']) &&
            ((mc['no-lv-flash'].thinking.variant || {}).deep === 'no-lv') && ((mc['no-lv-flash'].thinking.variant || {}).fast === 'no-lv-flash') &&
            mc['no-lv'].thinking.mode === 'variant' && mc['no-lv'].user === true && mc['no-lv'].source === 'user',
            JSON.stringify(mc['no-lv-flash'] && mc['no-lv-flash'].thinking));
        const g6 = await httpJson('GET', '/api/modelcaps');
        ck('R6e 读回等价（GET /api/modelcaps=v3 真值 ok:true+source 三态字段随行）',
            g6.status === 200 && g6.json && g6.json.ok === true && g6.json.caps['glm-5.2'].context_len === 131072 &&
            g6.json.caps['glm-5.2'].source === 'user' && g6.json.caps['deepseek-v4.1-flash'].source === 'official',
            g6.text.slice(0, 120));
        const b6 = upstream.length;
        await postAlias('R6-family-alive');        const rec6 = upstream.slice(b6).filter(x => x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === 'R6-family-alive').pop();
        ck('R6f 迁移后家族仍激活：别名 max→上游 model=no-lv 且思考参数随行（s101/W1：registryFamilies/llmproxy 零改）',
            !!rec6 && rec6.body.model === FAM_DEEP && rec6.body.reasoning_effort === 'max',
            rec6 ? 'model=' + rec6.body.model + ' re=' + rec6.body.reasoning_effort : 'no record');
    } catch (e) {
        ck('探针异常（须排查）', false, e && e.stack || String(e));
    } finally {
        stopBridge();
        try { mock.close(); } catch {}
        console.log('\nmodelcaps-probe: ' + pass + ' pass, ' + fail + ' fail');
        process.exit(fail ? 1 : 0);
    }
})();
