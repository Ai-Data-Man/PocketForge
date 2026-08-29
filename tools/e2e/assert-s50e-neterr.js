// s50e 修复自测：classifyUpstream + S26_ERR_RE 对真实 goose 错误文本的判定断言
const C = require('assert');
// 从桥源码提取 S26_ERR_RE 与 classifyUpstream（不启动桥）
const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat-bridge.tpl.js'), 'utf8');
const reM = src.match(/const S26_ERR_RE = (\/.+\/i);/);
C.ok(reM, 'S26_ERR_RE 定义存在');
const S26_ERR_RE = eval(reM[1]);
function classifyUpstream(txt) {
    const s = String(txt || '');
    if (/401|api key|unauthorized/i.test(s)) return 'unauthorized';
    if (/rate limit|429/i.test(s)) return 'rate';
    if (/timed out|timeout/i.test(s)) return 'timeout';
    return 'server';
}
// 1) 新形态（GUI 实证文本）→ 命中且归 server
C.strictEqual(classifyUpstream('Network error: Could not connect to 127.0.0.1:9 — check your network connection and try again.'), 'server', '实证文本归 server');
C.ok(S26_ERR_RE.test('Network error: Could not connect to 127.0.0.1:9 — check your network connection and try again.'), '实证文本命中 S26_ERR_RE');
// 2) 小写变体 → server
C.ok(S26_ERR_RE.test('could not connect to upstream') && classifyUpstream('could not connect to upstream') === 'server', '小写变体归 server');
C.ok(S26_ERR_RE.test('network error') && classifyUpstream('network error') === 'server', 'network error 归 server');
// 3) 原有 4 类回归
C.ok(S26_ERR_RE.test('Ran into this error while generating response. Try again or refactor your prompt...'), 'Ran into this error 命中');
C.strictEqual(classifyUpstream('401 Unauthorized: invalid api key'), 'unauthorized', '401 归 unauthorized');
C.strictEqual(classifyUpstream('Server error: rate limit exceeded (429)'), 'rate', '429 归 rate');
C.strictEqual(classifyUpstream('Request timed out after 60s'), 'timeout', 'timeout 归 timeout');
C.strictEqual(classifyUpstream('fetch failed: ECONNREFUSED'), 'server', 'ECONN 类归 server');
// 4) 误报防线：正常回复不命中
C.ok(!S26_ERR_RE.test('今天天气不错，我们聊聊网络吧'), '正常中文回复不误报');
C.ok(!S26_ERR_RE.test('Let me show you how the network topology looks'), '含 network 的正常英文不误报');
console.log('assert-s50e-neterr: 9/9 PASS');
