#!/usr/bin/env node
// PocketForge 自动升级器（ADR-0009）：独立于栈的 detached 进程。
// 流程：定位 zip（GitHub release 或已暂存）→ sha256 校验 → 解压 → 停栈 →
//       按文件哈希差量应用（备份被替换/删除文件）→ 重启栈 → 健康检查 → 失败自动回滚。
// 状态全程写 data/updates/status.json；用户数据 data/ 与受保护路径永不触碰。
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawn, execFile } = require('child_process');

const ROOT = process.env.FORGE_ROOT || path.resolve(__dirname, '..');
const UPD = path.join(ROOT, 'data', 'updates');
const STATUS_FILE = path.join(UPD, 'status.json');

// ---- 状态写入（升级期间桥可能已死，这是唯一真相源）----
function writeStatus(st) {
    st.ts = Date.now();
    try { fs.mkdirSync(UPD, { recursive: true }); fs.writeFileSync(STATUS_FILE, JSON.stringify(st, null, 2)); } catch {}
}
let ST = { stage: 'starting', ok: false, msg: '', pct: 0 };
writeStatus(ST);
// ---- P1（s69 遗留①）：落盘日志 + 阶段心跳 + 总超时 ----
// runner 是 detached+stdio:ignore 的孤进程，stdout 无人接收——挂死时零痕迹（s73 实录 1 次：
// stop 后 17min 无输出无日志进程消失）。全程关键输出 append 到 data/logs/update-runner.log
// （data/ 属 PROTECTED 永不入差量）；写入失败静默降级——磁盘满/权限不得让升级本身失败。
const LOG_FILE = path.join(ROOT, 'data', 'logs', 'update-runner.log');
function flog(line) {
    try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + line + '\n'); } catch {}
}
// 总超时上限 20 分钟：325MB 级包+慢盘下下载/解压/逐文件 hash 实测可超 10min，取一倍余量；
// 超时经 catch→既有回滚路径恢复备份。检测用阶段间检查点累计（每阶段完成打点时核对），零新依赖。
const UPGRADE_TIMEOUT_MS = 20 * 60 * 1000;
const T0 = Date.now();
function checkpoint(stage) {
    flog('heartbeat: ' + stage + ' 完成 +' + ((Date.now() - T0) / 1000).toFixed(1) + 's');
    if (Date.now() - T0 > UPGRADE_TIMEOUT_MS) throw new Error('升级总耗时超过 ' + Math.round(UPGRADE_TIMEOUT_MS / 60000) + ' 分钟上限（阶段 ' + stage + '），主动回滚');
}
let lastFlogKey = '', lastFlogTs = 0;
function say(stage, msg, pct) {
    ST.stage = stage; if (msg !== undefined) ST.msg = msg; if (pct !== undefined) ST.pct = pct;
    console.log('[upd]', stage, msg || '', pct != null ? pct + '%' : '');
    const key = stage + '|' + (msg || ''); // 下载进度同 key 5s 节流落盘，防逐 chunk 刷爆日志
    if (key !== lastFlogKey || Date.now() - lastFlogTs >= 5000) { lastFlogKey = key; lastFlogTs = Date.now(); flog('[upd] ' + stage + ' ' + (msg || '') + (pct != null ? ' ' + pct + '%' : '')); }
    writeStatus(ST);
}

// ---- 参数 ----
const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes('--dry-run');
let STAGED = argOf('--staged');           // 已暂存的 zip 文件名（data/updates/ 下）
let URL_OVERRIDE = argOf('--url');        // 直连下载地址（check 阶段给出）

function readJson(f, dft) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dft; } }
const CFG = readJson(path.join(ROOT, 'data', 'update.json'), {});
const REPO = CFG.repo || '';
const PROXY = CFG.proxy || '';

// ---- 受保护路径：相对 forge 根，前缀匹配即永不覆盖/删除 ----
// v0.9.10（s69 遗留①+差量同族核实）：config.yaml 升级包不含→差量判 deleted 删盘→bootstrap 纯模板
// 重建丢用户能力开关+mcp-* 块——PROTECTED 化后文件留盘，bootstrap 走 s17/s46 合并重建。
// custom_providers/=用户自配的模型端点（交付时改 base_url 与 key）；memory/=memory MCP 用户记忆库
// （升级包剔除该目录→差量把库文件判 deleted）。升级包不含、bootstrap 会重建的不保（.goosehints），
// 种子交付优先的不保（conf/goose/config/recipes/——G4 max_turns 等种子修复靠升级送达，备份兜底）。
const PROTECTED = ['data/', 'conf/goose/data/', 'conf/goose/state/', 'conf/goose/config/config.yaml', 'conf/goose/config/custom_providers/', 'conf/goose/config/memory/', 'conf/ports.env.yaml', 'conf/apps.env.yaml'];

