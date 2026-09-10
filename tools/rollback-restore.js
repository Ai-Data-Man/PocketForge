// 主线5 tombstone 恢复脚本（补篇裁决 2026-09-08 §2：修复路径，不是产品功能——触发条件=用户报告+qa 发现）。
// 读 data/rewrite-tombstones/<sid>-<序号>.jsonl → 事务内按原 id 序 INSERT 回 messages →（人工）打开对话验证。
// 用法：node tools/rollback-restore.js <forge根目录> <sid> [序号]   （序号缺省=该 sid 最新一次手术）
// 注意：恢复前该对话不能有人在用（goose 内存态不含被删内容，INSERT 回后需重新打开对话才会重放）。
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const [, , ROOT, SID, SEQ] = process.argv;
if (!ROOT || !SID || !/^[\w-]{1,128}$/.test(SID)) { console.error('用法: node tools/rollback-restore.js <forge根目录> <sid> [序号]'); process.exit(2); }
const dir = path.join(ROOT, 'data', 'rewrite-tombstones');
const re = new RegExp('^' + SID + '-(\\d+)\\.jsonl$');
let seqs = [];
try { seqs = fs.readdirSync(dir).map(f => (f.match(re) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b); } catch {}
if (!seqs.length) { console.error('没有找到 ' + SID + ' 的撤回备份文件'); process.exit(1); }
const seq = SEQ ? Number(SEQ) : seqs[seqs.length - 1];
if (!seqs.includes(seq)) { console.error('序号 ' + seq + ' 不存在；可用: ' + seqs.join(', ')); process.exit(1); }
const file = path.join(dir, SID + '-' + seq + '.jsonl');
const rows = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
const COLS = ['id', 'message_id', 'session_id', 'role', 'content_json', 'created_timestamp', 'timestamp', 'tokens', 'metadata_json'];
for (const r of rows) { if (r.session_id !== SID) { console.error('tombstone 内混入别的会话行，中止'); process.exit(1); } }
const db = new DatabaseSync(path.join(ROOT, 'conf', 'goose', 'data', 'sessions', 'sessions.db'));
db.exec('PRAGMA busy_timeout=30000');
db.exec('BEGIN IMMEDIATE');
try {
    const ins = db.prepare('INSERT INTO messages (' + COLS.join(',') + ') VALUES (' + COLS.map(() => '?').join(',') + ')');
    for (const r of rows) ins.run(...COLS.map(c => (r[c] === null || r[c] === undefined) ? null : r[c]));
    db.exec('COMMIT');
} catch (e) { db.exec('ROLLBACK'); db.close(); console.error('恢复失败（已回滚，库未动）: ' + e.message); process.exit(1); }
db.close();
console.log('已按原 id 序恢复 ' + rows.length + ' 行（' + path.basename(file) + '）。重新打开该对话即可看到恢复后的历史。');
