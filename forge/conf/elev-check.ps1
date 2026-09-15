# s90: 高完整性令牌检测——判据=管理员组是否"可用"（restricted token 下 Administrators 变 deny-only，
# IsInRole 返回 False），与 PostgreSQL 自身的放行判据同源。
# 为何不用完整性 SID：restricted token 仍保留 S-1-16-12288（实测 2026-09-15），据此判定会无限重开窗口。
# 输出：HIGH（需降权重启）/ LOW（可正常启动）。调用：powershell -NoProfile -ExecutionPolicy Bypass -File elev-check.ps1
$id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object System.Security.Principal.WindowsPrincipal -ArgumentList $id
if ($p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) { 'HIGH' } else { 'LOW' }
