// [s107/f6 入库] 用途：llmproxy 力度翻译：-flash→同池深档别名/原生 effort 五档放行/effort 上 wire/顶栏切档闭环
// 用法：node tools/e2e/proxythink-probe.js（env 覆盖：PF_TPL/PF_BRIDGE/PF_PRESETS/PF_GOOSE_BIN 等见体内；自建沙箱桥本地口，不碰 dev 栈 8790）
// 来源：s98-s101 各批 forge/tmp 同名探针（AGENTS §8.2 触桥清单成员；s106 留痕「探针入库义务」的补账，s107/f6 落库）
// s98/llm-proxy 探针（mock 上游 + 沙箱真桥 + 真 goose 全链）。
// 机制：桥开 /llmproxy/ 反代；深度家族（X-flash ↔ X 同池）生成别名 gpt-5-forge-<deep>——
// 别名命中 goose is_reasoning_model 名单 → 原生 thinking_effort 五档放出 → effort 上 wire →
// 桥代理翻译成真模型（off/low/medium→fast，high/max→deep）并把**官方思考参数随行至上游**（s101/W1：
// 过去 delete 是自伤，裁决 2026-09-23 §2.3 + research/41 §1.B；越界档归一：GLM 无 off→low，medium→high）。
// 断言分组：
//   H0 静态：别名前缀 + 闸门正则命中（对照臂，改前即绿——机制文档化）；
//   H1 非别名透传：上游收到的 body 字节级等价 + SSE 逐块零缓冲（到达时延断言）；
//   H2 错误透传：401/429/500 状态码与响应体原样；
//   H3 别名翻译：effort low→no-lv-flash / max·high→no-lv / off·缺省→flash，思考参数随行（值=归一后档：
//      s101/W2 起档位归一读官方预置表值域——glm 无 off 落 low / deepseek 有 none 落 none；探针须随包复制 conf/model-presets.json）；
//   H4 响应翻译：回给 goose 的流里真名换回别名（含跨 chunk 边界劈开形态）；
//   H5 并发 5 路：effort↔模型配对零交叉、响应路由零串台；
//   W1-W4 真栈 ws 链（真 goose）：subscribed 帧零别名+gradient 提示+五档在场（活体闸门证明）、
//      set_think max/low 人话回执、prompt 后上游真收到深/快模型（effort→模型端到端）、全程帧零别名。
// 红绿：node tmp/proxythink-probe.js —— 改前除 H0 外全红（/llmproxy 404、无 gradient、遮蔽单档）。
// s101/W1 随迁：H3/W3 断言由「剥净思考参数」翻为「官方参数随行且值=归一后档」（红对照=改前模板跑本文件 H3/W3 红）。
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const FORGE = path.join(__dirname, '..', '..', 'forge'); // 入库 s107/f6：自 forge/tmp 迁 tools/e2e，深度随迁
const TPL_BRIDGE = process.env.PF_BRIDGE || path.join(FORGE, 'conf', 'templates', 'chat-bridge.tpl.js');
const GOOSE_BIN = process.env.PF_GOOSE_BIN || path.join(FORGE, 'bin', 'goose', 'goose-package', 'goose.exe');
const SB = path.join(FORGE, 'tmp', 'proxythink-sb');
const MOCK_PORT = 20891, PORT = 20790;
// s101/W4：家族换模型降为兜底且默认关（裁决 §2.4）——本探针测**别名路线**（家族内 effort→成员模型），故：
// ①池用官方表未收录的 no-lv 对（verify 资格：官方无档位才配对）；②桥以 FORGE_VARIANT_FAMILY=1 起（强制开）。
// 别名锚定 fast 成员名：deep 重指向时别名不变（存量会话不失联）。
// W4 随迁要点：别名路线的载体必须是**无官方档位**的模型（有档位=一律走参数、不配对，见 capsDefault 的 useFam）；
// 故 H3/W1-W4 的 glm-5.3 真名全部改为 no-lv 对。H1 字节级透传臂改用**不在池**的 plain-xyz（参数路线对池内已声明
// 档位的模型会注入 default，字节等价前提不成立——这正是 W4 主路径的行为，非缺陷）。
const FAST = 'no-lv-flash', DEEP = 'no-lv';
const ALIAS = 'gpt-5-forge-' + FAST;
const PLAIN = 'plain-xyz'; // 不在池、官方表未收录=参数路线零改写（H1 字节透传臂载体）
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok || !why ? '' : ' — ' + String(why))); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- mock 上游：记录一切；SSE 回显 model 与 tag；可控错误码/劈块 ----------
const upstream = []; // {ts,url,raw,body,resChunkTs[]}
const mockWriters = new Set();
const mock = http.createServer((req, res) => {
    let buf = '';
    req.on('data', c => { buf += c; });
    req.on('end', () => {
        const rec = { ts: Date.now(), method: req.method, url: req.url, raw: buf };
        try { rec.body = JSON.parse(buf); } catch {}
        upstream.push(rec);
        if (req.method === 'GET' && req.url.includes('models')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ object: 'list', data: [FAST, DEEP, PLAIN].map(id => ({ id, object: 'model' })) }));
            return;
        }
        if (req.method === 'POST' && rec.body && typeof rec.body.model === 'string' && rec.body.model.startsWith('__status')) {
            const code = parseInt(rec.body.model.slice('__status'.length), 10) || 500;
            const body = 'mock-error-body-' + code;
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(body);
            return;
        }
        if (req.method === 'POST') {
            const model = (rec.body && rec.body.model) || 'unknown';
            const tag = (rec.body && rec.body.messages && rec.body.messages[0] && rec.body.messages[0].content) || '';
            const split = String(tag).includes('SPLIT');
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            const chunkTs = rec.resChunkTs = [];
            const sse = (obj) => 'data: ' + JSON.stringify(obj) + '\n\n';
            const c1 = { id: 'c1', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta: { role: 'assistant', content: String(tag) }, finish_reason: null }] };
            const c2 = { id: 'c1', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
            // 劈块形态：把 "model":"NAME 劈成两半写（tail-hold 换翻译器的边界用例）
            if (split) {
                const s = sse(c1);
                const cut = s.indexOf('"' + model) + Math.floor((model.length + 2) / 2);
                res.write(s.slice(0, cut)); chunkTs.push(Date.now());
                setTimeout(() => { res.write(s.slice(cut)); chunkTs.push(Date.now()); }, 30);
                setTimeout(() => { res.write(sse(c2) + 'data: [DONE]\n\n'); chunkTs.push(Date.now()); res.end(); }, 60);
            } else {
                res.write(sse(c1)); chunkTs.push(Date.now());
                setTimeout(() => { res.write(sse(c2) + 'data: [DONE]\n\n'); chunkTs.push(Date.now()); res.end(); }, 30);
            }
            return;
        }
        res.writeHead(404); res.end('not found');
    });
});

