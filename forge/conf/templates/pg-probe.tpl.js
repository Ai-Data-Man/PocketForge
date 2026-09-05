// s66/ADR-0011 阶段二: pg readiness TCP 探活（pc exec 经 cmd /C，内联 -e 会被 Go->cmd->argv 三层
// 引号转义破坏——实证见 tmp/s66-readiness-tcp-experiment.log，故落文件；真相源=本模板，bootstrap 生成）。
// 用法: node pg-probe.js <data/pg.port 路径>。连通 exit 0；拒绝/超时(2s)/文件缺失 exit 1。
'use strict';
const port = require('fs').readFileSync(process.argv[2], 'utf8').trim();
const s = require('net').connect({ port: +port, host: '127.0.0.1' }, () => { process.exit(0); });
s.on('error', () => process.exit(1));
setTimeout(() => process.exit(1), 2000);
