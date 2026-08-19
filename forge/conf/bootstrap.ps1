# PocketForge 启动器核心逻辑（由 启动数字员工.cmd 调用）
# 模板替换：goose 不展开环境变量，须写入绝对路径
$ErrorActionPreference = 'Stop'
$ForgeRoot = Split-Path -Parent $PSScriptRoot

# 1) goose config 生成（幂等）
$gooseDir = Join-Path $ForgeRoot 'conf\goose\config'
New-Item -ItemType Directory -Force -Path $gooseDir | Out-Null
$tplPath  = Join-Path $ForgeRoot 'conf\templates\goose-config.tpl.yaml'
$cfgPath  = Join-Path $gooseDir 'config.yaml'
$nodeDir  = Join-Path $ForgeRoot 'bin\node-v22\node-v22.21.1-win-x64'
$tpl = [IO.File]::ReadAllText($tplPath)
$cfg = $tpl.Replace('__FORGE_ROOT__', ($ForgeRoot -replace '\\','/')).Replace('__NODE_DIR__', ($nodeDir -replace '\\','/'))
[IO.File]::WriteAllText($cfgPath, $cfg)

# 2) 首启 secrets
$secrets = Join-Path $ForgeRoot 'data\secrets.env'
if (-not (Test-Path $secrets)) {
    $chars = { -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ }) }
    $tok = & $chars
    $lines = @(
        "PC_TOKEN=$tok",
        'FAUCET_ADMIN_EMAIL=admin@pocketforge.local',
        'FAUCET_ADMIN_PW=' + (& $chars).Substring(0,24),
        'FORGE_AGENT_API_KEY=',
        'FORGE_AGENT_HOST=http://127.0.0.1:20128/v1/'
    )
    [IO.File]::WriteAllLines($secrets, $lines)
}

# 3) 端口探测（冲突 +1，最多 5 次）
function Pick-Port([int]$start) {
    $p = $start
    for ($i=0; $i -lt 5; $i++) {
        $c = New-Object Net.Sockets.TcpClient
        try { $c.Connect('127.0.0.1', $p); $c.Close(); $p++ } catch { break }
    }
    return $p
}
$pcPort = Pick-Port 8099
$faucetPort = Pick-Port 8091
"$pcPort" | Set-Content (Join-Path $ForgeRoot 'data\pc.port')
"$faucetPort" | Set-Content (Join-Path $ForgeRoot 'data\faucet.port')

# 4) ports overlay 生成（pc 也不展开任意变量到 readiness port——用显式值）
$overlay = "processes:`n  faucet:`n    command: `"$($ForgeRoot -replace '\\','/')/bin/faucet/faucet.exe serve --foreground --host 127.0.0.1 --port $faucetPort --data-dir $($ForgeRoot -replace '\\','/')/data/faucet`"`n    readiness_probe:`n      http_get:`n        host: 127.0.0.1`n        port: $faucetPort`n        scheme: http`n        path: /healthz"
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'conf\ports.env.yaml'), $overlay)

Write-Host "[PocketForge] starting... pc=$pcPort faucet=$faucetPort"
