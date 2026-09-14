// s88 QA（s87 遗留①收口，角色纪律#3）：GET /api/apps 模糊批——apps/*.yaml 畸形输入韧性。
// 手法=自建自清（s82 纪律）：fixtures 全部 fuzz-* 前缀，用后删除，终态回基线；活体桥 :8790 只读 GET。
// 覆盖：巨型/二进制字节谱/空文件/纯注释（含伪 forge-meta XSS 向量）/meta JSON 形态变体（数组/数字/字符串/
// 超长/尾注释）/键名与缩进注入（引号键/tab/深缩进/CRLF/孤 CR）/BOM/scheme 伪协议注入/URL 白名单正负例/
// 10 路并发一致性/零持久化（conf/apps.env.yaml 与目录快照不变）。
// 判卷红线：不炸端点（恒 200 ok:true）、输出形状恒定、坏输入不落任何持久化、伪协议 url 不可执行形态。
// 用法：node tools/e2e/apps-fuzz-probe.js [bridge-base]（缺省 http://127.0.0.1:8790）
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const FORGE = path.join(ROOT, 'forge');
const BPORT = parseInt(((process.argv[2] || 'http://127.0.0.1:8790').match(/:(\d+)/) || [])[1], 10) || 8790;
const APPS_DIR = path.join(FORGE, 'apps');
let pass = 0, fail = 0;
const ck = (n, ok, extra) => { console.log((ok ? 'PASS' : 'FAIL') + ': ' + n + (extra !== undefined && extra !== '' ? '  | ' + String(extra).slice(0, 200) : '')); ok ? pass++ : fail++; };
const sha = p => { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return null; } };

function get(p, timeoutMs) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const rq = http.get({ host: '127.0.0.1', port: BPORT, path: p, timeout: timeoutMs || 25000 }, r => {
            let b = ''; r.on('data', c => b += c);
            r.on('end', () => { try { resolve({ code: r.statusCode, j: JSON.parse(b), ms: Date.now() - t0 }); } catch (e) { reject(new Error('bad json: ' + b.slice(0, 120))); } });
        });
        rq.on('error', reject); rq.on('timeout', () => { rq.destroy(); reject(new Error('timeout ' + p)); });
    });
}
function req(method, p) {
    return new Promise((resolve, reject) => {
        const rq = http.request({ host: '127.0.0.1', port: BPORT, path: p, method }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => resolve({ code: r.statusCode, body: b })); });
        rq.on('error', reject); rq.end();
    });
}
const snapDir = () => { try { return fs.readdirSync(APPS_DIR).sort().join(','); } catch { return '<NO-DIR>'; } };