// ---------- HTTP 客户端助手（收 SSE 记逐块到达时刻） ----------
function httpPost(path_, body, headers) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
        const rq = http.request({ host: '127.0.0.1', port: PORT, path: path_, method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'content-length': data.length }, headers || {}) }, res => {
            const chunks = [], chunkTs = [];
            res.on('data', c => { chunks.push(c); chunkTs.push(Date.now()); });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), chunkTs }));
        });
        rq.on('error', reject);
        rq.setTimeout(15000, () => { rq.destroy(new Error('timeout')); });
        rq.write(data); rq.end();
    });
}

// ---------- ws 客户端（think-grad-probe 同款最小实现） ----------
function wsFrame(str) {
    const payload = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    return Buffer.concat([header, mask, masked]);
}
function wsConnect(onFrame, port_) {
    const P = port_ || PORT;
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const rq = http.request({ host: '127.0.0.1', port: P, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'http://127.0.0.1:' + P } });
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
async function waitHealth(port_) { return waitHealthOn(port_ || PORT); }
async function waitHealthOn(P) {
    const t0 = Date.now();
    for (;;) {
        const ok = await new Promise(res => {
            const r = http.get({ host: '127.0.0.1', port: P, path: '/healthz', timeout: 1000 }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b === 'ok')); }).on('error', () => res(false));
            r.on('timeout', () => { r.destroy(); res(false); });
        });
        if (ok) return true;
        if (Date.now() - t0 > 30000) return false;
        await sleep(300);
    }
}
const wsConnectOn = wsConnect;

