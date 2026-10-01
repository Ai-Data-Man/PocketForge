// [s107/f6 入库] 用途：官方预置表正确性（conf/model-presets.json）：逐字段==官方真值/诚实缺省降级/物化链随包复制
// 用法：node tools/e2e/w2-preset-probe.js（env 覆盖：PF_TPL/PF_BRIDGE/PF_PRESETS/PF_GOOSE_BIN 等见体内；自建沙箱桥本地口，不碰 dev 栈 8790）
// 来源：s98-s101 各批 forge/tmp 同名探针（AGENTS §8.2 触桥清单成员；s106 留痕「探针入库义务」的补账，s107/f6 落库）
// s101/W2 探针：官方预置表（conf/model-presets.json）正确性 + 诚实缺省降级（裁决 2026-09-23 §2.1、AGENTS §8.2）。
// 数据源=docs/research/40/42/43 官方规范表；本探针逐条断言 caps==官方值，防「拍脑袋预置」回潮。
// Part A（静态，秒级零网络）：从桥模板原文提取预置机制（readPresets/presetLookup/presetThinking/capsDefault/
//   normalizeEffort），断言 ①表结构完整（每条目 source_url+verified）②临界模型逐字段==官方真值
//   （glm-5.3 levels=[low,high,max] 无 off / glm-5.3-flash multimodal true / deepseek levels 含 none 与 high /
//   各 context·maxOut 数字）③(host,model) 二元组：同模型跨 host 归属不同 ④未收录模型=诚实缺省（零编造数字、
//   levels=[]、unknown:true、source:'guess'）⑤档位归一读官方值域（glm off→low / deepseek off→none）。
//   **红对照**：同批断言跑改前模板（git show HEAD:…）必红——改前 capsDefault 五档含 off、-flash 判 false。
// Part B（活体沙箱真桥）：物化链证据——真桥从 ROOT/conf/model-presets.json 现读，providers 帧 caps 带 source，
//   /api/modelcaps GET 反映 official 与 guess 三态，落盘 model-caps.json _schema:3。
// 红绿：node forge/tmp/w2-preset-probe.js（红对照臂自带：PF_OLD_TPL 或 git show HEAD 取改前模板）。
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const FORGE = path.join(__dirname, '..', '..', 'forge'); // 入库 s107/f6：自 forge/tmp 迁 tools/e2e，深度随迁
const TPL_BRIDGE = process.env.PF_BRIDGE || path.join(FORGE, 'conf', 'templates', 'chat-bridge.tpl.js');
const PRESETS = process.env.PF_PRESETS || path.join(FORGE, 'conf', 'model-presets.json'); // PF_PRESETS=红对照臂指改前表快照（同 PF_BRIDGE 模式）
const SB = path.join(FORGE, 'tmp', 'w2-preset-sb');
const PORT = 20795;
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok || !why ? '' : ' — ' + String(why))); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 从模板原文提取预置机制（llmproxy-xlate-probe 同款提取桩） ----------
function extractFn(src, name) {
    const head = 'function ' + name + '(';
    const at = src.indexOf(head);
    if (at < 0) return null;
    const brace = src.indexOf('{', at);
    let depth = 0;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    return null;
}
function evalTpl(src, presetsFile) {
    const names = ['readPresets', 'presetLookup', 'presetThinking', 'presetMatchKey', 'capsDefault', 'thinkingKeysOf', 'thinkOffViaGate', 'normalizeEffort']; // s102/qa-rework 随迁：normalizeEffort 引用 thinkOffViaGate（P2-1 布尔门象限）
    const fns = names.map(n => extractFn(src, n));
    const old = fns[0] === null; // 改前模板无预置机制（readPresets 缺席）→ 用空表桩补齐签名，跑同一批断言得真实红
    const stub = n => (n === 'readPresets' ? 'function readPresets(){return {rev:"none",entries:[]};}' : n === 'presetLookup' ? 'function presetLookup(){return null;}' : n === 'presetThinking' ? 'function presetThinking(){return {mode:"none",levels:[],unknown:true};}' : n === 'presetMatchKey' ? 'function presetMatchKey(){return "";}' : null);
    const body = names.map((n, i) => fns[i] !== null ? fns[i] : stub(n)).filter(Boolean).join('\n');
    if (!body.includes('function capsDefault(')) return null; // 连 capsDefault 都没有=更早的改前态，提取失败即红
    const head = `
const PRESETS_FILE = ${JSON.stringify(presetsFile)};
const MULTIMODAL_RE = /vision|4o|omni|\\bvl\\b|gemini|claude/i;
let presetsCache = null;
const THINK_KEY_WRITERS = { reasoning_effort: (j, v) => { j.reasoning_effort = v; }, output_config: (j, v) => { j.output_config = Object.assign({}, j.output_config, { effort: v }); }, enable_thinking: (j, v) => { j.enable_thinking = v !== 'none' && v !== 'off'; }, EnableThinking: (j, v) => { j.EnableThinking = v !== 'none' && v !== 'off'; } }; // s102/W3 随迁：与真模板四族同步
const THINK_DEFAULT_KEY = 'reasoning_effort';
const W1_EFFORT_ALIASES = { minimal: 'low', light: 'low', medium: 'high', xhigh: 'high', ultra: 'max', none: 'off', disabled: 'off', off: 'off' };
const VARIANT_FAMILY_ENABLED = process.env.FORGE_VARIANT_FAMILY === '1'; // s101/W4：家族兜底降级开关（默认关；提取桩须补，否则 capsDefault 引用未定义=ReferenceError）
// 改前模板残留引用（W2 已删；仅旧模板缺席时提供，供其启发式函数不报错）
const THINK_GATE_RE = /(?:^|[-/])(?:o\d+(?:$|-)|gpt-5(?:$|[-.])|claude|gemini-3|grok-4)/;
const W1_MODEL_EFFORTS = [[/glm-5\\.3/i, ['low', 'high', 'max']], [/deepseek/i, ['none', 'low', 'high', 'max']]];
function readJson(f, d) { try { return JSON.parse(require('fs').readFileSync(f, 'utf8').replace(/^\\uFEFF/, '')); } catch { return d; } }
const capsStore = {};
function syncModelCaps() { return { caps: capsStore }; }
`;
    return new Function('require', head + body + '\nreturn { capsDefault, presetLookup, normalizeEffort, thinkingKeysOf, capsStore, __old: ' + old + ' };')(require);
}

