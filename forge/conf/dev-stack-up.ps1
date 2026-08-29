# dev 栈拉起（等价 启动数字员工.cmd 的无窗口版，开发会话用）
$ErrorActionPreference = 'Continue'
$ForgeRoot = 'C:\ZCodeWorks\PocketForge\forge'
$env:FORGE_ROOT = $ForgeRoot
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ForgeRoot 'conf\bootstrap.ps1')

foreach ($line in Get-Content (Join-Path $ForgeRoot 'data\pc.port')) { $PC_PORT = $line.Trim(); break }
foreach ($line in Get-Content (Join-Path $ForgeRoot 'data\faucet.port')) { $FAUCET_PORT = $line.Trim(); break }
foreach ($line in Get-Content (Join-Path $ForgeRoot 'data\secrets.env')) {
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
$env:PC_PORT = $PC_PORT
$env:FAUCET_PORT = $FAUCET_PORT
$env:GOOSE_PATH_ROOT = "$ForgeRoot\conf\goose"
$env:GOOSE_DISABLE_KEYRING = '1'
$env:GOOSE_TELEMETRY_ENABLED = 'false'
$env:NO_PROXY = '127.0.0.1,localhost'
$env:no_proxy = '127.0.0.1,localhost'

# aggregate apps
$d = Join-Path $ForgeRoot 'apps'
$out = Join-Path $ForgeRoot 'conf\apps.env.yaml'
$yamls = @(Get-ChildItem $d -Filter *.yaml -ErrorAction SilentlyContinue | Sort-Object Name)
if ($yamls.Count -gt 0) {
    $c = $yamls | ForEach-Object { (Get-Content $_.FullName -Raw) -replace '(?m)^processes:\s*$', '' }
    [IO.File]::WriteAllText($out, ('processes:' + ($c -join [Environment]::NewLine)))
} else {
    [IO.File]::WriteAllText($out, 'processes: {}')
}

Write-Host "[dev-up] starting pc=$PC_PORT faucet=$FAUCET_PORT"
Set-Location $ForgeRoot
# s50: pc 以前台 & 挂在调用者进程树下，宿主（子代理后台任务）被收割时 pc 被连带硬杀（今日三样本实证，见 journal s50e/h）。
# 改 detached 拉起：父链立即脱离，pc 存活不再绑定任何易死会话。目标机 启动数字员工.cmd 由用户双击（explorer 链）天然免疫，无需同改。
$pcArgs = @('up','-f',(Join-Path $ForgeRoot 'conf\process-compose.yaml'),'-f',(Join-Path $ForgeRoot 'conf\ports.env.yaml'),'-f',$out,'-p',$PC_PORT,'-t=false')
Start-Process -FilePath (Join-Path $ForgeRoot 'bin\pc\process-compose.exe') -ArgumentList $pcArgs -WorkingDirectory $ForgeRoot -WindowStyle Hidden
# detached 后等待栈就绪再返回，调用方（探针/回归）才能直接用
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    try { $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$PC_PORT/processes" -TimeoutSec 2; if ($r.StatusCode -eq 200) { Write-Host "[dev-up] pc ready on $PC_PORT"; exit 0 } } catch {}
    Start-Sleep -Milliseconds 800
}
Write-Host "[dev-up] pc did not become ready in 30s"; exit 1
