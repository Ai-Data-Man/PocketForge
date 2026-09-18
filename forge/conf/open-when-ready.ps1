# s97/主线2：启动器「就绪后开窗」观察器。启动数字员工.cmd 在 pc up 前以 start "" /b 拉起本脚本
# （共享控制台，输出与 pc 日志混排可接受）。动机：旧版首启 welcome 在 pc up 之前只等 3 秒就打开，
# 栈还没起来；且启动器从不打开聊天地址、不打印地址。
# 语义：轮询桥就绪（TCP 8790 通 + GET /healthz 200；1s 间隔，240s 超时）——就绪前不开任何窗口。
# s97/F-12 根治：首次 healthz 后、开窗前，先静默跑 bin\pc\forge-register.cmd converge（与启动器
# pc up 完全相同的 env+三件套文件集的 project update）——pc v1.122.0 守护生命周期内第一次 JSON
# update 因 Vars(PC_REPLICA_NUM) int→float64 往返漂移必全表重启一次（docs/research/34）；把它消耗
# 在无在飞回合的启动窗口，此后 agent 首次注册=no-op 添加而非全表重启。收敛自身会重启 chat-bridge，
# 故随后重新轮询 healthz，桥回来才开窗。收敛失败/超时只打一行 warn 不阻断（退回旧行为：注册时再
# 付一次重启代价，不致命）。
# s97/v0.9.15 发布门：收敛 update 的全表重启会打伤尚在 pending 的一次性（is_daemon:false）链——恰逢
# 依赖判定窗口（faucet healthy 判定中）时 daily-backup/faucet-provision/faucet-rawsql/goose-scheduler
# 全部 Skipped exit=1（restart:'no' 不自愈）→备份/供给/调度缺失（rel151 实录）。两层防护：
# ①沉降等待：收敛前轮询主 yaml 现读的 is_daemon:false 键集，全部离开在飞态（Pending/Launching/
# Running 之外即终态：Completed/Skipped/Error）才收敛；独立 30s 上限（不吃 240s 预算），超时照跑
# 收敛（进入第②层兜底）。终态判据只用 status——pc v1.122 JSON 对在飞进程 exit_code 也报 0 而非
# null（rel152 实测：Launching exit_code=0），null 判据恒假会让等待空转直达超时。
# ②补跑校验：收敛+healthz 200 后复查键集，Skipped/Pending/Error 者逐个 pc process start 补跑
# （rawsql/provision/backup 均幂等脚本）；补跑的 10s 观察窗放在开窗之后，只 warn 不阻断主流程。
# 就绪后：打印地址 → 首启 welcome（s50 语义保留：start 异步，等 3 秒浏览器读走文件再改名
# welcome.shown）→ Edge --app 聊天窗（与 跟数字员工聊天.cmd 同参数同 profile）。超时只打印人话，
# 不弹浏览器。端口 8790 与 conf/process-compose.yaml、跟数字员工聊天.cmd 同源硬编码。
$ErrorActionPreference = 'Continue'
$ForgeRoot = Split-Path -Parent $PSScriptRoot
$Port = 8790
$TimeoutSec = 240

# pc 客户端定位：端口与 forge-register.cmd 同源（data\pc.port，缺失/非数字回落 8099）
$pcExe = Join-Path $ForgeRoot 'bin\pc\process-compose.exe'
$pcPort = 8099
$pcPortFile = Join-Path $ForgeRoot 'data\pc.port'
if (Test-Path $pcPortFile) {
    try {
        $pv = [string](Get-Content $pcPortFile -TotalCount 1 -ErrorAction Stop)
        if ($pv -match '^\s*(\d+)\s*$') { $pcPort = [int]$Matches[1] }
    } catch { }
}

function Test-BridgeReady {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', $Port)
        if (-not $client.Connected) { return $false }
    } catch { return $false } finally { $client.Close() }
    try {
        $req = [Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/healthz")
        $req.Timeout = 3000
        $req.Proxy = $null
        $resp = $req.GetResponse()
        try { return (([int]$resp.StatusCode) -eq 200) } finally { $resp.Close() }
    } catch { return $false }
}

function Wait-BridgeReady([datetime]$Deadline) {
    while (-not (Test-BridgeReady)) {
        if ((Get-Date) -gt $Deadline) { return $false }
        Start-Sleep -Seconds 1
    }
    return $true
}