// ---------- 表结构断言 ----------
function tableChecks() {
    let j = null;
    try { j = JSON.parse(fs.readFileSync(PRESETS, 'utf8')); } catch (e) { ck('P0 预置表可解析（conf/model-presets.json）', false, e.message); return null; }
    ck('P0 预置表可解析+非空（entries=' + ((j.entries || []).length) + '）', Array.isArray(j.entries) && j.entries.length === 75, 'n=' + (j.entries || []).length + '（期望恰 75——71+s102/hygiene 增 4：qwen3.8-2.4t-a95b/-27b、gpt-5.1、aliyuncs kimi-k3 二元组；条数变更须随批改此断言）');
    const bad = (j.entries || []).filter(e => !e.source_url || !e.verified || !e.match || (!e.match.model && !e.match.model_regex) || !e.thinking);
    ck('P0b 每条目必带 source_url+verified+match+thinking（缺=红）', bad.length === 0, JSON.stringify(bad.slice(0, 2)));
    const hosts = (j.entries || []).filter(e => e.match.host_contains).length;
    ck('P0c (host,model) 二元组条目在场（research/42 §7.D 硬证据落地）', hosts >= 4, 'host条目=' + hosts);
    const vendors = new Set((j.entries || []).map(e => { const m = e.match.model || e.match.model_regex || ''; const t = [[/glm-5|^glm/i, 'glm'], [/deepseek/i, 'deepseek'], [/qwen/i, 'qwen'], [/kimi/i, 'kimi'], [/doubao/i, 'doubao'], [/hunyuan/i, 'hunyuan'], [/ernie/i, 'ernie'], [/MiniMax/i, 'minimax'], [/step/i, 'step'], [/gpt-/i, 'openai'], [/claude/i, 'claude'], [/gemini/i, 'gemini'], [/grok/i, 'grok'], [/mistral/i, 'mistral']].find(x => x[0].test(m)); return t ? t[1] : 'other'; }));
    ck('P0d 厂系覆盖（P0 一览：' + [...vendors].join(',') + '）', vendors.size >= 13, 'vendors=' + vendors.size);
    return j;
}

