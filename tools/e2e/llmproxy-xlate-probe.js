// [s107/f6 入库] 用途：xlateConfigOptions 会话态分路：别名单→译真名+gradient 兜底；真名单→零翻译
// 用法：node tools/e2e/llmproxy-xlate-probe.js（env 覆盖：PF_TPL/PF_BRIDGE/PF_PRESETS/PF_GOOSE_BIN 等见体内；自建沙箱桥本地口，不碰 dev 栈 8790）
// 来源：s98-s101 各批 forge/tmp 同名探针（AGENTS §8.2 触桥清单成员；s106 留痕「探针入库义务」的补账，s107/f6 落库）
// s98/llm-proxy P1 回归探针（QA 复审返工项）：xlateConfigOptions 必须按会话形态分路——
//   ① 别名会话（goose 侧 currentValue=别名）→ 按 effort 译成成员真名 + 挂 gradient + 兜底合成五档；
//   ② 存量真名会话（currentValue=真名成员）→ **零翻译零合成**（否则界面显示与实际跑的模型背离：显示快档、实跑深档 2.8x）；
//   ③ 非家族 → 原样；④ 家族已散但会话钉旧别名 → 落回生效真名（既有行为）。
// 用法：node tmp/llmproxy-xlate-probe.js
'use strict';
const fs = require('fs');
const path = require('path');
const FORGE = path.join(__dirname, '..', '..', 'forge'); // 入库 s107/f6：自 forge/tmp 迁 tools/e2e，深度随迁
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok || !why ? '' : ' — ' + String(why))); ok ? pass++ : fail++; };

const TPL = process.env.PF_XLATE_TPL || path.join(FORGE, 'conf', 'templates', 'chat-bridge.tpl.js');
const src = fs.readFileSync(TPL, 'utf8');
function extractFn(name) {
    const head = 'function ' + name + '(';
    const at = src.indexOf(head);
    if (at < 0) throw new Error('fn not found: ' + name);
    const brace = src.indexOf('{', at);
    let depth = 0;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error('unbalanced: ' + name);
}

// 桥内依赖桩：activeProvider/registryFamilies 只用「池 + 别名映射」两个事实
const POOL = ['deepseek-v4.1-flash', 'glm-5.3-flash', 'glm-5.3'];
const FAM = { fast: 'glm-5.3-flash', deep: 'glm-5.3', alias: 'gpt-5-forge-glm-5.3-flash' };
const ctx = {
    activeProvider: () => ({ name: 'stub', models: POOL, host: 'http://x', active: true }),
    registryFamilies: () => [FAM],
    forgeFamilies: () => [FAM],
    effectiveModel: () => 'deepseek-v4.1-flash',
    console,
};
const fnSrc = [extractFn('familyOfModel'), extractFn('gooseModelName'), extractFn('xlateConfigOptions')].join('\n');
const makeXlate = () => new Function('activeProvider', 'registryFamilies', 'forgeFamilies', 'effectiveModel', 'console',
    fnSrc + '\nreturn xlateConfigOptions;')(ctx.activeProvider, ctx.registryFamilies, ctx.forgeFamilies, ctx.effectiveModel, console);

const mk = (cur, effortCur, effOpts) => ([
    { id: 'model', name: 'Model', type: 'select', currentValue: cur, options: [{ value: cur, name: cur }, { value: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash' }] },
    { id: 'thinking_effort', name: 'TE', type: 'select', currentValue: effortCur, options: effOpts || [{ value: 'off', name: 'off' }] },
]);
const modelOf = co => (co.find(c => c.id === 'model') || {});

// ① 别名会话 + effort=max → 真名 deep + gradient
{
    const co = mk(FAM.alias, 'max');
    makeXlate()(co);
    const mo = modelOf(co);
    ck('① 别名会话 effort=max → 成员真名 glm-5.3', mo.currentValue === 'glm-5.3', mo.currentValue);
    ck('① gradient 数据面在场（fast/deep 真名）', !!(mo.gradient && mo.gradient.fast === 'glm-5.3-flash' && mo.gradient.deep === 'glm-5.3'), JSON.stringify(mo.gradient));
    ck('① 选项列表里的别名已翻成真名（零别名外泄）', !JSON.stringify(co).includes('gpt-5-forge'), JSON.stringify(mo.options));
    const th = co.find(c => c.id === 'thinking_effort');
    ck('① 遮蔽回包兜底合成五档且当前值=max', th.options.length === 5 && th.currentValue === 'max', JSON.stringify(th));
}
// ② 存量真名会话（P1 回归守卫）：零翻译零合成
{
    const co = mk('glm-5.3', 'off');
    const snap = JSON.stringify(co);
    makeXlate()(co);
    ck('② 真名会话原样不动（零翻译零合成=界面即真相）', JSON.stringify(co) === snap, JSON.stringify(modelOf(co)));
    ck('② 真名会话不挂 gradient（不会误显两档）', modelOf(co).gradient === undefined, JSON.stringify(modelOf(co).gradient));
    ck('② 真名会话档位保持遮蔽态（不伪造五档）', co.find(c => c.id === 'thinking_effort').options.length === 1, '');
}
// ②b 真名会话=deep 成员时同样零合成（P1 现场：显示快档实跑深档的根因点）
{
    const co = mk('glm-5.3-flash', 'off');
    const snap = JSON.stringify(co);
    makeXlate()(co);
    ck('②b 真名=flash 成员亦原样（不被 effort 改写）', JSON.stringify(co) === snap, JSON.stringify(modelOf(co).currentValue));
}
// ③ 非家族模型 → 原样
{
    const co = mk('deepseek-v4.1-flash', 'off');
    const snap = JSON.stringify(co);
    makeXlate()(co);
    ck('③ 非家族原样透传', JSON.stringify(co) === snap, '');
}
// ④ 家族已散 + 会话钉旧别名 → 落回生效真名（不泄漏别名）
{
    const noFam = new Function('activeProvider', 'registryFamilies', 'forgeFamilies', 'effectiveModel', 'console',
        fnSrc + '\nreturn xlateConfigOptions;')(() => ({ name: 'stub', models: ['deepseek-v4.1-flash'], active: true }), () => [], () => [], () => 'deepseek-v4.1-flash', console);
    const co = mk(FAM.alias, 'off');
    noFam(co);
    ck('④ 家族已散：别名落回生效真名', modelOf(co).currentValue === 'deepseek-v4.1-flash', modelOf(co).currentValue);
}

console.log('\nllmproxy-xlate-probe: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
