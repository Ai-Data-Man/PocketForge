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
# s46: 模板里没有的扩展块（MCP 市场装的 mcp-*）整体保留追加
if (Test-Path $cfgPath) {
    $old = [IO.File]::ReadAllText($cfgPath)
    $extraBlocks = ''
    foreach ($m in [regex]::Matches($old, '(?ms)^ {2}([A-Za-z0-9_\-]+):\s*\r?\n(.*?)(?=^ {2}[A-Za-z0-9_\-]+:|^[^\s#]|\z)')) {
        $key = $m.Groups[1].Value
        if ($key -like 'mcp-*') { $extraBlocks += $m.Value; continue }
        $en = [regex]::Match($m.Groups[2].Value, 'enabled:\s*(true|false)')
        if ($en.Success) {
            $cfg = [regex]::Replace($cfg, "(?ms)(^ {2}$($key):\s*\r?\n.*?)enabled:\s*(true|false)", "`$1enabled: $($en.Groups[1].Value)")
        }
    }
    if ($extraBlocks -ne '' -and $cfg -notmatch [regex]::Escape($extraBlocks)) {
        $cfg = $cfg.TrimEnd() + "`n" + $extraBlocks.TrimEnd() + "`n"
    }
}
[IO.File]::WriteAllText($cfgPath, $cfg)

# 1b) memory MCP 包装脚本生成（goose spawn 扩展子进程时丢弃父 env → wrapper 内强制便携根）
#     s85/P2: 模板纯 ASCII + %~dp0 自推导根目录——不依赖代码页，非 ASCII 安装路径下同样可解析（审计 §2 推荐档）；
#     写出仍做 CRLF 规范化（cmd 解析纪律，模板漂移到 LF 也不进生成物）
$memTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\memory-mcp.tpl.cmd'))
$memCmd = $memTpl.Replace("`r`n","`n").Replace("`n","`r`n")
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\memory-mcp.cmd'), $memCmd)

# 1b-3) s66/ADR-0011: pg-init 包装脚本生成（pc oneshot 进程用，幂等守卫在模板内；s85/P2 同 1b 纯 ASCII 方案）
$pgTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\pg-init.tpl.cmd'))
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\pg-init.cmd'), $pgTpl.Replace("`r`n","`n").Replace("`n","`r`n"))

# 1b-4) s66 阶段二: pg readiness TCP 探活脚本生成（pc exec 的 cmd /C 对内联 -e 有三层引号转义问题，故落文件）
$probeTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\pg-probe.tpl.js'))
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\pg-probe.js'), $probeTpl)

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

# 1b-7) permission.yaml 首启种子（copy-if-missing，存在绝不覆盖；裁决 docs/verdicts/2026-09-08-permission-yaml-untrack §3）
# 不逐启重写：goose 运行时回写可能含 judge 缓存（research/12 §3.3，语义未完全考证）——逐启重写=每启清缓存→权限卡重问风暴；
# 模板只负责新装首启种子，之后文件归 goose 运行时演化（与 config.yaml 逐启重写/.goosehints 逐启覆盖刻意不同）。
$permTplPath = Join-Path $ForgeRoot 'conf\templates\permission.tpl.yaml'
$permPath    = Join-Path $ForgeRoot 'conf\goose\config\permission.yaml'
if (Test-Path $permTplPath) {
    if (-not (Test-Path $permPath)) {
        Copy-Item $permTplPath $permPath
        Write-Host '[bootstrap] permission.yaml seeded from template (first run)'
    } elseif (-not (Select-String -Path $permPath -Pattern '^user:' -Quiet)) {
        # qa P2-2：存在但内容无效（空文件/缺 user: 块）——goose 缺键 panic 家族；守卫+留档模式同 1b-2 .goosehints
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        Copy-Item $permPath (Join-Path $ForgeRoot "data\logs\permission-corrupt-$stamp.bak") -Force
        Copy-Item $permTplPath $permPath -Force
        Write-Host '[bootstrap] permission.yaml invalid (no user: block), archived and re-seeded from template'
    }
} elseif (-not (Test-Path $permPath)) {
    # qa P3-1：模板与目标双缺——显式红字告警，不再静默 rc=0
    Write-Host '[bootstrap] WARNING: permission.yaml missing AND template missing - goose may fail to start; restore conf\templates\permission.tpl.yaml and relaunch' -ForegroundColor Red
}

