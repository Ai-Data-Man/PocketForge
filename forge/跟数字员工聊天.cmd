@echo off
setlocal EnableExtensions
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"

set "GOOSE_PATH_ROOT=%FORGE_ROOT%\conf\goose"
set "GOOSE_DISABLE_KEYRING=1"
set "GOOSE_MODE=smart_approve"
set "GOOSE_TELEMETRY_ENABLED=false"
set "NODE_DIR=%FORGE_ROOT%\bin\node-v22\node-v22.21.1-win-x64"
set "NO_PROXY=127.0.0.1,localhost"
set "no_proxy=127.0.0.1,localhost"

if exist "%FORGE_ROOT%\data\secrets.env" (
  for /f "usebackq eol=# tokens=1,2 delims==" %%a in ("%FORGE_ROOT%\data\secrets.env") do set "%%a=%%b"
)

cd /d "%FORGE_ROOT%"
"%FORGE_ROOT%\bin\goose\goose-package\goose.exe" session
pause
