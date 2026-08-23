// PocketForge vision helper: send an image to a vision-capable model via OpenAI-compatible API.
// Usage: node vision.js <image-path> [question] [model]
// Default model: myopencode/glm-5.2 (verified vision-capable on 2026-08-23 probe)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(path.resolve(__dirname, '..'), 'forge');
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
const secrets = readSecrets(path.join(ROOT, 'data', 'secrets.env'));

const imgPath = process.argv[2];
const question = process.argv[3] || '详细描述这张截图：布局、可见元素、状态。如果有异常（空白、错位、被遮挡、报错文字）请明确指出。';
const model = process.argv[4] || 'myopencode/glm-5.2';
if (!imgPath) { console.error('usage: node vision.js <image> [question] [model]'); process.exit(2); }

const b64 = fs.readFileSync(imgPath).toString('base64');
const ext = path.extname(imgPath).slice(1).toLowerCase() || 'png';
const host = (secrets.FORGE_AGENT_HOST || 'http://127.0.0.1:20128/v1/').replace(/\/$/, '');
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
            const m = j.choices && j.choices[0] && j.choices[0].message;
            console.log((m && (m.content || m.reasoning_content)) || JSON.stringify(j).slice(0, 200));
        } catch { console.log('RAW:', b.slice(0, 400)); }
    });
});
req.on('error', e => { console.error('ERR:', e.message); process.exit(1); });
req.write(body); req.end();
