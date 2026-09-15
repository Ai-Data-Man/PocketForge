#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""s93b: 生成降权冷启 wrapper（GBK+CRLF，wrapper 内先 chcp 936，纯净 PATH 复刻真实双击）。
用法: python mk_wrap.py <root> <logfile> <wrapperpath> [extra_cmd]
"""
import sys

root, logf, wrap = sys.argv[1], sys.argv[2], sys.argv[3]
extra = sys.argv[4] if len(sys.argv) > 4 else ''
body = ('@echo off\r\n'
        'chcp 936 >nul\r\n'
        'set "PATH=C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem;'
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0"\r\n'
        'call "%s\\\u542f\u52a8\u6570\u5b57\u5458\u5de5.cmd" > "%s" 2>&1\r\n' % (root, logf))
if extra:
    body += extra + '\r\n'
data = body.encode('gbk')
assert b'\xc6\xf4' in data, 'GBK bytes missing'
open(wrap, 'wb').write(data)
print('wrapper written', wrap)
