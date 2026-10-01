@echo off
setlocal EnableExtensions
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"
set /a PC_PORT=8099
rem M1(review s15): set /a cannot read file content, use for /f instead
for /f "usebackq delims=" %%i in (`type "%FORGE_ROOT%\data\pc.port" 2^>nul`) do set "PC_PORT=%%i"
rem s66 fix: pc v1.122.0 has no "shutdown" verb (unknown command was hidden by 2^>nul, stack kept running); correct verb is "down"
rem (ASCII discipline: this file must stay pure ASCII -- cmd parses it in the ANSI codepage;
rem  UTF-8 Chinese comment bytes got paired as GBK and ate the next line's head, s67 proven)

rem ---- s91: graceful stop. stdin MUST be redirected away from the console and TUI disabled -
rem ---- otherwise the down client can sit waiting on the console and never return
rem ---- (user hit it 2026-09-15: the stop script appeared to do nothing / hung).
rem ---- s97: the down client must run DETACHED. If the pc daemon is wedged (half-started
rem ---- or stuck in an update) the client never returns, and a synchronous call wedges this
rem ---- script right here - the wait/kill escalation below is then unreachable. The wedged
rem ---- client is itself cleaned up by hard_stop (same exe name under this forge root).
set "PC_EXE=%FORGE_ROOT%\bin\pc\process-compose.exe"
set "DOWN_LOG=%TEMP%\pf-down-%RANDOM%.txt"
set "PC_DISABLE_TUI=1"
start "" /b cmd /c ""%PC_EXE%" -p %PC_PORT% down <nul >"%DOWN_LOG%" 2>&1"

rem ---- wait for it to actually go away (API unreachable or nothing running) ----
rem ---- 15 tries: measured graceful stop incl postgres takes 8-10s, 8 was too tight (s97) ----
set /a TRIES=0
:wait_stop
powershell -NoProfile -Command "try{if((Invoke-RestMethod ('http://127.0.0.1:'+%PC_PORT%+'/processes') -TimeoutSec 1).data|?{$_.is_running}){exit 1}}catch{exit 0};exit 0" >nul 2>&1
if not errorlevel 1 goto stopped
set /a TRIES+=1
if %TRIES% geq 15 goto hard_stop
timeout /t 1 /nobreak >nul
goto wait_stop

rem ---- s91: graceful stop did not finish. Measured 2026-09-15: children can be gone while the pc daemon
rem ---- itself lingers holding the port, and closing the black window does nothing (pc is a separate
rem ---- process). Escalate: kill stack executables that belong to THIS forge root only, then re-verify.
:hard_stop
echo [PocketForge] normal stop did not finish; forcing shutdown...
powershell -NoProfile -Command "$root='%FORGE_ROOT%'; Get-Process -Name process-compose,postgres,faucet,nats-server -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { try{ Stop-Process -Id $_.Id -Force -ErrorAction Stop }catch{} }; 'forced'" >nul 2>&1

set /a TRIES2=0
:wait_stop2
powershell -NoProfile -Command "try{if((Invoke-RestMethod ('http://127.0.0.1:'+%PC_PORT%+'/processes') -TimeoutSec 1).data|?{$_.is_running}){exit 1}}catch{exit 0};exit 0" >nul 2>&1
if not errorlevel 1 goto stopped_hard
set /a TRIES2+=1
if %TRIES2% geq 8 goto not_stopped
timeout /t 1 /nobreak >nul
goto wait_stop2

rem ---- s97/F-13: close Edge windows anchored to THIS install root (chat window profile and
rem ---- welcome page live under data\ - while they run the install folder cannot be renamed
rem ---- or deleted, breaking the "delete folder = full uninstall" acceptance line) ----
rem ---- s107/f8: post-stop port sweep (bounded, 15s budget, 1baffa5 precedent). Root cause of the
rem ---- 2026-10-02 incident: a postgres --forkchild backend that inherited the 5432 LISTENING
rem ---- socket survives the pc tree-kill after reparenting; wait_stop only watches the pc API,
rem ---- so a clean pc exit jumps straight to :stopped and the orphan is never collected. Next
rem ---- start then crash-loops pg on the busy port ("cannot connect to database"). Sweep every
rem ---- product port (data\*.port current values + known defaults): alive holder whose exe path
rem ---- is under THIS root gets killed (path-scoped, foreign processes untouched); a port held
rem ---- by a dead PID (ghost socket) gets a wait-and-retry, then one plain-language hint.
:stopped
powershell -NoProfile -Command "$root='%FORGE_ROOT%'; $ports=@(8790,8091,8099,5432,4222,8222); foreach($f in @('pc.port','pg.port','faucet.port')){ try{ $v=[int](Get-Content (Join-Path $root ('data\'+$f)) -ErrorAction Stop).Trim(); $ports+=$v }catch{} }; $ports=@($ports | Sort-Object -Unique); $sw=[Diagnostics.Stopwatch]::StartNew(); do{ $again=$false; foreach($p in $ports){ $c=$null; try{ $c=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop | Select-Object -First 1 }catch{}; if($c){ $pr=Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if($pr -and $pr.Path -and $pr.Path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){ try{ Stop-Process -Id $pr.Id -Force -ErrorAction Stop }catch{}; $again=$true } elseif(-not $pr){ $again=$true } } }; if($again -and $sw.Elapsed.TotalSeconds -lt 12){ Start-Sleep -Seconds 3 } } while($again -and $sw.Elapsed.TotalSeconds -lt 12); foreach($p in $ports){ $c=$null; try{ $c=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop | Select-Object -First 1 }catch{}; if($c){ $pr=Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if((-not $pr) -or ($pr.Path -and $pr.Path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase))){ Write-Host ('[PocketForge] port '+$p+' is still busy. Wait a few seconds, then start again.') } } }"
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -and $_.CommandLine -match [regex]::Escape('%FORGE_ROOT%') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 2 /nobreak >nul
echo [PocketForge] all stopped.
del "%DOWN_LOG%" >nul 2>&1
pause
exit /b 0

:stopped_hard
powershell -NoProfile -Command "$root='%FORGE_ROOT%'; $ports=@(8790,8091,8099,5432,4222,8222); foreach($f in @('pc.port','pg.port','faucet.port')){ try{ $v=[int](Get-Content (Join-Path $root ('data\'+$f)) -ErrorAction Stop).Trim(); $ports+=$v }catch{} }; $ports=@($ports | Sort-Object -Unique); $sw=[Diagnostics.Stopwatch]::StartNew(); do{ $again=$false; foreach($p in $ports){ $c=$null; try{ $c=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop | Select-Object -First 1 }catch{}; if($c){ $pr=Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if($pr -and $pr.Path -and $pr.Path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){ try{ Stop-Process -Id $pr.Id -Force -ErrorAction Stop }catch{}; $again=$true } elseif(-not $pr){ $again=$true } } }; if($again -and $sw.Elapsed.TotalSeconds -lt 12){ Start-Sleep -Seconds 3 } } while($again -and $sw.Elapsed.TotalSeconds -lt 12); foreach($p in $ports){ $c=$null; try{ $c=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop | Select-Object -First 1 }catch{}; if($c){ $pr=Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if((-not $pr) -or ($pr.Path -and $pr.Path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase))){ Write-Host ('[PocketForge] port '+$p+' is still busy. Wait a few seconds, then start again.') } } }"
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -and $_.CommandLine -match [regex]::Escape('%FORGE_ROOT%') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 2 /nobreak >nul
echo [PocketForge] all stopped (forced).
del "%DOWN_LOG%" >nul 2>&1
pause
exit /b 0

:not_stopped
echo [PocketForge] WARNING: some programs may still be running.
echo   details: %DOWN_LOG%
echo   run this script again, or restart the computer.
pause
exit /b 1
