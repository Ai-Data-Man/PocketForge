# apps 聚合器（启动数字员工.cmd 与 conf\dev-stack-up.ps1 共用；s96 起为单一真相源）
# 语义：apps\*.yaml 各自剥掉顶层 `processes:` 行（含行尾换行）后文本拼接进 conf\apps.env.yaml，
# pc up 以多 -f 加载。s89/R1 纪律：joined 内容必须另起一行——协议形态（forge-meta 首行注释）的
# app 剥掉 processes: 行后文件体首行是注释，直接粘在 processes: 后会拼成 "processes:# forge-meta…"
# （注释失效+{ 进 flow mapping）→ pc up FTL。
#
# s96 基础设施键守卫（ADR-0003「agent 不得定义基础设施键」的聚合层执法，非仅协议纪律）：
# 背景 = pc -f 合并语义为后文件顶层键覆盖前文件——apps yaml 若声明与 conf\process-compose.yaml
# 重名的顶层进程键（如 pg/chat-bridge），会覆盖真基础设施定义致整栈 crash-loop（s95 批 pg 停机实录）。
# 守卫：聚合前逐文件提取顶层进程键（两缩进键，行级解析，桥 appParseYaml 同款判据），命中基础设施
# 键集 → 跳过该文件不聚合 + 一行人话告警。键集从主 yaml 现读（单一真相源，不硬编码列表——
# 9 键勘误教训：nats 非 nats-server、pg 非 postgres）。
# 降级：主 yaml 读不到时 fail-open（只告警不跳过），防守卫自己挡启动。
# 告警去两处：console + conf\apps.guard.log（每次运行覆写，只反映本次；零告警时删除旧档）。
$ErrorActionPreference = 'Continue'
$ForgeRoot = Split-Path -Parent $PSScriptRoot

# 顶层进程键提取：`processes:` 段下恰两缩进的键（更深层不匹配；注释/空行跳过；顶格行=段结束）
function Get-TopProcKeys([string]$text) {
    $keys = @()
    $inProcs = $false
    foreach ($l in ($text -split "\r?\n")) {
        if ($l -notmatch '\S') { continue }
        if ($l -match '^\s*#') { continue }
        if (-not $inProcs) { if ($l -match '^processes:\s*$') { $inProcs = $true }; continue }
        if ($l -match '^\S') { break }
        $mk = [regex]::Match($l, '^  ([^\s:][^:]*):')
        if ($mk.Success) { $keys += $mk.Groups[1].Value.Trim() }
    }
    # 注意：不加 ,@() 包裹——包裹后输出为「单个数组对象」，@(fn | Where-Object) 里 $_=整个数组、
    # ContainsKey 恒 false（s96 段级测试 13/24 实锤）；裸 return 空数组时输出零项，两种消费端语义都正确
    return $keys
}

$warn = @()

# 1) 基础设施键集：主 yaml 现读（读不到 = fail-open，见头注）
$infra = @{}
$mainYaml = Join-Path $ForgeRoot 'conf\process-compose.yaml'
if (Test-Path $mainYaml) {
    foreach ($k in (Get-TopProcKeys ([IO.File]::ReadAllText($mainYaml)))) { $infra[$k] = $true }
} else {
    $warn += '[apps-guard] 读不到 conf\process-compose.yaml，基础设施键守卫本次未生效（apps 已按原样全部聚合）'
}

# 2) 逐文件聚合（命中基础设施键 → 整文件跳过，不进产物）
$d = Join-Path $ForgeRoot 'apps'
$out = Join-Path $ForgeRoot 'conf\apps.env.yaml'
$keep = @()
$yamls = @(Get-ChildItem $d -Filter *.yaml -ErrorAction SilentlyContinue | Sort-Object Name)
foreach ($y in $yamls) {
    $raw = [IO.File]::ReadAllText($y.FullName)
    if ($infra.Count -gt 0) {
        $hits = @(Get-TopProcKeys $raw | Where-Object { $infra.ContainsKey($_) })
        if ($hits.Count -gt 0) {
            $warn += ('[apps-guard] apps/' + $y.Name + ' 里有和系统组件重名的进程，已跳过它防止启动出问题——跟小 forge 说一声让它修一下（重名进程：' + ($hits -join '、') + '）')
            continue
        }
    }
    $keep += ($raw -replace '(?m)^processes:\s*$', '')
}

# 3) 产物（无文件或全部被跳过 = 空 processes，与既有语义一致）
if ($keep.Count -gt 0) {
    [IO.File]::WriteAllText($out, ('processes:' + [Environment]::NewLine + ($keep -join [Environment]::NewLine)))
} else {
    [IO.File]::WriteAllText($out, 'processes: {}')
}

# 4) 告警落两处：log（UTF-8 覆写）+ console
$log = Join-Path $ForgeRoot 'conf\apps.guard.log'
if ($warn.Count -gt 0) {
    [IO.File]::WriteAllLines($log, $warn)
    foreach ($w in $warn) { Write-Host $w }
} elseif (Test-Path $log) {
    Remove-Item $log -Force
}
