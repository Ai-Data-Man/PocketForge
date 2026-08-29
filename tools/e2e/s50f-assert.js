// s50f 断言：修复1 @菜单竞态 + 修复2 草稿守卫 + 修复3 401 正则（自含，node tools/e2e/s50f-assert.js）
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } }

// ===== 修复 3：401 正则三组用例（提取模板真实正则）=====
const tpl = fs.readFileSync(path.join(__dirname, '..', '..', 'forge', 'conf', 'templates', 'chat.tpl.html'), 'utf8');
const m401 = tpl.match(/if\((\/401[^/]*\/i)\.test\(txt\)\)/);
ok(m401, '修复3: 模板中找到收窄后的 401 正则');
const re401 = new RegExp(m401[1].slice(1, -2), 'i');
ok(re401.test('Ran into this error: Authentication error: ... 401 Unauthorized') === true, '修复3: 401 Unauthorized 报错 → 401 分支');
ok(re401.test('查询完成，共 401 条记录') === false, '修复3: 「共 401 条记录」→ 非 401 分支（换线按钮）');
ok(re401.test('Missing API key') === true, '修复3: Missing API key → 401 分支');

// ===== 修复 2：草稿守卫逻辑三组（提取模板 pendingRetry 回调体执行）=====
const mGuard = tpl.match(/pendingRetry=\(\)=>\{ if\(busy\) return; if\(txt\.value\.trim\(\)&&txt\.value\.trim\(\)!==orig\)\{ el\.remove\(\); return; \} txt\.value=orig; submit\(\); el\.remove\(\); \}/);
ok(mGuard, '修复2: 模板中找到带草稿守卫的 pendingRetry 回调');
function runGuard({ busy, draft, orig }) {
  const log = { submitted: null, removed: false, txtSet: null };
  const txt = { value: draft };
  const el = { remove: () => { log.removed = true; } };
  const submit = () => { log.submitted = txt.value; };
  // 与模板回调同构（mGuard 校验过文本一致，直接执行同逻辑）
  const fn = () => { if (busy) return; if (txt.value.trim() && txt.value.trim() !== orig) { el.remove(); return; } txt.value = orig; submit(); el.remove(); };
  fn();
  return log;
}
let r = runGuard({ busy: true, draft: '', orig: 'hi' });
ok(r.submitted === null && !r.removed, '修复2: busy → 不发不摘');
r = runGuard({ busy: false, draft: '新草稿', orig: 'hi' });
ok(r.submitted === null && r.removed && r.txtSet === null, '修复2: 用户已打新草稿 → 放弃重发、摘掉按钮、保留草稿');
r = runGuard({ busy: false, draft: '   ', orig: 'hi' });
ok(r.submitted === 'hi' && r.removed, '修复2: 空 → 自动填原文重发');

// ===== 修复 1：@菜单竞态（提取模板真实 renderAtMenu 代码段执行，双轮、轮1 dbOverview 100ms 延迟）=====
const mFn = tpl.match(/let atGen=0;[\s\S]*?^function renderAtMenu\(q\)\{[\s\S]*?^}/m);
ok(mFn, '修复1: 模板中找到 atGen 声明与 renderAtMenu');
// 造 DOM/全局桩
function makeMenu() { const kids = []; return { innerHTML: '', style: {}, children: { get length() { return kids.length; } }, appendChild(c) { kids.push(c); }, _kids: kids }; }
const files = [{ name: 'a.csv' }, { name: 'ab.txt' }];
let dbDelay = 0;
const SB = {};
SB.curWs = 'ws1';
SB.fetch = async () => ({ json: async () => files });
SB.dbOverview = async () => { if (dbDelay) await new Promise(r2 => setTimeout(r2, dbDelay)); return { services: [{ service: 'main', tables: [{ name: 'ab_table', rows: 5 }] }] }; };
SB.$ = (id) => (id === 'at-menu') ? SB._menu : null;
SB.fileIcon = () => '📄';
SB.esc = (s) => s;
SB.txt = { value: '' };
SB._menu = makeMenu();
global.document = { createElement: () => ({ style: {}, set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ''; }, appendChild() {}, getBoundingClientRect: () => ({}) }) };
eval(`(async()=>{
  const {curWs,esc,fileIcon,txt}=SB, fetch=SB.fetch, dbOverview=SB.dbOverview, $=SB.$, document=global.document;
  ${mFn[0]}
  // 轮1: @a，dbOverview 慢 100ms；轮2: @ab，dbOverview 即时
  dbDelay = 100;
  const p1 = renderAtMenu('a');
  await new Promise(r2 => setTimeout(r2, 10)); // 确保轮1 已过 artifacts fetch、进入 dbOverview 等待
  dbDelay = 0;
  const p2 = renderAtMenu('ab'); // atGen 递增，轮1 应作废
  await new Promise(r2 => setTimeout(r2, 50)); // 让轮2微任务链全部跑完
  await p1;
  SB._menu._kids.forEach(c => console.log('  kid: ' + JSON.stringify(c.textContent || c._html || '?').slice(0, 60)));
  const dbHeads = SB._menu._kids.filter(c => c.textContent && c.textContent.includes('库里的数据'));
  console.log('轮2菜单子项数=' + SB._menu._kids.length + '，DB分组头数=' + dbHeads.length);
  console.log(dbHeads.length === 1 ? 'PASS 修复1: 轮2菜单只含一份 DB 分组' : 'FAIL 修复1: DB 分组数=' + dbHeads.length);
  if (dbHeads.length === 1) { pass++; } else { fail++; process.exitCode = 1; }
})()`);
setTimeout(() => {
  console.log('---');
  console.log('total: ' + pass + ' pass, ' + fail + ' fail');
  if (fail > 0) process.exitCode = 1;
}, 500);
