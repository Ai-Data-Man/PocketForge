// s108/d2 验收驱动（裁决 2026-10-03-s108-db-write-path 验收臂 1/2/4/5）：
//   核心臂=iat124 同 prompt 建表任务 → permcard ≤2（allow_once 应答=真同意）→ 数据/建账全对 + 回复零技术坐标；
//   热加载断臂=faucet 重启证据（process_start_time 漂移）+agent 侧零 shell/轮询；追加臂/负检查臂同场。
//   证据落 <repo>/tmp/d2-accept-last.json + 截图；只经 CDP 驱动真页（s107 sandbox-accept-driver 同骨架）。
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { boot } from './cdp-observe.mjs';

const REPO = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const ROOT = process.env.PF_ACCEPT_ROOT || 'C:/PF-TEST/d2';
const LOG = path.join(ROOT, 'data', 'logs', 'events.log');
const permLines = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(l => l.includes('"ev":"permcard"')) : [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = { phases: {} };

function httpJson(port, p, headers) {
    return new Promise(res => {
        const rq = http.get({ host: '127.0.0.1', port, path: p, headers: headers || {}, timeout: 5000 }, r => {
            let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch { res(b); } });
        }); rq.on('error', () => res(null)); rq.on('timeout', () => { rq.destroy(); res(null); });
    });
}
async function procs() {
    const port = parseInt(fs.readFileSync(path.join(ROOT, 'data', 'pc.port'), 'utf8').trim(), 10);
    const d = await httpJson(port, '/processes');
    const out = {}; for (const p of (d && d.data) || []) out[p.name] = { status: p.status, start: p.process_start_time, restarts: p.restarts };
    return out;
}

const h = await boot();
await h.sleep(5000);
const dialogs = [];
const origHandler = h.ws.onmessage;
h.ws.onmessage = e => { if (origHandler) origHandler(e); const m = JSON.parse(e.data); if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.type + ':' + (m.params.message || '').slice(0, 40)); h.send('Page.handleJavaScriptDialog', { accept: true }); } };

// 会话+模型就绪门（providers.json 已首启前种子——桥侧 env 派生就绪；顶栏模型名只做留证不阻断）
for (let i = 0; i < 30; i++) {
    const sid = await h.ev("typeof sessionId!=='undefined'&&!!sessionId"); if (sid) break; await h.sleep(1000);
}
OUT.topbarModel = await h.ev("$('model-pick')?.textContent?.trim()?.slice(0,60)");
const preProcs = await procs(); OUT.phases.pre = preProcs;

async function answerCards(mode) { // mode='allow_once'|'reject_once'——模拟妻子真实点头/摇头
    return await h.ev(`(function(){ let n=0; for(const c of document.querySelectorAll('.permcard:not(.settled)')){ const want=${JSON.stringify(mode)}==='reject_once'?'这次不行':'这次可以'; const b=[...c.querySelectorAll('button')].find(b=>b.textContent.includes(want)); if(b){ b.click(); n++; } } return n; })()`);
}
async function sendPrompt(text) {
    await h.ev(`(function(){ const t=document.getElementById('txt'); t.value=${JSON.stringify(text)}; submit(); })()`);
}
async function waitTurn(timeoutS, label) {
    const t0 = Date.now(); let answered = 0; const marks = [];
    for (let i = 0; ; i++) {
        await h.sleep(1500);
        answered += await answerCards('allow_once');
        const busy = await h.ev("getComputedStyle(document.getElementById('typing')).display!=='none'");
        const unsettled = await h.ev("document.querySelectorAll('.permcard:not(.settled)').length");
        if (i % 10 === 0) marks.push(Math.round((Date.now() - t0) / 1000) + 's');
        if (!busy && !unsettled && i > 6) break;
        if (Date.now() - t0 > timeoutS * 1000) { OUT.phases[label + '_timeout'] = true; break; }
    }
    return { answered, wallSec: Math.round((Date.now() - t0) / 1000), marks };
}
const toolTitles = () => h.ev("[...document.querySelectorAll('.card .ttl')].map(t=>t.textContent.trim())");
const lastAgent = () => h.ev("(function(){ const ms=[...document.querySelectorAll('#chat .msg.agent,#chat [class*=agent]')]; const el=ms[ms.length-1]; return el?el.textContent.trim().slice(0,1500):''; })()");

// ---------- 核心臂：iat124 同 prompt ----------
const CORE_PROMPT = '帮我在数据库里记一张表：2026-10-01 买菜 35.6 元；2026-10-02 水电费 88 元；2026-10-03 地铁 4.5 元。存好后告诉我存在哪。这个任务直接做，不用 todo 清单。'; // 尾句=裁决臂1 todo 卡预案（s107 验收 6 同款）
await sendPrompt(CORE_PROMPT);
const core = await waitTurn(360, 'core');
OUT.phases.core = { ...core, permcardLines: permLines().length };
OUT.coreToolTitles = await toolTitles();
OUT.coreReply = await lastAgent();
OUT.postProcs = await procs();
await h.send('Page.captureScreenshot', { format: 'png' }).then(r => { if (r.result?.data) fs.writeFileSync(path.join(REPO, 'tmp', 'd2-accept-core.png'), Buffer.from(r.result.data, 'base64')); });

