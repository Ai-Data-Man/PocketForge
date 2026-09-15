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
set "PC_EXE=%FORGE_ROOT%\bin\pc\process-compose.exe"
set "DOWN_LOG=%TEMP%\pf-down-%RANDOM%.txt"
set "PC_DISABLE_TUI=1"
"%PC_EXE%" -p %PC_PORT% down <nul >"%DOWN_LOG%" 2>&1

rem ---- wait for it to actually go away (API unreachable or nothing running) ----
set /a TRIES=0
:wait_stop
powershell -NoProfile -Command "try{if((Invoke-RestMethod ('http://127.0.0.1:'+%PC_PORT%+'/processes') -TimeoutSec 1).data|?{$_.is_running}){exit 1}}catch{exit 0};exit 0" >nul 2>&1
if not errorlevel 1 goto stopped
set /a TRIES+=1
if %TRIES% geq 8 goto hard_stop
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

:stopped
echo [PocketForge] all stopped.
del "%DOWN_LOG%" >nul 2>&1
pause
exit /b 0

:stopped_hard
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
