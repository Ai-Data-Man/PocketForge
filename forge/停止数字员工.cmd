@echo off
setlocal EnableExtensions
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"
set /a PC_PORT=8099
rem M1(审查s15): set /a 读不了文件内容，改 for /f
for /f "usebackq delims=" %%i in (`type "%FORGE_ROOT%\data\pc.port" 2^>nul`) do set "PC_PORT=%%i"
rem s66 fix: pc v1.122.0 has no "shutdown" verb (unknown command was hidden by 2^>nul, stack kept running); correct verb is "down"
"%FORGE_ROOT%\bin\pc\process-compose.exe" -p %PC_PORT% down 2>nul
echo [PocketForge] stop requested.
pause
