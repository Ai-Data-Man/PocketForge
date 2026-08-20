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

# 1b) memory MCP 包装脚本生成（goose spawn 扩展子进程时丢弃父 env → wrapper 内强制便携根）
$memTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\memory-mcp.tpl.cmd'))
$memCmd = $memTpl.Replace('__FORGE_ROOT__', $ForgeRoot)
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\memory-mcp.cmd'), $memCmd)

# 1c) memory junction：goose-mcp 硬编码 %APPDATA%\Block\goose\config\memory（无视 GOOSE_PATH_ROOT，
#     见 docs/research/04-goose.md）。NTFS junction 重定向到便携目录（免管理员；卸载=删 junction）。
$memPort = Join-Path $ForgeRoot 'conf\goose\config\memory'
New-Item -ItemType Directory -Force -Path $memPort | Out-Null
$memApp  = Join-Path $env:APPDATA 'Block\goose\config\memory'
if (-not (Test-Path $memApp)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $memApp) | Out-Null
    cmd /c mklink /J "$memApp" "$memPort" | Out-Null
}

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

# 5) faucet raw_sql 置位脚本生成（node:sqlite，ADR-0004：agent 建表通道）
$rawTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\faucet-rawsql.tpl.js'))
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\faucet-rawsql.js'), $rawTpl)

# 5b) 备份脚本生成（每日启动时执行，保留 7 份）
$bakTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\forge-backup.tpl.js'))
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\forge-backup.js'), $bakTpl)

# 5c) 首启欢迎页（仅首次：data/welcome.done 不存在时生成 html 并由启动器打开）
$done = Join-Path $ForgeRoot 'data\welcome.done'
if (-not (Test-Path $done)) {
    $wTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\welcome.tpl.html'))
    [IO.File]::WriteAllText((Join-Path $ForgeRoot 'data\welcome.html'), $wTpl)
    'ok' | Set-Content $done
    Write-Host '[PocketForge] first run: welcome.html ready'
}

Write-Host "[PocketForge] starting... pc=$pcPort faucet=$faucetPort"
