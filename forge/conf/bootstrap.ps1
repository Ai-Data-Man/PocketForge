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
# s17: 用户在设置面板改过扩展开关 → 模板重写时保留其 enabled 值（ADR-0010）
if (Test-Path $cfgPath) {
    $old = [IO.File]::ReadAllText($cfgPath)
    foreach ($m in [regex]::Matches($old, '(?ms)^ {2}([A-Za-z0-9_\-]+):\s*\r?\n(.*?)(?=^ {2}[A-Za-z0-9_\-]+:|^[^\s#])')) {
        $en = [regex]::Match($m.Groups[2].Value, 'enabled:\s*(true|false)')
        if ($en.Success) {
            $cfg = [regex]::Replace($cfg, "(?ms)(^ {2}$($m.Groups[1].Value):\s*\r?\n.*?)enabled:\s*(true|false)", "`$1enabled: $($en.Groups[1].Value)")
        }
    }
}
[IO.File]::WriteAllText($cfgPath, $cfg)

# 1b) memory MCP 包装脚本生成（goose spawn 扩展子进程时丢弃父 env → wrapper 内强制便携根）
$memTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\memory-mcp.tpl.cmd'))
$memCmd = $memTpl.Replace('__FORGE_ROOT__', $ForgeRoot)
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\memory-mcp.cmd'), $memCmd)

# 1b-2) s20: .goosehints 幂等重建（模板为唯一真相源）。
# 事故背景：hints 曾被开发期脚本写坏成 600KB 重复段（P11-P24 期间入库未察觉），
# 每轮 system prompt 被垃圾挤爆。hints = 只读手册，agent 不应写它；损坏则留档重建。
$hintsTplPath = Join-Path $ForgeRoot 'conf\templates\goose-hints.tpl.md'
$hintsPath    = Join-Path $gooseDir '.goosehints'
if (Test-Path $hintsTplPath) {
    if (Test-Path $hintsPath) {
        $hLen = (Get-Item $hintsPath).Length
        if ($hLen -gt 50KB -or $hLen -lt 1KB) {
            $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            Copy-Item $hintsPath (Join-Path $ForgeRoot "data\logs\hints-corrupt-$stamp.bak") -Force
            Write-Host "[bootstrap] .goosehints 异常（$hLen 字节），已留档并从模板重建"
        }
    }
    Copy-Item $hintsTplPath $hintsPath -Force
}
# hints 模板支持 __FORGE_ROOT__ 占位符（定时任务命令需要绝对路径）
if (Test-Path $hintsPath) {
    $hRaw = [IO.File]::ReadAllText($hintsPath)
    if ($hRaw.Contains('__FORGE_ROOT__')) {
        [IO.File]::WriteAllText($hintsPath, $hRaw.Replace('__FORGE_ROOT__', $ForgeRoot))
    }
}

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
        'FORGE_AGENT_HOST=http://127.0.0.1:20128/v1/',
        'GOOSE_MODEL_NAME=myopencode/glm-5.2'
    )
    [IO.File]::WriteAllLines($secrets, $lines)
} else {
    # 幂等补缺失键（模板演进时旧部署也能拿到新键）
    $existing = @(Get-Content $secrets) | Where-Object { $_ -and -not $_.StartsWith('#') }
    $have = @{}
    foreach ($l in $existing) { $k = $l.Split('=')[0]; $have[$k] = $true }
    $add = @()
    if (-not $have['GOOSE_MODEL_NAME']) { $add += 'GOOSE_MODEL_NAME=myopencode/glm-5.2' }
    if (-not $have['FORGE_AGENT_API_KEY']) { $add += 'FORGE_AGENT_API_KEY=' }
    if (-not $have['FORGE_AGENT_HOST']) { $add += 'FORGE_AGENT_HOST=http://127.0.0.1:20128/v1/' }
    if ($add.Count -gt 0) { Add-Content $secrets ($add -join [Environment]::NewLine) }
}

# 3) 端口探测（运行中的栈不动：端口文件存在且活着则跳过重写）
function Test-PortAlive([int]$p) {
    $c = New-Object Net.Sockets.TcpClient
    try { $c.Connect('127.0.0.1', $p); $c.Close(); return $true } catch { return $false }
}
function Pick-Port([int]$start) {
    $p = $start
    for ($i=0; $i -lt 5; $i++) {
        if (Test-PortAlive $p) { $p++ } else { break }
    }
    return $p
}
$pcFile = Join-Path $ForgeRoot 'data\pc.port'
$faucetFile = Join-Path $ForgeRoot 'data\faucet.port'
if ((Test-Path $pcFile) -and (Test-PortAlive (Get-Content $pcFile))) {
    $pcPort = Get-Content $pcFile
} else {
    $pcPort = Pick-Port 8099
    "$pcPort" | Set-Content $pcFile
}
if ((Test-Path $faucetFile)) {
    $faucetPort = Get-Content $faucetFile
} else {
    $faucetPort = Pick-Port 8091
    "$faucetPort" | Set-Content $faucetFile
}

# 4) ports overlay 生成（pc 也不展开任意变量到 readiness port——用显式值）
$overlay = "processes:`n  faucet:`n    command: `"$($ForgeRoot -replace '\\','/')/bin/faucet/faucet.exe serve --foreground --host 127.0.0.1 --port $faucetPort --data-dir $($ForgeRoot -replace '\\','/')/data/faucet`"`n    readiness_probe:`n      http_get:`n        host: 127.0.0.1`n        port: $faucetPort`n        scheme: http`n        path: /healthz"
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'conf\ports.env.yaml'), $overlay)

# 5) faucet raw_sql 置位脚本生成（node:sqlite，ADR-0004：agent 建表通道）
$rawTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\faucet-rawsql.tpl.js'))
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\faucet-rawsql.js'), $rawTpl)

# 5b) 备份脚本生成（每日启动时执行，保留 7 份）
$bakTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\forge-backup.tpl.js'))
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\forge-backup.js'), $bakTpl)

# 5d) 聊天桥脚本与页面（ACP <-> WebSocket，妻子聊天入口后端）
$bridgeTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\chat-bridge.tpl.js'))
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\chat-bridge.js'), $bridgeTpl)

# 5c) 首启欢迎页（仅首次：data/welcome.done 不存在时生成 html 并由启动器打开）
$done = Join-Path $ForgeRoot 'data\welcome.done'
if (-not (Test-Path $done)) {
    $wTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\welcome.tpl.html'))
    [IO.File]::WriteAllText((Join-Path $ForgeRoot 'data\welcome.html'), $wTpl)
    'ok' | Set-Content $done
    Write-Host '[PocketForge] first run: welcome.html ready'
}

Write-Host "[PocketForge] starting... pc=$pcPort faucet=$faucetPort"
