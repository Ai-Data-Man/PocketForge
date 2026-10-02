// s108/d2 追加臂 mini：同沙盒新会话（新 MCP 进程=修后代码）发追加 prompt，数卡+验行
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { boot } from './cdp-observe.mjs';
const ROOT = process.env.PF_ACCEPT_ROOT || 'C:/PF-TEST/d2';
const LOG = path.join(ROOT, 'data', 'logs', 'events.log');
const permN = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(l => l.includes('"ev":"permcard"')).length : 0;
const h = await boot();
await h.sleep(5000);
const before = permN();
await h.ev("(function(){ const t=document.getElementById('txt'); t.value='再记一笔：2026-10-07 买书 45 元，加到家庭记账的支出明细表里，加完告诉我'; submit(); })()");
let answered = 0; const t0 = Date.now();
for (let i = 0; ; i++) {
    await h.sleep(1500);
    answered += await h.ev("(function(){ let n=0; for(const c of document.querySelectorAll('.permcard:not(.settled)')){ const b=[...c.querySelectorAll('button')].find(b=>b.textContent.includes('这次可以')); if(b){ b.click(); n++; } } return n; })()");
    const busy = await h.ev("getComputedStyle(document.getElementById('typing')).display!=='none'");
    const un = await h.ev("document.querySelectorAll('.permcard:not(.settled)').length");
    if (!busy && !un && i > 6) break;
    if (Date.now() - t0 > 300000) break;
}
const reply = await h.ev("(function(){ const ms=[...document.querySelectorAll('#chat [class*=agent]')]; const el=ms[ms.length-1]; return el?el.textContent.trim().slice(0,500):''; })()");
console.log('append-mini: cards=' + (permN() - before) + ' answered=' + answered + ' wall=' + Math.round((Date.now()-t0)/1000) + 's');
console.log('reply:', reply);
const KEY = fs.readFileSync(path.join(ROOT, 'data', 'faucet', '.apikey'), 'utf8').trim();
const rows = await new Promise(res => http.get({ host: '127.0.0.1', port: 8091, path: '/api/v1/' + encodeURIComponent('家庭记账') + '/_table/' + encodeURIComponent('支出明细') + '?max_results=20', headers: { 'X-API-Key': KEY } }, r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b))); }));
console.log('rows after append:', rows.meta.count, JSON.stringify(rows.resource.map(x=>x['日期']+':'+x['项目'])));
process.exit(0);
