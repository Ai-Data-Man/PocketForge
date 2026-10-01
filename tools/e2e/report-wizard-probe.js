// [s107/f6 入库] 用途：报表向导提示词（chat.tpl.html reportPrompt）文案钉——s48「两问出报表」形态 +
//       s107/f4 两拍化（报表=Markdown 直出答案先到；存 Excel 先问用户）+ s107/f4c todo 禁令句 + 数据纪律句。
//       手法=函数逐字提取后真实执行，断言拼装与句序。
// 用法：node tools/e2e/report-wizard-probe.js [chat.tpl.html 路径]（缺省=dev 树模板，绿形态）。
//       红对照：git show 034bf13^:forge/conf/templates/chat.tpl.html（f4 前旧句「做完生成一个 Excel 文件
//       给我预览」在场=W3 红）等历史 ref 重定向后传参。
// 来源：s107 会话 tmp/s107-f4-wizard.mjs（f4/f4c 两批红绿探针随批演进）。
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat.tpl.html'), 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n); ok ? pass++ : fail++; };
const m = html.match(/function reportPrompt\(file,want\)\{\n  return [\s\S]*?\n\}/);
if (!m) { console.error('NOT FOUND: reportPrompt'); process.exit(1); }
const p = new Function('file', 'want', m[0] + '\nreturn reportPrompt(file, want);')('ws-x/销售.csv', '各产品销量');
ck('W1 两拍句①：先把报表结果直接写在回复里（用 Markdown 表格）', p.includes('先把报表结果直接写在回复里（用 Markdown 表格）'));
ck('W2 两拍句②：要存成 Excel 文件时先问我要不要', p.includes('要存成 Excel 文件时先问我要不要'));
ck('W3 旧句清零：做完生成一个 Excel 文件给我预览', !p.includes('做完生成一个 Excel 文件给我预览'));
ck('W4 数据纪律句保持：表格里没有的数据不要自己编', p.includes('表格里没有的数据不要自己编'));
ck('W5 文件与诉求逐字拼装', p.includes('用这个表格：ws-x/销售.csv') && p.includes('我想知道：各产品销量'));
ck('W6 todo 禁令句（s107/f4c）：这个任务直接做，不用 todo 清单', p.includes('这个任务直接做，不用 todo 清单'));
ck('W7 todo 句位次：在两拍句之后、数据纪律句之前', p.indexOf('要存成 Excel 文件时先问我要不要') < p.indexOf('这个任务直接做') && p.indexOf('这个任务直接做') < p.indexOf('表格里没有的数据'));
console.log('==============================\nreport-wizard-probe: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
