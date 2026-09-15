#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""s93b G2 抽检：High shell 直跑启动器 → 断言自动降权重开（两行人话）+ 就绪 + pc 单实例。
用法: python g2check.py <tag> <root>
"""
import json, os, subprocess, sys, time

REPO = r'C:\ZCodeWorks\PocketForge'
tag, ROOT = sys.argv[1], sys.argv[2]
EVD = os.path.join(REPO, 'tmp', 's93b-qa', tag)
os.makedirs(EVD, exist_ok=True)


def sh(c, t=180):
    return subprocess.run(c, shell=isinstance(c, str), capture_output=True, text=True,
                          encoding='utf-8', errors='replace', timeout=t, stdin=subprocess.DEVNULL)


def procs(name):
    ps = ("@(Get-CimInstance Win32_Process | Where-Object { $_.Path -and "
          "$_.Path.StartsWith('%s',[StringComparison]::OrdinalIgnoreCase) -and $_.Name -eq '%s' }).Count"
          % (ROOT, name))
    r = sh(['powershell', '-NoProfile', '-Command', ps])
    return r.stdout.strip().splitlines()[-1] if r.stdout.strip() else '?'


log = os.path.join(ROOT, 'launch-g2check.log')
wrap = os.path.join(ROOT, 'w2.cmd')
body = ('@echo off\r\nchcp 936 >nul\r\n'
        'set "PATH=C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem;'
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0"\r\n'
        'call "%s\\\u542f\u52a8\u6570\u5b57\u5458\u5de5.cmd" > "%s" 2>&1\r\n' % (ROOT, log))
open(wrap, 'wb').write(body.encode('gbk'))

t0 = time.time()
p = subprocess.Popen(['cmd', '/c', wrap], stdin=subprocess.DEVNULL)
pr = sh(['python', os.path.join(REPO, 'tmp', 's93b-qa', 'harness', 'poll_ready.py'),
         ROOT, log, '120', str(t0)], t=180)
txt = open(log, encoding='utf-8', errors='replace').read() if os.path.exists(log) else ''
out = {'tag': tag, 'pc_procs': procs('process-compose.exe'), 'ready': pr.returncode == 0,
       'poll': (pr.stdout or '')[-300:],
       'detect_admin': '管理员身份启动' in txt, 'relaunch_line': '自动改用普通权限重新启动' in txt,
       'log_tail': txt[-800:]}
try:
    p.wait(timeout=20)
except subprocess.TimeoutExpired:
    out['launcher_rc'] = 'still-running'
open(os.path.join(EVD, tag + '-g2check.json'), 'w', encoding='utf-8').write(
    json.dumps(out, ensure_ascii=False, indent=1))
print(json.dumps(out, ensure_ascii=False, indent=1))
