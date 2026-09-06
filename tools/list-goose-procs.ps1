# 枚举本机 goose.exe 进程（PID/PPID/命令行截断 140 字符）——goose 进程滞留/孤儿取证的观察工具。
# 来源：research/17（s74）tmp/s74-goose-procs.ps1 于 s75 转正。只读，不杀任何进程。
# 配套：tools/clean-orphan-mcp.ps1（清扫孤儿形态）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools/list-goose-procs.ps1
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process -Filter "name='goose.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if ($cmd -and $cmd.Length -gt 140) { $cmd = $cmd.Substring(0,140) }
  "PID=$($_.ProcessId) PPID=$($_.ParentProcessId) CMD=$cmd"
}