# 1b-8) s78d 裁决 docs/verdicts/2026-09-13-v150-builtin-skills-trim：上游捆绑内置技能遮蔽桩（web-search/goose-doc-guide）。
#     goose 无内置技能禁用键，唯一覆盖通道=同名文件系统技能优先于 builtins（discover 先扫目录再补 builtins，seen 去重）。
#     每启覆盖重建（语义同 1b-2 .goosehints，非 1b-7 copy-if-missing）：桩是产品自有静态物，覆盖式自愈、可随版改文案。
#     桩不进产品 UI（/api/skills 只扫 .agents/skills）；用户日后从商店装同名技能（cwd/.agents/skills 扫描序更先）=用户意愿优先。
foreach ($stubName in @('web-search','goose-doc-guide')) {
    $stubTplPath = Join-Path $ForgeRoot "conf\templates\skill-stub-$stubName.tpl.md"
    if (Test-Path $stubTplPath) {
        $stubDir = Join-Path $gooseDir "skills\$stubName"
        New-Item -ItemType Directory -Force -Path $stubDir | Out-Null
        Copy-Item $stubTplPath (Join-Path $stubDir 'SKILL.md') -Force
    }
}

# 1c) memory junction：goose-mcp 硬编码 %APPDATA%\Block\goose\config\memory（无视 GOOSE_PATH_ROOT，
#     见 docs/research/04-goose.md）。NTFS junction 重定向到便携目录（免管理员；卸载=删 junction）。
#     s85/P4: 守卫从 Test-Path 改为「是 Junction 且 Target 存在」双条件——悬挂 junction 的 Test-Path 同样返回
#     True，旧守卫在用户改名/搬迁整个文件夹后永不重建（经该路径的记忆读写静默 FileNotFoundError）；失效即删旧重建。
$memPort = Join-Path $ForgeRoot 'conf\goose\config\memory'
New-Item -ItemType Directory -Force -Path $memPort | Out-Null
$memApp  = Join-Path $env:APPDATA 'Block\goose\config\memory'
$memOk = $false
if (Test-Path $memApp) {
    $memIt = Get-Item $memApp -Force
    $memOk = ($memIt.LinkType -eq 'Junction') -and (Test-Path ($memIt.Target -join ''))
}
if (-not $memOk) {
    New-Item -ItemType Directory -Force -Path (Split-Path $memApp) | Out-Null
    if (Test-Path $memApp) { Remove-Item $memApp -Force -Recurse }
    cmd /c mklink /J "$memApp" "$memPort" | Out-Null
}