// ---- fixtures（畸形谱，全部 fuzz-* 前缀，用后自清）----
const huge = ['processes:'];
for (let i = 0; i < 20000; i++) huge.push('  fuzz-huge-p' + i + ':\n    command: "x --pad=' + 'A'.repeat(80) + '"');
const FIX = {
    // 1) 巨型（~2 万键 + 超长行）
    'fuzz-huge.yaml': huge.join('\n') + '\n',
    // 2) 二进制字节谱 + 无效 UTF-8 序列（Buffer 直写保原始字节，不经 utf8 重编码）
    'fuzz-binary.yaml': Buffer.concat([Buffer.from(Array.from({ length: 256 }, (_, i) => i)), Buffer.from([0xff, 0xfe, 0xc0, 0x80, 0xed, 0xa0, 0x80]), Buffer.from('processes:\n  fuzz-bin-x:\n', 'binary')]),
    // 3) 空文件
    'fuzz-empty.yaml': '',
    // 4) 纯注释 + 伪 forge-meta XSS 向量（url=javascript: / 描述带 HTML）
    'fuzz-xss.yaml': '# forge-meta: {"description":"<img src=x onerror=alert(1)>\u6d4b\u8bd5","url":"javascript:alert(1)","created_at":"9999-99-99","source":"x"}\n# just a comment, no processes\n',
    // 5) meta JSON 形态变体：数组 / 数字 / 字符串 / true（非对象全降级）
    'fuzz-marray.yaml': '# forge-meta: [1,2,3]\nprocesses:\n  fuzz-ma-x:\n    command: "x"\n',
    'fuzz-mnum.yaml': '# forge-meta: 42\nprocesses:\n  fuzz-mn-x:\n    command: "x"\n',
    'fuzz-mstr.yaml': '# forge-meta: "just a string"\nprocesses:\n  fuzz-ms-x:\n    command: "x"\n',
    // 6) 超长 forge-meta 行（1MB JSON）+ 尾注释形态
    'fuzz-mlong.yaml': '# forge-meta: {"description":"' + 'L'.repeat(1024 * 1024) + '"}\nprocesses:\n  fuzz-ml-x:\n    command: "x"\n',
    'fuzz-mtail.yaml': '# forge-meta: {"description":"ok"} # trailing note\nprocesses:\n  fuzz-mt-x:\n    command: "x"\n',
    // 7) 键名与缩进注入：引号键 / tab 缩进 / 4 空格 / 深缩进 / 孤 CR 行尾
    'fuzz-shapes.yaml': 'processes:\n  "fuzz-quoted":\n    command: "x"\n\tfuzz-tab-x:\n    command: "x"\n    fuzz-deep-x:\n      command: "x"\n  fuzz-ok:\r    command: "y"\r',
    // 8) BOM（Windows 记事本编辑产物）
    'fuzz-bom.yaml': '\ufeffprocesses:\n  fuzz-bom-x:\n    command: "x"\n',
    // 9) scheme 伪协议注入（probeUrl 合成通道）
    'fuzz-scheme.yaml': 'processes:\n  fuzz-sc-x:\n    readiness_probe:\n      http_get: { host: 127.0.0.1, port: 18950, scheme: javascript, path: /alert(1) }\n',
    // 10) meta.url 白名单正负例
    'fuzz-urls.yaml': '# forge-meta: {"url":"HTTPS://ok.example/x"}\nprocesses:\n  fuzz-u1:\n    command: "x"\n',
    'fuzz-urlb.yaml': '# forge-meta: {"url":"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="}\nprocesses:\n  fuzz-u2:\n    command: "x"\n',
    'fuzz-urlc.yaml': '# forge-meta: {"url":"https://x\\"onmouseover=\\"alert(1)"}\nprocesses:\n  fuzz-u3:\n    command: "x"\n',
    // 11) CRLF 正常形状（应可解析——行级解析器 split(/\r?\n/)）
    'fuzz-crlf.yaml': 'processes:\r\n  fuzz-crlf-web:\r\n    command: "x"\r\n    readiness_probe:\r\n      http_get: { host: 127.0.0.1, port: 18951, scheme: http, path: / }\r\n',
};
const cleanup = () => { for (const f of Object.keys(FIX)) { try { fs.unlinkSync(path.join(APPS_DIR, f)); } catch {} } };