function isProtected(rel) { return PROTECTED.some(p => rel === p.replace(/\/$/, '') || rel.startsWith(p)); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function walkMap(dir, baseDir, out) {
    let ents; try { ents = fs.readdirSync(dir); } catch { return; }
    for (const f of ents) {
        const full = path.join(dir, f);
        const rel = path.relative(baseDir, full).split(path.sep).join('/');
        let st; try { st = fs.lstatSync(full); } catch { continue; }
        if (st.isDirectory()) { if (!isProtected(rel)) walkMap(full, baseDir, out); }
        else out[rel] = st.isFile() ? sha256(fs.readFileSync(full)) : '';
    }
}

// ---- HTTP(S)，支持可选 http 代理（CONNECT 隧道）----
function fetchBuf(url, redirects) {
    redirects = redirects || 0;
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const mod = u.protocol === 'https:' ? https : http;
        const opts = { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, headers: { 'user-agent': 'PocketForge-Updater' } };
        const done = (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode)) {
                res.resume();
                if (redirects > 4) return reject(new Error('重定向过多'));
                return resolve(fetchBuf(res.headers.location, redirects + 1));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
            const chunks = [];
            let got = 0; const total = Number(res.headers['content-length'] || 0);
            res.on('data', c => { chunks.push(c); got += c.length; if (total) say('download', '下载中', Math.round(got / total * 100)); });
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        };
        if (PROXY && u.protocol === 'https:') {
            const pu = new URL(PROXY);
            const preq = http.request({ hostname: pu.hostname, port: pu.port || 80, method: 'CONNECT', path: u.hostname + ':443' });
            preq.on('connect', (res2, sock) => {
                if (res2.statusCode !== 200) { sock.destroy(); return reject(new Error('代理连接失败 ' + res2.statusCode)); }
                const req = https.request(Object.assign({}, opts, { socket: sock, agent: false }), done);
                req.on('error', reject); req.end();
            });
            preq.on('error', reject); preq.end();
        } else {
            const req = mod.request(opts, done);
            req.on('error', reject); req.end();
        }
    });
}

async function locateZip() {
    fs.mkdirSync(UPD, { recursive: true });
    if (STAGED) {
        const f = path.join(UPD, STAGED);
        if (!/^[\w.-]+\.zip$/.test(STAGED) || !fs.existsSync(f)) throw new Error('暂存包不存在: ' + STAGED);
        say('staged', '使用离线包 ' + STAGED);
        return f;
    }
    if (!REPO) throw new Error('未配置升级源（data/update.json 的 repo）');
    say('locate', '查询 GitHub 最新版本…');
    const api = await fetchBuf('https://api.github.com/repos/' + REPO + '/releases/latest');
    const rel = JSON.parse(api.toString('utf8'));
    let assets = rel.assets || [];
    // URL_OVERRIDE 来自 check 阶段，仍限定 github release download 域
    if (URL_OVERRIDE) assets = assets.filter(a => a.browser_download_url === URL_OVERRIDE).concat(assets);
    const zipA = assets.find(a => /^PocketForge-.+\.zip$/.test(a.name));
    const shaA = assets.find(a => /^PocketForge-.+\.zip\.sha256$/.test(a.name));
    if (!zipA || !shaA) throw new Error('release 里没找到安装包或校验文件');
    say('download', '下载 ' + zipA.name, 0);
    const buf = await fetchBuf(zipA.browser_download_url);
    const zf = path.join(UPD, zipA.name);
    fs.writeFileSync(zf, buf);
    const shabuf = await fetchBuf(shaA.browser_download_url);
    fs.writeFileSync(path.join(UPD, zipA.name + '.sha256'), shabuf);
    return zf;
}

function verifySha(zipFile) {
    const expect = (fs.readFileSync(zipFile + '.sha256', 'utf8').match(/^([0-9a-fA-F]{64})/) || [])[1];
    if (!expect) throw new Error('校验文件格式不对');
    const actual = sha256(fs.readFileSync(zipFile));
    if (actual !== expect.toLowerCase()) throw new Error('sha256 不匹配！包已损坏或被篡改');
    say('verify', 'sha256 校验通过');
}

