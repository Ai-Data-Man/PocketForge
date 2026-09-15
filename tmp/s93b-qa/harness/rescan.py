#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""s93b: 停机后全量扫描（终态日志，无 mid-write 截断）+ 备份链终态断言。
用法: python rescan.py <tag> <root>
"""
import json, os, re, sys, zipfile

REPO = r'C:\ZCodeWorks\PocketForge'
tag, ROOT = sys.argv[1], sys.argv[2]
EVD = os.path.join(REPO, 'tmp', 's93b-qa', tag)
os.makedirs(EVD, exist_ok=True)
PAT = [('FATAL', r'\bFATAL\b'), ('panic', r'\bpanic\b'), ('Access is denied', r'Access is denied'),
       ('不是内部或外部命令', '不是内部或外部命令'), ('ENOENT', r'ENOENT'), ('EADDRINUSE', r'EADDRINUSE'),
       ('FTL', r'\bFTL\b'), ('st-at-obj', r'at Object\.<anonymous>'), ('Traceback', r'Traceback'),
       ('ECONNREFUSED', r'ECONNREFUSED'), ('Unhandled', r'Unhandled|uncaughtException'),
       ('NodeError', r'^Error: '), ('node-stack', r'^\s+at .*\.js:\d+')]

lg = os.path.join(ROOT, 'data', 'logs')
sizes, hits = {}, {}
if os.path.isdir(lg):
    for f in sorted(os.listdir(lg)):
        p = os.path.join(lg, f)
        if not os.path.isfile(p):
            continue
        d = open(p, encoding='utf-8', errors='replace').read()
        sizes[f] = len(d)
        for n, pat in PAT:
            c = len(re.findall(pat, d, re.M))
            if c:
                hits['%s::%s' % (f, n)] = c
out = {'tag': tag, 'log_sizes': sizes, 'hits': hits,
       'backups': sorted(os.listdir(os.path.join(ROOT, 'data', 'backups')))
                  if os.path.isdir(os.path.join(ROOT, 'data', 'backups')) else [],
       'dumps': sorted(os.listdir(os.path.join(ROOT, 'data', 'pg-dumps')))
                if os.path.isdir(os.path.join(ROOT, 'data', 'pg-dumps')) else []}
bl = os.path.join(lg, 'backup.log')
out['backup_log'] = open(bl, encoding='utf-8', errors='replace').read()[-2000:] if os.path.exists(bl) else '<absent>'
with zipfile.ZipFile(os.path.join(EVD, tag + '-logs-final.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    if os.path.isdir(lg):
        for f in os.listdir(lg):
            p = os.path.join(lg, f)
            if os.path.isfile(p):
                z.write(p, 'data/logs/' + f)
open(os.path.join(EVD, tag + '-rescan.json'), 'w', encoding='utf-8').write(
    json.dumps(out, ensure_ascii=False, indent=1))
print(json.dumps(out, ensure_ascii=False, indent=1))
