#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""s93b: 停止矩阵 — 跑产品停止脚本（GBK wrapper，stdin=nul 免 pause 挂起）并断言零残留。
用法: python stop_run.py <tag> <root>
"""
import json, os, socket, subprocess, sys, time

REPO = r'C:\ZCodeWorks\PocketForge'
tag, ROOT = sys.argv[1], sys.argv[2]
EVD = os.path.join(REPO, 'tmp', 's93b-qa', tag)
os.makedirs(EVD, exist_ok=True)


def sh(cmd, t=180):
    return subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True,
                          encoding='utf-8', errors='replace', timeout=t, stdin=subprocess.DEVNULL)


def procs_under(root):
    ps = ("Get-CimInstance Win32_Process | Where-Object { $_.Path -and "
          "$_.Path.StartsWith('%s',[StringComparison]::OrdinalIgnoreCase) } | "
          "Select-Object -ExpandProperty Name" % root)
    r = sh(['powershell', '-NoProfile', '-Command', ps], t=90)
    names = [l.strip() for l in r.stdout.splitlines() if l.strip()]
    import collections
    return dict(collections.Counter(names))


def port_open(p):
    s = socket.socket(); s.settimeout(0.6)
    try:
        s.connect(('127.0.0.1', p)); return True
    except OSError:
        return False
    finally:
        s.close()


def readport(n):
    try:
        return int(open(os.path.join(ROOT, 'data', n)).read().strip())
    except Exception:
        return None


wrap = os.path.join(ROOT, 'stop.cmd')
body = ('@echo off\r\nchcp 936 >nul\r\n'
        'set "PATH=C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem;'
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0"\r\n'
        'call "%s\\\u505c\u6b62\u6570\u5b57\u5458\u5de5.cmd" <nul > "%s\\stop-%s.log" 2>&1\r\n'
        % (ROOT, ROOT, tag))
open(wrap, 'wb').write(body.encode('gbk'))

t0 = time.time()
r = subprocess.run(['cmd', '/c', wrap], capture_output=True, text=True, timeout=180,
                   stdin=subprocess.DEVNULL)
el = time.time() - t0
time.sleep(3)
out = {'tag': tag, 'elapsed_s': round(el, 1), 'rc': r.returncode,
       'stdout': (r.stdout or '')[-500:],
       'stoplog': open(os.path.join(ROOT, 'stop-%s.log' % tag), encoding='utf-8', errors='replace')
                    .read()[-600:] if os.path.exists(os.path.join(ROOT, 'stop-%s.log' % tag)) else '<absent>',
       'residual_procs': procs_under(ROOT),
       'ports': {n: port_open(p) for n, p in
                 (('pc', readport('pc.port')), ('faucet', readport('faucet.port')), ('pg', readport('pg.port')))
                 if p}}
open(os.path.join(EVD, tag + '-stop.json'), 'w', encoding='utf-8').write(
    json.dumps(out, ensure_ascii=False, indent=1))
print(json.dumps(out, ensure_ascii=False, indent=1))
