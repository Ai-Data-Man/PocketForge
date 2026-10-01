// [s107/f6 入库] 用途：从零验收驱动（缺陷#2 read 工具线）——在已冷启的沙盒场景里经 CDP 驱动真页：
//   配流（provider/host/key）→上传 CSV→报表向导两问→发送→断言「零权限卡出报表」。
//   判据=events.log permcard 计数（全程快照）+聊天末帧内容；本驱动只观测不应答权限卡（验收=零卡）。
// 用法：先备好场景（dist 包全新解压至 PF_ACCEPT_ROOT 并 .cmd 冷启、healthz 200），然后：
//   PF_ACCEPT_ROOT=C:/PF-TEST/<场景> node tools/e2e/sandbox-accept-driver.mjs
//   env：PF_ACCEPT_ROOT（沙盒根，必填）；PF_ACCEPT_HOST/PF_ACCEPT_MODEL/PF_ACCEPT_KEY（缺省从 dev 树
//   forge/data/providers.json 活跃档案现读——key 不入任何台账/输出，s107 任务书纪律）；PF_PAGE_URL（缺省
//   http://127.0.0.1:8790/）；PF_CDP_PORT（缺省 9333，沙盒争用时换口）。
//   产出：<repo>/tmp/sandbox-accept-last.json + .png（证据落 tmp，不入库）。
//   注意：消耗真实 LLM 轮次（验收级）；与 QA/其它验收并行时先对齐端口与 junction 归属。
// 来源：s107 会话 tmp/s107d-accept.mjs（iat118/119 从零验收驱动；s107/f6 入库时敏感值全部参数化——
//   原版硬编码 host+key 现读，本文件零敏感字面量）。
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from './cdp-observe.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = process.env.PF_ACCEPT_ROOT;
if (!ROOT) { console.error('必填 PF_ACCEPT_ROOT=<沙盒根>（dist 包解压+冷启后）'); process.exit(2); }
const prov = (() => { try { return (JSON.parse(fs.readFileSync(path.join(REPO, 'forge', 'data', 'providers.json'), 'utf8')).find(p => p.active)) || null; } catch { return null; } })();
const HOST = process.env.PF_ACCEPT_HOST || (prov && prov.host) || '';
const MODEL = process.env.PF_ACCEPT_MODEL || (prov && prov.models && prov.models[0]) || 'glm-5.3-flash';
const KEY = process.env.PF_ACCEPT_KEY || (prov && prov.key) || '';
if (!HOST || !KEY) { console.error('缺 host/key：设 PF_ACCEPT_HOST/PF_ACCEPT_KEY 或确保 dev 树 providers.json 有活跃档案'); process.exit(2); }
const LOG = path.join(ROOT, 'data', 'logs', 'events.log');
const permcardCount = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(l => l.includes('"ev":"permcard"')).length : 0;

const h = await boot();
await h.sleep(5000);
const dialogs = [];
const origHandler = h.ws.onmessage;
h.ws.onmessage = e => { if (origHandler) origHandler(e); const m = JSON.parse(e.data); if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.type + ':' + (m.params.message || '').slice(0, 40)); h.send('Page.handleJavaScriptDialog', { accept: true }); } };

// 配流（key 只进页面表单，不落任何输出）
await h.ev(`(function(){ $('open-settings').click(); })()`); await h.sleep(1500);
await h.ev(`(function(){ $('prov-name').value='验收中转'; $('cfg-host').value=${JSON.stringify(HOST)}; $('cfg-key').value=${JSON.stringify(KEY)}; })()`);
await h.sleep(200);
await h.ev("$('prov-add').click()"); await h.sleep(1500);
await h.ev("$('save-cfg').click()"); await h.sleep(1500);
await h.ev("$('fetch-models').click()");
let pool = 0;
for (let i = 0; i < 30; i++) { await h.sleep(1000); pool = await h.ev("document.querySelectorAll('#model-pool input[type=checkbox]').length"); if (pool > 10) break; }
await h.ev(`(function(){ [...document.querySelectorAll('#model-pool label')].find(l=>l.textContent.includes(${JSON.stringify(MODEL)}))?.querySelector('input')?.click(); })()`);
await h.sleep(300);
await h.ev("$('save-cfg').click()"); await h.sleep(3000);
await h.ev("$('modal').classList.remove('on')"); await h.sleep(2000);
const topbar = await h.ev("$('model-pick')?.textContent?.trim()?.slice(0,40)");

// 上传 CSV + 报表向导（同会话单窗）
await h.ev(`(function(){
    const csv='水果,价格,库存\\n苹果,5.5,20\\n香蕉,3.2,50\\n橘子,4.0,30\\n';
    const dt=new DataTransfer();
    dt.items.add(new File([csv], '水果价目.csv', {type:'text/csv'}));
    const inp=document.getElementById('up-input');
    inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true}));
})()`);
await h.sleep(2500);
await h.ev(`(function(){ const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('帮我做张报表')); b&&b.click(); })()`);
await h.sleep(2000);
const pick = await h.ev(`(function(){ const wiz=[...document.getElementById('chat').children].find(e=>e.textContent.includes('用哪个表格')); if(!wiz) return 'no-wiz'; const sel=wiz.querySelector('select'); const opt=[...sel.options].find(o=>o.textContent.includes('水果价目')); if(!opt) return 'no-opt'; sel.value=opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); return 'src-ok'; })()`);
await h.sleep(500);
await h.ev(`(function(){ const wiz=[...document.getElementById('chat').children].find(e=>e.textContent.includes('用哪个表格')); [...wiz.querySelectorAll('button')].find(x=>x.textContent.trim()==='总共是多少')?.click(); })()`);
await h.sleep(500);
const sent = await h.ev(`(function(){ const wiz=[...document.getElementById('chat').children].find(e=>e.textContent.includes('用哪个表格')); const b=[...wiz.querySelectorAll('button')].find(x=>x.textContent.trim()==='发送'); if(b){ b.click(); return 'sent'; } return 'no-send'; })()`);

// 回合观测：permcard 出现即记（不点允许——验收判据=零卡）；等回合完成 ≤300s
const permSnapshot = [];
let final = null; const phases = new Set();
for (let i = 0; i < 150; i++) {
    await h.sleep(2000);
    permSnapshot.push(permcardCount());
    const tp = await h.ev("document.getElementById('typing-text')?.textContent"); if (tp) phases.add(tp);
    const busy = await h.ev("getComputedStyle(document.getElementById('typing')).display!=='none'");
    if (!busy && i > 8) { final = true; break; }
}
const chatFinal = await h.ev("[...document.getElementById('chat').children].slice(-2).map(c=>c.textContent.trim().slice(0,220))");
await h.send('Page.captureScreenshot', { format: 'png' }).then(r => { if (r.result?.data) fs.writeFileSync(path.join(REPO, 'tmp', 'sandbox-accept-last.png'), Buffer.from(r.result.data, 'base64')); });
const permcardTotal = permcardCount();
const result = { sceneRoot: ROOT, pool, topbar, pick, sent, permcardTotal, permTimeline: [...new Set(permSnapshot)], phases: [...phases], chatFinal, dialogs, errCount: h.console_.filter(c => /error|exception/i.test(c.level)).length };
fs.writeFileSync(path.join(REPO, 'tmp', 'sandbox-accept-last.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ pool, topbar: topbar?.slice(0, 30), pick, sent, permcardTotal, phases: [...phases].slice(0, 8), chatFinal, errCount: result.errCount }, null, 1));
process.exit(0);
