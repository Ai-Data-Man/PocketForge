@echo off
setlocal EnableExtensions
rem s85/P1: console to UTF-8 so Node/Go stdout renders correctly (audit 2026-09-14 runbook section 1)
chcp 65001 >nul
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"

rem ---- s85/P3 guard: PostgreSQL upstream cannot init when the install path itself contains non-ASCII chars (audit section 3).
rem ---- cmd cannot test non-ASCII itself and cannot echo non-ASCII reliably -> PowerShell probes via env var and,
rem ---- on failure, prints the Chinese plain-language message (base64 = UTF-8; wording = audit section 3:
rem ---- folder path has Chinese/special chars, move the whole folder to an English path like D:\PocketForge, restart).
powershell -NoProfile -Command "$m=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('W1BvY2tldEZvcmdlXSDlh7rplJnkuobvvJrov5nkuKrmlofku7blpLnnmoTot6/lvoTph4zmnInkuK3mlofmiJbnibnmrorlrZfnrKbvvIzmlbDlrZflkZjlt6XmsqHlip7ms5Xku47ov5nph4zlkK/liqjjgIINCuivt+aKiuaVtOS4qiBQb2NrZXRGb3JnZSDmlofku7blpLnnp7vliqjliLDnuq/oi7HmlofjgIHmlbDlrZfnmoTot6/lvoTkuIvvvIjkvovlpoIgRDpcUG9ja2V0Rm9yZ2XvvInvvIzlho3ph43mlrDlj4zlh7vlkK/liqjjgIINCg==')); if ($env:FORGE_ROOT -match '[^\x00-\x7F]') { [Console]::Out.Write($m); exit 1 }"
if errorlevel 1 ( pause & exit /b 1 )

if not exist "%FORGE_ROOT%\data\logs" mkdir "%FORGE_ROOT%\data\logs"

rem ---- bootstrap: goose config / secrets / ports (see conf\bootstrap.ps1) ----
powershell -NoProfile -ExecutionPolicy Bypass -File "%FORGE_ROOT%\conf\bootstrap.ps1"
for /f "usebackq delims=" %%p in ("%FORGE_ROOT%\data\pc.port") do set "PC_PORT=%%p"
for /f "usebackq delims=" %%p in ("%FORGE_ROOT%\data\faucet.port") do set "FAUCET_PORT=%%p"
for /f "usebackq delims=" %%p in ("%FORGE_ROOT%\data\pg.port") do set "PG_PORT=%%p"
for /f "usebackq eol=# tokens=1,2 delims==" %%a in ("%FORGE_ROOT%\data\secrets.env") do set "%%a=%%b"

rem ---- environment ----
set "GOOSE_PATH_ROOT=%FORGE_ROOT%\conf\goose"
set "GOOSE_DISABLE_KEYRING=1"
set "GOOSE_TELEMETRY_ENABLED=false"
set "NODE_DIR=%FORGE_ROOT%\bin\node-v22\node-v22.21.1-win-x64"
set "NO_PROXY=127.0.0.1,localhost"
set "no_proxy=127.0.0.1,localhost"

rem ---- first-run welcome page (data\welcome.html exists only on first run) ----
rem s50: start 是异步的，立刻 ren 会让浏览器读到 404（沙盒冒烟实证）；等 3 秒让浏览器打开文件后再改名
if exist "%FORGE_ROOT%\data\welcome.html" (
  start "" "%FORGE_ROOT%\data\welcome.html"
  timeout /t 3 /nobreak >nul
  ren "%FORGE_ROOT%\data\welcome.html" welcome.shown 2>nul
)

echo [PocketForge] starting... pc=%PC_PORT% faucet=%FAUCET_PORT%
cd /d "%FORGE_ROOT%"

rem ---- aggregate registered apps (apps\*.yaml) into conf\apps.env.yaml ----
rem s89/R1: joined 内容必须另起一行——协议形态（forge-meta 首行注释）的 app 剥掉 processes: 行后
rem 文件体首行是注释，直接粘在 processes: 后会拼成 "processes:# forge-meta…"（注释失效+{ 进 flow mapping）→ pc up FTL
set "APP_ARGS="
powershell -NoProfile -Command "$d='%FORGE_ROOT%\apps'; $out='%FORGE_ROOT%\conf\apps.env.yaml'; if((Test-Path $d) -and (Get-ChildItem $d -Filter *.yaml).Count -gt 0){ $c=Get-ChildItem $d -Filter *.yaml | Sort-Object Name | ForEach-Object { (Get-Content $_.FullName -Raw) -replace '(?m)^processes:\s*$','' }; [IO.File]::WriteAllText($out, ('processes:' + [Environment]::NewLine + ($c -join [Environment]::NewLine))) } else { [IO.File]::WriteAllText($out, 'processes: {}') }" >nul 2>&1

"%FORGE_ROOT%\bin\pc\process-compose.exe" up -f "%FORGE_ROOT%\conf\process-compose.yaml" -f "%FORGE_ROOT%\conf\ports.env.yaml" -f "%FORGE_ROOT%\conf\apps.env.yaml" -p %PC_PORT% -t=false
echo [PocketForge] all stopped.
pause
