// goose 调度守护 wrapper（goose v1.50 升级适配，2026-09-13 / research/23 实施记录）。
// 行为差异：v1.50 的 `goose acp` stdio server 在 stdin EOF 即优雅退出（v1.46 忽略 EOF 常驻）；
// process-compose 守护进程不给 stdin（Go exec nil = NUL）→ 直跑 goose.exe 秒退 exit 0，
// pc 视为正常退出不重启，调度器死、cron 永不触发。
// 适配：本 wrapper 为 goose 持一条永不关闭的 stdin 管道（不写不 end），stdout/stderr 透传，
// 退出码透传（goose 真死时 pc on_failure 重启语义保留）。v1.46 同形兼容（stdin 空置无副作用）。
// 环境不加工：GOOSE_PATH_ROOT/GOOSE_DISABLE_KEYRING 等由 pc 的 environment 块注入本进程后原样传递。
const { spawn } = require('child_process');
const path = require('path');
const exe = path.join(__dirname, 'goose', 'goose-package', 'goose.exe');
const child = spawn(exe, ['acp', '--enable-scheduler'], {
    env: process.env,
    stdio: ['pipe', 'inherit', 'inherit'],
    windowsHide: true,
});
child.on('exit', (code) => process.exit(code == null ? 1 : code));
child.on('error', () => process.exit(1));
