// PocketForge read-file MCP server（vendored stdio，零依赖 node；s107/f4）
// 裁决 docs/verdicts/2026-10-02-s107-report-permission-readtool.md：挂一把只读文件内容工具，
// annotations.readOnlyHint=true → goose smart_approve 判定链第②步确定性放行（零权限卡、零 judge 开销），
// 给报表 happy path 一条免卡读通道（上传即同意——用户自己投放给 agent 读的文件）。
// 边界（照裁决 §边界清单，机制不进配置面、无开关）：
//   作用域恒限本安装 data/artifacts/ 子树（conf/ 与 data/ 其它面有 faucet .apikey/供应商密钥，读进
//   上下文=泄进 LLM 请求与日志）；跨工作区可读（工具进程无法可靠感知"当前会话工作区"，整域是可执行边界）。
//   窗口=默认 400 行且 64KB 先到为准，offset/limit 行级翻页，回包带总行数与截断说明（对齐 tree「[N]」习惯）。
//   二进制/非 UTF-8 → 人话报错（引导另存 CSV 或文件面板预览）；越界=拒+指明允许的根；
//   不存在/传目录=拒+引导 tree；`..` 归一化后前缀校验，不做字符串匹配。
//   只读纪律：本文件构造上无任何写 API（QA 负验证项）——只有 readFileSync/statSync，绝不 require 写面。
// 用法：node read-file-mcp.js <artifacts 绝对根>（根由 goose-config 物化的绝对路径经 argv 传入，不吃 env）
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || path.join(process.cwd(), 'data', 'artifacts'));
const DEFAULT_LINES = 400;              // 默认窗口行数
const MAX_BYTES = 64 * 1024;            // 单次窗口字节上限（行数与它先到为准）
const LIMIT_CAP = 1000;                 // 单次 limit 上限（字节上限对截断结果仍然生效）
const FILE_CAP = 100 * 1024 * 1024;     // 文件本体读取上限（防病理大文件撑爆内存；上下文防线是窗口不是它）

const TOOL = {
    name: 'read',
    description: '读工作区里文本文件的内容（只读，不改文件）。读文件内容用它，不要用 shell type/cat。path 填 tree 工具里看到的文件路径；文件长时默认读前 400 行，用 offset/limit 翻页接着读。',
    inputSchema: {
        type: 'object',
        properties: {
            path: { type: 'string', description: '要读的文件路径（tree 工具里看到的相对路径，如 ws-xxxx/data.csv）' },
            offset: { type: 'integer', description: '从第几行开始读（0 起，默认 0）' },
            limit: { type: 'integer', description: '最多读几行（默认 400，上限 1000）' }
        },
        required: ['path']
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } // ← smart_approve 第②步放行的钩子
};

function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// `..` 归一化后前缀校验（裁决：不做字符串匹配）。resolve 后必须落在 ROOT 之内。
function resolveInRoot(rel) {
    const abs = path.resolve(ROOT, String(rel));
    const rootSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
    return (abs === ROOT || abs.startsWith(rootSep)) ? abs : null;
}

function looksBinary(buf) { // 头 8KB 嗅探：NUL 字节或非法 UTF-8 序列（xlsx/zip/图片全在首段暴露）
    const sniff = buf.subarray(0, 8192);
    if (sniff.includes(0)) return true;
    try { new TextDecoder('utf-8', { fatal: true }).decode(sniff); return false; } catch { return true; }
}

function humanSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(0) + ' MB' : (n / 1024).toFixed(0) + ' KB'; }

