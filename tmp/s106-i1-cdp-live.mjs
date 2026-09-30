// s106/i1 S2 活体红绿：批删回执 banner 渲染 + 桥回执后断连→重连清墙→回执存活实录（含旧模板红臂）
// 用法：node tmp/s106-i1-cdp-live.mjs green|red
//   green=现行模板（banner 挂 #chat 外，重连清墙后存活）；red=HEAD 旧模板（回执落墙，清墙即销毁）
// 零破坏：delete_sessions 用今日伪造号段（桥当日守卫→skipped 分支，不触任何真实会话）。
'use strict';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const MODE = process.argv[2] || 'green';
const CDP_PORT = 9344;
const PROFILE = 'C:/ZCodeWorks/PocketForge/tmp/s106-i1-edge-profile';
const TPL = 'C:/ZCodeWorks/PocketForge/forge/conf/templates/chat.tpl.html';
const OUT = `C:/ZCodeWorks/PocketForge/tmp/s106-i1-cdp-${MODE}.json`;

const getJson = (port, p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, r => {
        let b = ''; r.on('data', c => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (MODE === 'green') { // 备份现行模板（red 还原用；green 只确认工作树=已修复版）
    fs.copyFileSync(TPL, 'C:/ZCodeWorks/PocketForge/tmp/s106-i1-new.tpl.bak');
} else {
    const old = execSync('git show HEAD:forge/conf/templates/chat.tpl.html', { cwd: 'C:/ZCodeWorks/PocketForge', maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(TPL, old);
}

spawn('cmd', ['/c', 'start', '', 'msedge', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--new-window', '--app=http://127.0.0.1:8790/'], { detached: true, stdio: 'ignore' }).unref();
let targets = null;
for (let i = 0; i < 30; i++) {
    try { targets = await getJson(CDP_PORT, '/json'); if (targets.some(t => t.type === 'page' && t.url.includes('8790'))) break; } catch {}
    await sleep(500);
}
const page = targets.find(t => t.type === 'page' && t.url.includes('8790'));
if (!page) { console.log('FATAL: no page target'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map(); let msgId = 0;
const frames = [];
ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Network.webSocketFrameReceived') frames.push({ dir: 'recv', payload: String(m.params.response.payloadData).slice(0, 300) });
    if (m.method === 'Network.webSocketFrameSent') frames.push({ dir: 'sent', payload: String(m.params.response.payloadData).slice(0, 300) });
};
await new Promise(r => (ws.onopen = r));
const send = (method, params = {}) => new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Page.reload', { ignoreCache: true });
await sleep(8000); // goose session/new 需数秒，wssend 前 WS 必须就绪

// ---- 触发批删（今日伪造号段 → skipped 分支，回执+断连照走，零删除） ----
// S2 实锤场景=「无在开会话时批删」：重连 onopen 走 subscribe(null) 清墙。页面 reload 后种子会话
// 必然已开（S3 现象实录），故 wssend 前置空会话指针复现「无在开会话」态（top-level let 可页内赋值）。
const today = new Date(); const p2 = n => String(n).padStart(2, '0');
const fakeSid = `${today.getFullYear()}${p2(today.getMonth() + 1)}${p2(today.getDate())}_000901`;
frames.length = 0;
await ev('sessionId=null; currentSid=null; void 0');
const sendRet = await ev(`wssend({type:'delete_sessions',sessionIds:['${fakeSid}']})`);
await sleep(300); // 快采样：回执已到页、桥 destroy/重连（≥300ms 退避）尚未清墙——旧形态此窗内回执在墙上
const before = await ev(`(() => {
  const b = document.getElementById('op-banner');
  const infos = [...document.querySelectorAll('#chat .msg.agent.info')].map(e => e.textContent.slice(0, 200));
  return { banner: b ? b.textContent.slice(0, 200) : null, bannerInChat: b ? document.getElementById('chat').contains(b) : null, chatInfos: infos };
})()`);

// ---- 等 断连→自动重连→onopen subscribe(null) 清墙 完成 ----
await sleep(4000);
const after = await ev(`(() => {
  const b = document.getElementById('op-banner');
  const chat = document.getElementById('chat');
  return {
    banner: b ? b.textContent.slice(0, 200) : null,
    bannerInChat: b ? chat.contains(b) : null,
    chatInfos: [...chat.querySelectorAll('.msg.agent.info')].map(e => e.textContent.slice(0, 120)),
    chatCleared: ![...chat.querySelectorAll('.msg')].some(e => e.className.includes('info')),
    wsOpen: (window.ws && ws.readyState) === 1,
  };
})()`);
const recvSys = frames.filter(f => f.dir === 'recv').map(f => { try { return JSON.parse(f.payload).sys; } catch { return null; } }).filter(Boolean);

fs.writeFileSync(OUT, JSON.stringify({ mode: MODE, fakeSid, sendRet, before, after, recvSys }, null, 2));
console.log(JSON.stringify({ mode: MODE, fakeSid, sendRet, before, after, recvSys }, null, 2));
if (MODE === 'red') { // 还原现行模板
    fs.copyFileSync('C:/ZCodeWorks/PocketForge/tmp/s106-i1-new.tpl.bak', TPL);
}
ws.close();
await sleep(500);
try { // 只杀本 profile 锚定的 Edge 实例（不误伤用户窗口）
    execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -like '*s106-i1-edge-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
} catch {}
process.exit(0);