// ---------- 数据核验（REST 直查） ----------
const KEY = fs.readFileSync(path.join(ROOT, 'data', 'faucet', '.apikey'), 'utf8').trim();
const FPORT = parseInt(fs.readFileSync(path.join(ROOT, 'data', 'faucet.port'), 'utf8').trim(), 10);
OUT.dataCheck = {};
try {
    const sqlDir = path.join(ROOT, 'data', 'sqlite');
    const dbs = fs.readdirSync(sqlDir).filter(f => f.endsWith('.db')).map(f => f.slice(0, -3));
    OUT.dataCheck.sqliteFiles = dbs;
    const svc = dbs[0];
    if (svc) {
        const enc = encodeURIComponent(svc);
        const tables = await httpJson(FPORT, '/api/v1/' + enc + '/_table', { 'X-API-Key': KEY });
        OUT.dataCheck.service = svc; OUT.dataCheck.tables = tables && tables.resource;
        const biz = (tables && tables.resource || []).find(t => t !== 'forge_meta' && t !== 'forge_table_info');
        if (biz) {
            const rows = await httpJson(FPORT, '/api/v1/' + enc + '/_table/' + encodeURIComponent(biz) + '?max_results=20', { 'X-API-Key': KEY });
            OUT.dataCheck.bizTable = biz; OUT.dataCheck.bizRows = rows && rows.resource;
        }
        const meta = await httpJson(FPORT, '/api/v1/' + enc + '/_table/forge_meta?max_results=5', { 'X-API-Key': KEY });
        OUT.dataCheck.forgeMeta = meta && meta.resource;
        const tinfo = await httpJson(FPORT, '/api/v1/' + enc + '/_table/forge_table_info?max_results=20', { 'X-API-Key': KEY });
        OUT.dataCheck.forgeTableInfo = tinfo && tinfo.resource;
    }
} catch (e) { OUT.dataCheck.error = String(e && e.message || e); }

// ---------- 追加臂：再记一笔（走 faucet_insert；注解现状 UNVERIFIED，照实记录） ----------
const APPEND_PROMPT = '再记一笔：2026-10-04 打车 12 元，加到刚才那张表里，加完告诉我';
await sendPrompt(APPEND_PROMPT);
const ap = await waitTurn(300, 'append');
OUT.phases.append = { ...ap, permcardLines: permLines().length };
OUT.appendReply = await lastAgent();
const KEY2 = KEY, FPORT2 = FPORT;
try {
    const svc = OUT.dataCheck.service, biz = OUT.dataCheck.bizTable;
    if (svc && biz) {
        const rows = await httpJson(FPORT2, '/api/v1/' + encodeURIComponent(svc) + '/_table/' + encodeURIComponent(biz) + '?max_results=20', { 'X-API-Key': KEY2 });
        OUT.dataCheck.bizRowsAfterAppend = rows && rows.resource;
    }
} catch (e) { OUT.dataCheck.appendError = String(e && e.message || e); }

// ---------- 负检查·shell 照卡（reject_once 应答） ----------
await sendPrompt('用命令行的方式把当前文件夹里的文件列出来给我看看（用系统的命令行工具）');
{
    const t0 = Date.now(); let rejected = 0; let timeout = false;
    for (let i = 0; ; i++) {
        await h.sleep(1500);
        rejected += await answerCards('reject_once');
        const busy = await h.ev("getComputedStyle(document.getElementById('typing')).display!=='none'");
        const unsettled = await h.ev("document.querySelectorAll('.permcard:not(.settled)').length");
        if (!busy && !unsettled && i > 6) break;
        if (Date.now() - t0 > 240000) { timeout = true; break; }
    }
    OUT.phases.shellArm = { rejected, timeout, permcardLines: permLines().length };
    OUT.shellReply = await lastAgent();
}

// ---------- 负检查·读库零卡 ----------
await sendPrompt('现在数据库里都有哪些库和表？每张表大概存了什么？简单告诉我就行');
{
    const before = permLines().length;
    const t0 = Date.now(); let timeout = false;
    for (let i = 0; ; i++) {
        await h.sleep(1500);
        await answerCards('allow_once');
        const busy = await h.ev("getComputedStyle(document.getElementById('typing')).display!=='none'");
        const unsettled = await h.ev("document.querySelectorAll('.permcard:not(.settled)').length");
        if (!busy && !unsettled && i > 6) break;
        if (Date.now() - t0 > 240000) { timeout = true; break; }
    }
    OUT.phases.readArm = { timeout, permcardDelta: permLines().length - before };
    OUT.readReply = await lastAgent();
}

OUT.permcardLog = permLines();
OUT.dialogs = dialogs;
OUT.finalProcs = await procs();
OUT.consoleErrors = (h.console || []).filter(c => /error|exception/i.test(c.level)).slice(0, 20);
await h.send('Page.captureScreenshot', { format: 'png' }).then(r => { if (r.result?.data) fs.writeFileSync(path.join(REPO, 'tmp', 'd2-accept-final.png'), Buffer.from(r.result.data, 'base64')); });
fs.writeFileSync(path.join(REPO, 'tmp', 'd2-accept-last.json'), JSON.stringify(OUT, null, 1));
console.log('=== d2 accept summary ===');
console.log('core:', JSON.stringify(OUT.phases.core));
console.log('append:', JSON.stringify(OUT.phases.append));
console.log('shellArm:', JSON.stringify(OUT.phases.shellArm));
console.log('readArm:', JSON.stringify(OUT.phases.readArm));
console.log('permcard total lines:', OUT.permcardLog.length);
console.log('faucet start drift (pre→final):', OUT.phases.pre.faucet && OUT.phases.pre.faucet.start, '→', OUT.finalProcs.faucet && OUT.finalProcs.faucet.start);
process.exit(0);
