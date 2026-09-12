// 死代码检测：具名函数在定义行之外零出现 = 候选
const fs = require('fs');
const src = fs.readFileSync('forge/conf/templates/chat-bridge.tpl.js', 'utf8');
const lines = src.split('\n');
const defs = [];
lines.forEach((l, i) => {
  const m = l.match(/^(?:async )?function ([A-Za-z_$][\w$]*)/) || l.match(/^\s+function ([A-Za-z_$][\w$]*)/);
  if (m) defs.push([m[1], i + 1]);
});
const dead = [];
for (const [name, line] of defs) {
  const re = new RegExp('\\b' + name + '\\b', 'g');
  let count = 0;
  lines.forEach((l, idx) => {
    if (idx === line - 1) return;
    const mm = l.match(re);
    if (mm) count += mm.length;
  });
  if (count === 0) dead.push([name, line]);
}
console.log('=== 零引用函数 ===');
dead.forEach(([n, l]) => console.log(l + ': ' + n));
console.log('total defs:', defs.length, 'dead:', dead.length);

// 注释掉的代码块（连续 // 开头且含代码特征）
let commentedCode = 0;
for (const [i, l] of lines.entries()) {
  const t = l.trim();
  if (/^\/\/\s*(const |let |if\s*\(|for\s*\(|function |res\.|ws\.|return |await )/.test(t)) { console.log('commented-code ' + (i+1) + ': ' + t.slice(0, 90)); commentedCode++; }
}
console.log('commented-code lines:', commentedCode);

// POST body 累积样板重复
const boiler = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.includes("let postBytes = 0; // s50c"));
console.log('=== POST body 样板出现 ' + boiler.length + ' 次: 行 ' + boiler.map(([, i]) => i).join(', '));

// res.writeHead(200 JSON 样板
const wr = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.includes("res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })"));
console.log('=== writeHead(200 json) 样板出现 ' + wr.length + ' 次');

// session/new+rebind 模式重复
const rebind = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.includes("if (!sessionClients.has(res.sessionId)) sessionClients.set(res.sessionId, new Set());"));
console.log('=== sessionClients rebind 样板出现 ' + rebind.length + ' 次: 行 ' + rebind.map(([, i]) => i).join(', '));
const sessNew = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.includes("method: 'session/new'"));
console.log("=== session/new 调用点: 行 " + sessNew.map(([, i]) => i).join(', '));

// pcPort 读取样板
const pcport = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.includes("data', 'pc.port'"));
console.log('=== pc.port 读取样板出现 ' + pcport.length + ' 次: 行 ' + pcport.map(([, i]) => i).join(', '));

// secrets.env 重写样板（providers 与 save_config 两处）
const sew = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.includes("GOOSE_MODEL_NAME|FORGE_AGENT_HOST|FORGE_AGENT_API_KEY"));
console.log('=== secrets.env 键过滤样板出现 ' + sew.length + ' 次: 行 ' + sew.map(([, i]) => i).join(', '));

// explain/optimize 双胞胎：SSE 解析循环样板
const sse = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.includes("if (p === '[DONE]') { finish(); return; }") || l.includes("if (pj === '[DONE]') { finish(); return; }"));
console.log('=== SSE [DONE] 解析样板出现 ' + sse.length + ' 次: 行 ' + sse.map(([, i]) => i).join(', '));
const reasoning = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.includes("reasoning_effort = 'none'"));
console.log('=== reasoning_effort 降级样板出现 ' + reasoning.length + ' 次: 行 ' + reasoning.map(([, i]) => i).join(', '));

// faucet REST GET 三胞胎样板
const faucets = ['faucetRows', 'faucetTableInfo', 'faucetSample'].map(fn => {
  const line = lines.findIndex(l => l.includes('function ' + fn));
  return fn + '@' + (line + 1);
});
console.log('=== faucet REST 样板: ' + faucets.join(', '));
const restq = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.includes("rq.on('error', () => resolve(null));"));
console.log("=== 'error'->resolve(null) 样板出现 " + restq.length + ' 次: 行 ' + restq.map(([, i]) => i).join(', '));