// ---------- Part A：逐模型官方真值断言（改前模板同批跑=红对照） ----------
function valueChecks(api, tag) {
    const P = new Set();
    const cd = (m, host) => api.capsDefault(m, new Set(), host || '');
    const quiet = process.env.PF_W2_QUIET === '1' || tag === 'old'; // 红对照臂静默（逐臂 FAIL 明细是红臂的定义，不打印成探针输出）
    const want = (n, ok, why) => { if (ok) P.add(n); else if (!quiet) console.log('FAIL: ' + tag + '/' + n + ' — ' + String(why)); return ok; };
    // 池内三模型（W2 首批核心）
    const g53 = cd('glm-5.3');
    want('A1', g53.source === 'official' && g53.context_len === 1000000 && g53.context_est === false && g53.multimodal === false &&
        JSON.stringify(g53.thinking.levels) === JSON.stringify(['low', 'high', 'max']) && g53.thinking.default === 'max' &&
        g53.thinking.off_supported === false && !g53.thinking.levels.includes('off') && g53.thinking.mode === 'native',
        JSON.stringify(g53));
    const g53f = cd('glm-5.3-flash');
    want('A2', g53f.multimodal === true && g53f.input && g53f.input.pdf === true && g53f.context_len === 1000000 && g53f.max_output === 131072 &&
        JSON.stringify(g53f.thinking.levels) === JSON.stringify(['low', 'high', 'max']), JSON.stringify(g53f));
    const ds = cd('deepseek-v4.1-flash');
    want('A3', ds.multimodal === true && ds.input.pdf === false && ds.context_len === 1000000 && ds.max_output === 393216 &&
        ds.thinking.levels.includes('none') && ds.thinking.levels.includes('high') && ds.thinking.default === 'high' && ds.thinking.off_supported === true,
        JSON.stringify(ds));
    // 厂系覆盖（官方数字逐条）
    const q = cd('qwen3.8-max');
    want('A4', q.context_len === 262144 && q.max_output === 65536 && JSON.stringify(q.thinking.levels) === JSON.stringify(['low', 'medium', 'xhigh']) && q.thinking.default === 'xhigh', JSON.stringify(q));
    const k = cd('kimi-k3');
    want('A5', k.context_len === 1048576 && k.multimodal === true && k.thinking.default === 'max' && k.thinking.off_supported === false, JSON.stringify(k));
    const db = cd('doubao-seed-2-1-pro-260915');
    want('A6', db.context_len === 1048576 && db.max_output === 262144 && db.thinking.levels.length === 7 && db.thinking.default === 'high', JSON.stringify({ c: db.context_len, m: db.max_output, n: db.thinking.levels.length, d: db.thinking.default }));
    const hy = cd('hunyuan-a13b');
    want('A7', hy.context_len === 229376 && hy.thinking.default === 'on' && hy.thinking.levels.length === 0, JSON.stringify(hy));
    const er = cd('ernie-5.0');
    want('A8', er.context_len === 131072 && er.multimodal === true && er.thinking.default === 'off' && er.thinking.off_supported === true, JSON.stringify(er));
    const mm = cd('MiniMax-M3');
    want('A9', mm.context_len === 1000000 && mm.max_output === 524288 && mm.multimodal === true, JSON.stringify(mm));
    const st = cd('step-5-preview');
    want('A10', st.context_len === 1048576 && st.max_output === 65536 && JSON.stringify(st.thinking.levels) === JSON.stringify(['low', 'medium', 'high']) && st.thinking.default === 'medium', JSON.stringify(st));
    const gp = cd('gpt-5.5');
    want('A11', gp.context_len === 1050000 && gp.max_output === 128000 && gp.thinking.levels.includes('none'), JSON.stringify(gp));
    const oa = cd('gpt-6-astra');
    want('A12', oa.thinking.off_supported === false && oa.context_len === 1050000, JSON.stringify(oa));
    const cl = cd('claude-opus-5-5');
    want('A13', cl.context_len === 1000000 && cl.max_output === 128000 && cl.thinking.default === 'medium' && cl.thinking.off_supported === false, JSON.stringify(cl));
    const ch = cd('claude-haiku-4-5');
    want('A14', ch.context_len === 200000 && ch.max_output === 64000 && ch.thinking.mode === 'budget' && ch.thinking.levels.length === 0, JSON.stringify(ch));
    const ge = cd('gemini-3.8-flash');
    want('A15', ge.context_len === 1048576 && ge.input.pdf === true && ge.input.video === true && JSON.stringify(ge.thinking.levels) === JSON.stringify(['low', 'medium', 'high']), JSON.stringify(ge));
    const gk = cd('grok-4.7');
    want('A16', gk.context_len === 500000 && gk.thinking.default === 'high' && gk.thinking.off_supported === false, JSON.stringify(gk));
    const mi = cd('mistral-medium-3-5');
    want('A17', JSON.stringify(mi.thinking.levels) === JSON.stringify(['high', 'none']) && mi.thinking.off_supported === true, JSON.stringify(mi));
    // (host,model) 二元组：同模型跨 host 归属不同（research/42 §7.D 硬证据）
    const stNative = cd('step-3.7-flash', 'https://api.stepfun.com/v1');
    const stBailian = cd('stepfun/step-3.7-flash', 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    want('A18', stNative.thinking.default === 'medium' && stNative.thinking.off_supported === false &&
        stBailian.thinking.default === 'off' && stBailian.thinking.off_supported === true &&
        JSON.stringify(stBailian.thinking.keys).includes('enable_thinking'), JSON.stringify({ n: stNative.thinking, b: stBailian.thinking }));
    const qfDs = cd('deepseek-v4-pro', 'https://qianfan.baidubce.com/v2');
    const dsOfficial = cd('deepseek-v4-pro', 'https://api.deepseek.com/v1');
    want('A19', JSON.stringify(qfDs.thinking.levels) === JSON.stringify(['high', 'max']) && JSON.stringify(dsOfficial.thinking.levels) === JSON.stringify(['none', 'low', 'high', 'max']),
        JSON.stringify({ qf: qfDs.thinking.levels, ds: dsOfficial.thinking.levels }));
    // 未收录模型=诚实缺省（零编造）
    const un = cd('totally-unknown-xyz-9000');
    want('A20', un.context_len === null && un.context_est === true && un.source === 'guess' && un.max_output === null &&
        Array.isArray(un.thinking.levels) && un.thinking.levels.length === 0 && un.thinking.unknown === true, JSON.stringify(un));
    const unFam = cd('no-such-model-flash');
    want('A21', unFam.thinking.levels.length === 0 && unFam.thinking.unknown === true && unFam.source === 'guess', JSON.stringify(unFam.thinking));
    // 档位归一读官方值域（GLM 无 off → 落 low；DeepSeek 有 none → 落 none）——预填 caps 存储（桥内单一真相源同形）
    for (const m of ['glm-5.3', 'glm-5.3-flash', 'deepseek-v4.1-flash', 'totally-unknown-xyz-9000', 'hunyuan-a13b', 'gemini-3.8-flash', 'qwen3.8-max']) api.capsStore[m] = cd(m);
    const nr = (m, v) => api.normalizeEffort(m, v);
    want('A22', nr('glm-5.3', 'off') === 'low' && nr('glm-5.3-flash', 'off') === 'low' && nr('glm-5.3', 'medium') === 'high' && nr('glm-5.3', 'max') === 'max',
        [nr('glm-5.3', 'off'), nr('glm-5.3', 'medium'), nr('glm-5.3', 'xhigh')].join(','));
    want('A23', nr('deepseek-v4.1-flash', 'off') === 'none' && nr('deepseek-v4.1-flash', 'none') === 'none' && nr('deepseek-v4.1-flash', 'low') === 'low',
        [nr('deepseek-v4.1-flash', 'off'), nr('deepseek-v4.1-flash', 'none')].join(','));
    want('A24', nr('totally-unknown-xyz-9000', 'high') === 'high' && nr('totally-unknown-xyz-9000', 'off') === 'none', 'unlisted 原样/off→none');
    // 键声明：官方 keys 过滤后只留写侧已实现的族（s102/W3 随迁：hunyuan→EnableThinking 布尔族；
    // gemini thinkingConfig 未实现→安全回落 reasoning_effort，research/43 §3-⑦ 官方兼容面映射）
    want('A25', JSON.stringify(api.thinkingKeysOf('glm-5.3')) === JSON.stringify(['reasoning_effort']) &&
        JSON.stringify(api.thinkingKeysOf('hunyuan-a13b')) === JSON.stringify(['EnableThinking']) &&
        JSON.stringify(api.thinkingKeysOf('gemini-3.8-flash')) === JSON.stringify(['reasoning_effort']),
        JSON.stringify([api.thinkingKeysOf('glm-5.3'), api.thinkingKeysOf('hunyuan-a13b'), api.thinkingKeysOf('gemini-3.8-flash')]));
    // s102/table-hygiene 新条目（match 命中+数字与底稿逐位一致，防转录漂移；数字源 research/42 §1.B、43 §1.A-⑤）
    const q24 = cd('qwen3.8-2.4t-a95b');
    want('A27', q24.source === 'official' && q24.context_len === null && q24.context_est === true && q24.max_output === null &&
        JSON.stringify(q24.thinking.levels) === JSON.stringify(['low', 'medium', 'xhigh']) && q24.thinking.default === 'xhigh' && q24.thinking.off_supported === true,
        JSON.stringify(q24));
    const q27 = cd('qwen3.8-27b');
    want('A28', q27.source === 'official' && q27.context_len === null && q27.max_output === null &&
        JSON.stringify(q27.thinking.levels) === JSON.stringify(['low', 'medium', 'xhigh']) && q27.thinking.default === 'xhigh' && q27.thinking.off_supported === true,
        JSON.stringify(q27));
    const g51 = cd('gpt-5.1');
    want('A29', g51.source === 'official' && g51.context_len === 400000 && g51.max_output === 128000 &&
        g51.thinking.levels === null && g51.thinking.unknown === true && g51.thinking.default === null && g51.thinking.off_supported === null,
        JSON.stringify(g51));
    // kimi-k3 阿里二元组（tier1 精确二元组优先）：aliyuncs host→可关（enable_thinking=false 口径，research/42 §1.B）；月之暗面 host→仍不可关（#15 条目未动）
    const kAli = cd('kimi-k3', 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    const kMoon = cd('kimi-k3', 'https://api.moonshot.cn/v1');
    want('A30', kAli.source === 'official' && kAli.thinking.off_supported === true && kAli.context_len === null &&
        JSON.stringify(kAli.thinking.levels) === JSON.stringify(['max', 'high', 'low']) && kAli.thinking.default === 'max' &&
        JSON.stringify(kAli.thinking.keys).includes('enable_thinking') &&
        kMoon.thinking.off_supported === false && kMoon.context_len === 1048576,
        JSON.stringify({ a: kAli.thinking, m: kMoon.thinking }));
    // s102/qa-rework P2-1 随迁：布尔门象限（keys 含 enable_thinking ∧ off_supported=true ∧ levels 无 none）
    // 关思考归一为 'off'（交写侧落 enable_thinking=False，research/42 §1.B）——修前被 levels 门就近收敛 low；
    // 'None' 大小写变体（微修 a）经 toLowerCase 终试同落 'off'。写侧形状由 tmp/s102-rework/rework-probe.js 活体钉。
    want('A31', nr('qwen3.8-max', 'off') === 'off' && nr('qwen3.8-max', 'none') === 'off' && nr('qwen3.8-max', 'None') === 'off',
        [nr('qwen3.8-max', 'off'), nr('qwen3.8-max', 'none'), nr('qwen3.8-max', 'None')].join(','));
    return P;
}

(async () => {
    console.log('--- Part A: 预置表结构 + 逐模型官方真值（' + path.basename(TPL_BRIDGE) + '）---');
    tableChecks();
    const src = fs.readFileSync(TPL_BRIDGE, 'utf8');
    const api = evalTpl(src, PRESETS);
    if (!api) { ck('A0 桥模板含预置机制（readPresets/presetLookup/capsDefault 等七函数）', false, 'extract failed'); }
    else {
        ck('A0 桥模板含预置机制（readPresets/presetLookup/capsDefault 等七函数）', true);
        const got = valueChecks(api, 'new');
        const names = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19', 'A20', 'A21', 'A22', 'A23', 'A24', 'A25', 'A27', 'A28', 'A29', 'A30', 'A31'];
        const missing = names.filter(n => !got.has(n));
        ck('A26 逐模型官方真值全臂通过（' + got.size + '/30）', missing.length === 0, '红臂=' + missing.join(','));
    }
    // ---- 红对照：W1 态模板（s101 W2 改前，提交 58b3c0e）同批必红（改前 capsDefault 五档含 off、-flash 判 false） ----
    const RED_PIN = process.env.PF_RED_REV || '58b3c0e'; // 钉死改前版本（不是 HEAD——本批提交后 HEAD 已含机制）
    let oldSrc = '';
    try { oldSrc = execSync('git show ' + RED_PIN + ':forge/conf/templates/chat-bridge.tpl.js', { cwd: path.join(FORGE, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { }
    if (!oldSrc) { ck('R0 红对照：改前模板可取（git show ' + RED_PIN + '）', false, 'git show failed'); }
    else {
        const oldApi = evalTpl(oldSrc, PRESETS);
        if (oldApi) {
            const oldGot = valueChecks(oldApi, 'old');
            const redProven = !oldGot.has('A1') || !oldGot.has('A2') || !oldGot.has('A3');
            ck('R0 红对照：改前模板同批断言必红（改前五档含 off / glm-flash 判 false）', redProven,
                '改前通过臂=' + [...oldGot].join(','));
            ck('R0b 红对照具体形态：改前 -flash 走家族启发式得五档含 off、看图判 false、上下文恒空靠估计',
                (() => {
                    const pool = new Set(['glm-5.3-flash', 'glm-5.3']); // 池内有去后缀兄弟=改前家族分支
                    const b = oldApi.capsDefault('glm-5.3-flash', pool, '');
                    const a = oldApi.capsDefault('glm-5.3', pool, '');
                    return b.thinking.levels.indexOf('off') >= 0 && b.thinking.levels.length === 5 &&
                        b.multimodal === false && b.context_len === null && b.context_est === true &&
                        a.thinking.levels.indexOf('off') >= 0 && a.multimodal === false;
                })(),
                JSON.stringify(oldApi.capsDefault('glm-5.3-flash', new Set(['glm-5.3-flash', 'glm-5.3']), '')));
        } else {
            ck('R0 红对照：改前模板无预置机制（提取即失败=红）', true);
        }
    }
    console.log('--- Part B: 沙箱真桥（物化链 + providers 帧 + /api/modelcaps）---');
    try { await partB(); } catch (e) { ck('B 探针异常', false, e && e.stack || String(e)); }
    console.log('\nw2-preset-probe: ' + pass + ' pass, ' + fail + ' fail');
    process.exit(fail ? 1 : 0);
})();

function httpJson(method, p, body) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
        const rq = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: Object.assign({}, data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) }, res => {
            let b = ''; res.on('data', c => b += c);
            res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode, json: j, text: b }); });
        });
        rq.on('error', reject); rq.setTimeout(15000, () => rq.destroy(new Error('timeout')));
        if (data) rq.write(data); rq.end();
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
            socket.on('error', () => {}); socket.on('close', () => {});
            resolve(api);
        });
        rq.on('error', e => { clearTimeout(timer); reject(e); });
    });
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