function readTool(args) {
    const rel = args && args.path;
    if (!rel || typeof rel !== 'string') return err('要告诉它读哪个文件：path 参数填文件路径（tree 工具里看到的那种相对路径）。');
    const abs = resolveInRoot(rel);
    if (!abs) return err('只能读 data/artifacts/ 里的文件（' + ROOT + '）——你上传给它的文件都在各个工作区里。给的路径在范围外：' + rel);
    let st;
    try { st = fs.statSync(abs); } catch { return err('文件不存在：' + rel + '。先用 tree 工具看看这个工作区里有哪些文件。'); }
    if (st.isDirectory()) return err(rel + ' 是个文件夹，不是文件——read 一次读一个文件。先用 tree 工具看里面有什么。');
    if (st.size > FILE_CAP) return err('文件太大（' + humanSize(st.size) + '），read 读不了这么大的文件。');
    let buf;
    try { buf = fs.readFileSync(abs); } catch (e) { return err('读不了这个文件（' + humanSize(st.size) + '），稍后再试一次。'); }
    if (looksBinary(buf)) return err(rel + ' 不是文本文件（可能是 Excel、图片等），read 读不了它的内容。Excel 表格请先另存为 CSV 再上传，或在右侧文件面板点开预览。');
    let lines = buf.toString('utf8').split(/\r?\n/);
    if (lines.length && lines[lines.length - 1] === '') lines.pop(); // 行数口径=换行终止行
    const total = lines.length;
    let offset = Math.trunc(Number(args.offset) || 0);
    if (offset < 0) offset = 0;
    let limit = Math.trunc(Number(args.limit) || DEFAULT_LINES);
    if (limit < 1) limit = 1;
    if (limit > LIMIT_CAP) limit = LIMIT_CAP;
    if (offset >= total) return err(rel + ' 共 ' + total + ' 行，offset=' + offset + ' 已经在文件末尾之后了。');
    let win = lines.slice(offset, offset + limit);
    // 64KB 上限：从尾部收行直到装得下；单行超限则字节级截断那行
    while (win.length > 1 && Buffer.byteLength(win.join('\n'), 'utf8') > MAX_BYTES) win.pop();
    let byteCut = false;
    if (Buffer.byteLength(win.join('\n'), 'utf8') > MAX_BYTES) {
        const b = Buffer.from(win[0], 'utf8');
        win = [b.subarray(0, MAX_BYTES).toString('utf8')];
        byteCut = true;
    }
    const last = offset + win.length; // 实际读到的末行（1-based 闭区间末）
    let text = rel + ' 共 ' + total + ' 行，本次第 ' + (offset + 1) + '-' + last + ' 行：\n' + win.join('\n');
    if (last < total) text += '\n（后面还有 ' + (total - last) + ' 行没显示：再调用一次 read，offset=' + last + ' 接着读）';
    if (byteCut) text += '\n（这一行太长，按单次 64KB 上限截断了；要后半段换个更小的 offset/limit 分段读）';
    return { content: [{ type: 'text', text }] };
}

function reply(id, result, error) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result, error }) + '\n'); }
function handle(msg) {
    const { id, method } = msg;
    if (method === 'initialize') {
        reply(id, { protocolVersion: (msg.params && msg.params.protocolVersion) || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'read-file', version: '1.0.0' } });
    } else if (method === 'tools/list') {
        reply(id, { tools: [TOOL] });
    } else if (method === 'tools/call') {
        const p = msg.params || {};
        if (p.name !== 'read') reply(id, { content: [{ type: 'text', text: '没有这个工具：' + p.name }], isError: true });
        else reply(id, readTool(p.arguments || {}));
    } else if (id !== undefined && method && !method.startsWith('notifications/')) {
        reply(id, undefined, { code: -32601, message: 'unknown method: ' + method });
    } // notifications/*：按协议不回包
}

let bufIn = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
    bufIn += d;
    let i;
    while ((i = bufIn.indexOf('\n')) >= 0) {
        const line = bufIn.slice(0, i).trim();
        bufIn = bufIn.slice(i + 1);
        if (!line) continue;
        try { handle(JSON.parse(line)); } catch (e) { process.stderr.write('[read-file-mcp] bad line: ' + e.message + '\n'); } // 坏行不杀进程（fail-visible 落 stderr）
    }
});
process.stdin.on('end', () => process.exit(0));
