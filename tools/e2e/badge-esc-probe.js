// qa返工(P2-1, 审查 075ee4b) 徽标 title 注入向量探针：node 层断言 esc 后输出无注入，不开浏览器
// 做法：从 chat.tpl.html 原文提取 esc() 与 skillOriginBadge() 源码执行（防“测试副本与产品漂移”），
// 喂入 origin.repo 带引号+img 标签的向量，断言 title 属性面与文本面均转义；顺带钉住 .obadge 截断样式。
'use strict';
const C = require('assert');
const FSS = require('fs');
const path = require('path');
const html = FSS.readFileSync(path.join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat.tpl.html'), 'utf8');
function grab(re, what) {
    const m = html.match(re);
    C.ok(m, 'chat.tpl.html 提取失败: ' + what + '（模板结构漂移，先改探针）');
    return m[0];
}
const escSrc = grab(/function esc\(s\)\{[^\n]*\}/, 'esc()');
const badgeSrc = grab(/function skillOriginBadge\(sk\)\{[\s\S]*?\n\}/, 'skillOriginBadge()');
const { esc, skillOriginBadge } = new Function(escSrc + '\n' + badgeSrc + '\n; return { esc, skillOriginBadge };')();

const EVIL = 'a/b"><img src=x onerror=alert(1)>';
const badge = skillOriginBadge({ origin: { source: 'market', repo: EVIL } });
C.ok(badge.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'), 'title 面未整体转义: ' + badge);
C.ok(!badge.includes('<img'), '存在未转义 <img 标签: ' + badge);
const title = badge.split('title="')[1].split('"')[0]; // 第一个引号即属性闭合 → 属性面只含转义实体
C.ok(!title.includes('<') && !title.includes('"'), 'title 属性被提前闭合/注入: ' + title);
C.equal(skillOriginBadge({ origin: { source: 'self' } }).includes('自己攒的'), true, 'self 徽标回归');
C.equal(skillOriginBadge({ origin: null }), '', '无 origin 无徽标回归');
// 64 字符 repo 撑版防护：.obadge 截断样式在模板里（display/overflow/ellipsis/max-width）
const css = grab(/\.skill \.obadge\{[^\n]*\}/, '.skill .obadge 样式');
C.ok(/display:inline-block/.test(css) && /max-width/.test(css) && /overflow:hidden/.test(css) && /text-overflow:ellipsis/.test(css), '.obadge 缺截断样式: ' + css);
console.log('badge-esc-probe: PASS=6 FAIL=0');
