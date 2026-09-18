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
# 就绪后：打印地址 → 首启 welcome（s50 语义保留：start 异步，等 3 秒浏览器读走文件再改名
# welcome.shown）→ Edge --app 聊天窗（与 跟数字员工聊天.cmd 同参数同 profile）。超时只打印人话，
# 不弹浏览器。端口 8790 与 conf/process-compose.yaml、跟数字员工聊天.cmd 同源硬编码。
$ErrorActionPreference = 'Continue'
$ForgeRoot = Split-Path -Parent $PSScriptRoot
$Port = 8790
$TimeoutSec = 240

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
if (Test-Path $regCmd) {
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