# 一次性键集：主 yaml 现读 `processes:` 段下 is_daemon:false 的顶层键（行级解析，
# conf\apps-aggregate.ps1 Get-TopProcKeys 同款判据：恰两缩进=顶层键，其下更深缩进的
# is_daemon:false 行=归入当前键；注释/空行跳过，顶格行=段结束）
function Get-OneshotKeys([string]$text) {
    $keys = @()
    $inProcs = $false
    $cur = $null
    foreach ($l in ($text -split "\r?\n")) {
        if ($l -notmatch '\S') { continue }
        if ($l -match '^\s*#') { continue }
        if (-not $inProcs) { if ($l -match '^processes:\s*$') { $inProcs = $true }; continue }
        if ($l -match '^\S') { break }
        $mk = [regex]::Match($l, '^  ([^\s:][^:]*):')
        if ($mk.Success) { $cur = $mk.Groups[1].Value.Trim(); continue }
        if ($null -ne $cur -and $l -match '^\s+is_daemon:\s*false\s*$') { $keys += $cur }
    }
    return $keys
}

# pc process list -o json；失败/空/非 JSON 一律返回 $null（调用方按查不到处理，不抛不炸）
function Get-PcProcs {
    if (-not (Test-Path $pcExe)) { return $null }
    try {
        $out = (& $pcExe -p $pcPort process list -o json 2>$null) -join "`n"
        if (-not $out.Trim()) { return $null }
        return @($out | ConvertFrom-Json)
    } catch { return $null }
}

$deadline = (Get-Date).AddSeconds($TimeoutSec)
if (-not (Wait-BridgeReady $deadline)) {
    Write-Host ''
    Write-Host "[PocketForge] 启动没完成：等了 $TimeoutSec 秒服务还没就绪，就不自动开窗口了。"
    Write-Host '排查看 data\logs\pc.log。如果黑窗口还开着、服务只是慢，稍等后直接双击「跟数字员工聊天.cmd」试试。'
    exit 1
}

