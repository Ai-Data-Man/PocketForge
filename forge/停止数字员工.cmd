@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"
for /f "usebackq eol=# tokens=1,2 delims==" %%a in ("%FORGE_ROOT%\data\secrets.env") do set "%%a=%%b"
"%FORGE_ROOT%\bin\pc\process-compose.exe" -p %PC_PORT% down --tui=false 2>nul || "%FORGE_ROOT%\bin\pc\process-compose.exe" -p %PC_PORT% shutdown --tui=false 2>nul
echo [PocketForge] 已请求停止全部进程。
pause