function unzip(zipFile) {
    const dest = path.join(UPD, 'unpack');
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    // 用随包 python 解压（与打包脚本同款 zipfile）
    const pyRoots = [path.join(ROOT, 'bin', 'python', 'python.exe'), 'python'];
    const code = "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])";
    for (const py of pyRoots) {
        try {
            execFileSyncWrap(py, ['-c', code, zipFile, dest]);
            say('unpack', '解压完成');
            return dest;
        } catch (e) { lastErr = e; }
    }
    throw lastErr || '无可用 python';
}
const { execFileSync } = require('child_process');
function execFileSyncWrap(cmd, args2) { try { execFileSync(cmd, args2, { stdio: 'ignore', timeout: 120000 }); } catch (e) { lastErr = e; if (!e.status || e.status !== 0) throw e; } }
let lastErr = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function stopStack() {
    say('stop', '停止数字员工…');
    let port = '8099';
    try { port = fs.readFileSync(path.join(ROOT, 'data', 'pc.port'), 'utf8').trim() || port; } catch {}
    // s66 fix: pc v1.122 无 shutdown 动词（同 停止数字员工.cmd），正确动词是 down；原死词被 catch 吞掉导致从未真正停栈
    try { execFileSync(path.join(ROOT, 'bin', 'pc', 'process-compose.exe'), ['-p', port, 'down'], { stdio: 'ignore', timeout: 30000 }); } catch {}
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
        const stillUp = await new Promise(resolve => {
            const req = http.get({ host: '127.0.0.1', port: Number(port), path: '/processes', timeout: 800 }, r => { r.resume(); resolve(true); });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
        });
        if (!stillUp) break;
        await sleep(700);
    }
    // R2: 实测 pc shutdown 可能遗留 chat-bridge 子进程（占用 8790 导致新桥起不来、healthz 探到老进程误判成功）
    // 按 http.port 精确定位并终止；runner 自身命令行不含 chat-bridge.js,无误伤
    try {
        const out = execFileSync('powershell', ['-NoProfile', '-Command',
            "Get-NetTCPConnection -LocalPort 8790 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"], { encoding: 'utf8', timeout: 15000 });
        for (const line of out.split(String.fromCharCode(13, 10))) {
            const pid = parseInt(line.trim(), 10);
            if (pid && pid !== process.pid) { try { process.kill(pid); console.log('[upd] killed stale bridge pid', pid); } catch {} }
        }
    } catch {}
    await sleep(1200);
    say('stop', '栈已停止');
}

