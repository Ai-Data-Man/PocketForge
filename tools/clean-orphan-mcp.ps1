# 清扫孤儿 goose mcp memory 进程——research/17 取证的「extension 初始化失败」分支遗留形态（PPID 已死）。
# 来源：research/17（s74）tmp/s74-kill-orphan-mcp.ps1 于 s75 转正。属兜底清扫，不是常规运维：
# 正常路径下 acp 退出会整树回收（research/17 实验 A/F），delete_session 已发 ACP session/close（s75 桥修复）。
# 安全边界（红线，改动前必须保留三条同时满足）：
#   1) 进程名 = goose.exe；
#   2) 命令行匹配本产品树的 goose-package\goose.exe（可选引号）+ "mcp memory"（严格按命令行，避免误杀用户自建 MCP）；
#   3) 父进程已死（孤儿形态）。父进程活着的绝不杀——那是滞留/在用扩展，回收归 session/close 与桥重启管。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools/clean-orphan-mcp.ps1
$ErrorActionPreference = 'SilentlyContinue'
$live = @()
$killed = 0
Get-CimInstance Win32_Process -Filter "name='goose.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if ($cmd -and $cmd -match 'goose-package[\\/]goose\.exe"?\s+mcp\s+memory') {
    # 父进程还活着吗
    $parent = Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue
    if (-not $parent) {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      $killed++
    } else {
      $live += "PID=$($_.ProcessId) PPID=$($_.ParentProcessId) parent-alive (kept)"
    }
  } else {
    if ($cmd) { $live += "KEEP PID=$($_.ProcessId) CMD=$($cmd.Substring(0,[Math]::Min(60,$cmd.Length)))" }
  }
}
"killed=$killed"
$live
