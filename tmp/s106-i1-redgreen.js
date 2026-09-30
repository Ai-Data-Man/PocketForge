// s106/i1 红绿臂：note() 不可见容器家族清扫源锚断言，打「给定模板文件」（旧版=git HEAD 快照=红，新版=绿）
// 用法：node tmp/s106-i1-redgreen.js <chat.tpl.html 路径>
// 预期：旧版 I1J/I1E*/I1F/I1G/I1H/I1I 全红（banner/sk-note/say/通道迁移均不存在），新版全绿。
'use strict';
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n); ok ? pass++ : fail++; };
const grab = (re, label) => { const m = html.match(re); if (!m) { console.log('FAIL: NOT FOUND ' + label); fail++; return ''; } return m[0]; };

// S2: banner 函数在场（旧版无此函数）
const bannerSrc = grab(/let bannerT=null;\nfunction banner\(t\)\{[\s\S]*?\n\}/, 'banner fn');
ck('RG1 banner 函数在场且挂 chat 之外（S2 独立于墙）', bannerSrc.indexOf('chat.parentNode.insertBefore(el,chat)') >= 0 && bannerSrc.indexOf('},8000)') >= 0);
ck('RG2 批删回执走 banner（旧版=addInfo 落墙，重连清墙必现销毁）', /banner\(bits\.join\('。'\)\);/.test(html));

// B 类: 9 个无遮罩界面动作回执通道迁移（旧版全 note）
const b = [
  ['archiveSession 归档回执', /async function archiveSession\(sid,arch\)\{[\s\S]*?\n\}/, 'addInfo(arch?\'已归档\':\'已取消归档\')'],
  ['文件树「用电脑打开」回执', /d\.ok\?addInfo\('已在电脑上打开 '/, null],
  ['工作区批量清理回执', /else addInfo\('已清理 '/, null],
  ['工作区单删回执', /if\(d\.ok\)\{ loadWorkspaces\(\); addInfo\('工作区已删除'\); \}/, null],
  ['link-ok 三处回执（guard/fail/catch）', /\$\('link-ok'\)\.onclick=\(\)=>\{[\s\S]*?\n\};/, null],
  ['up-input 两处回执（guard/fail）', /\$\('up-input'\)\.onchange=async\(\)=>\{[\s\S]*?\n\};/, null],
];
for (const [label, re, extra] of b) {
  const m = html.match(re);
  let ok = !!m && m[0].indexOf('addInfo(') >= 0 && !/\bnote\(/.test(m[0].split('addInfo(').join(''));
  if (extra) ok = ok && m[0].indexOf(extra) >= 0;
  ck('RG3 ' + label + '：走 addInfo 不走 note（修前红锚）', ok);
}

// C1: 手艺批量停/启落 skills-modal 内 #sk-note
ck('RG4 手艺批量成功回执走 skNote（旧版 note 零可见）', /else skNote\('已'\+/.test(html));
ck('RG5 #sk-note 状态行+skNote 函数在场（弹窗内回执落点）', /id="sk-note"/.test(html) && /function skNote\(t\)\{[\s\S]*?\$\('sk-note'\)/.test(html));

// C2: cap-modal 失败/校验 6 处 say + 成功 2 处维持 note
const capSrc = grab(/function openCapEditor\(model\)\{[\s\S]*?\n\}\n\$\('fetch-models'\)/, 'openCapEditor');
ck('RG6 cap-modal 弹窗内回执行 capNote+say（旧版失败回执写被盖住的 #save-note）', /const capNote=document\.createElement\('div'\);/.test(capSrc) && (capSrc.match(/\bsay\(/g) || []).length === 6);
ck('RG7 cap-modal 成功 2 处维持 note（closeCapModal 后 #save-note 露出可见）', /note\('「'\+model\+'」已恢复官方默认。'\)/.test(capSrc) && /note\('「'\+model\+'」的配置已保存。'\)/.test(capSrc));

console.log('s106-i1-redgreen: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
