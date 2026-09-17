# True EOF probe: mirrors goose v1.50 shell tool wait semantics
# (child.wait() for cmd.exe, then read the stdout/stderr pipes until EOF).
# Usage: eof_probe.py "<command line passed to cmd /d /c>" [deadline_secs]
import os, subprocess, sys, threading, time

line = sys.argv[1]
deadline = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
t0 = time.time()
p = subprocess.Popen(['cmd', '/d', '/c', line],
                     stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                     stdin=subprocess.DEVNULL)
chunks = []          # (stream, abs_time_since_t0, bytes)
eof = {}             # stream -> time

def reader(stream, tag):
    fd = stream.fileno()
    while True:
        try:
            b = os.read(fd, 4096)
        except OSError:
            break
        if not b:
            break
        chunks.append((tag, time.time() - t0, b))
    eof[tag] = time.time() - t0

ts = {s: threading.Thread(target=reader, args=(getattr(p, s), s), daemon=True) for s in ('stdout', 'stderr')}
for t in ts.values(): t.start()

cmd_exit = None
while time.time() - t0 < deadline:
    if cmd_exit is None and p.poll() is not None:
        cmd_exit = time.time() - t0
    if cmd_exit is not None and not (ts['stdout'].is_alive() or ts['stderr'].is_alive()):
        break
    time.sleep(0.01)

all_eof = 'stdout' in eof and 'stderr' in eof
eof_at = max(eof.values()) if eof else None
post = [ (tag, round(ts_, 2), b[:80].decode('utf8', 'replace').strip()) for tag, ts_, b in chunks
         if cmd_exit is not None and ts_ > cmd_exit + 0.05 ]
print({
    'cmdExitMs': None if cmd_exit is None else round(cmd_exit * 1000),
    'stdoutEofMs': None if 'stdout' not in eof else round(eof['stdout'] * 1000),
    'stderrEofMs': None if 'stderr' not in eof else round(eof['stderr'] * 1000),
    'eofReached': all_eof,
    'verdict': ('HANG_NO_EOF' if not all_eof else
                ('EOF_DELAYED_AFTER_CMD_EXIT' if eof_at - (cmd_exit or 0) > 2.0 else 'EOF_WITH_CMD_EXIT')),
    'bytesAfterCmdExit': post[:6],
    'stdout': b''.join(b for tag, _, b in chunks if tag == 'stdout').decode('utf8', 'replace')[:1200],
    'stderr': b''.join(b for tag, _, b in chunks if tag == 'stderr').decode('utf8', 'replace')[:600],
})
