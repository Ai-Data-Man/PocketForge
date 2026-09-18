@echo off
setlocal
rem PocketForge: register an app with the running stack (hot reload).
rem Usage: forge-register.cmd apps/<app-name>.yaml   (".yaml" and "apps/" are optional; / or \ both fine)
rem ASCII only. No "cd &&", no nested quotes, no env dependency:
rem this file derives the install root from its own location, so it works from any shell.
rem s97/F-9: ROOT must equal the launcher's FORGE_ROOT string exactly (clean install root).
rem pc project update re-renders every command:/working_dir:/log_location: with caller env;
rem an un-normalized "bin\pc\.." here drifts all ${FORGE_ROOT} sites vs the launcher-started
rem project and pc restarts the whole table (chat-bridge included -> in-flight turn orphaned).
rem for %%~fi resolves ".." into the fully qualified clean path.
rem qa s97 late P2-2: pc drift compare is ALSO case-sensitive and %%~dp0/%%~fi keep the CALLER's
rem case - a hand-typed c:\root\... path drifts every ${FORGE_ROOT} site the same way (full
rem table restart). bootstrap persists the launcher-chain root in data\forge-root.txt (same
rem pattern as the port files); read it first (for /f = CR-safe, same read as the launcher's
rem pc.port read); fall back to %%~fi self-derivation only if the file is missing/empty.
set "ROOT="
if exist "%~dp0..\..\data\forge-root.txt" for /f "usebackq delims=" %%r in ("%~dp0..\..\data\forge-root.txt") do set "ROOT=%%r"
if not defined ROOT for %%i in ("%~dp0..\..") do set "ROOT=%%~fi"

set "APP=%~1"
if "%APP%"=="" (
  echo usage: forge-register.cmd apps/^<app-name^>.yaml
  exit /b 2
)
rem s97/F-12 root fix: literal "converge" = internal channel for the startup watcher
rem (conf\open-when-ready.ps1), NOT an agent surface (empty arg stays usage above).
rem pc v1.122.0: the update client's JSON round-trip turns the templater-injected
rem PC_REPLICA_NUM(int) into float64, so the FIRST JSON update of a daemon lifetime
rem restarts the whole table; afterwards storage has converged and updates are no-ops
rem (research/34). "converge" burns that first update with the launcher's exact three-file
rem set (no fourth -f) and the same self-provisioned env, before any chat window opens.
if /i "%APP%"=="converge" (
  set "MODE=converge"
  goto converge
)
rem normalize: drop a leading apps\ or apps/ (either slash), strip surrounding quotes
set "APP=%APP:"=%"
if /i "%APP:~0,5%"=="apps\" set "APP=%APP:~5%"
if /i "%APP:~0,5%"=="apps/" set "APP=%APP:~5%"
if /i not "%APP:~-5%"==".yaml" set "APP=%APP%.yaml"
set "APPFULL=%ROOT%\apps\%APP%"

if not exist "%APPFULL%" (
  echo [PocketForge] app file not found: %APPFULL%
  echo [PocketForge] write it first: copy conf\_app-template.yaml to apps\%APP%
  exit /b 3
)

:converge
set "PCPORT="
if exist "%ROOT%\data\pc.port" set /p PCPORT=<"%ROOT%\data\pc.port"
if "%PCPORT%"=="" set "PCPORT=8099"

rem s97/F-7: pc project update re-renders EVERY process with the CALLER's env, then replaces the
rem project and restarts any process whose rendered config changed. The agent shell is scrubbed
rem (no FAUCET_PORT/PG_PORT/secrets), so a bare update renders empty interpolations, sees drift
rem against the launcher-started stack and restarts live processes - a chat-bridge restart
rem mid-turn orphans the in-flight reply (user sees the turn die with no closing message).
rem s95 round 3/4 lesson: "restarts=0" after update was an illusion - the counter resets when
rem update replaces the whole project; the honest anchor is the "ACP initialized" count in
rem data\logs\pc.log. Self-provision the exact launcher env (port files + secrets.env + fixed
rem vars) so update matches the running config and only adds the new app.
set "FAUCETPORT="
if exist "%ROOT%\data\faucet.port" set /p FAUCETPORT=<"%ROOT%\data\faucet.port"
if "%FAUCETPORT%"=="" set "FAUCETPORT=8091"
set "FAUCET_PORT=%FAUCETPORT%"
set "PGPORT="
if exist "%ROOT%\data\pg.port" set /p PGPORT=<"%ROOT%\data\pg.port"
if "%PGPORT%"=="" set "PGPORT=5432"
set "PG_PORT=%PGPORT%"
for /f "usebackq eol=# tokens=1,2 delims==" %%a in ("%ROOT%\data\secrets.env") do set "%%a=%%b"
set "GOOSE_PATH_ROOT=%ROOT%\conf\goose"
set "GOOSE_DISABLE_KEYRING=1"
set "GOOSE_TELEMETRY_ENABLED=false"
set "NODE_DIR=%ROOT%\bin\node-v22\node-v22.21.1-win-x64"
set "NO_PROXY=127.0.0.1,localhost"
set "no_proxy=127.0.0.1,localhost"

set "FORGE_ROOT=%ROOT%"
rem pc writes 2 debug lines to stderr on every run ("Path not found for process compose config home");
rem the agent shell treats non-empty stderr as a failed command, so keep stderr out of the tool output
rem (diagnostics still land in data\logs\register.log).
if "%MODE%"=="converge" goto upd_converge
"%ROOT%\bin\pc\process-compose.exe" -p %PCPORT% project update -f "%ROOT%\conf\process-compose.yaml" -f "%ROOT%\conf\ports.env.yaml" -f "%ROOT%\conf\apps.env.yaml" -f "%APPFULL%" 2>>"%ROOT%\data\logs\register.log"
goto upd_done
:upd_converge
"%ROOT%\bin\pc\process-compose.exe" -p %PCPORT% project update -f "%ROOT%\conf\process-compose.yaml" -f "%ROOT%\conf\ports.env.yaml" -f "%ROOT%\conf\apps.env.yaml" 2>>"%ROOT%\data\logs\register.log"
:upd_done
if errorlevel 1 (
  if "%MODE%"=="converge" (
    echo [PocketForge] converge update failed
    exit /b 1
  )
  echo [PocketForge] register failed. Tell the agent to check the app file and try again.
  exit /b 1
)
if "%MODE%"=="converge" (
  echo [PocketForge] converged
  exit /b 0
)
echo [PocketForge] registered: apps\%APP%
exit /b 0