async function partB() {
    let bridge = null, berr = '';
    try {
        try { fs.rmSync(SB, { recursive: true, force: true }); } catch {}
        for (const d of ['conf/goose/config', 'conf/goose/data/sessions', 'conf/templates', 'data/logs', 'data/stats']) fs.mkdirSync(path.join(SB, ...d.split('/')), { recursive: true });
        // 物化链：预置表随包落在 conf/（沙箱镜像出厂形态）
        fs.copyFileSync(PRESETS, path.join(SB, 'conf', 'model-presets.json'));
        fs.writeFileSync(path.join(SB, 'VERSION'), '9.9.9-w2-preset-probe');
        fs.writeFileSync(path.join(SB, 'conf', 'goose', 'config', 'config.yaml'), 'GOOSE_PROVIDER: openai\nGOOSE_DISABLE_UPDATE_CHECK: true\nextensions: {}\n');
        fs.writeFileSync(path.join(SB, 'data', 'providers.json'), JSON.stringify([
            { name: 'probe家', host: 'https://api.stepfun.com/v1', models: ['glm-5.3', 'glm-5.3-flash', 'deepseek-v4.1-flash', 'totally-unknown-xyz-9000'], key: 'probe-key', active: true }
        ], null, 2));
        fs.writeFileSync(path.join(SB, 'data', 'secrets.env'), 'PC_TOKEN=probe\n');
        const src = fs.readFileSync(TPL_BRIDGE, 'utf8');
        const ANCHOR = "const child = spawn(GOOSE, ['acp'], {";
        if (src.split(ANCHOR).length - 1 !== 1) { ck('B0 桥模板 spawnAcp 锚点恰一处（可桩化）', false, 'anchor count != 1'); return; }
        fs.writeFileSync(path.join(SB, 'bridge-patched.js'), src.replace(ANCHOR, "const child = spawn(process.execPath, [process.env.PF_ACP_STUB || GOOSE, 'acp'], {"));
        fs.writeFileSync(path.join(SB, 'goose-stub.js'), `
const fs=require('fs');let buf='',seq=0;
process.stdin.setEncoding('utf8');
process.stdin.on('data',c=>{buf+=c;let i;while((i=buf.indexOf('\\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line)continue;let j;try{j=JSON.parse(line)}catch{continue}
if(j.id===undefined||j.id===null)continue;let result={};
if(j.method==='initialize')result={agentInfo:{name:'goose-probe',version:'1.50.0-probe'},protocolVersion:1};
else if(j.method==='session/new')result={sessionId:'20260920_'+(++seq),configOptions:[],modes:{availableModes:[],currentModeId:null}};
else if(j.method==='session/set_config_option')result={configOptions:[]};
else if(j.method==='session/load')result={sessionId:(j.params||{}).sessionId,configOptions:[],updates:[]};
else if(j.method==='session/prompt')result={stopReason:'end'};
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:j.id,result})+'\\n');}});
process.stdin.on('end',()=>process.exit(0));
const t=setTimeout(()=>process.exit(0),60000);if(t.unref)t.unref();
`);
        bridge = spawn(process.execPath, [path.join(SB, 'bridge-patched.js')], {
            env: Object.assign({}, process.env, { FORGE_ROOT: SB, PORT: String(PORT), PF_ACP_STUB: path.join(SB, 'goose-stub.js'), NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' }),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        bridge.stderr.on('data', d => { berr += d; });
        if (!await waitHealth()) { ck('B0 沙箱真桥启动（healthz）', false, berr.slice(-300)); return; }
        ck('B0 沙箱真桥启动（healthz）', true);
        await sleep(800);
        const CAPS = path.join(SB, 'data', 'model-caps.json');
        const j = JSON.parse(fs.readFileSync(CAPS, 'utf8'));
        ck('B1 落盘 _schema:3（ADR-0009 迁移到 latest）', j._schema === 3, 'schema=' + j._schema);
        const c = j.caps || {};
        ck('B2 池内三模型 source=official + preset_rev 在场（含 official 条目元数据）',
            c['glm-5.3'] && c['glm-5.3'].source === 'official' && c['glm-5.3'].preset_rev && c['glm-5.3-flash'].source === 'official' && c['deepseek-v4.1-flash'].source === 'official',
            JSON.stringify([c['glm-5.3'] && c['glm-5.3'].source, c['glm-5.3'] && c['glm-5.3'].preset_rev]));
        ck('B3 官方真值落盘：glm-5.3 1M/128K + 三档无 off；glm-5.3-flash 能看图',
            c['glm-5.3'] && c['glm-5.3'].context_len === 1000000 && c['glm-5.3'].context_est === false &&
            JSON.stringify(c['glm-5.3'].thinking.levels) === JSON.stringify(['low', 'high', 'max']) &&
            c['glm-5.3-flash'].multimodal === true,
            JSON.stringify(c['glm-5.3']));
        ck('B4 未收录模型=诚实缺省落盘（context_len null + levels [] + unknown + source guess）',
            c['totally-unknown-xyz-9000'] && c['totally-unknown-xyz-9000'].context_len === null && c['totally-unknown-xyz-9000'].context_est === true &&
            Array.isArray(c['totally-unknown-xyz-9000'].thinking.levels) && c['totally-unknown-xyz-9000'].thinking.levels.length === 0 &&
            c['totally-unknown-xyz-9000'].thinking.unknown === true && c['totally-unknown-xyz-9000'].source === 'guess',
            JSON.stringify(c['totally-unknown-xyz-9000']));
        // providers 帧：caps 带 source（页侧三态标注数据面）
        const frames = [];
        const ws = await wsConnect(f => frames.push(f));
        ws.send({ type: 'providers' });
        let pf = null;
        for (let i = 0; i < 80 && !pf; i++) { pf = frames.find(f => f.sys === 'providers'); if (!pf) await sleep(120); }
        const ent = pf && pf.list && pf.list.find(p => p.name === 'probe家');
        ck('B5 providers 帧 caps 随行 source 三态字段（official/guess）',
            !!ent && ent.caps && ent.caps['glm-5.3'] && ent.caps['glm-5.3'].source === 'official' &&
            ent.caps['totally-unknown-xyz-9000'] && ent.caps['totally-unknown-xyz-9000'].source === 'guess',
            JSON.stringify(ent && ent.caps['glm-5.3'] && { s: ent.caps['glm-5.3'].source, u: ent.caps['totally-unknown-xyz-9000'] && ent.caps['totally-unknown-xyz-9000'].source }));
        ws.close();
        // 用户改过→source=user（三态第三档），且官方表不再覆写
        const s1 = await httpJson('POST', '/api/modelcaps', { op: 'set', model: 'glm-5.3', patch: { multimodal: true } });
        const g1 = await httpJson('GET', '/api/modelcaps');
        ck('B6 用户改过→source=user + user:true（官方表永不覆写）',
            s1.json && s1.json.ok === true && g1.json.caps['glm-5.3'].source === 'user' && g1.json.caps['glm-5.3'].user === true && g1.json.caps['glm-5.3'].multimodal === true,
            JSON.stringify(g1.json.caps['glm-5.3'] && { s: g1.json.caps['glm-5.3'].source, m: g1.json.caps['glm-5.3'].multimodal }));
    } finally {
        if (bridge) { try { execSync('taskkill /PID ' + bridge.pid + ' /T /F', { stdio: 'ignore' }); } catch { try { bridge.kill(); } catch {} } }
        await sleep(200);
        try { fs.rmSync(SB, { recursive: true, force: true }); } catch {}
    }
}
