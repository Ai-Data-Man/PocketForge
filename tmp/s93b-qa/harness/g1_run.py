#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""s93b F1 复验：单棵树降权冷启 → 断言备份链。
用法: python g1_run.py <tag> <root> [--reuse] [--skiprun]
  --reuse   不删树/不解压（二次启动场景）
  --skiprun 只做断言（栈已在跑）
产出证据到 tmp/s93b-qa/<tag>/。
"""
import glob, io, json, os, re, shutil, socket, subprocess, sys, time, zipfile

REPO = r'C:\ZCodeWorks\PocketForge'
PKG = os.path.join(REPO, 'dist', 'PocketForge-20260915-v0.9.13.zip')
HARNESS = os.path.join(REPO, 'tmp', 's93b-qa', 'harness')
NODE = None  # set after extract

PAT = [('FATAL', r'\bFATAL\b'), ('panic', r'\bpanic\b'), ('Access is denied', r'Access is denied'),
       ('不是内部或外部命令', '不是内部或外部命令'), ('ENOENT', r'ENOENT'), ('EADDRINUSE', r'EADDRINUSE'),
       ('FTL', r'\bFTL\b'), ('st-at-obj', r'at Object\.<anonymous>'), ('Traceback', r'Traceback'),
       ('ECONNREFUSED', r'ECONNREFUSED'), ('Unhandled', r'Unhandled|uncaughtException'),
       ('NodeError', r'^Error: '), ('does not exist', r'database .* does not exist')]


def sh(cmd, t=180, **kw):
    return subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True,
                          encoding='utf-8', errors='replace', timeout=t, **kw)


def kill_root(root):
    # 按进程镜像路径（产品 preflight 同款口径）——不用 CommandLine，否则会杀掉自带 argv 路径的 QA shell
    ps = ('Get-CimInstance Win32_Process | Where-Object { '
          '($_.Path -and $_.Path.StartsWith(\'%s\', [StringComparison]::OrdinalIgnoreCase)) -or '
          '($_.Name -eq \'cmd.exe\' -and $_.CommandLine -and $_.CommandLine -like \'*%s*w.cmd*\') '
          '} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
          % (root, root))
    return sh(['powershell', '-NoProfile', '-Command', ps], t=90)


def port_open(p, tmo=0.6):
    s = socket.socket(); s.settimeout(tmo)
    try:
        s.connect(('127.0.0.1', p)); return True
    except OSError:
        return False
    finally:
        s.close()


def healthz(port):
    s = socket.socket(); s.settimeout(2)
    try:
        s.connect(('127.0.0.1', port))
        s.sendall(b'GET /healthz HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n')
        return s.recv(256).split(b'\r\n')[0].decode('latin1')
    except OSError:
        return None
    finally:
        s.close()


def pc(port, *args, ojson=True):
    exe = os.path.join(ROOT, 'bin', 'pc', 'process-compose.exe')
    env = dict(os.environ, PC_DISABLE_TUI='1')
    a = [exe, '-p', str(port), *args]
    if ojson:
        a += ['-o', 'json']
    return sh(a, t=25, env=env, stdin=subprocess.DEVNULL)


def readport(name):
    try:
        return int(open(os.path.join(ROOT, 'data', name)).read().strip())
    except Exception:
        return None


def scan_logs(ev):
    hits = {}
    lg = os.path.join(ROOT, 'data', 'logs')
    if os.path.isdir(lg):
        for f in sorted(os.listdir(lg)):
            p = os.path.join(lg, f)
            if not os.path.isfile(p):
                continue
            try:
                d = open(p, encoding='utf-8', errors='replace').read()
            except OSError:
                continue
            # 去掉欢迎页/probe 噪声：pc.log 中 healthy 探活行
            for name, pat in PAT:
                c = len(re.findall(pat, d, re.M))
                if c:
                    hits['%s::%s' % (f, name)] = c
    return hits


tag, ROOT = sys.argv[1], sys.argv[2]
reuse = '--reuse' in sys.argv
skiprun = '--skiprun' in sys.argv
EVD = os.path.join(REPO, 'tmp', 's93b-qa', tag)
os.makedirs(EVD, exist_ok=True)
out = {'tag': tag, 'root': ROOT}

if not skiprun:
    kill_root(ROOT)
    time.sleep(2)
    if not reuse:
        for _ in range(5):
            if not os.path.isdir(ROOT):
                break
            shutil.rmtree(ROOT, ignore_errors=True)
            time.sleep(2)
        os.makedirs(ROOT, exist_ok=True)
        t0 = time.time()
        with zipfile.ZipFile(PKG) as z:
            z.extractall(ROOT)
        out['extract_s'] = round(time.time() - t0, 1)
    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    open(os.path.join(ROOT, 'data', 'welcome.done'), 'w').write('s93b-pre-set\n')
    log = os.path.join(ROOT, 'launch.log')
    wrap = os.path.join(ROOT, 'w.cmd')
    subprocess.run(['python', os.path.join(HARNESS, 'mk_wrap.py'), ROOT, log, wrap], check=True)
    t0 = time.time()
    r = subprocess.run(['cmd', '/c', 'runas', '/trustlevel:0x20000', wrap],
                       capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
    out['runas_rc'] = r.returncode
    pr = subprocess.run(['python', os.path.join(HARNESS, 'poll_ready.py'), ROOT, log, '120', str(t0)],
                        capture_output=True, text=True, timeout=180)
    out['poll'] = (pr.stdout or '')[-400:]
    out['ready'] = pr.returncode == 0
    if not out['ready']:
        print(json.dumps(out, ensure_ascii=False)); sys.exit(2)

# ---- 等 daily-backup 收尾 ----
pcp = readport('pc.port')
deadline = time.time() + 150
state, raw = {}, ''
while time.time() < deadline:
    r = pc(pcp, 'process', 'get', 'daily-backup')
    raw = r.stdout
    for line in reversed(r.stdout.strip().splitlines()):
        try:
            j = json.loads(line)
            if isinstance(j, dict):
                state = j
                break
        except Exception:
            continue
    st = str(state.get('status') or state.get('state') or '')
    if st and st.lower() not in ('running', 'launching', 'pending', 'launched'):
        break
    time.sleep(3)
out['daily_backup_state'] = {k: v for k, v in state.items()
                             if k in ('name', 'status', 'state', 'exit_code', 'is_running', 'age')}
out['pc_get_raw'] = raw[-600:]
open(os.path.join(EVD, 'pc-get-daily-backup.json'), 'w', encoding='utf-8').write(
    json.dumps(state, ensure_ascii=False, indent=1)[:4000])

# ---- 收集证据 ----
time.sleep(2)
bdir = os.path.join(ROOT, 'data', 'backups')
ddir = os.path.join(ROOT, 'data', 'pg-dumps')
files = lambda d: sorted(os.listdir(d)) if os.path.isdir(d) else []
out['backups'] = [f + ':' + str(os.path.getsize(os.path.join(bdir, f))) for f in files(bdir)]
out['dumps'] = [f + ':' + str(os.path.getsize(os.path.join(ddir, f))) for f in files(ddir)]
out['dumps_zip'] = bool([f for f in files(bdir)])
bl = os.path.join(ROOT, 'data', 'logs', 'backup.log')
out['backup_log'] = open(bl, encoding='utf-8', errors='replace').read()[-1500:] if os.path.exists(bl) else '<absent>'
out['hits'] = scan_logs(EVD)
out['pg_log_size'] = os.path.getsize(os.path.join(ROOT, 'data', 'logs', 'pg.log')) \
    if os.path.exists(os.path.join(ROOT, 'data', 'logs', 'pg.log')) else -1
bp = readport('bridge.port') or 8790
out['bridge_healthz'] = healthz(bp)
out['ports_open'] = {n: port_open(readport(n)) for n in ('pc.port', 'faucet.port', 'pg.port') }

# 拷贝关键证据
def copy(rel, name):
    src = os.path.join(ROOT, rel.replace('/', os.sep))
    if os.path.isfile(src):
        shutil.copy(src, os.path.join(EVD, name))

copy('data/logs/backup.log', tag + '-backup.log')
copy('data/logs/pc.log', tag + '-pc.log')
copy('data/logs/pg.log', tag + '-pg.log')
copy('launch.log', tag + '-launch.log')
shutil.copy(os.path.join(ROOT, 'w.cmd'), os.path.join(EVD, 'w.cmd'))

# 全日志打包（红项留证场景）
with zipfile.ZipFile(os.path.join(EVD, tag + '-logs.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    lg = os.path.join(ROOT, 'data', 'logs')
    if os.path.isdir(lg):
        for f in os.listdir(lg):
            p = os.path.join(lg, f)
            if os.path.isfile(p):
                z.write(p, 'data/logs/' + f)

# 清挂起 wrapper（launcher 尾部 pause 持 launch.log 句柄，阻删树）
sh(['powershell', '-NoProfile', '-Command',
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine "
    "-like '*%s*w.cmd*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force "
    "-ErrorAction SilentlyContinue }" % ROOT], t=60)
open(os.path.join(EVD, 'result.json'), 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1))
print(json.dumps(out, ensure_ascii=False, indent=1))
