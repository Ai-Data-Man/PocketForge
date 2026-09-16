# APPS-GUARD-TEST: conf/apps-aggregate.ps1 段级测试（s96 基础设施键守卫）。
# 方法同 perm-seed-test：沙盒镜像 conf/apps 布局，运行时复制真脚本（非静态副本=永远测当前源），
# 以 启动数字员工.cmd 同款 powershell -File 形态跑子进程，断言产物字节/守卫日志/console/退出码。
# 本文件 UTF-8 BOM：含中文精确告警文案断言（PS5.1 无 BOM 会按 ANSI 误解码，已知坑）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools\apps-guard-test.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$srcScript  = Join-Path $repo 'forge\conf\apps-aggregate.ps1'
$srcMainYml = Join-Path $repo 'forge\conf\process-compose.yaml'
if (-not (Test-Path $srcScript)) { Write-Host 'APPS-GUARD-TEST FAIL: conf\apps-aggregate.ps1 not found'; exit 1 }

$script:pass = 0; $script:total = 0; $script:roots = @()
function New-Sandbox([bool]$withMain) {
    $root = Join-Path ([IO.Path]::GetTempPath()) ('apps-guard-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path (Join-Path $root 'conf') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $root 'apps') | Out-Null
    Copy-Item $srcScript (Join-Path $root 'conf\apps-aggregate.ps1') -Force
    if ($withMain) { Copy-Item $srcMainYml (Join-Path $root 'conf\process-compose.yaml') -Force }
    $script:roots += $root
    return $root
}
# fixture = LF + UTF-8 无 BOM（真 app yaml 实测形态，e2e-report.yaml）
function Write-Fixture([string]$root, [string]$name, [string[]]$lines) {
    [IO.File]::WriteAllText((Join-Path $root ('apps\' + $name)), (($lines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
}
# 与启动器同款调用形态；返回 @{ rc; cap }（cap = 子进程 stdout 合并捕获）
function Invoke-Aggregate([string]$root) {
    $cap = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'conf\apps-aggregate.ps1') 2>&1 | Out-String)
    return @{ rc = $LASTEXITCODE; cap = $cap }
}
function Get-Out([string]$root)     { return [IO.File]::ReadAllText((Join-Path $root 'conf\apps.env.yaml')) }
function Get-LogLines([string]$root) {
    $p = Join-Path $root 'conf\apps.guard.log'
    if (-not (Test-Path $p)) { return $null }
    return @(([IO.File]::ReadAllText($p)) -split "\r?\n" | Where-Object { $_ -ne '' })
}
# 老算法的期望产物公式（剥行正则与 join 与旧两处聚合器逐字相同）
function Get-Expected([string[]]$texts) {
    $stripped = @($texts | ForEach-Object { $_ -replace '(?m)^processes:\s*$', '' })
    return ('processes:' + [Environment]::NewLine + ($stripped -join [Environment]::NewLine))
}
function Ck([string]$name, [bool]$cond) {
    $script:total++
    if ($cond) { $script:pass++; Write-Host ('  ok   ' + $name) }
    else { Write-Host ('  FAIL ' + $name) -ForegroundColor Red }
}
function Raw-Fixture([string]$root, [string]$name) { return [IO.File]::ReadAllText((Join-Path $root ('apps\' + $name))) }

$metaA = '# forge-meta: {"description":"守卫测试A","url":"http://127.0.0.1:8199/a.html","created_at":"2026-09-16","source":"apps-guard-test"}'
$fxA = @($metaA, 'processes:', '  guard-a:', "    command: 'cmd /c echo a'", '    is_daemon: false')
$fxB = @('# forge-meta: {"description":"守卫测试B"}', 'processes:', '  chat-bridge:', "    command: 'cmd /c echo b'", '  guard-b:', "    command: 'cmd /c echo b2'")
$fxC = @('processes:', '  guard-c:', "    command: 'cmd /c echo c'")
$fxD = @('processes:', '  pg:', "    command: 'x'", '  nats:', "    command: 'x'", '  guard-d:', "    command: 'x'")
$fxE = @('processes:', '  postgres:', "    command: 'x'", '  nats-server:', "    command: 'x'", '  guard-e:', "    command: 'x'")
$fxF = @('processes:', '  pg-init:', "    command: 'x'")

$msgSkip = ' 里有和系统组件重名的进程，已跳过它防止启动出问题——跟小 forge 说一声让它修一下（重名进程：'
$msgOpen = '[apps-guard] 读不到 conf\process-compose.yaml，基础设施键守卫本次未生效（apps 已按原样全部聚合）'

# ---- T1 正常 app：聚合产物与老算法逐字节等价，零告警 ----
$r = New-Sandbox $true; Write-Fixture $r 'a.yaml' $fxA
$run = Invoke-Aggregate $r
Ck 'T1 rc=0' ($run.rc -eq 0)
Ck 'T1 产物=老算法公式（forge-meta 首行+LF 源形态）' ((Get-Out $r) -ceq (Get-Expected @((Raw-Fixture $r 'a.yaml'))))
Ck 'T1 零告警：无 log 文件' ($null -eq (Get-LogLines $r))
Ck 'T1 console 静默' ($run.cap -notmatch '\S')

# ---- T2 坏 app（chat-bridge）：跳过 + 一行告警 + rc=0 ----
$r = New-Sandbox $true; Write-Fixture $r 'b.yaml' $fxB
$run = Invoke-Aggregate $r
$lg = @(Get-LogLines $r)
Ck 'T2 rc=0（跳过不是错误，启动不挡）' ($run.rc -eq 0)
Ck 'T2 产物=空 processes' ((Get-Out $r) -ceq 'processes: {}')
Ck 'T2 log 一行且文案精确（含命中的键）' ($null -ne $lg -and $lg.Count -eq 1 -and $lg[0] -ceq ('[apps-guard] apps/b.yaml' + $msgSkip + 'chat-bridge）'))
Ck 'T2 console 有告警锚点' ($run.cap -match '\[apps-guard\]')

# ---- T3 多文件混合：好-坏-好，坏者出局、好者按名序拼接 ----
$r = New-Sandbox $true
Write-Fixture $r 'a.yaml' $fxA; Write-Fixture $r 'b.yaml' $fxB; Write-Fixture $r 'c.yaml' $fxC
$run = Invoke-Aggregate $r
$lg = @(Get-LogLines $r)
Ck 'T3 产物=老算法公式（a+c，b 缺席）' ((Get-Out $r) -ceq (Get-Expected @((Raw-Fixture $r 'a.yaml'), (Raw-Fixture $r 'c.yaml'))))
Ck 'T3 产物不含 infra 键' ((Get-Out $r) -notmatch 'chat-bridge')
Ck 'T3 log 一行指向 b.yaml' ($null -ne $lg -and $lg.Count -eq 1 -and $lg[0].StartsWith('[apps-guard] apps/b.yaml'))
Ck 'T3 rc=0' ($run.rc -eq 0)

# ---- T4 apps/ 空：产物空 processes，无告警 ----
$r = New-Sandbox $true
$run = Invoke-Aggregate $r
Ck 'T4 空 apps 产物=processes: {}' ((Get-Out $r) -ceq 'processes: {}')
Ck 'T4 无 log' ($null -eq (Get-LogLines $r))
Ck 'T4 rc=0' ($run.rc -eq 0)

# ---- T5 主 yaml 缺失：fail-open（不跳过，只告警） ----
$r = New-Sandbox $false; Write-Fixture $r 'b.yaml' $fxB
$run = Invoke-Aggregate $r
$lg = @(Get-LogLines $r)
Ck 'T5 坏 app 照常聚合（fail-open）' ((Get-Out $r) -ceq (Get-Expected @((Raw-Fixture $r 'b.yaml'))))
Ck 'T5 log=降级告警一行（文案精确）' ($null -ne $lg -and $lg.Count -eq 1 -and $lg[0] -ceq $msgOpen)
Ck 'T5 rc=0' ($run.rc -eq 0)

# ---- T6 全坏：产物空 + 两行告警（多键命中按文件序） ----
$r = New-Sandbox $true; Write-Fixture $r 'b.yaml' $fxB; Write-Fixture $r 'd.yaml' $fxD
$run = Invoke-Aggregate $r
$lg = @(Get-LogLines $r)
Ck 'T6 产物=processes: {}' ((Get-Out $r) -ceq 'processes: {}')
Ck 'T6 log 两行，d 行含 pg、nats（文件序）' ($null -ne $lg -and $lg.Count -eq 2 -and $lg[1] -ceq ('[apps-guard] apps/d.yaml' + $msgSkip + 'pg、nats）'))

# ---- T7 零告警运行清掉旧 log（每启覆写语义） ----
$r = New-Sandbox $true
Write-Fixture $r 'a.yaml' $fxA; Write-Fixture $r 'b.yaml' $fxB
$null = Invoke-Aggregate $r
Ck 'T7 前置：log 存在' ($null -ne (Get-LogLines $r))
Remove-Item (Join-Path $r 'apps\b.yaml') -Force
$null = Invoke-Aggregate $r
Ck 'T7 复跑零告警后 log 被删' ($null -eq (Get-LogLines $r))

# ---- T8 键集语义：精确键名（勘误钉：postgres/nats-server 不是 infra 键，放行；pg-init 是，拦截） ----
$r = New-Sandbox $true; Write-Fixture $r 'e.yaml' $fxE
$run = Invoke-Aggregate $r
Ck 'T8a postgres/nats-server（勘误错名）不误伤，照常聚合' ((Get-Out $r) -ceq (Get-Expected @((Raw-Fixture $r 'e.yaml'))) -and $null -eq (Get-LogLines $r))
$r = New-Sandbox $true; Write-Fixture $r 'f.yaml' $fxF
$null = Invoke-Aggregate $r
$lg = @(Get-LogLines $r)
Ck 'T8b pg-init（深层 oneshot 键）被拦' ($null -ne $lg -and $lg[0] -ceq ('[apps-guard] apps/f.yaml' + $msgSkip + 'pg-init）'))

foreach ($x in $script:roots) { Remove-Item $x -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host ('APPS-GUARD-TEST: ' + $script:pass + '/' + $script:total)
if ($script:pass -ne $script:total) { exit 1 }
exit 0