// ---------- H0：静态对照臂（机制文档化；改前即绿） ----------
function partH0() {
    const src = fs.readFileSync(TPL_BRIDGE, 'utf8');
    ck('H0a 别名前缀常量在桥模板在场（gpt-5-forge-）', src.includes('gpt-5-forge-'));
    // goose is_openai_responses_model 门（1.46 源码实证，research/35）：^(?:o\d+(?:$|-)|gpt-5(?:$|[-.]))——
    // 别名必须以 gpt-5 开头且后续为 - 或 . 才命中。本探针别名固定 gpt-5-forge-no-lv-flash。
    const gate = /(?:^|[-/])(?:o\d+(?:$|-)|gpt-5(?:$|[-.]))/;
    ck('H0b 别名 ' + ALIAS + ' 命中 goose 闸门正则（no-lv 真名不命中）', gate.test(ALIAS) && !gate.test(DEEP) && !gate.test(FAST));
}

// ---------- 沙箱真桥：真 goose + mock 上游 ----------
async function partLive() {
    let bridge = null;
    try {
        // 沙箱根：junction 零使用——GOOSE 二进制走 PF_GOOSE_BIN 补丁锚注入，删沙箱不伤产品树
        try { fs.rmSync(SB, { recursive: true, force: true }); } catch {}
        for (const d of ['conf/goose/config', 'conf/goose/data/sessions', 'data/logs', 'data/stats']) fs.mkdirSync(path.join(SB, ...d.split('/')), { recursive: true });
        fs.copyFileSync(path.join(FORGE, 'conf', 'model-presets.json'), path.join(SB, 'conf', 'model-presets.json')); // s101/W2：官方预置表随包落 conf/（真桥现读；glm off→low 归一依赖官方值域）
        fs.writeFileSync(path.join(SB, 'VERSION'), '9.9.9-proxythink-probe');
        fs.writeFileSync(path.join(SB, 'conf', 'goose', 'config', 'config.yaml'),
            'GOOSE_PROVIDER: openai\nGOOSE_MODE: smart_approve\nGOOSE_DISABLE_UPDATE_CHECK: true\nextensions: {}\n');
        fs.writeFileSync(path.join(SB, 'data', 'providers.json'), JSON.stringify([
            { name: 'probe家', host: 'http://127.0.0.1:' + MOCK_PORT + '/v1', models: [FAST, DEEP, PLAIN], key: 'probe-key', active: true }
        ], null, 2));
        const src = fs.readFileSync(TPL_BRIDGE, 'utf8');
        const GOOSE_ANCHOR = "const GOOSE = path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe');";
        if (src.split(GOOSE_ANCHOR).length - 1 !== 1) { ck('W0 桥模板 GOOSE 锚点恰一处（可桩化）', false, 'anchor count != 1'); return; }
        fs.writeFileSync(path.join(SB, 'bridge-patched.js'), src.replace(GOOSE_ANCHOR,
            "const GOOSE = process.env.PF_GOOSE_BIN || path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe');"));
        bridge = spawn(process.execPath, [path.join(SB, 'bridge-patched.js')], {
            env: Object.assign({}, process.env, {
                FORGE_ROOT: SB, PORT: String(PORT), PF_GOOSE_BIN: GOOSE_BIN,
                FORGE_VARIANT_FAMILY: '1', // s101/W4：别名路线须强制开家族（默认关=无别名，见块头注）
                NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
            }), stdio: ['ignore', 'pipe', 'pipe'],
        });
        let berr = '';
        bridge.stdout.on('data', d => process.env.PF_VERBOSE ? console.log('[bridge]', String(d).trim()) : {});
        bridge.stderr.on('data', d => { berr += d; });
        if (!await waitHealth()) { ck('W0 沙箱桥启动（healthz）', false, berr.slice(-400)); return; }
        ck('W0 沙箱桥启动（healthz）', true);
        await sleep(2500); // 等 acp initialize

        // ---- H1 非别名透传：字节级等价 + SSE 零缓冲（载体=池外 plain-xyz：官方未收录+非家族→参数路线零改写）----
        {
            const raw = JSON.stringify({ model: PLAIN, stream: true, messages: [{ role: 'user', content: 'H1-tag' }] });
            const r = await httpPost('/llmproxy/chat/completions', raw);
            const rec = upstream.filter(x => x.url.endsWith('chat/completions') && x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === 'H1-tag').pop();
            ck('H1a 非别名请求上游收到字节级等价 body', !!rec && rec.raw === raw, rec ? 'raw=' + rec.raw.slice(0, 80) : 'no record');
            ck('H1b 非别名响应字节原样（SSE 透传，零改写）', r.status === 200 && r.body.toString('utf8').includes('H1-tag') && r.body.toString('utf8').includes(PLAIN));
            // 零缓冲：mock 写出时刻 vs 客户端逐块到达时刻——每块到达滞后 <300ms（全缓冲到 end 才发会整体晚于末块）
            const lagOk = !!rec && rec.resChunkTs.length >= 2 && r.chunkTs.length >= 2 &&
                r.chunkTs[0] - rec.resChunkTs[0] < 300;
            ck('H1c SSE 逐块零缓冲（首块到达滞后<300ms，且≥2 块分开到达）', lagOk, JSON.stringify({ mock: rec && rec.resChunkTs, cli: r.chunkTs }));
        }
        // ---- H2 错误透传 ----
        for (const code of [401, 429, 500]) {
            const r = await httpPost('/llmproxy/chat/completions', { model: '__status' + code + '__', messages: [{ role: 'user', content: 'x' }] });
            ck('H2 上游 ' + code + ' 状态码与响应体原样透传', r.status === code && r.body.toString('utf8') === 'mock-error-body-' + code, r.status + ':' + r.body.toString('utf8').slice(0, 40));
        }
        // ---- H3 别名+effort → 真模型 + 思考参数随行（s101/W1：过去剥净，现随行；值=归一后档。
        //      W4 随迁：载体=官方表未收录的 no-lv 对（无声明值域）→ normalizeEffort 走「无官方值域」支路：
        //      off 用各厂通行关思考词 none，其余原样交上游，缺省不发）----
        {
            const arms = [
                ['low', FAST, 'low'], ['max', DEEP, 'max'], ['high', DEEP, 'high'],
                ['off', FAST, 'none'], // no-lv 无声明值域 → off 归一为 none（不猜厂系 off 词）
                [null, FAST, null],    // 缺省档：不写
            ];
            for (const [eff, want, wantRE] of arms) {
                const tag = 'H3-' + (eff || 'none');
                const body = { model: ALIAS, stream: true, messages: [{ role: 'user', content: tag }] };
                if (eff) body.reasoning_effort = eff;
                const r = await httpPost('/llmproxy/chat/completions', body);
                const rec = upstream.filter(x => x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === tag).pop();
                const gotRE = rec && typeof rec.body.reasoning_effort === 'string' ? rec.body.reasoning_effort : null;
                ck('H3 effort=' + (eff || '(缺省)') + ' → 上游 model=' + want + ' 且思考参数随行(' + (wantRE || '不发') + ')',
                    !!rec && rec.body.model === want && gotRE === wantRE && !('reasoning' in rec.body) && !('thinking' in rec.body),
                    rec ? 'model=' + rec.body.model + ' re=' + gotRE : 'no record');
            }
        }
        // ---- H4 响应翻译：真名换回别名（含劈块） ----
        {
            const r1 = await httpPost('/llmproxy/chat/completions', { model: ALIAS, reasoning_effort: 'max', stream: true, messages: [{ role: 'user', content: 'H4-deep-SPLIT' }] });
            const t1 = r1.body.toString('utf8');
            ck('H4a 深档响应翻回别名（含跨 chunk 劈开形态）', t1.includes('"' + ALIAS + '"') && !t1.includes('"' + DEEP + '"'), t1.slice(0, 120));
            const r2 = await httpPost('/llmproxy/chat/completions', { model: ALIAS, reasoning_effort: 'low', stream: true, messages: [{ role: 'user', content: 'H4-fast-SPLIT' }] });
            const t2 = r2.body.toString('utf8');
            ck('H4b 快档响应翻回别名（fast 名不出厂）', t2.includes('"' + ALIAS + '"') && !t2.includes('"' + FAST + '"'), t2.slice(0, 120));
        }
        // ---- H5 并发 5 路：配对零交叉 ----
        {
            const jobs = [];
            const plan = [['low', FAST], ['max', DEEP], ['low', FAST], ['high', DEEP], [null, FAST]];
            plan.forEach(([eff, want], i) => {
                const tag = 'H5-' + i;
                const body = { model: ALIAS, stream: true, messages: [{ role: 'user', content: tag }] };
                if (eff) body.reasoning_effort = eff;
                jobs.push(httpPost('/llmproxy/chat/completions', body).then(r => ({ tag, want, eff, r })));
            });
            const out = await Promise.all(jobs);
            let okAll = true, why = '';
            for (const o of out) {
                const rec = upstream.filter(x => x.body && x.body.messages && x.body.messages[0] && x.body.messages[0].content === o.tag).pop();
                const resp = o.r.body.toString('utf8');
                if (!rec || rec.body.model !== o.want || !resp.includes(o.tag)) { okAll = false; why = o.tag + '→' + (rec ? rec.body.model : 'none'); break; }
            }
            ck('H5 并发 5 路 effort↔模型配对零交叉、响应路由零串台', okAll, why);
        }

        // ---- W1-W4：真 goose ws 全链 ----
        const frames = [];
        const ws = await wsConnect(f => frames.push(f));
        await sleep(400);
        ws.send({ type: 'subscribe', sessionId: null });
        const sub = await waitFrame(frames, f => f.sys === 'subscribed', 30000);
        if (!sub) { ck('W1 subscribed 到达（真 goose 开新会话）', false, 'timeout'); }
        else {
            const s = JSON.stringify(sub);
            const mo = (sub.configOptions || []).find(c => c && c.id === 'model');
            const th = (sub.configOptions || []).find(c => c && c.id === 'thinking_effort');
            const vals = th && Array.isArray(th.options) ? th.options.map(x => x && x.value) : [];
            ck('W1a subscribed 帧零别名（假名不出厂）', !s.includes('gpt-5-forge'), s.slice(0, 160));
            const g = mo && mo.gradient; // s98/llm-proxy: gradient 挂在 configOptions 的 model 选项上（跨界翻译点统一落点，rpc 直通响应同形）
            ck('W1b gradient 家族提示在场（fast/deep 真名）', !!g && g.family === DEEP && g.fast === FAST && g.deep === DEEP, JSON.stringify(g));
            ck('W1c configOptions model.currentValue 是真名（别名已翻回）', !!mo && (mo.currentValue === FAST || mo.currentValue === DEEP), mo && mo.currentValue);
            ck('W1d 活体闸门证明：别名下 thinking_effort 五档在场（off/low/medium/high/max）',
                vals.length === 5 && ['off', 'low', 'medium', 'high', 'max'].every(v => vals.includes(v)), JSON.stringify(vals));
        }
        // W2/W3：set_think max → prompt → 上游真收到深模型
        const thinkSet = async v => {
            ws.send({ type: 'set_think', value: v });
            return await waitFrame(frames, f => f.sys === 'think_set' && (!f.value || f.value === v), 15000);
        };
        const t1 = await thinkSet('max');
        ck('W2 set_think max 回执 ok（原生通道经别名放开）', !!(t1 && t1.ok === true && t1.value === 'max'), JSON.stringify(t1));
        const nBefore = upstream.length;
        ws.send({ type: 'prompt', text: 'W3-deep-tag' });
        await waitFrame(frames, f => f.agent && f.agent.method === 'stop', 60000);
        await sleep(300);
        const deepRec = upstream.slice(nBefore).filter(x => x.body && x.body.messages && x.body.messages.some(m => String(m.content || '').includes('W3-deep-tag'))).pop();
        // s101/W1: 值由 goose 自身档位映射给出（goose ThinkingEffort 五档 → OpenAI wire 映射，research/35 §1；
        // 非我桥钳制——H3 直臂 max→max 证我桥不钳）。本臂判据=官方参数**随行**（过去被桥删除，此处必空）。
        const deepRE = deepRec && deepRec.body.reasoning_effort;
        ck('W3 选深端到端：上游真实收到 ' + DEEP + ' 且思考参数随行（reasoning_effort∈{high,max}）',
            !!deepRec && deepRec.body.model === DEEP && (deepRE === 'high' || deepRE === 'max'),
            deepRec ? 'model=' + deepRec.body.model + ' re=' + deepRE : 'no upstream record');
        // W4：切回快 → 上游收 flash
        const t2 = await thinkSet('low');
        ck('W4a set_think low 回执 ok', !!(t2 && t2.ok === true && t2.value === 'low'), JSON.stringify(t2));
        const n2 = upstream.length;
        ws.send({ type: 'prompt', text: 'W4-fast-tag' });
        await waitFrame(frames, f => f.agent && f.agent.method === 'stop' && Date.now() > 0 && frames.filter(g => g.agent && g.agent.method === 'stop').length >= 2, 60000);
        await sleep(300);
        const fastRec = upstream.slice(n2).filter(x => x.body && x.body.messages && x.body.messages.some(m => String(m.content || '').includes('W4-fast-tag'))).pop();
        ck('W4b 切快端到端：上游真实收到 ' + FAST, !!fastRec && fastRec.body.model === FAST, fastRec ? 'model=' + fastRec.body.model : 'no upstream record');
        // 全程帧零别名（含 rpc 透传、通知、回执）
        ck('W5 全程 ws 帧零别名泄漏（' + frames.length + ' 帧扫描）', !frames.some(f => JSON.stringify(f).includes('gpt-5-forge')));
        ws.close();
    } finally {
        if (bridge) { try { execSync('taskkill /PID ' + bridge.pid + ' /T /F', { stdio: 'ignore' }); } catch { try { bridge.kill(); } catch {} } }
    }
}