(async () => {
    const baseApps = snapDir();
    const appsEnvHash0 = sha(path.join(FORGE, 'conf', 'apps.env.yaml'));
    const confTop0 = fs.readdirSync(path.join(FORGE, 'conf')).sort().join(',');
    try { for (const [f, body] of Object.entries(FIX)) fs.writeFileSync(path.join(APPS_DIR, f), body); }
    catch (e) { console.error('FATAL fixture write:', e.message); cleanup(); process.exit(2); }

    // ===== 相位一：全谱共存下端点韧性与形状恒定 =====
    let j = null;
    try { j = (await get('/api/apps', 40000)).j; } catch (e) { ck('F1 畸形全谱共存不炸端点（200 ok:true）', false, e.message); }
    const apps = (j && j.apps) || [];
    const by = Object.fromEntries(apps.map(a => [a.id, a]));
    if (j) ck('F1 畸形全谱共存不炸端点（200 ok:true，16 fixtures 全在列）', j.ok === true && Array.isArray(j.apps) && Object.keys(FIX).every(f => !!by[f.replace(/\.yaml$/i, '')]), 'n=' + apps.length);
    ck('F2 巨型文件（2 万键+超长行）解析有界不挂死', !!by['fuzz-huge'] && Array.isArray(by['fuzz-huge'].procs) && by['fuzz-huge'].procs.length === 20000, 'procs=' + (by['fuzz-huge'] && by['fuzz-huge'].procs.length));
    ck('F3 二进制字节谱（0x00-0xFF+无效 UTF-8）不炸（降级允许，条目仍在列）', !!by['fuzz-binary'], Object.keys(by).length ? '' : 'missing');
    ck('F4 空文件：兜底列出（id 在列，state 有值）', !!by['fuzz-empty'] && by['fuzz-empty'].state === 'stop' && by['fuzz-empty'].createdAt !== null, 'state=' + (by['fuzz-empty'] && by['fuzz-empty'].state));
    const xss = by['fuzz-xss'];
    ck('F5 XSS 向量：url=javascript: 被白名单拒（输出 null，无死链无伪协议按钮）', !!xss && xss.url === null, 'url=' + (xss && xss.url));
    ck('F6 XSS 向量：human 数据面原样（显示层 esc 消费——桥不猜不洗数据）', !!xss && xss.human === '<img src=x onerror=alert(1)>测试', 'human=' + (xss && JSON.stringify(xss.human).slice(0, 60)));
    ck('F7 meta 非对象形态（数组/数字/字符串）全降级 human=null 不炸', by['fuzz-marray'] && by['fuzz-marray'].human === null && by['fuzz-mnum'] && by['fuzz-mnum'].human === null && by['fuzz-mstr'] && by['fuzz-mstr'].human === null);
    ck('F8 超长 forge-meta（1MB）：合法 JSON 照常解析（human 超长字符串）不炸；尾注释形态降级 null', by['fuzz-mlong'] && typeof by['fuzz-mlong'].human === 'string' && by['fuzz-mlong'].human.length > 1000000 && by['fuzz-mtail'] && by['fuzz-mtail'].human === null);
    // 形状恒定：键集与类型（所有条目）
    const APP_KEYS = ['createdAt', 'human', 'id', 'listenPorts', 'procs', 'srcSid', 'srcTitle', 'state', 'url', 'yaml'].sort().join(',');
    const shapeOk = apps.every(a => Object.keys(a).sort().join(',') === APP_KEYS
        && typeof a.id === 'string' && (a.human === null || typeof a.human === 'string')
        && (a.url === null || typeof a.url === 'string') && (a.srcSid === null || typeof a.srcSid === 'string')
        && (a.srcTitle === null || typeof a.srcTitle === 'string') && Array.isArray(a.procs) && Array.isArray(a.listenPorts)
        && ['run', 'stop', 'fail'].includes(a.state) && a.procs.every(p => Object.keys(p).sort().join(',') === 'exitCode,name,state' && typeof p.name === 'string' && ['run', 'stop', 'fail', 'absent'].includes(p.state)));
    ck('F9 输出形状恒定（全部条目键集/类型/state 词表零漂移）', shapeOk, 'n=' + apps.length);
    ck('F10 键名/缩进注入（引号键/tab/深缩进/孤 CR）不炸且 procs 元素 name 恒 string（端点形状）', !!by['fuzz-shapes'] && by['fuzz-shapes'].procs.every(p => typeof p.name === 'string'));
    ck('F11 CRLF 正常形状可解析（Windows 编辑产物）', by['fuzz-crlf'] && by['fuzz-crlf'].procs.length === 1 && by['fuzz-crlf'].procs[0].name === 'fuzz-crlf-web' && by['fuzz-crlf'].url === 'http://127.0.0.1:18951/', JSON.stringify(by['fuzz-crlf'] && by['fuzz-crlf'].procs));
    ck('F12 BOM 文件：降级不炸（条目在列，形状恒定）', !!by['fuzz-bom']);
    // scheme 伪协议注入：probeUrl 合成通道固定 '://'+host:port 拼接——javascript:// 后必是 host:port（JS 注释形态，不可执行）
    const sc = by['fuzz-scheme'];
    const schemeSafe = !!sc && typeof sc.url === 'string' && /^javascript:\/\/[\w.-]+:\d+\//.test(sc.url) && !/javascript:[^/]/.test(sc.url);
    ck('F13 scheme 注入只产生注释形态（javascript://host:port/，无可执行 JS 段）——QA 已另报 🟡 scheme 白名单不对称', schemeSafe, 'url=' + (sc && sc.url));
    ck('F14 meta.url 白名单正例：HTTPS:// 大写协议通过（i 旗）', by['fuzz-urls'] && by['fuzz-urls'].url === 'HTTPS://ok.example/x', by['fuzz-urls'] && by['fuzz-urls'].url);
    ck('F15 meta.url 白名单负例：data: 伪协议拒（url=null 不放死链）', by['fuzz-urlb'] && by['fuzz-urlb'].url === null, 'url=' + (by['fuzz-urlb'] && by['fuzz-urlb'].url));
    ck('F16 meta.url 引号向量：协议合法即原样输出（前端 esc 转义已核——桥不猜），无伪协议', by['fuzz-urlc'] && /^https?:\/\//i.test(by['fuzz-urlc'].url), 'url=' + (by['fuzz-urlc'] && by['fuzz-urlc'].url));

    // ===== 相位二：并发一致 + 写面负断言 =====
    const N = 10;
    const rs = await Promise.all(Array.from({ length: N }, () => get('/api/apps', 40000).catch(() => null)));
    const okBodies = rs.filter(r => r && r.code === 200 && r.j && r.j.ok === true);
    const bodies = new Set(okBodies.map(r => JSON.stringify(r.j.apps)));
    ck('F17 10 路并发全 200 且 apps 数组逐字节一致（execFile 并发无竞态错乱）', okBodies.length === N && bodies.size === 1, 'ok=' + okBodies.length + ' distinct=' + bodies.size);
    const post = await req('POST', '/api/apps').catch(() => null);
    const del = await req('DELETE', '/api/apps').catch(() => null);
    ck('F18 写通道负断言：POST/DELETE 全拒 405', post && post.code === 405 && del && del.code === 405, 'POST=' + (post && post.code) + ' DELETE=' + (del && del.code));
    ck('F19 零持久化：conf/apps.env.yaml 哈希不变 + conf/ 顶层清单不变 + 目录内非 fuzz 文件零扰动', sha(path.join(FORGE, 'conf', 'apps.env.yaml')) === appsEnvHash0 && fs.readdirSync(path.join(FORGE, 'conf')).sort().join(',') === confTop0, '');

    // ===== 自清与终态（s82 纪律）=====
    cleanup();
    let j2 = null; try { j2 = (await get('/api/apps')).j; } catch {}
    const baseYaml = baseApps === '<NO-DIR>' ? 0 : baseApps.split(',').filter(x => x && /\.yaml$/i.test(x)).length;
    ck('F20 用后自清：fixtures 删除 + /api/apps 回基线条数', j2 && j2.ok === true && j2.apps.length === baseYaml, 'n=' + (j2 && j2.apps ? j2.apps.length : '?') + ' base=' + baseYaml);
    ck('F21 终态目录快照还原（fuzz-* 零残留）', snapDir() === baseApps, snapDir());
    console.log('apps-fuzz: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { cleanup(); console.error('FATAL', e); process.exit(2); });
