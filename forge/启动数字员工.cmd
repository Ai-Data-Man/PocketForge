@echo off
setlocal EnableExtensions
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"
if not exist "%FORGE_ROOT%\data\logs" mkdir "%FORGE_ROOT%\data\logs"

rem ---- bootstrap: goose config / secrets / ports (see conf\bootstrap.ps1) ----
powershell -NoProfile -ExecutionPolicy Bypass -File "%FORGE_ROOT%\conf\bootstrap.ps1"
for /f "usebackq delims=" %%p in ("%FORGE_ROOT%\data\pc.port") do set "PC_PORT=%%p"
for /f "usebackq delims=" %%p in ("%FORGE_ROOT%\data\faucet.port") do set "FAUCET_PORT=%%p"
for /f "usebackq eol=# tokens=1,2 delims==" %%a in ("%FORGE_ROOT%\data\secrets.env") do set "%%a=%%b"

rem ---- environment ----
set "GOOSE_PATH_ROOT=%FORGE_ROOT%\conf\goose"
set "GOOSE_DISABLE_KEYRING=1"
set "GOOSE_TELEMETRY_ENABLED=false"
set "NODE_DIR=%FORGE_ROOT%\bin\node-v22\node-v22.21.1-win-x64"
set "NO_PROXY=127.0.0.1,localhost"
set "no_proxy=127.0.0.1,localhost"

echo [PocketForge] starting... pc=%PC_PORT% faucet=%FAUCET_PORT%
cd /d "%FORGE_ROOT%"
"%FORGE_ROOT%\bin\pc\process-compose.exe" up -f "%FORGE_ROOT%\conf\process-compose.yaml" -f "%FORGE_ROOT%\conf\ports.env.yaml" -p %PC_PORT% -t=false
echo [PocketForge] all stopped.
pause