# 2) 首启 secrets
# s97/F-11: agent 三键种子改从 data/providers.json 活跃档案现读（存在且可解析时）。
# 旧缺省 127.0.0.1:20128 是死地址：种子被启动器导出→pc up 渲染进 chat-bridge environment 块→
# 桥的 provider 同步随后把 secrets.env 改写成档案真值→「运行值≠文件值」→pc project update 按
# wrapper 现读 env 重渲染判 chat-bridge 漂移→重启（在飞回合孤儿化，s97b/d 实录）。源头收敛：
# 种下的就是档案真值（桥同步写 host 原样、models 取池首，与本种子同源同形）→运行渲染==文件值==桥同步值，三点恒同。
# providers.json 缺失/坏 JSON/无 active 档案 → 回落旧缺省（fail-safe，行为同旧版）。
$pvHost = 'http://127.0.0.1:20128/v1/'
$pvKey = ''
$pvModel = 'mimo-v2.5'
$pvLive = $false
try {
    $pvFile = Join-Path $ForgeRoot 'data\providers.json'
    if (Test-Path $pvFile) {
        $pvAct = @((ConvertFrom-Json ([IO.File]::ReadAllText($pvFile))) | Where-Object { $_.active })[0]
        if ($pvAct) {
            $pvLive = $true
            if ($pvAct.host) { $pvHost = [string]$pvAct.host }
            if ($pvAct.key)  { $pvKey  = [string]$pvAct.key }
            if ($pvAct.models) { $pvModel = [string]@($pvAct.models)[0] }
        }
    }
} catch { }
$secrets = Join-Path $ForgeRoot 'data\secrets.env'
$chars = { -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ }) } # s94 F-6: 提到 if 外——幂等补缺 FAUCET_ADMIN_PW 也要用
if (-not (Test-Path $secrets)) {
    $tok = & $chars
    $lines = @(
        "PC_TOKEN=$tok",
        'FAUCET_ADMIN_EMAIL=admin@pocketforge.local',
        # s89/Y1: 括号必加——PS 数组元素里逗号优先级高于 +，裸 'K=' + expr, 会拼成 string+数组 展开成两元素
        # （首启产物 FAUCET_ADMIN_PW= 与随机串各占一行，s88 §8 字节级首启检视实锤，历版皆然）
        ('FAUCET_ADMIN_PW=' + (& $chars).Substring(0,24)),
        "FORGE_AGENT_API_KEY=$pvKey",
        "FORGE_AGENT_HOST=$pvHost",
        # 种子=可选池首模型（有活跃档案时）；2026-09-08 myopencode 线路已死（服务商侧 404），s76 遗留①收尾（幂等补键同此种子）
        "GOOSE_MODEL_NAME=$pvModel"
    )
    [IO.File]::WriteAllLines($secrets, $lines)
} else {
    # 幂等补缺失键（模板演进时旧部署也能拿到新键）
    $existing = @(Get-Content $secrets) | Where-Object { $_ -and -not $_.StartsWith('#') }
    $have = @{}
    foreach ($l in $existing) { $k = $l.Split('=')[0]; $have[$k] = $true }
    # s97/F-11 升级自愈：旧部署 secrets 三键还是出厂缺省而 providers.json 已有真值 → 对齐
    #（只识别出厂缺省字面值：用户自设值一律不动；对齐一次后重跑恒 no-op）
    if ($pvLive) {
        $all = @(Get-Content $secrets)
        $healed = $false
        for ($i = 0; $i -lt $all.Count; $i++) {
            if ($all[$i] -eq 'FORGE_AGENT_HOST=http://127.0.0.1:20128/v1/' -and $pvHost -ne 'http://127.0.0.1:20128/v1/') { $all[$i] = "FORGE_AGENT_HOST=$pvHost"; $healed = $true }
            elseif ($all[$i] -eq 'FORGE_AGENT_API_KEY=' -and $pvKey -ne '') { $all[$i] = "FORGE_AGENT_API_KEY=$pvKey"; $healed = $true }
            elseif ($all[$i] -eq 'GOOSE_MODEL_NAME=mimo-v2.5' -and $pvModel -ne 'mimo-v2.5') { $all[$i] = "GOOSE_MODEL_NAME=$pvModel"; $healed = $true }
        }
        if ($healed) {
            [IO.File]::WriteAllLines($secrets, $all)
            Write-Host '[bootstrap] secrets.env: stale agent seed aligned to active provider (s97/F-11)'
        }
    }
    $add = @()
    if (-not $have['GOOSE_MODEL_NAME']) { $add += "GOOSE_MODEL_NAME=$pvModel" }
    if (-not $have['FORGE_AGENT_API_KEY']) { $add += "FORGE_AGENT_API_KEY=$pvKey" }
    if (-not $have['FORGE_AGENT_HOST']) { $add += "FORGE_AGENT_HOST=$pvHost" }
    # s94 F-6: faucet 首启供给（bootstrap 5h + pc oneshot faucet-provision）需要确定性 admin 凭据
    if (-not $have['FAUCET_ADMIN_EMAIL']) { $add += 'FAUCET_ADMIN_EMAIL=admin@pocketforge.local' }
    if (-not $have['FAUCET_ADMIN_PW']) { $add += ('FAUCET_ADMIN_PW=' + (& $chars).Substring(0,24)) }
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
# s84: hints 的 __FAUCET_PORT__ 占位符在端口确定后替换（首启 1b-2 物化先于此，故补一次后置替换；
# 旧模板硬编码 8091 在端口漂移机器上误导 agent curl 错端口烧整轮——cycle-40 appcap 实锤）
$hintsLive = Join-Path $gooseDir '.goosehints'
if ((Test-Path $hintsLive) -and ((Get-Content $hintsLive -Raw).Contains('__FAUCET_PORT__'))) {
    $h2 = [IO.File]::ReadAllText($hintsLive).Replace('__FAUCET_PORT__', "$faucetPort")
    [IO.File]::WriteAllText($hintsLive, $h2)
}
# s66/ADR-0011: PG 端口（pg.port 存在即复用，与 faucet 同款；${PG_PORT} 由两个启动器导出供 pc 展开）
$pgFile = Join-Path $ForgeRoot 'data\pg.port'
if ((Test-Path $pgFile)) {
    $pgPort = Get-Content $pgFile
} else {
    $pgPort = Pick-Port 5432
    "$pgPort" | Set-Content $pgFile
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

# 5e) s40: gen-xlsx 工具生成（真相源入库；此前只存在于 bin/ 被 ignore，丢失即永久丢失）
$xlsxTpl = Join-Path $ForgeRoot 'conf\templates\gen-xlsx.tpl.js'
$xlsxOut = Join-Path $ForgeRoot 'bin\gen-xlsx.js'
if (Test-Path $xlsxTpl) { Copy-Item $xlsxTpl $xlsxOut -Force }

# 5f) vision 看图工具生成（真相源入库；此前住在仓库根 tools/ 不进包，交付物里 see-image 技能指向的文件不存在）
$visTpl = Join-Path $ForgeRoot 'conf\templates\vision.tpl.js'
$visOut = Join-Path $ForgeRoot 'bin\vision.js'
if (Test-Path $visTpl) { Copy-Item $visTpl $visOut -Force }

# 5g) goose 调度守护 wrapper 生成（goose v1.50 适配：acp 对 stdin EOF 即优雅退出，pc 守护进程无 stdin
#     须由 wrapper 持管道，见模板头注；process-compose.yaml goose-scheduler 指向本产物）
$schedTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\goose-scheduler.tpl.js'))
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\goose-scheduler.js'), $schedTpl)

# 5h) s94 F-6: faucet 首启供给脚本生成（admin/forge-admin 角色/agent key → data/faucet/.apikey；
#     幂等+失败不阻断；由 pc oneshot「faucet-provision」在 faucet 端口就绪后执行，见模板头注）
$provTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\faucet-provision.tpl.js'))
[IO.File]::WriteAllText((Join-Path $ForgeRoot 'bin\faucet-provision.js'), $provTpl)

# 5i) s95 F-6: 应用热注册 wrapper 生成（agent 自己拼 pc project update 的形态在 cmd 嵌套引号下不可执行，
#     且 -f 集不全时 pc 整体替换项目会重启整栈、打断进行中的对话；wrapper 自带 root+完整文件集+人话退出码）
$regTpl = Join-Path $ForgeRoot 'conf\templates\forge-register.tpl.cmd'
$regOut = Join-Path $ForgeRoot 'bin\pc\forge-register.cmd'
if (Test-Path $regTpl) { Copy-Item $regTpl $regOut -Force }

# 5c) 首启欢迎页（仅首次：data/welcome.done 不存在时生成 html 并由启动器打开）
$done = Join-Path $ForgeRoot 'data\welcome.done'
if (-not (Test-Path $done)) {
    $wTpl = [IO.File]::ReadAllText((Join-Path $ForgeRoot 'conf\templates\welcome.tpl.html'))
    [IO.File]::WriteAllText((Join-Path $ForgeRoot 'data\welcome.html'), $wTpl)
    'ok' | Set-Content $done
    Write-Host '[PocketForge] first run: welcome.html ready'
}

Write-Host "[PocketForge] starting... pc=$pcPort faucet=$faucetPort"
