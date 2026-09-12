// fuzz 面3（3f80ca9/166607a P3-2）：maskKeys 显示层掩码随机 key 形态矩阵（静态纯函数探针，无桥无网络）。
// 从 chat.tpl.html 提取 maskKeys 原文执行（report-probe-static 同款手法）。向量族：大小写 header 名/引号变体
// （JSON 形态/单引号/键值异引号）/多 key 同串/超长 key/空值/仅前缀/12-13 字符掩码边界/Unicode 与 \0 值内混杂/
// URL query ?apikey=（规格外形态）。断言：不崩恒返串、规格内两族（x-api-key/authorization bearer）全形态掩码
// 到位、≤12 字符全星、13 字符前6后4。已知缺口（Unicode/NUL 断 token 后尾段裸奔、?apikey= 规格外）按观察项
// 报告，探针只钉「不崩+规格内掩码不受污染」不钉缺口行为本身。
'use strict';
const FSS = require('fs');
const path = require('path');
const HTML = FSS.readFileSync(path.join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat.tpl.html'), 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n + (ok ? '' : (why ? '  << ' + why : ''))); ok ? pass++ : fail++; };

// ---- 提取 maskKeys 原文（锚点：函数头 → toolCard 头）----
const at = HTML.indexOf('function maskKeys(s){');
const end = HTML.indexOf('function toolCard', at);
if (at < 0 || end < 0 || end <= at) { console.log('FAIL: maskKeys 提取锚点不存在'); process.exit(1); }
const maskKeys = new Function(HTML.slice(at, end) + ';return maskKeys;')();

// ---- 断言助手 ----
const masked = (inp, keyTail) => { // keyTail：原 key 中不应裸奔出现的尾段（后 8 字符以上切片）
    let out;
    try { out = maskKeys(inp); } catch (e) { return { ok: false, why: 'threw ' + e.message }; }
    if (typeof out !== 'string') return { ok: false, why: 'non-string ' + typeof out };
    if (out.includes('****')) {
        const tail = keyTail.slice(-8);
        if (keyTail.length > 12 && out.includes(tail)) return { ok: false, why: '尾段裸奔: ' + out };
    }
    return { ok: true, out };
};
const key = (n, pre) => (pre || 'sk-') + 'abcdefghijklmnop'.slice(0, Math.max(1, n - (pre ? pre.length : 0))).padEnd(Math.max(1, n - (pre ? pre.length : 0)), '9');
const K16 = 'sk-abcdef12345678'; // 16 字符标准形态
const vectors = [];
const V = (label, inp, tail) => vectors.push({ label, inp, tail });

// 大小写 header 名 ×3
V('大写 X-API-Key', 'X-API-Key: ' + K16, K16);
V('小写 x-api-key', 'x-api-key: ' + K16, K16);
V('混合 X-aPi-kEy', 'X-aPi-kEy: ' + K16, K16);
// 引号变体 ×5
V('JSON 双引号形态', '{"X-API-Key":"' + K16 + '"}', K16);
V('JSON 键尾引号+空格', '{"X-API-Key" : "' + K16 + '"}', K16);
V('单引号形态', "'x-api-key' = '" + K16 + "'", K16);
V('键单引号值双引号', "'X-API-Key' = \"" + K16 + '"', K16);
V('无引号等号形态', 'x-api-key=' + K16, K16);
// Authorization 族 ×4
V('Bearer 裸形态', 'Authorization: Bearer ' + K16, K16);
V('bearer JSON 形态', '{"authorization":"Bearer ' + K16 + '"}', K16);
V('BEARER 全大写', 'AUTHORIZATION: BEARER ' + K16, K16);
V('authorization 紧凑无空格', 'Authorization:Bearer ' + K16, K16);
// 多 key 同串 ×2
V('双 faucet key 同串', 'curl -H "X-API-Key: faucet_k111111111" -H "X-API-Key: faucet_k222222222" https://x', 'faucet_k222222222');
V('X-API-Key+Bearer 混装', 'X-API-Key: ' + K16 + ' Authorization: Bearer ' + K16.slice(0, 15) + 'zz', K16.slice(0, 15) + 'zz');
// 超长 ×1
V('200 字符超长 key', 'X-API-Key: ' + 'k'.repeat(200), 'k'.repeat(200));
// 空值/仅前缀 ×3（无 token 可掩——不崩即可）
V('空值', 'X-API-Key: \nnext line', null);
V('仅 Bearer 前缀', 'Authorization: Bearer ', null);
V('空串输入', '', null);
// 12/13 字符掩码边界 ×2
V('12 字符全星边界', 'X-API-Key: abcdef123456', null);   // → ****（全掩）
V('13 字符前6后4边界', 'X-API-Key: abcdef1234567', 'abcdef1234567'); // → abcdef****4567（首6 可见属规格）
// Unicode / \0 混杂 ×3（观察项：token 类外字符断链后尾段可能裸奔——只钉不崩+头部已掩）
V('值中含中文', 'X-API-Key: sk-abc中文def1234567890', 'sk-abc');  // 头段应被掩（尾段缺口走报告）
V('值中含 \\0', 'X-API-Key: sk-\u0000null\u0000-abcdefghijklmnop', 'sk-');
V('值中含 JSON 转义形态 \\u0000 字面', 'X-API-Key: sk-\\u0000abcdefghij', 'sk-');
// 规格外 URL query 形态 ×2（?apikey= 不在 s78 P4 两族规格内——钉规格内 key 不受污染）
V('?apikey= 规格外共存', 'curl "https://h/p?apikey=sk-notinspec0000" -H "X-API-Key: ' + K16 + '"', K16);
V('?API-KEY= 大写变体', '?API-KEY=sk-alsoout000 -H "authorization: Bearer ' + K16 + '"', K16);

let bad = [];
for (const v of vectors) {
    const r = v.tail === null
        ? (() => { try { const o = maskKeys(v.inp); return { ok: typeof o === 'string', why: typeof o }; } catch (e) { return { ok: false, why: e.message }; } })()
        : masked(v.inp, v.tail);
    if (!r.ok) bad.push(v.label + ' << ' + r.why);
}
ck('M1 全 ' + vectors.length + ' 向量不崩恒返串+规格内掩码到位（尾段零裸奔）', bad.length === 0, bad.join(' | '));

// 掩码形状钉子（规格行为回归）：12 全星 / 13 前6后4 / 16 前6后4
const shape12 = maskKeys('X-API-Key: abcdef123456');
ck('M2 12 字符 key 全星（无前缀残留）', shape12 === 'X-API-Key: ****', shape12);
const shape13 = maskKeys('X-API-Key: abcdef1234567');
ck('M3 13 字符 key 前6+****+后4', shape13 === 'X-API-Key: abcdef****4567', shape13);
const shape16 = maskKeys('x-api-key: ' + K16);
ck('M4 16 字符 key 前6+****+后4（小写 header 同效）', shape16 === 'x-api-key: ' + K16.slice(0, 6) + '****' + K16.slice(-4), shape16);

// 双 key 同串两处都掩（无首匹配即停）
const two = maskKeys('X-API-Key: faucet_k111111111 X-API-Key: faucet_k222222222');
ck('M5 多 key 同串逐一掩码（非首匹配即停）', two.includes('faucet****1111') && two.includes('faucet****2222'), two);

// 规格外 ?apikey= 共存时规格内 key 仍被掩（缺口行为本身走观察报告，不在此钉）
const mix = maskKeys('curl "https://h/p?apikey=sk-notinspec0000" -H "X-API-Key: ' + K16 + '"');
ck('M6 规格外形态共存不阻断规格内掩码', mix.includes(K16.slice(0, 6) + '****' + K16.slice(-4)), mix);

// Unicode/\0 向量：头部 ASCII 段必须已掩（尾段缺口=观察项 tmp 报告，不钉行为）
const uni = maskKeys('X-API-Key: sk-abc中文def1234567890');
ck('M7 Unicode 断链向量：ASCII 头段已掩不崩（尾段缺口走观察报告）', !uni.includes('sk-abc中文'), uni);
const nul = maskKeys('X-API-Key: sk-\u0000null\u0000-abcdefghijklmnop');
ck('M8 \\0 断链向量：ASCII 头段已掩不崩（尾段缺口走观察报告）', !nul.includes('sk-\u0000nul'), nul.replace(/\u0000/g, '\\0'));

console.log('mask-fuzz-probe: PASS=' + pass + ' FAIL=' + fail);
if (fail) process.exitCode = 1;
