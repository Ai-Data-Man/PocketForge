// PocketForge vision helper: send an image to a vision-capable model via OpenAI-compatible API.
// Materialized by bootstrap.ps1 to <FORGE_ROOT>/bin/vision.js (template lives in conf/templates/).
// Usage:
//   node vision.js <image-path> [question] [model]   看图
//   node vision.js --get-model                       打印当前生效视觉模型
//   node vision.js --list-models                     列出服务商可用模型 id（不打印密钥）
//   node vision.js --set-model <model-id>            持久化视觉模型（写 data/secrets.env 的 FORGE_VISION_MODEL）
// 模型解析顺序：argv model > 环境变量 FORGE_VISION_MODEL > secrets.env FORGE_VISION_MODEL；都没有则人话报错引导设置，不回落硬编码。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // bin/.. = FORGE_ROOT
const SECRETS = path.join(ROOT, 'data', 'secrets.env');
const SET_HINT = '先运行 vision.js --list-models 查看服务商有哪些模型可用，与用户确认后运行 vision.js --set-model <模型名> 设置（设一次长期生效）。';

function readSecrets(f) {
    const out = {};
    try {
        for (const raw of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
            const m = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
            if (m && m[2] !== '') out[m[1]] = m[2];
        }
    } catch {}
    return out;
}
const secrets = readSecrets(SECRETS);
const argv = process.argv.slice(2);
const cmd = argv[0] || '';

if (cmd === '--get-model') {
    const m = process.env.FORGE_VISION_MODEL || secrets.FORGE_VISION_MODEL || '';
    if (!m) { console.error('尚未设置视觉模型。' + SET_HINT); process.exit(1); }
    console.log(m);
    process.exit(0);
}

if (cmd === '--list-models') {
    const host = (secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
    const key = secrets.FORGE_AGENT_API_KEY || '';
    if (!host || !key) { console.error('尚未配置模型服务商（缺接口地址或密钥）。请先在聊天窗口的设置面板里配置服务商。'); process.exit(1); }
    const u = new URL(host + '/models');
    const reqMod = require(u.protocol === 'https:' ? 'https' : 'http');
    const req = reqMod.request(u, { method: 'GET', headers: { Authorization: 'Bearer ' + key }, timeout: 30000 }, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
            try {
                const j = JSON.parse(b);
                const ids = (j.data || j.models || []).map(m => m.id || m.name || String(m));
                if (res.statusCode !== 200 || !ids.length) { console.error('获取模型列表失败（HTTP ' + res.statusCode + '）。请检查设置面板里的服务商配置。'); process.exit(1); }
                console.log(ids.join('\n'));
            } catch { console.error('模型列表响应解析失败（HTTP ' + res.statusCode + '）。'); process.exit(1); }
        });
    });
    req.on('error', e => { console.error('连接服务商失败：' + e.message); process.exit(1); });
    req.on('timeout', () => { req.destroy(); console.error('连接服务商超时。'); process.exit(1); });
    req.end();
} else if (cmd === '--set-model') {
    const m = (argv[1] || '').trim();
    // qa P2-1：换行/CRLF 会把第二行注入 secrets.env（伪造任意键），必须拒——模型 id 单行
    if (!m || m.startsWith('--') || /[\r\n]/.test(m)) { console.error('用法：node vision.js --set-model <模型名>（模型名用 --list-models 查到的原样 id，单行）'); process.exit(2); }
    let lines = [];
    try { lines = fs.readFileSync(SECRETS, 'utf8').split(/\r?\n/).filter(l => l !== '' && !/^FORGE_VISION_MODEL=/.test(l.trim())); } catch {}
    lines.push('FORGE_VISION_MODEL=' + m);
    // 幂等重写：只动 FORGE_VISION_MODEL 行，其余原样保留（桥重写 secrets.env 只过滤三个已知键，本键可共存）；断电安全写 tmp+rename
    const tmp = SECRETS + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, lines.join('\n') + '\n');
    fs.renameSync(tmp, SECRETS);
    console.log('视觉模型已设为 ' + m + '，立即生效。');
    process.exit(0);
} else {
    // 看图主路径：每次调用现读 secrets.env，设完即生效
    const imgPath = cmd;
    if (!imgPath || imgPath.startsWith('--')) { console.error('用法：node vision.js <图片路径> "问题"\n       node vision.js --get-model | --list-models | --set-model <模型名>'); process.exit(2); }
    const question = argv[1] || '详细描述这张截图：布局、可见元素、状态。如果有异常（空白、错位、被遮挡、报错文字）请明确指出。';
    const model = argv[2] || process.env.FORGE_VISION_MODEL || secrets.FORGE_VISION_MODEL || '';
    if (!model) { console.error('看图失败：尚未设置视觉模型。' + SET_HINT); process.exit(1); }

    // qa s78e P3-A：坏图片路径（不存在/是目录/读不了）人话报错，不吐英文栈
    let b64;
    try {
        b64 = fs.readFileSync(imgPath).toString('base64');
    } catch (e) {
        if (e.code === 'ENOENT') console.error('看图失败：找不到这张图片：' + imgPath + '。请确认文件存在后再试。');
        else if (e.code === 'EISDIR') console.error('看图失败：这个路径是文件夹，不是图片：' + imgPath + '。请给出图片文件本身的路径。');
        else console.error('看图失败：这张图片读不了（' + (e.code || e.message) + '）：' + imgPath);
        process.exit(2);
    }
    const ext = path.extname(imgPath).slice(1).toLowerCase() || 'png';
    // s99/S3（裁决 2026-09-21 §3.6）：空 host 不再回落 127.0.0.1:20128 死地址（与出厂空态一致）——
    // 诚实报未配置并指路（--list-models 同款），不打永远连不上的占位端点。
    const host = (secrets.FORGE_AGENT_HOST || '').replace(/\/$/, '');
    if (!host) { console.error('看图失败：还没连上大模型——先在聊天窗口的 ⚙️ 设置里配好服务商（地址+Key），保存后再试。'); process.exit(1); }
    const key = secrets.FORGE_AGENT_API_KEY || '';

    const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: `data:image/${ext};base64,${b64}` } },
        ]}],
        max_tokens: 2000,
    });

    const u = new URL(host + '/chat/completions');
    const reqMod = require(u.protocol === 'https:' ? 'https' : 'http');
    const req = reqMod.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, timeout: 120000 }, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
            for (const cut of ['\ndata:', 'data: [DONE]']) { const i = b.indexOf(cut); if (i > 0) b = b.slice(0, i); }
            try {
                const j = JSON.parse(b.trim());
                if (res.statusCode !== 200 || j.error) {
                    const em = (j.error && (j.error.message || j.error.code)) || ('HTTP ' + res.statusCode);
                    console.error('看图失败：' + em);
                    console.error('如果提示模型不存在或不能看图，' + SET_HINT);
                    process.exit(1);
                }
                const m = j.choices && j.choices[0] && j.choices[0].message;
                console.log((m && (m.content || m.reasoning_content)) || JSON.stringify(j).slice(0, 200));
            } catch { console.log('RAW:', b.slice(0, 400)); }
        });
    });
    req.on('error', e => { console.error('看图失败：连不上模型服务商（' + e.message + '）。请确认服务商服务在运行。'); process.exit(1); });
    req.on('timeout', () => { req.destroy(); console.error('看图失败：模型服务商 120 秒没响应。'); process.exit(1); });
    req.write(body); req.end();
}