function startStack() {
    const cmdPath = path.join(ROOT, '启动数字员工.cmd');
    spawn('cmd.exe', ['/c', cmdPath], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref();
}

function healthz(timeoutMs, expectVer) {
    const t0 = Date.now();
    return new Promise(resolve => {
        const poll = () => {
            const req = http.get({ host: '127.0.0.1', port: 8790, path: '/api/update/status', timeout: 2000 }, r => {
                let b = ''; r.on('data', c => b += c); r.on('end', () => {
                    if (!expectVer) return resolve(r.statusCode === 200);
                    try { const j = JSON.parse(b); resolve(r.statusCode === 200 && j.version === expectVer); }
                    catch { resolve(false); }
                });
            });
            req.on('error', () => retry()); req.on('timeout', () => { req.destroy(); retry(); });
            function retry() { if (Date.now() - t0 > timeoutMs) return resolve(false); setTimeout(poll, 2500); }
        };
        poll();
    });
}

async function main() {
    let localVer = 'dev'; // s41: 提升到 try 外——回滚分支(catch)也要读它，原 const 声明会导致 ReferenceError
    try {
        localVer = (fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim()) || 'dev';
        ST.from = localVer;
        flog('=== 升级开始 ' + localVer + ' -> ?' + (STAGED ? '（离线包 ' + STAGED + '）' : '') + ' ===');
        const zipFile = await locateZip();
        checkpoint('下载');
        verifySha(zipFile);
        checkpoint('校验');
        const unpack = unzip(zipFile);
        // 新树根 = 解压目录下若只有单一 forge-pkg 内容则直接是它
        const newRoot = unpack;
        const newMap = {}; walkMap(newRoot, newRoot, newMap);
        const curMap = {}; walkMap(ROOT, ROOT, curMap);

        const applied = [], added = [], deleted = [];
        for (const rel of Object.keys(newMap)) {
            if (isProtected(rel)) continue;
            if (!(rel in curMap)) added.push(rel);
            else if (curMap[rel] !== newMap[rel]) applied.push(rel);
        }
        for (const rel of Object.keys(curMap)) {
            if (isProtected(rel)) continue;
            if (!(rel in newMap)) deleted.push(rel);
        }
        ST.to = '?';
        try { ST.to = fs.readFileSync(path.join(newRoot, 'VERSION'), 'utf8').trim() || '?'; } catch {}
        say('plan', '需更新 ' + applied.length + ' 个文件，新增 ' + added.length + '，删除 ' + deleted.length);
        if (DRY) { console.log(JSON.stringify({ applied, added, deleted }, null, 1)); ST.ok = true; ST.dryRun = true; writeStatus(ST); return; }

        // 备份将被替换/删除的现有文件
        const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        const backupDir = path.join(UPD, 'backup-' + ts);
        const backupRel = 'data/updates/backup-' + ts;
        for (const rel of [...applied, ...deleted]) {
            const src = path.join(ROOT, rel.split('/').join(path.sep));
            if (!fs.existsSync(src)) continue;
            const dst = path.join(backupDir, rel.split('/').join(path.sep));
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
        }
        fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify({ ts, from: localVer, to: ST.to, applied, added, deleted }, null, 2));

        await stopStack(); // P2（s69 遗留①）：原未 await——差量替换与栈收杀并发，清杀/重启竞态
        checkpoint('停栈');

        // 应用
        say('apply', '写入新版本文件…');
        for (const rel of [...applied, ...added]) {
            const src = path.join(newRoot, rel.split('/').join(path.sep));
            const dst = path.join(ROOT, rel.split('/').join(path.sep));
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
        }
        for (const rel of deleted) {
            try { fs.rmSync(path.join(ROOT, rel.split('/').join(path.sep)), { force: true }); } catch {}
        }

        checkpoint('差量替换');

        // 重启 + 健康检查（90 秒）
        say('restart', '重启数字员工…');
        startStack();
        const ok = await healthz(90000, ST.to);
        if (!ok) throw new Error('升级后服务未能启动');
        checkpoint('重启');

        ST.ok = true; ST.stage = 'done'; ST.msg = '已升级到 ' + ST.to + '。备份在 ' + backupRel;
        writeStatus(ST);
        console.log('upgrade complete ->', ST.to);
        flog('=== 升级完成 ' + localVer + ' -> ' + ST.to + ' ===');
    } catch (e) {
        console.error('UPGRADE FAILED:', e.message);
        flog('UPGRADE FAILED@' + ST.stage + ': ' + (e.message || e));
        // 回滚：还原备份并重启旧版
        // P1 总超时可在 stop 之后任一检查点触发——此时栈已停（文件可能未动），同样须恢复+重启；
        // stop 段恢复=同字节回写无副作用（备份在停栈前已落）
        try {
            if (ST.stage === 'stop' || ST.stage === 'apply' || ST.stage === 'restart') {
                say('rollback', '失败，正在回滚…');
                const bd = fs.readdirSync(UPD).filter(n => n.startsWith('backup-')).sort().pop();
                if (bd) {
                    const bdir = path.join(UPD, bd);
                    const man = readJson(path.join(bdir, 'manifest.json'), {});
                    for (const rel of man.applied || []) {
                        const src = path.join(bdir, rel.split('/').join(path.sep));
                        const dst = path.join(ROOT, rel.split('/').join(path.sep));
                        if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
                    }
                    for (const rel of man.deleted || []) { /* 删除类回滚=从备份放回 */ 
                        const src = path.join(bdir, rel.split('/').join(path.sep));
                        const dst = path.join(ROOT, rel.split('/').join(path.sep));
                        if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
                    }
                    for (const rel of man.added || []) { try { fs.rmSync(path.join(ROOT, rel.split('/').join(path.sep)), { force: true }); } catch {} }
                }
                startStack();
                await healthz(60000, localVer);
                ST.ok = false; ST.rolledBack = true; ST.msg = '升级失败已自动回滚到原版本: ' + (e.message || e);
                flog('=== 已回滚并重启 ' + localVer + ' ===');
            } else {
                ST.ok = false; ST.msg = String(e.message || e);
            }
        } catch (e2) {
            ST.ok = false; ST.msg = '升级失败且回滚异常，请用离线包重试或联系支持: ' + e2.message;
        }
        writeStatus(ST);
        process.exitCode = 1;
    } finally {
        // qa P3-5: 解压临时树（data/updates/unpack，可达数百 MB）成功/失败/回滚/dry-run 全路径用完即清——运行时残留非用户数据
        try { fs.rmSync(path.join(UPD, 'unpack'), { recursive: true, force: true }); } catch {}
    }
}
main();
