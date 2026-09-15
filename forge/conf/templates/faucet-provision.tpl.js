// PocketForge: s94 F-6 首启 faucet 供给——admin / forge-admin 角色 / agent key + data/faucet/.apikey。
// 幂等：.apikey 存在且本机 REST 一次鉴权探活通过即跳过（旧部署/重复启动零动作）；
// admin/role 已存在按成功处理（UNIQUE 冲突=已建档，直接吞掉）；key 建后即写 .apikey。
// 失败=warn 并退出 0（与就绪门同哲学：供给失败不阻断启动；桥的富化读不到 key 自行静默降级）。
// 由 process-compose oneshot「faucet-provision」跑（depends_on faucet: process_healthy——端口就绪由 pc 保证，
// bootstrap 先于栈起等不到端口，供给必须挂在栈内；faucet-rawsql 同款先例）。
// 凭据确定性：FAUCET_ADMIN_EMAIL / FAUCET_ADMIN_PW 取自 data/secrets.env（bootstrap 首启种子/幂等补缺）。
// CLI 语义（本机 faucet.exe 实测 2026-09-15）：admin/role/key create 直接写 --data-dir 下 sqlite，
// 服务运行中并发写无锁冲突；key create 原始 key 只在 stdout 出现一次（Key:   faucet_<hex>）；
// 新 key 服务端即刻生效（401/404 鉴别实测）。argv[2]=ROOT 覆盖（faucet-rawsql 同款可测性）。
const FSS = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'faucet');
const KEY_FILE = path.join(DATA_DIR, '.apikey');
const PORT_FILE = path.join(ROOT, 'data', 'faucet.port');
const SECRETS = path.join(ROOT, 'data', 'secrets.env');
const FAUCET = path.join(ROOT, 'bin', 'faucet', 'faucet.exe');

function readSecrets() {
    const out = {};
    try {
        for (const line of FSS.readFileSync(SECRETS, 'utf8').split(/\r?\n/)) {
            const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (m && m[2] !== '') out[m[1]] = m[2];
        }
    } catch {}
    return out;
}
function run(args) {
    return new Promise((resolve, reject) => {
        execFile(FAUCET, args.concat(['--data-dir', DATA_DIR]), { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 },
            (e, stdout, stderr) => {
                const err = String(stderr || (e && e.message) || '');
                if (/UNIQUE constraint failed/.test(err)) return resolve(''); // 已建档=幂等成功
                if (e) return reject(new Error(args.join(' ') + ': ' + (err || 'exit ' + e.code)));
                resolve(String(stdout || ''));
            });
    });
}
function keyWorks(key) { // 鉴权探活：坏 key 401、好 key 对未知路径 404（本机实测）——非 401 即有效
    return new Promise(resolve => {
        let port = 0;
        try { port = parseInt(FSS.readFileSync(PORT_FILE, 'utf8').trim(), 10) || 0; } catch {}
        if (!port) return resolve(false);
        try {
            const rq = require('http').get({ hostname: '127.0.0.1', port, path: '/api/v1/_provision_probe', headers: { 'X-API-Key': key }, timeout: 4000 }, r => {
                r.resume();
                r.on('end', () => resolve(r.statusCode !== 401));
            });
            rq.on('error', () => resolve(false));
            rq.on('timeout', () => { rq.destroy(); resolve(false); });
        } catch { resolve(false); }
    });
}
(async () => {
    try {
        if (FSS.existsSync(KEY_FILE)) {
            const k = FSS.readFileSync(KEY_FILE, 'utf8').trim();
            if (k && await keyWorks(k)) { console.log('[faucet-provision] .apikey 有效，跳过'); return; }
        }
        const sec = readSecrets();
        const email = sec.FAUCET_ADMIN_EMAIL || 'admin@pocketforge.local';
        const pw = sec.FAUCET_ADMIN_PW || '';
        if (!pw) { console.warn('[faucet-provision] secrets.env 缺 FAUCET_ADMIN_PW，跳过供给（不阻断启动）'); return; }
        await run(['admin', 'create', '--email', email, '--password', pw]);
        await run(['role', 'create', '--name', 'forge-admin', '--description', 'PocketForge agent full access']);
        const out = await run(['key', 'create', '--role', 'forge-admin', '--label', 'forge-agent']);
        const km = String(out).match(/Key:\s*(faucet_\S+)/);
        if (!km) throw new Error('key create 未吐出 key：' + String(out).slice(0, 120));
        FSS.writeFileSync(KEY_FILE, km[1] + '\n');
        console.log('[faucet-provision] admin+forge-admin+agent key 已供给，.apikey 已写入（admin=' + email + '）');
    } catch (e) {
        console.warn('[faucet-provision] 供给失败（不阻断启动）：' + ((e && e.message) || e));
    }
})();
