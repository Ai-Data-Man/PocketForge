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

rem ---- s90: PostgreSQL refuses to run under an elevated token (user hit it 2026-09-15: double-click on the
rem ---- built-in Administrator account => pg crash-loop => "database not connected" fallback). Relaunch
rem ---- ourselves under a restricted token (runas trustlevel - no admin rights needed) when elevated.
rem ---- Detection = conf\elev-check.ps1 (IsInRole on Administrators; restricted tokens report False because the
rem ---- group becomes deny-only - the SAME criterion PG itself uses). Do NOT key on the integrity SID
rem ---- S-1-16-12288: restricted tokens keep it (measured 2026-09-15) => would reopen windows forever.
if "%~1"=="relaunched" goto after_relaunch
for /f "delims=" %%a in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%FORGE_ROOT%\conf\elev-check.ps1" 2^>nul') do set "FORGE_IL=%%a"
if not "%FORGE_IL%"=="HIGH" goto after_relaunch
powershell -NoProfile -Command "$m=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('W1BvY2tldEZvcmdlXSDmo4DmtYvliLDlvZPliY3mmK/nrqHnkIblkZjouqvku73lkK/liqjigJTigJTmlbDmja7lupPlh7rkuo7lronlhajkuI3lhYHorrjku6XnrqHnkIblkZjov5DooYzjgIIK5q2j5Zyo6Ieq5Yqo5pS555So5pmu6YCa5p2D6ZmQ6YeN5paw5ZCv5Yqo77yM6K+356iN5YCZ4oCmCg==')); [Console]::Out.Write($m)"
rem ---- s90: the "relaunched" marker must sit INSIDE the quoted runas argument (empirically: "path arg" works,
rem ---- "path" arg is dropped silently - verified 2026-09-15).
start "" runas /trustlevel:0x20000 "%~f0 relaunched"
rem ---- s95/F-4: terminate THIS host too (plain exit, not exit /b) after handing off. The window that ran us
rem ---- keeps its console alive under any interactive host (cmd /K, a console window the command was typed
rem ---- into) and conhost holds the console cwd - with the install root as cwd the folder cannot be renamed
rem ---- or deleted after the stack stops ("Device busy"; measured: the handle survives every in-script chdir
rem ---- and is released the moment the window's console host dies). The reduced child owns the work from here.
exit
:after_relaunch
set "FORGE_IL="

if not exist "%FORGE_ROOT%\data\logs" mkdir "%FORGE_ROOT%\data\logs"

rem ---- s92 pre-flight (conf\start-preflight.ps1): single-instance guard + orphan cleanup.
rem exit 2 = stack already running (another pc alive) -> friendly message, exit (a second pc would
rem share the same pc.log and produce the rotation rename errors users saw 2026-09-15);
rem exit 0 = clean (leftover processes from a killed pc are removed so ports are free).
powershell -NoProfile -ExecutionPolicy Bypass -File "%FORGE_ROOT%\conf\start-preflight.ps1"
if errorlevel 2 ( pause & exit /b 0 )

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
rem s96: 聚合移入 conf\apps-aggregate.ps1（与 conf\dev-stack-up.ps1 同一真相源；s89/R1 joined
rem 另起一行纪律 + 基础设施键守卫〔apps yaml 顶层进程键与系统组件重名 → 跳过该文件+人话告警〕
rem 见该脚本头注）。守卫告警走 console（本窗口）与 conf\apps.guard.log，故不再 >nul。
set "APP_ARGS="
powershell -NoProfile -ExecutionPolicy Bypass -File "%FORGE_ROOT%\conf\apps-aggregate.ps1"

"%FORGE_ROOT%\bin\pc\process-compose.exe" up -f "%FORGE_ROOT%\conf\process-compose.yaml" -f "%FORGE_ROOT%\conf\ports.env.yaml" -f "%FORGE_ROOT%\conf\apps.env.yaml" -p %PC_PORT% -t=false
echo [PocketForge] all stopped.
rem ---- s94-b3: pc attach exit closes this window - a trailing pause left the console window
rem ---- alive after stop (its CWD = install root blocked folder deletion; 4 sandboxes = 4 windows).
rem ---- Non-zero pc exit (config/port error) still pauses so the failure stays readable.
if errorlevel 1 (
  echo [PocketForge] startup failed - see data\logs\pc.log
  pause
)
exit /b 0
