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
"%FORGE_ROOT%\bin\pc\process-compose.exe" -p %PC_PORT% down 2>nul
rem s67(STATE item6/qa P3-5): verify stop actually took effect; poll pc API ~10s.
rem stopped = API unreachable (pc exited) or no process with is_running=true
set /a TRIES=0
:wait_stop
powershell -NoProfile -Command "try{if((Invoke-RestMethod ('http://127.0.0.1:'+%PC_PORT%+'/processes') -TimeoutSec 1).data|?{$_.is_running}){exit 1}}catch{exit 0};exit 0" >nul 2>&1
if not errorlevel 1 goto stopped
set /a TRIES+=1
if %TRIES% geq 6 goto not_stopped
timeout /t 1 /nobreak >nul
goto wait_stop
:stopped
echo [PocketForge] all stopped.
pause
exit /b 0
:not_stopped
echo [PocketForge] WARNING: some programs may still be running. Close this window and run stop again, or restart the computer.
pause
exit /b 1
