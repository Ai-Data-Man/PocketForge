#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""s93c F3 定点复验汇总：逐树读证据 → 打印 F3 放行条件判定表。
用法: python f3_verdict.py <root-prefix> <tag> [<tag> ...]
"""
import json, os, re, sys, zipfile

PREFIX = sys.argv[1]
REPO = r'C:\ZCodeWorks\PocketForge'
EVD = os.path.join(REPO, 'tmp', 's93c-qa')
PATS = [('FATAL', r'\bFATAL\b'), ('ENOENT', r'ENOENT'), ('panic', r'panic'),
        ('Traceback', r'Traceback'), ('does-not-exist', r'database .* does not exist'),
        ('EADDRINUSE', r'EADDRINUSE'), ('denied', r'Access is denied'),
        ('bad-cmd', '不是内部或外部命令'), ('st-at-obj', r'at Object\.<anonymous>'),
        ('ECONNREFUSED', r'ECONNREFUSED'), ('Unhandled', r'Unhandled|uncaughtException')]
FAIL = 0
for tag in sys.argv[2:]:
    root = os.path.join(PREFIX, tag)
    ev = os.path.join(EVD, tag)
    res = json.load(open(os.path.join(ev, 'result.json'), encoding='utf-8'))
    scans = json.load(open(os.path.join(ev, tag + '-rescan.json'), encoding='utf-8'))
    # 终态日志 zip（停机后落盘 = 权威口径）
    final, hits = {}, {}
    zp = os.path.join(ev, tag + '-logs-final.zip')
    if os.path.exists(zp):
        with zipfile.ZipFile(zp) as z:
            for n in z.namelist():
                d = z.read(n).decode('utf-8', 'replace')
                final[os.path.basename(n)] = len(d)
                for pn, pat in PATS:
                    c = len(re.findall(pat, d, re.M))
                    if c:
                        hits['%s::%s' % (os.path.basename(n), pn)] = c
    # 1) daily-backup exit 0
    m = re.search(r'"exit_code":\s*(-?\d+)', res.get('pc_get_raw', ''))
    exit0 = m is not None and m.group(1) == '0'
    # 2) 两库 dump
    dumps = [f.split(':')[0] for f in res['dumps']]
    have_pg = any(f.startswith('pg-') and f.endswith('.sql') for f in dumps)
    have_bridge = any(f.startswith('pg-bridge-') for f in dumps)
    # 3) zip 产出 + 内含 pg-dumps
    zpk = [f for f in res['backups']]
    inzip = False
    if zpk:
        p = os.path.join(root, 'data', 'backups', zpk[0].split(':')[0])
        if os.path.exists(p):
            with zipfile.ZipFile(p) as z:
                inzip = any(n.startswith('pg-dumps/') for n in z.namelist())
    # 4) 用户可见控制台（launch log 拷贝）复扫
    lc = os.path.join(ev, tag + '-launch.log')
    lhits = {}
    if os.path.exists(lc):
        d = open(lc, encoding='utf-8', errors='replace').read()
        for pn, pat in PATS:
            c = len(re.findall(pat, d, re.M))
            if c:
                lhits[pn] = c
    ok = exit0 and have_pg and have_bridge and inzip and not hits and not lhits
    FAIL += 0 if ok else 1
    print('== %s %s' % (tag, 'PASS' if ok else '*** FAIL ***'))
    print('   ready=%s(%s) exit0=%s dumps[pg=%s bridge=%s]=%s zip=%s zip-has-pg-dumps=%s' % (
        res['ready'], res.get('poll', '').strip(), exit0, have_pg, have_bridge, dumps, zpk, inzip))
    print('   终态日志: %s' % final)
    print('   终态命中: %s | 控制台命中: %s' % (hits or 'none', lhits or 'none'))
print('\nRESULT: %s (%d/%d)' % ('ALL PASS' if FAIL == 0 else '%d FAIL' % FAIL,
                               len(sys.argv) - 2, len(sys.argv) - 2))
sys.exit(1 if FAIL else 0)
