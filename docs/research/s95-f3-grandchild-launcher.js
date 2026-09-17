// intermediate: spawns grandchild per MODE then exits (mirrors pc.exe exiting after project update)
const { spawn } = require('child_process');
const mode = process.argv[2];
const GRAND_MS = process.argv[3] || '8000';
const GRAND = 'C:/PF-TEST/pf-f3-mech/gm-grand.js';
const NODE = process.execPath;
const t0 = Date.now();
let g = null;
try {
  if (mode === 'node-inherit') g = spawn(NODE, [GRAND, GRAND_MS], { stdio: 'inherit' });
  else if (mode === 'node-ignore') g = spawn(NODE, [GRAND, GRAND_MS], { stdio: ['ignore', 'ignore', 'ignore'] });
  else if (mode === 'node-piped') g = spawn(NODE, [GRAND, GRAND_MS], { stdio: ['ignore', 'pipe', 'pipe'] });
  else if (mode === 'node-detached') g = spawn(NODE, [GRAND, GRAND_MS], { stdio: ['ignore', 'ignore', 'ignore'], detached: true });
  else if (mode === 'cmd-start-b') g = spawn(process.env.COMSPEC || 'cmd.exe', ['/d', '/c', 'start "" /b "' + NODE + '" ' + GRAND + ' ' + GRAND_MS], { stdio: 'inherit' });
  else if (mode === 'cmd-nul-redirect') g = spawn(process.env.COMSPEC || 'cmd.exe', ['/d', '/c', NODE + ' ' + GRAND + ' ' + GRAND_MS + ' >nul 2>&1'], { stdio: 'inherit' });
  else if (mode === 'no-grand') g = null;
  else throw new Error('unknown mode ' + mode);
} catch (e) { console.log('child-spawn-error ' + e.message); process.exit(3); }
if (g && g.unref) { try { g.unref(); } catch (e) {} }
console.log('child-grand-pid=' + (g && g.pid) + ' mode=' + mode + ' at=' + (Date.now() - t0));
setTimeout(() => process.exit(0), 200);
