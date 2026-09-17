import json, os, subprocess, sys, threading, time

PC = r"C:\PF-TEST\s95a\bin\pc\process-compose.exe"
CWD = r"C:\PF-TEST\pf-f3-pc"
ADD = sys.argv[2] if len(sys.argv) > 2 else 'add.yaml'
LINE = 'cd /d %s && %s -p 8097 project update -f base.yaml -f %s' % (CWD, PC, ADD)
deadline = float(sys.argv[1]) if len(sys.argv) > 1 else 15.0
t0 = time.time()
p = subprocess.Popen(['cmd', '/d', '/c', LINE], stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL)
chunks, eof = [], {}

def reader(stream, tag):
    fd = stream.fileno()
    while True:
        try: b = os.read(fd, 4096)
        except OSError: break
        if not b: break
        chunks.append((tag, time.time() - t0, b))  # raw bytes, decode later
    eof[tag] = time.time() - t0
ts = {s: threading.Thread(target=reader, args=(getattr(p, s), s), daemon=True) for s in ('stdout', 'stderr')}
for t in ts.values(): t.start()

def tree(tag):
    ps = ('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Where-Object { $_.Name -in @("process-compose.exe","node.exe","cmd.exe") } | '
          'Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress')
    out = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True).stdout.decode('utf-8','replace').strip()
    try: rows = json.loads(out) if out.startswith('[') else [json.loads(out)]
    except Exception: rows = []
    keep = [r for r in rows if r and (('pf-f3-pc' in (r.get('CommandLine') or '')) or r['ProcessId'] == p.pid)]
    rows2 = [{'pid': r['ProcessId'], 'ppid': r['ParentProcessId'], 'name': r['Name'], 'cmd': (r.get('CommandLine') or '')[:110]} for r in keep]
    print(tag, 'clientPid=%s' % p.pid, json.dumps(rows2, ensure_ascii=False))

cmd_exit = None
while time.time() - t0 < deadline:
    if cmd_exit is None and p.poll() is not None:
        cmd_exit = time.time() - t0
        print('T+%.2fs client cmd.exe exited rc=%s' % (cmd_exit, p.returncode))
    if not hasattr(tree, '_done') and time.time() - t0 > 1.2:
        tree._done = True; tree('TREE@1.2s')
    if cmd_exit is not None and not (ts['stdout'].is_alive() or ts['stderr'].is_alive()):
        break
    time.sleep(0.02)

all_eof = 'stdout' in eof and 'stderr' in eof
tree('TREE@end')
print(json.dumps({
  'cmdExitMs': None if cmd_exit is None else round(cmd_exit*1000),
  'stdoutEofMs': None if 'stdout' not in eof else round(eof['stdout']*1000),
  'stderrEofMs': None if 'stderr' not in eof else round(eof['stderr']*1000),
  'eofReached': all_eof,
  'bytesAfterCmdExit': [(tag, round(ts_,2), b[:100].decode("utf8","replace").strip()) for tag, ts_, b in chunks if cmd_exit and ts_ > cmd_exit + 0.05][:8],
  'stdout': b''.join(b for tag,_,b in chunks if tag=='stdout').decode('utf8','replace')[:900],
  'stderr': b''.join(b for tag,_,b in chunks if tag=='stderr').decode('utf8','replace')[:500],
}, ensure_ascii=False))
