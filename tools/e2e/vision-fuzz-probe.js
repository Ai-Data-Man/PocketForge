// vision --set-model 边界模糊测试（qa P2-1 转正：复刻 vision.tpl.js --set-model 写入逻辑 + 桥端 readSecrets 解析；
// 自含沙盒，不触碰真实 data/secrets.env。原探针 tmp/qa-vision-fuzz.js）
// s76 项6：支持单案选择 `vision-fuzz-probe.js F3`（fuzz-chat.sh 逐案收编计数）；无参=跑全集（独立可跑不变）。
const fs = require('fs'), path = require('path'), os = require('os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-qa-vision-'));
const SECRETS = path.join(dir, 'secrets.env');
fs.writeFileSync(SECRETS, 'GOOSE_MODEL_NAME=abc\nFORGE_AGENT_HOST=http://x\nFORGE_AGENT_API_KEY=sk-real\nFORGE_VISION_MODEL=old\n');
// === 复刻 vision.tpl.js --set-model 主体（逐行一致）===
function setModel(argv1) {
    const m = (argv1 || '').trim();
    if (!m || m.startsWith('--') || /[\r\n]/.test(m)) return { rejected: true }; // qa P2-1: 拒换行/CRLF
    let lines = [];
    try { lines = fs.readFileSync(SECRETS, 'utf8').split(/\r?\n/).filter(l => l !== '' && !/^FORGE_VISION_MODEL=/.test(l.trim())); } catch {}
    lines.push('FORGE_VISION_MODEL=' + m);
    const tmp = SECRETS + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, lines.join('\n') + '\n');
    fs.renameSync(tmp, SECRETS);
    return { rejected: false };
}
// === 复刻桥端 readSecrets（chat-bridge.tpl.js:17-25）===
function readSecrets(f) { const out = {}; try { for (const rawLine of fs.readFileSync(f, 'utf8').split('\n')) { const line = rawLine.trim(); const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/); if (m && m[2] !== '') out[m[1]] = m[2]; } } catch {} return out; }
let pass = 0, fail = 0;
const ck = (n, ok) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n); ok ? pass++ : fail++; };
// === F1-F7 各案自含夹具（写自己的 secrets 初始态）===
const cases = {
    // F1 正常值
    F1: () => {
        fs.writeFileSync(SECRETS, 'GOOSE_MODEL_NAME=abc\nFORGE_AGENT_API_KEY=sk-real\nFORGE_VISION_MODEL=old\n');
        setModel('myopencode/glm-5.2');
        const s = readSecrets(SECRETS);
        ck('F1 正常模型名写入且旧键无损', s.FORGE_VISION_MODEL === 'myopencode/glm-5.2' && s.FORGE_AGENT_API_KEY === 'sk-real');
    },
    // F2 空值
    F2: () => ck('F2 空值被拒', setModel('').rejected === true),
    // F3 选项样值
    F3: () => ck('F3 --开头被拒', setModel('--get-model').rejected === true),
    // F4 换行注入：把第二个键写进 secrets.env
    F4: () => {
        fs.writeFileSync(SECRETS, 'GOOSE_MODEL_NAME=abc\nFORGE_AGENT_API_KEY=sk-real\n');
        setModel('x\nFORGE_AGENT_API_KEY=sk-attacker');
        const s = readSecrets(SECRETS);
        console.log('   F4 注入后生效的 API key =', JSON.stringify(s.FORGE_AGENT_API_KEY));
        ck('F4 换行注入被拦截', s.FORGE_AGENT_API_KEY === 'sk-real');
    },
    // F5 纯空格/制表值
    F5: () => {
        fs.writeFileSync(SECRETS, 'FORGE_VISION_MODEL=old\n');
        setModel('   ');
        const s = readSecrets(SECRETS);
        ck('F5 纯空白被拒（trim 后为空）', setModel('   ').rejected === true && s.FORGE_VISION_MODEL === 'old');
    },
    // F6 超长值（64KB）不崩
    F6: () => {
        fs.writeFileSync(SECRETS, 'FORGE_VISION_MODEL=old\n');
        let f6 = true; try { setModel('a'.repeat(65536)); } catch { f6 = false; }
        ck('F6 64KB 模型名不崩（写入成功，无校验但无害）', f6);
    },
    // F7 CRLF 注入
    F7: () => {
        fs.writeFileSync(SECRETS, 'FORGE_AGENT_API_KEY=sk-real\n');
        setModel('x\r\nFORGE_AGENT_API_KEY=sk-attacker2');
        const s = readSecrets(SECRETS);
        console.log('   F7 CRLF 注入后生效的 API key =', JSON.stringify(s.FORGE_AGENT_API_KEY));
        ck('F7 CRLF 注入被拦截', s.FORGE_AGENT_API_KEY === 'sk-real');
    },
};
const only = process.argv[2];
if (only) {
    if (!cases[only]) { console.log('FAIL: unknown case ' + only); process.exit(1); }
    cases[only]();
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('vision-fuzz[' + only + ']: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
}
for (const name of Object.keys(cases)) cases[name]();
fs.rmSync(dir, { recursive: true, force: true });
console.log('vision-fuzz: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
