// 巨型函数 + 嵌套深度 + 调试残留分析
const fs = require('fs');
const src = fs.readFileSync('forge/conf/templates/chat-bridge.tpl.js', 'utf8');
const lines = src.split('\n');

// 1) 巨型函数：用大括号配平法测函数体长度
const defs = [];
lines.forEach((l, i) => {
  const m = l.match(/^(?:async )?function ([A-Za-z_$][\w$]*)/) || l.match(/^\s+function ([A-Za-z_$][\w$]*)/);
  if (m) defs.push({ name: m[1], start: i + 1 });
});
console.log('=== 超过 60 行的函数 ===');
for (const d of defs) {
  let depth = 0, seen = false, end = d.start;
  for (let i = d.start - 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; seen = true; }
      if (ch === '}') depth--;
    }
    if (seen && depth <= 0) { end = i + 1; break; }
  }
  d.len = end - d.start + 1;
  if (d.len > 60) console.log(d.name + ' @' + d.start + '-' + end + ' = ' + d.len + ' 行');
}

// 2) 嵌套深度 >4 的行（粗略大括号深度，忽略字符串字面量中的大括号干扰，仅作密集区指示）
console.log('=== 大括号深度 >=6 的行（指示深嵌套区） ===');
let depth = 0;
const deepLines = [];
lines.forEach((l, i) => {
  for (const ch of l) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  if (depth >= 6 && l.trim()) deepLines.push(i + 1);
});
if (deepLines.length) {
  // 压缩成区间
  let ranges = [], s = deepLines[0], p = deepLines[0];
  for (const x of deepLines.slice(1)) { if (x - p > 5) { ranges.push([s, p]); s = x; } p = x; }
  ranges.push([s, p]);
  ranges.forEach(([a, b]) => console.log('深度>=6 区间: ' + a + '-' + b));
} else console.log('(无)');

// 3) 调试残留 / 环境开关
console.log('=== 调试开关 / 残留标记 ===');
lines.forEach((l, i) => {
  if (/PF_EXPLAIN_DEBUG|console\.log\('debug|TODO|FIXME|XXX|HACK\b/.test(l)) console.log((i+1) + ': ' + l.trim().slice(0, 100));
});

// 4) 巨型注释密度（文件熵指标）：中文注释行数
let zhComment = 0, code = 0;
lines.forEach(l => { const t = l.trim(); if (t.startsWith('//')) { if (/[\u4e00-\u9fff]/.test(t)) zhComment++; } else if (t) code++; });
console.log('=== 注释密度: 中文注释行=' + zhComment + ' 代码行=' + code + ' 比例=' + (zhComment/code*100).toFixed(1) + '%' + ' 总行=' + lines.length);
