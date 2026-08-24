#!/usr/bin/env node
// 制品版本管理 CLI（ADR-0007）：给 agent 用；每个对话一个工作区目录（data/artifacts/ws-*），引擎 = vendored isomorphic-git(MIT)
// 用法：
//   node bin/artifact-vcs.js snapshot data/artifacts/<工作区> data/artifacts/<工作区>/<文件> -m "<大白话说明为什么改>"
//   node bin/artifact-vcs.js log      data/artifacts/<工作区> data/artifacts/<工作区>/<文件>
//   node bin/artifact-vcs.js restore  data/artifacts/<工作区> data/artifacts/<工作区>/<文件> <版本号>
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const ROOT = process.env.FORGE_ROOT || path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'data', 'artifacts');
const git = require(path.join(__dirname, 'vendor', 'artifact-vcs', 'node_modules', 'isomorphic-git'));

function safeSeg(p, allowEmpty) {
    const rel = String(p || '').split('\\').join('/').replace(/^data\/artifacts\//, '').replace(/\/+$/, '');
    if ((!rel && !allowEmpty) || rel.includes('..') || rel.includes(':') || rel.startsWith('/')) return null;
    return rel;
}
function fmtTime(ts) {
    const d = new Date(ts * 1000), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function resolveWs(arg) {
    // 接受完整路径 data/artifacts/ws-xxx 或裸 ws id
    const seg = safeSeg(arg);
    if (!seg) return null;
    const id = seg.startsWith('ws-') ? seg.split('/')[0] : seg;
    if (!/^ws-[0-9]{4}-[0-9]{6}[a-z]*$/.test(id) && id !== 'ws-imported') return null;
    const dir = path.join(ART, id);
    return fs.existsSync(dir) ? { id, dir } : null;
}

async function main() {
    const [cmd, wsArg, fileArg] = process.argv.slice(2);
    const wsr = resolveWs(wsArg);
    let rel = safeSeg(fileArg);
    // 文档用法里文件参数带工作区前缀：data/artifacts/<ws>/<file> —— 去掉重复前缀
    if (wsr && rel && rel.startsWith(wsr.id + '/')) rel = rel.slice(wsr.id.length + 1);
    if (!cmd || !wsr || !rel) {
        console.log('用法: node bin/artifact-vcs.js <snapshot|log|restore> <工作区目录> <工作区内文件路径> [-m 说明|版本号]');
        console.log('例:   node bin/artifact-vcs.js snapshot data/artifacts/ws-0824-171201 data/artifacts/ws-0824-171201/报表.xlsx -m "加了合计列"');
        process.exit(1);
    }
    const full = path.join(wsr.dir, rel.split('/').join(path.sep));
    if (cmd === 'snapshot') {
        const mi = process.argv.indexOf('-m');
        const msg = (mi > -1 && process.argv[mi + 1]) ? process.argv[mi + 1] : ('更新 ' + rel);
        if (!fs.existsSync(full)) { console.error('文件不存在: ' + wsr.id + '/' + rel); process.exit(1); }
        try { await git.stat({ fs: fsp, dir: wsr.dir, filepath: rel }); } catch { await git.init({ fs: fsp, dir: wsr.dir, defaultBranch: 'main' }); }
        await git.add({ fs: fsp, dir: wsr.dir, filepath: rel });
        const oid = await git.commit({ fs: fsp, dir: wsr.dir, message: msg, author: { name: '小forge', email: 'forge@local' } });
        console.log('已存一版 ' + rel.slice(rel.lastIndexOf('/') + 1) + '（' + msg.trim() + '）版本号 ' + oid.slice(0, 10));
    } else if (cmd === 'log') {
        let logs = [];
        try { logs = await git.log({ fs: fsp, dir: wsr.dir, filepath: rel }); } catch {}
        if (!logs.length) { console.log('该文件还没有历史版本（改动过一次后就有）'); return; }
        for (const l of logs) console.log(fmtTime(l.commit.author.timestamp) + '  ' + l.oid.slice(0, 10) + '  ' + String(l.commit.message || '').trim().split('\n')[0]);
    } else if (cmd === 'restore') {
        const short = String(process.argv[5] || '').replace(/[^0-9a-f]/g, '');
        if (!short) { console.error('要给出版本号（用 log 命令查）；用法: restore <工作区> <文件> <oid>'); process.exit(1); }
        try { await git.add({ fs: fsp, dir: wsr.dir, filepath: rel }); await git.commit({ fs: fsp, dir: wsr.dir, message: '恢复前自动保存当前版', author: { name: '小forge', email: 'forge@local' } }); } catch {}
        const full40 = short.length === 40 ? short : await git.expandOid({ fs: fsp, dir: wsr.dir, oid: short });
        const b = await git.readBlob({ fs: fsp, dir: wsr.dir, oid: full40, filepath: rel });
        await fsp.writeFile(full, Buffer.from(b.blob));
        await git.add({ fs: fsp, dir: wsr.dir, filepath: rel });
        await git.commit({ fs: fsp, dir: wsr.dir, message: '已恢复到 ' + short.slice(0, 6) + ' 那一版', author: { name: '小forge', email: 'forge@local' } });
        console.log('已把 ' + wsr.id + '/' + rel + ' 恢复到旧版（恢复前的内容也自动存了一版，放心）');
    } else {
        console.error('未知命令: ' + cmd);
        process.exit(1);
    }
}
main().catch(e => { console.error('失败: ' + e.message); process.exit(1); });
