// s66/ADR-0011 阶段二: pg readiness TCP 探活（pc exec 经 cmd /C，内联 -e 会被 Go->cmd->argv 三层
// 引号转义破坏——实证见 tmp/s66-readiness-tcp-experiment.log，故落文件；真相源=本模板，bootstrap 生成）。
// 用法: node pg-probe.js <data/pg.port 路径>。连通 exit 0；拒绝/超时(2s)/文件缺失 exit 1。
// s67: 连通后 s.end() 优雅半关再退——此前裸 process.exit 带开 socket 强杀进程，postgres 每探针
// 收 RST 记 COMMERROR "could not receive data from client"（实测约 4.5MB/天）；FIN 先行使 postgres
// 走 backend_startup.c ProcessStartupPacket 首字节 EOF 静默分支。close=服务器已处理完我们的 EOF
// 的同步点（其回包可能是 RST——Windows 上 STATUS_ERROR 路径实测如此——经 ended 旗标判为成功）。
'use strict';
const port = require('fs').readFileSync(process.argv[2], 'utf8').trim();
let ended = false;
const s = require('net').connect({ port: +port, host: '127.0.0.1' }, () => { ended = true; s.end(); });
s.on('close', () => process.exit(ended ? 0 : 1));
s.on('error', (e) => { if (!ended) process.exit(1); });
setTimeout(() => process.exit(1), 2000);
