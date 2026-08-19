@echo off
setlocal EnableExtensions
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"
set /a PC_PORT=8099
if exist "%FORGE_ROOT%\data\pc.port" set /a PC_PORT=%FORGE_ROOT%\data\pc.port
"%FORGE_ROOT%\bin\pc\process-compose.exe" -p %PC_PORT% shutdown 2>nul
echo [PocketForge] stop requested.
pause