# s97/F-12：消耗守护生命周期内第一次 JSON update（见头注）。90s 超时兜底：pc update 实测 ~1s 返回，
# 挂死=树杀后放弃收敛，不卡死开窗。
$regCmd = Join-Path $ForgeRoot 'bin\pc\forge-register.cmd'
$recheckKeys = @()
if (Test-Path $regCmd) {
    # 第①层：等一次性链沉降再收敛（update 全表重启会打伤 pending 的一次性键，见头注）。
    # 键集主 yaml 现读，读不到/为空回落硬编码四键（与 v0.9.15 主 yaml 一致）。
    $oneshotKeys = @('faucet-rawsql', 'faucet-provision', 'daily-backup', 'pg-init')
    try {
        $mainYaml = Join-Path $ForgeRoot 'conf\process-compose.yaml'
        if (Test-Path $mainYaml) {
            $keys = @(Get-OneshotKeys ([IO.File]::ReadAllText($mainYaml)))
            if ($keys.Count -gt 0) { $oneshotKeys = $keys }
        }
    } catch { }
    $settleDeadline = (Get-Date).AddSeconds(30)
    while ($true) {
        $procs = Get-PcProcs
        $settled = $false
        if ($null -ne $procs) {
            $settled = $true
            foreach ($k in $oneshotKeys) {
                $e = @($procs | Where-Object { $_.name -eq $k })
                # 在飞才等：Pending/Launching/Running 之外（Completed/Skipped/Error…）都是终态。
                # 不用 exit_code 判终态——pc v1.122 对在飞进程也报 exit_code=0（rel152 实测）。
                if ($e.Count -eq 0) { $settled = $false; break }
                if (@('Pending', 'Launching', 'Running') -contains $e[0].status) { $settled = $false; break }
            }
        }
        if ($settled) { break }
        if ((Get-Date) -gt $settleDeadline) {
            Write-Host '[PocketForge] 等一次性组件沉降超时（30s），照常收敛——若组件被跳过，稍后自动补跑。'
            break
        }
        Start-Sleep -Seconds 1
    }
    try {
        $p = Start-Process -FilePath $env:ComSpec -ArgumentList ('/c ""{0}" converge"' -f $regCmd) -NoNewWindow -PassThru
        if (-not $p.WaitForExit(90000)) {
            & taskkill /F /T /PID $p.Id | Out-Null
            Write-Host '[PocketForge] 收敛超时（90s），跳过——首次注册时再付一次重启代价，不致命。'
        } elseif ($p.ExitCode -ne 0) {
            Write-Host "[PocketForge] 收敛失败（rc=$($p.ExitCode)），跳过——首次注册时再付一次重启代价，不致命。"
        }
    } catch {
        Write-Host "[PocketForge] 收敛异常：$($_.Exception.Message)"
    }
    # 首更全表重启含 chat-bridge——桥回 healthz 200 才开窗；共用同一 240s 总预算（deadline 不重置）。
    if (-not (Wait-BridgeReady $deadline)) {
        Write-Host ''
        Write-Host "[PocketForge] 启动没完成：等了 $TimeoutSec 秒服务还没就绪，就不自动开窗口了。"
        Write-Host '排查看 data\logs\pc.log。如果黑窗口还开着、服务只是慢，稍等后直接双击「跟数字员工聊天.cmd」试试。'
        exit 1
    }

    # 第②层：收敛后补跑校验（第①层超时/漏网时兜底）。Skipped/Pending/Error 的一次性键逐个
    # pc process start（rawsql/provision/backup 均幂等脚本，安全重跑）；记下补跑键，观察窗挪到
    # 开窗之后（见脚本尾部），不阻塞打印/开窗主流程。
    $procs = Get-PcProcs
    if ($null -ne $procs) {
        foreach ($k in $oneshotKeys) {
            $e = @($procs | Where-Object { $_.name -eq $k })
            if ($e.Count -gt 0 -and @('Skipped', 'Pending', 'Error') -contains $e[0].status) {
                $recheckKeys += $k
                Write-Host ('[PocketForge] 收敛后有一次性组件没起来，补跑：' + $k)
                try {
                    & $pcExe -p $pcPort process start $k 2>$null | Out-Null
                    if ($LASTEXITCODE -ne 0) { Write-Host "[PocketForge] 补跑 $k 未受理（rc=$LASTEXITCODE）。" }
                } catch {
                    Write-Host "[PocketForge] 补跑 $k 异常：$($_.Exception.Message)"
                }
            }
        }
    }
}

Write-Host ''
Write-Host "[PocketForge] 小 forge 已就绪：http://127.0.0.1:$Port"
Write-Host '聊天窗口已自动打开；没弹出来的话，双击文件夹里的「跟数字员工聊天.cmd」。'

# 首启欢迎页（data\welcome.html 仅首次启动存在；改名为 welcome.shown 防下次再开）
$welcome = Join-Path $ForgeRoot 'data\welcome.html'
if (Test-Path $welcome) {
    Start-Process -FilePath $welcome
    Start-Sleep -Seconds 3
    try { Rename-Item -Path $welcome -NewName 'welcome.shown' -ErrorAction Stop } catch { }
}

# 聊天窗：专用 profile 强制新开 Edge 实例（已有窗口会吞掉 --app）；Edge 不在预期路径回落默认浏览器
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (Test-Path $edge) {
    Start-Process -FilePath $edge -ArgumentList "--app=http://127.0.0.1:$Port", '--window-size=480,760', "--user-data-dir=$($ForgeRoot)\data\chat-window-profile"
} else {
    Start-Process "http://127.0.0.1:$Port"
}

# 第②层观察窗（开窗之后才跑，不阻塞主流程）：补跑键给 10s 观察期，仍未 Completed 只 warn。
if ($recheckKeys.Count -gt 0) {
    Start-Sleep -Seconds 10
    $recheck = Get-PcProcs
    foreach ($k in $recheckKeys) {
        $e = @()
        if ($null -ne $recheck) { $e = @($recheck | Where-Object { $_.name -eq $k }) }
        if ($e.Count -eq 0 -or $e[0].status -ne 'Completed') {
            $st = '(查不到)'
            if ($e.Count -gt 0) { $st = $e[0].status }
            Write-Host "[PocketForge] 警告：$k 补跑后 10s 观察窗内未达 Completed（当前 $st），请查 data\logs\pc.log。"
        }
    }
}
