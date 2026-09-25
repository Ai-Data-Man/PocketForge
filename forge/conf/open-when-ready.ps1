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
# ①沉降等待：收敛前轮询主 yaml 现读的 is_daemon:false 键集，全部离开 Pending/Restarting（依赖判定窗口，
# s98/R2-P4-2 早退判据；Launching/Running/终态均放行）即收敛；独立 30s 上限（不吃 240s 预算），超时照跑
# 收敛（进入第②层兜底）。fix(s100/pg-skip)：pg-init 单键特判要求 Completed 终态——initdb 在飞时放行
# converge 会被 update 硬杀 → pg 永久 Skipped（research/39）；其余键 R2 早退不动。终态判据只用 status——pc v1.122 JSON 对在飞进程 exit_code 也报 0 而非
# null（rel152 实测：Launching exit_code=0），null 判据恒假会让等待空转直达超时。
# ②补跑校验：收敛+healthz 200 后复查键集，Skipped/Pending/Error 者逐个 pc process start 补跑
# （rawsql/provision/backup 均幂等脚本）；名单含 pg（fix(s100/pg-skip)：非 Running 即补跑，
# pc process start pg 幂等）；补跑的 10s 观察窗放在开窗之后，只 warn 不阻断主流程。
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

# s98/B2: 收敛过程落文件日志（追加式，时间戳+rc；成功/失败都落；黑窗 Write-Host 输出不动）——R3 QA 曾以
# 时间线+源码双证替代，本件让下轮可直接读文件。data\logs 或文件不存在自动建；写不进只吞不阻断开窗。
# 行内容保持 ASCII（PS5.1 Add-Content 新文件默认 ANSI 码页，中文会烂）。
$ConvergeLog = Join-Path $ForgeRoot 'data\logs\open-when-ready.log'
function Write-ConvergeLog([string]$msg) {
    try {
        $dir = Split-Path -Parent $ConvergeLog
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $ConvergeLog -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
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
        # s98/R2-P4-2: 早退判据=全部离开 Pending/Restarting 即收敛（依赖判定窗口=rel151 Skipped 家族的真正
        # 危险窗；Launching/Running/终态均放行）。修前等全终态，R2 实测常吃满 30s 上限（冷启 54.2s vs R1 35.4s）；
        # 30s 上限保底不动，第②层补跑校验继续兜底。不用 exit_code 判终态——pc v1.122 对在飞进程也报 exit_code=0
        # （rel152 实测）。
        if ($e.Count -eq 0) { $settled = $false; break }
        if (@('Pending', 'Restarting') -contains $e[0].status) { $settled = $false; break }
        # fix(s100/pg-skip): pg-init 特判回终态口径——只对这一个键恢复 17d0d43 语义（要求 Completed），
        # 其余 oneshot 键保留 R2 早退省时。initdb 在飞(Running)时放行 converge → pc project update 全表
        # 重启 taskkill 硬杀 pg-init(exit=1) → pg depends_on 见 exit≠0 永久 Skipped 且永不复查
        # （research/39 §3.1；单变量=fc5464a）。
        if ($k -eq 'pg-init' -and $e[0].status -ne 'Completed') { $settled = $false; break }
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
        # s98/R1-F2: PS5.1 Start-Process -PassThru 不保持进程句柄 → 退出后 ExitCode 恒空（本机 40/40 实测，
        # 无参 WaitForExit() flush 也救不回）——预读 .Handle 强制保持句柄，「收敛失败（rc=）」假警报根治
        # （iat14 冷启+s97 dev drill 两轮实录）；flush 为 .NET 纪律随行（WaitForExit(ms) 后无参重载再读 ExitCode）。
        try { $null = $p.Handle } catch { } # 瞬退竞态下读句柄可抛——失败即回落旧行为，不阻断收敛等待
        if (-not $p.WaitForExit(90000)) {
            & taskkill /F /T /PID $p.Id | Out-Null
            Write-Host '[PocketForge] 收敛超时（90s），跳过——首次注册时再付一次重启代价，不致命。'
            Write-ConvergeLog 'converge: timeout after 90s (killed)' # s98/B2
        } else {
            $p.WaitForExit()
            Write-ConvergeLog ("converge rc={0}" -f $p.ExitCode) # s98/B2: 成功失败都落（rc=0 即收敛成功）
            if ($p.ExitCode -ne 0) {
                Write-Host "[PocketForge] 收敛失败（rc=$($p.ExitCode)），跳过——首次注册时再付一次重启代价，不致命。"
            }
        }
    } catch {
        Write-Host "[PocketForge] 收敛异常：$($_.Exception.Message)"
        Write-ConvergeLog ("converge exception: {0}" -f $_.Exception.Message) # s98/B2
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
    # s98/R1-F3: 首查命中的键先经 2s 瞬态复核再补跑——收敛重启窗口期 pc JSON 会短暂报 Skipped，
    # 旧码立即补跑 → 组件自愈启动中 process start 被拒 rc=1 →「未受理」噪音×N 而链实际全绿
    # （iat14 实录三连）。真终态（restart:'no' 不自愈）2s 后仍原地，复核不漏；2s 只在首查有命中时付。
    $procs = Get-PcProcs
    if ($null -ne $procs) {
        $flagged = @()
        # fix(s100/pg-skip): 补跑名单加 pg——pc 对 Skipped 是终态永不复查（research/39 §3.1-6），第①层
        # 30s 超时漏网时在此兜底：pg 非 Running 即 pc process start pg（幂等；17d0d43 补跑同族，
        # 首查命中的 2s 瞬态复核见下，容收敛重启窗口的短暂误报）。
        # fix(s102/sched-skip): daemon 补跑组=带 depends_on 的 daemon 全体（{pg, goose-scheduler}）——
        # goose-scheduler 化身闩在 pre-Ready 的 faucet 上遇 converge taskkill 即 Skipped 终态
        # （rel151=17d0d43 与 iat18 两实录；机制/幂等性与 pg 同族，research/39 §4.2 + tmp/s102-sched-rca.md）；
        # nats/faucet/chat-bridge 无 depends_on，对该机制结构性免疫不收。维护判据：新增 daemon 带
        # depends_on 必须同时进本组；反之删 yaml 里的 daemon 键需同步删组（残留键=「未受理」+2s 复核+10s
        # 观察窗三重补跑噪音，qa s102 P4-5 建议）。
        $daemonPatch = @('pg', 'goose-scheduler')
        foreach ($k in ($oneshotKeys + $daemonPatch)) {
            $e = @($procs | Where-Object { $_.name -eq $k })
            if ($daemonPatch -contains $k) {
                # 旗标只收终态集（Skipped/Error/缺失）——Pending=依赖等待自愈中，不是终态：三臂 N1 实录
                # converge 重启窗内 daemon 仍 Pending（等 faucet 再 Ready ~5-10s）被「非 is_running 即旗标」
                # 误打补跑噪音（restarts 恒 0 无害，tmp/s102-sched-arms/report.md 🟡）；健康 daemon 的
                # status 恒 Launching + is_running=true，Skipped/Error/缺失才真没人管（research/39）。
                if ($e.Count -eq 0 -or @('Skipped', 'Error') -contains $e[0].status) { $flagged += $k }
            } elseif ($e.Count -gt 0 -and @('Skipped', 'Pending', 'Error') -contains $e[0].status) { $flagged += $k }
        }
        if ($flagged.Count -gt 0) {
            Start-Sleep -Seconds 2
            $procs = Get-PcProcs
            if ($null -eq $procs) { $procs = @() }
        }
        foreach ($k in $flagged) {
            $e = @($procs | Where-Object { $_.name -eq $k })
            if ($daemonPatch -contains $k) {
                if ($e.Count -gt 0 -and $e[0].is_running -eq $true) { continue } # 已在跑（幂等容错），不补跑
            } elseif ($e.Count -gt 0 -and @('Skipped', 'Pending', 'Error') -notcontains $e[0].status) { continue } # 瞬态已离开，不补跑
            $recheckKeys += $k
            Write-Host ('[PocketForge] 收敛后有组件没起来，补跑：' + $k)
            try {
                & $pcExe -p $pcPort process start $k 2>$null | Out-Null
                $rcStart = $LASTEXITCODE # s98/R1-F3: 立即定格——随后的 Get-PcProcs 是原生调用，会把 $LASTEXITCODE 重置（冷启实录 rc 被冲成 0 自相矛盾）
                if ($rcStart -ne 0) {
                    # rc≠0 多为组件已在队列/自愈启动中被拒——状态复核而非裸 rc 定夺要不要报；
                    # Pending/Launching/Running/Completed=已被守护接管（终态兜底归尾部 10s 观察窗），
                    # 仅 Skipped/Error/查不到才真是没人管（s98/R1-F3）。
                    $e3 = @((Get-PcProcs) | Where-Object { $_.name -eq $k })
                    $st3 = '(查不到)'
                    if ($e3.Count -gt 0) { $st3 = $e3[0].status }
                    if (@('Pending', 'Launching', 'Running', 'Completed') -notcontains $st3) {
                        Write-Host "[PocketForge] 补跑 $k 未受理（rc=$rcStart，状态 $st3）。"
                    }
                }
            } catch {
                Write-Host "[PocketForge] 补跑 $k 异常：$($_.Exception.Message)"
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
        # fix(s100/pg-skip): daemon 补跑组健康态=is_running（daemon status 恒报 Launching，见第②层注）；oneshot 看 Completed
        $ok = $false
        if ($daemonPatch -contains $k) { if ($e.Count -gt 0 -and $e[0].is_running -eq $true) { $ok = $true } }
        elseif ($e.Count -gt 0 -and $e[0].status -eq 'Completed') { $ok = $true }
        if (-not $ok) {
            $st = '(查不到)'
            if ($e.Count -gt 0) { $st = $e[0].status }
            Write-Host "[PocketForge] 警告：$k 补跑后 10s 观察窗内未达健康态（当前 $st），请查 data\logs\pc.log。"
        }
    }
}
