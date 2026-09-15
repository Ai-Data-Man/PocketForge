#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""s93b: 轮询 bridge healthz（裸 socket，零代理）直到 200。
用法: python poll_ready.py <root> <log> <timeout_s> [start_epoch]
exit 0=ready；非 0=超时（打最后 30 行启动日志）
"""
import os, socket, sys, time

root, logf, tmo = sys.argv[1], sys.argv[2], float(sys.argv[3])
t0 = float(sys.argv[4]) if len(sys.argv) > 4 else time.time()


def healthz(port):
    try:
        s = socket.create_connection(('127.0.0.1', port), 2)
    except OSError:
        return None
    try:
        s.sendall(b'GET /healthz HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n')
        data = s.recv(256)
        return data.split(b'\r\n')[0].decode('latin1')
    except OSError:
        return None
    finally:
        s.close()


while time.time() - t0 < tmo:
    port = None
    pf = os.path.join(root, 'data', 'bridge.port')
    if os.path.exists(pf):
        try:
            port = int(open(pf).read().strip())
        except ValueError:
            port = None
    if port is None:
        port = 8790
    if healthz(port) == 'HTTP/1.1 200 OK':
        print('READY bridge healthz 200 on %d after %.1fs' % (port, time.time() - t0))
        sys.exit(0)
    time.sleep(1.5)

print('TIMEOUT after %.1fs' % (time.time() - t0))
if os.path.exists(logf):
    lines = open(logf, encoding='utf-8', errors='replace').read().splitlines()
    print('\n'.join(lines[-30:]))
sys.exit(1)