// ---------- Part C（W4 验收2）：默认参数路线端到端——家族关 + 官方有档位的 glm，真 goose 全链 ----------
// 顶栏切档 → 桥 /llmproxy 出站帧 reasoning_effort 随动（goose 对 glm 系不发 effort，真消费点在 applyParamRoute）。
// 与 Part A/B 的区别：pool=glm（官方三档）、家族默认关（无别名无 gradient）——这正是 W4 的主路径。
const PORT_C = 20792;
async function partC() {
    let bridge = null;
    const SBc = path.join(FORGE, 'tmp', 'proxythink-sbc');
    try {
        try { fs.rmSync(SBc, { recursive: true, force: true }); } catch {}
        for (const d of ['conf/goose/config', 'conf/goose/data/sessions', 'data/logs', 'data/stats']) fs.mkdirSync(path.join(SBc, ...d.split('/')), { recursive: true });
        fs.copyFileSync(path.join(FORGE, 'conf', 'model-presets.json'), path.join(SBc, 'conf', 'model-presets.json'));
        fs.writeFileSync(path.join(SBc, 'VERSION'), '9.9.9-proxythink-probe-c');
        fs.writeFileSync(path.join(SBc, 'conf', 'goose', 'config', 'config.yaml'),
            'GOOSE_PROVIDER: openai\nGOOSE_MODE: smart_approve\nGOOSE_DISABLE_UPDATE_CHECK: true\nextensions: {}\n');
        fs.writeFileSync(path.join(SBc, 'data', 'providers.json'), JSON.stringify([
            { name: 'probe家', host: 'http://127.0.0.1:' + MOCK_PORT + '/v1', models: ['glm-5.3-flash', 'glm-5.3'], key: 'probe-key', active: true }
        ], null, 2));
        const src = fs.readFileSync(TPL_BRIDGE, 'utf8');
        const GOOSE_ANCHOR = "const GOOSE = path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe');";
        fs.writeFileSync(path.join(SBc, 'bridge-patched.js'), src.replace(GOOSE_ANCHOR,
            "const GOOSE = process.env.PF_GOOSE_BIN || path.join(ROOT, 'bin', 'goose', 'goose-package', 'goose.exe');"));
        bridge = spawn(process.execPath, [path.join(SBc, 'bridge-patched.js')], {
            env: Object.assign({}, process.env, {
                FORGE_ROOT: SBc, PORT: String(PORT_C), PF_GOOSE_BIN: GOOSE_BIN,
                // 家族默认关（不设 FORGE_VARIANT_FAMILY）=W4 主路径
                NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
            }), stdio: ['ignore', 'pipe', 'pipe'],
        });
        let berr = '';
        bridge.stderr.on('data', d => { berr += d; });
        if (!await waitHealthOn(PORT_C)) { ck('C0 沙箱桥启动（家族默认关，healthz）', false, berr.slice(-400)); return; }
        ck('C0 沙箱桥启动（家族默认关，healthz）', true);
        await sleep(2500);
        const frames = [];
        const ws = await wsConnect(f => frames.push(f), PORT_C);
        await sleep(400);
        ws.send({ type: 'subscribe', sessionId: null, model: 'glm-5.3-flash' });
        const sub = await waitFrame(frames, f => f.sys === 'subscribed', 30000);
        if (!sub) { ck('C1 subscribed 到达（真 goose 开新会话）', false, 'timeout'); ws.close(); return; }
        const mo = (sub.configOptions || []).find(c => c && c.id === 'model');
        ck('C1 subscribed：模型=真名 glm-5.3-flash + 零 gradient（家族默认关=无家族面）',
            !!mo && mo.currentValue === 'glm-5.3-flash' && mo.gradient === undefined, JSON.stringify(sub.configOptions));
        // 顶栏切档 → prompt → 出站帧 reasoning_effort 随动（默认参数路线）
        const setThink = async v => { ws.send({ type: 'set_think', value: v }); return await waitFrame(frames, f => f.sys === 'think_set' && f.value === v, 15000); };
        const runArm = async (v, want) => {
            const t = await setThink(v);
            const n = upstream.length;
            ws.send({ type: 'prompt', text: 'C-' + v });
            await waitFrame(frames, f => f.agent && f.agent.method === 'stop', 60000);
            await sleep(300);
            const rec = upstream.slice(n).filter(x => x.body && x.body.messages && x.body.messages.some(m => String(m.content || '').includes('C-' + v))).pop();
            ck('C2 顶栏切档 ' + v + ' → 出站帧 model=glm-5.3-flash 且 reasoning_effort=' + want + '（默认参数路线消费闭环）',
                !!(t && t.ok === true) && !!rec && rec.body.model === 'glm-5.3-flash' && rec.body.reasoning_effort === want,
                JSON.stringify({ ok: t && t.ok, model: rec && rec.body.model, re: rec && rec.body.reasoning_effort }));
            return rec;
        };
        await runArm('high', 'high');
        await runArm('low', 'low');
        ws.close();
    } finally {
        if (bridge) { try { execSync('taskkill /PID ' + bridge.pid + ' /T /F', { stdio: 'ignore' }); } catch { try { bridge.kill(); } catch {} } }
        try { fs.rmSync(SBc, { recursive: true, force: true }); } catch {}
    }
}

(async () => {
    partH0();
    await new Promise(r => mock.listen(MOCK_PORT, '127.0.0.1', r));
    try { await partLive(); } catch (e) { ck('探针异常（不计入基线，须排查）', false, e && e.stack || String(e)); }
    try { await partC(); } catch (e) { ck('Part C 异常（须排查）', false, e && e.stack || String(e)); }
    try { mock.close(); } catch {}
    console.log('\nproxythink-probe: ' + pass + ' pass, ' + fail + ' fail');
    process.exit(fail ? 1 : 0);
})();
