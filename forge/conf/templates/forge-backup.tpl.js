// PocketForge backup: zip portable state into data/backups/, keep newest N.
// Sources: data/faucet data/sqlite data/js conf/goose/config (memory/hints/recipes).
// Runs as pc-managed oneshot (e.g. daily via goose schedule or pc cron-like restart).
// Usage: node forge-backup.js <FORGE_ROOT> [keep=7]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.argv[2];
const KEEP = Number(process.argv[3] || 7);
const OUT_DIR = path.join(ROOT, 'data', 'backups');
const SOURCES = ['data/faucet', 'data/sqlite', 'data/js', 'conf/goose/config']
    .map(s => path.join(ROOT, s).replace(/\\/g, '/'))
    .filter(p => fs.existsSync(p)); // tolerate missing dirs (fresh install)

fs.mkdirSync(OUT_DIR, { recursive: true });
if (SOURCES.length === 0) { console.log('nothing to back up'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.join(OUT_DIR, `forge-backup-${stamp}.zip`).replace(/\\/g, '/');

const first = SOURCES.shift();
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${first}' -DestinationPath '${out}' -Force"`, { stdio: 'pipe' });
for (const s of SOURCES) {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${s}' -DestinationPath '${out}' -Update"`, { stdio: 'pipe' });
}

// prune old (keep newest N)
const backups = fs.readdirSync(OUT_DIR).filter(f => f.startsWith('forge-backup-')).sort();
let removed = 0;
while (backups.length > KEEP) { fs.unlinkSync(path.join(OUT_DIR, backups.shift())); removed++; }

const size = fs.statSync(out).size;
console.log(`backup ok: ${path.basename(out)} (${(size/1024).toFixed(0)}KB) kept=${backups.length} pruned=${removed}`);
