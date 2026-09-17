// grandchild: long-lived, writes heartbeat to fd1 (its stdout), exits after GRAND_MS
const GRAND_MS = Number(process.argv[2] || 8000);
let n = 0;
const t0 = Date.now();
const iv = setInterval(() => {
  n++;
  try { process.stdout.write('grand-beat ' + n + ' t=' + (Date.now() - t0) + '\n'); } catch (e) {}
}, 1000);
setTimeout(() => { clearInterval(iv); process.exit(0); }, GRAND_MS);
process.stdout.write('grand-start pid=' + process.pid + ' will-exit-at=' + GRAND_MS + 'ms\n');
