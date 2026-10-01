// [s107/f6 入库] 用途：CDP 观测骨架——起 Edge --app + 远程调试口，全程收集控制台（error/warn/exception）
//   与 4xx 网络面，暴露 ev/shot 基元；供验收/巡检驱动 import 复用或独立冒烟（10s 采集摘要）。
// 用法（独立冒烟）：node tools/e2e/cdp-observe.mjs
//   env：PF_CDP_PORT（缺省 9333）/ PF_PAGE_URL（缺省 http://127.0.0.1:8790/）/ PF_CDP_PROFILE
//   （缺省 <repo>/tmp/cdp-observe-profile——沙盒争用时换独立口+独立 profile，勿动他人会话的口）。
// 来源：s107 Round-A 全观测骨架 tmp/s107-cdp-observe.mjs（A0-B10 与 s107d 验收驱动共用；s107/f6 入库
//   时参数名 S107_*→PF_* 统一，页面匹配按 PF_PAGE_URL 的端口自适）。
'use strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_PORT = parseInt(process.env.PF_CDP_PORT || '9333', 10);
const PAGE_URL = process.env.PF_PAGE_URL || 'http://127.0.0.1:8790/';
const PAGE_PORT = new URL(PAGE_URL).port || '80';
const PROFILE = process.env.PF_CDP_PROFILE || path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'tmp', 'cdp-observe-profile');

const getJson = (port, p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, r => {
        let b = ''; r.on('data', c => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function boot() {
    const edge = spawn('cmd', ['/c', 'start', '', 'msedge', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-proxy-server', `--app=${PAGE_URL}`], { detached: true, stdio: 'ignore', env: { ...process.env, NO_PROXY: '127.0.0.1,localhost' } });
    edge.unref();
    let targets = null;
    for (let i = 0; i < 40; i++) {
        try {
            targets = await getJson(CDP_PORT, '/json');
            if (targets.some(t => t.type === 'page' && t.url.includes(':' + PAGE_PORT))) break;
        } catch {}
        await sleep(500);
    }
    const page = targets?.find(t => t.type === 'page' && t.url.includes(':' + PAGE_PORT));
    if (!page) throw new Error('FATAL: no page target（页面端口=' + PAGE_PORT + '，检查 PF_PAGE_URL 与栈是否在跑）');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const pending = new Map(); let msgId = 0;
    const console_ = [];
    const network = [];
    ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
        const ts = new Date().toISOString();
        if (m.method === 'Runtime.consoleAPICalled') {
            const text = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
            console_.push({ ts, level: m.params.type, text: text.slice(0, 500) });
        } else if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            console_.push({ ts, level: 'exception', text: ((d.exception?.description) || d.text || '').slice(0, 800) });
        } else if (m.method === 'Log.entryAdded') {
            const en = m.params.entry;
            console_.push({ ts, level: 'log-' + en.level, text: (en.source + ': ' + en.text + (en.url ? ' @' + en.url : '')).slice(0, 500) });
        } else if (m.method === 'Network.responseReceived') {
            const r = m.params.response;
            if (r.status >= 400) network.push({ ts, url: r.url.slice(0, 200), status: r.status });
        }
    };
    await new Promise(r => { ws.onopen = r; ws.onclose = () => process.exit(2); });
    const send = (method, params = {}) => new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async expr => {
        const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        return r.result?.result?.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    return { ws, send, ev, console_, network, sleep };
}

// 独立跑=冒烟
if (process.argv[1] && (process.argv[1].endsWith('cdp-observe.mjs') || process.argv[1].endsWith('cdp-observe.js'))) {
    const h = await boot();
    await h.sleep(10000);
    const errs = h.console_.filter(c => /error|exception/i.test(c.level));
    console.log(JSON.stringify({ totalConsole: h.console_.length, errCount: errs.length, errs: errs.slice(0, 10), http4xx: h.network.slice(0, 5) }, null, 1));
    try { await h.send('Browser.close'); } catch {}
    await h.sleep(800);
    process.exit(0);
}
