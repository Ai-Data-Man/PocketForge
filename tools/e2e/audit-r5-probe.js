// r5/S2 归置审计探针（裁决 docs/verdicts/2026-09-19-capability-semantics-r5 §4/§6-S2）
// 机器断言（S2 验收②③）：
//   ② 划界关键词在场——LABELS browser desc 含「要登录」、MCP_CATALOG fetch desc 含「不开浏览器」、
//      scrape-table-to-db SKILL.md description 含「做法」自指；memory/memory-graph 双向划界（互补句展开成什么时候用谁）；
//      sequential-thinking 类定义可解释（外接思考辅助器）。
//   ③ 物化 cmp——conf/templates/chat-bridge.tpl.js 与 bin/chat-bridge.js 逐位一致（热区纪律）。
//   附：scanInstalledSkills 陈旧注释修正（不再声称扫 conf/goose/config/skills）。
// 单跑：node tools/e2e/audit-r5-probe.js（无桥无网络，秒级）
'use strict';
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(__dirname + '/../../forge/conf/templates/chat-bridge.tpl.js', 'utf8');
const bin = fs.readFileSync(__dirname + '/../../forge/bin/chat-bridge.js', 'utf8');
let pass = 0, fail = 0;
function ck(name, cond, detail) {
    if (cond) { console.log('PASS: ' + name); pass++; }
    else { console.log('FAIL: ' + name + (detail ? '  | ' + String(detail).slice(0, 140) : '')); fail++; }
}
function grab(re, label) { const m = tpl.match(re); if (!m) { console.error('NOT FOUND: ' + label); process.exit(1); } return m[0]; }

// ---- ③ 物化 cmp（热区纪律：模板=真相源，bin=物化产物，逐位一致）----
ck('物化 cmp：chat-bridge.tpl.js ≡ bin/chat-bridge.js', tpl === bin);

// ---- ② LABELS（自带的）划界 ----
const labelsSrc = grab(/const LABELS = \{[\s\S]+?\n        \};/, 'LABELS');
const descLine = id => (labelsSrc.match(new RegExp("'" + id + "': \\{ name: '[^']+', desc: '([^']+)'")) || ['', ''])[1];
ck('browser desc 收窄划界：含「要登录」且无「抓表格」（让给工具/手艺划界句）', descLine('browser').indexOf('要登录') >= 0 && descLine('browser').indexOf('抓表格') < 0, descLine('browser'));
ck('browser desc 含「要点按」（真浏览器判别）', labelsSrc.indexOf('要点按') >= 0);
ck('memory desc 反向指路：去「💭 记忆」看', labelsSrc.indexOf('💭 记忆') >= 0, labelOf(labelsSrc, 'memory'));
ck('memory desc 反向指路：台账关系→关系图谱记忆（🔌 工具）', labelsSrc.indexOf('关系图谱记忆') >= 0 && labelsSrc.indexOf('🔌 工具') >= 0);

// ---- ② MCP_CATALOG（工具）划界 ----
const catSrc = grab(/const MCP_CATALOG = \[[\s\S]+?\n\];/, 'MCP_CATALOG');
const ent = id => (catSrc.match(new RegExp("\\{ id: '" + id + "'[^}]+\\}")) || [''])[0];
ck('fetch desc 含「不开浏览器」（与自带的浏览器划界）', ent('fetch').indexOf('不开浏览器') >= 0, ent('fetch').slice(0, 90));
ck('fetch desc 指路：要登录要点按的页面→自带的浏览器', ent('fetch').indexOf('自带的浏览器') >= 0);
ck('sequential-thinking desc 类定义可解释：外接的思考辅助器', ent('sequential-thinking').indexOf('思考辅助器') >= 0, ent('sequential-thinking').slice(0, 90));
ck('memory-graph desc 双向划界：台账关系用它', ent('memory-graph').indexOf('台账关系') >= 0, ent('memory-graph').slice(0, 90));
ck('memory-graph desc 双向划界：平时的喜好和常用做法→自带的长期记忆', ent('memory-graph').indexOf('自带的长期记忆') >= 0 && ent('memory-graph').indexOf('喜好') >= 0);

// ---- ② 出厂手艺 SKILL.md 描述（走树内内容文件通道，V2 已核：bootstrap 零物化、纯差量送达）----
const skPath = n => path.join(__dirname, '..', '..', 'forge', '.agents', 'skills', n, 'SKILL.md');
const scrape = fs.readFileSync(skPath('scrape-table-to-db'), 'utf8');
const seeimg = fs.readFileSync(skPath('see-image'), 'utf8');
const descOf = txt => (txt.match(/^description:\s*([\s\S]*?)^---/m) || ['', ''])[1];
ck('scrape-table-to-db desc 含「做法」自指（这条是做法不是工具）', descOf(scrape).indexOf('做法') >= 0, descOf(scrape).slice(0, 80));
ck('scrape-table-to-db desc 跨类明示：自带的浏览器 + 抓取器（工具）', descOf(scrape).indexOf('自带的浏览器') >= 0 && descOf(scrape).indexOf('抓取器') >= 0);
ck('see-image desc 微调：看图的做法', descOf(seeimg).indexOf('看图的做法') >= 0, descOf(seeimg).slice(0, 60));

// ---- 附：scanInstalledSkills 陈旧注释修正 ----
ck('scanInstalledSkills 注释不再声称扫 conf/goose/config/skills（陈旧注释已修）', tpl.indexOf('+ conf/goose/config/skills (global-ish)') < 0);

function labelOf(src, id) { return (src.match(new RegExp("'" + id + "': \\{[^}]+\\}")) || [''])[0].slice(0, 110); }
console.log('audit-r5-probe: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
