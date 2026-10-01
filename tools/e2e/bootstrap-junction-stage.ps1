# [s107/f6 入库] 用途：bootstrap.ps1 memory junction 守卫三态验证摆臂（s107/f3 留痕批的验证驱动）——
#   fake=摆向假目标（复刻 s106/F3 错向形态）→跑 bootstrap→应出「修复(旧目标 X → 新目标 Y)」行+junction 归位；
#   new=拆除→应出「新建(目标 Y)」；keep=正常态→应出「保持(目标 Z)」零动作。判定靠 grep 日志行（人判或脚本判）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools/e2e/bootstrap-junction-stage.ps1 <fake|new|keep> <log 绝对路径>
#   注意：fake/new 会摆动 Administrator 的 %APPDATA% junction——只在本机 dev 树窗口内用（沙盒栈在跑时勿动，
#   junction 是全局单例，ADR-0005 双向争抢形态）；跑完终态应回 dev 树（keep 模式复核）。
# 来源：s107 会话 tmp/s107-f3-stage.ps1（f3 红绿驱动：红=旧 bootstrap 零 junction 行，绿=三态行齐）。
# s107/f3 红绿 staging：摆动 Administrator junction（假目标/拆除/保持）→ 跑 bootstrap.ps1（全流捕获）→ 报 junction 终态
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tmp/s107-f3-stage.ps1 <fake|new|keep> <log 绝对路径>
param([string]$Mode, [string]$Log)
$ErrorActionPreference = 'Continue'
$bootstrap = 'C:\ZCodeWorks\PocketForge\forge\conf\bootstrap.ps1'
$fake      = 'C:\ZCodeWorks\PocketForge\tmp\s107-f3-fake-mem'
$memApp    = Join-Path $env:APPDATA 'Block\goose\config\memory'

switch ($Mode) {
    'fake' {
        New-Item -ItemType Directory -Force -Path $fake | Out-Null
        if (Test-Path $memApp) { cmd /c rmdir "$memApp" }
        $out = cmd /c mklink /J "$memApp" "$fake" 2>&1
        Write-Output ("STAGE fake: " + ($out -join ' '))
    }
    'new' {
        if (Test-Path $memApp) { cmd /c rmdir "$memApp" }
        Write-Output 'STAGE new: junction 已拆除（原位不存在）'
    }
    'keep' {
        $i = Get-Item $memApp -Force
        Write-Output ("STAGE keep: 原状 " + $i.LinkType + " -> " + ($i.Target -join ''))
    }
}

$rc = 0
try {
    & $bootstrap *> $Log
} catch {
    $rc = 1
    "BOOTSTRAP-THREW: $_" | Add-Content $Log
}
Write-Output ("BOOTSTRAP-RC=" + $rc)
$j = if (Test-Path $memApp) { Get-Item $memApp -Force } else { $null }
if ($null -ne $j) { Write-Output ("FINAL: LinkType=" + $j.LinkType + " Target=" + ($j.Target -join '')) } else { Write-Output 'FINAL: MISSING' }
