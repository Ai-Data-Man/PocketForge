@echo off
setlocal
rem PocketForge: register an app with the running stack (hot reload).
rem Usage: forge-register.cmd apps/<app-name>.yaml   (".yaml" and "apps/" are optional; / or \ both fine)
rem ASCII only. No "cd &&", no nested quotes, no env dependency:
rem this file derives the install root from its own location, so it works from any shell.
set "ROOT=%~dp0..\.."
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "APP=%~1"
if "%APP%"=="" (
  echo usage: forge-register.cmd apps/^<app-name^>.yaml
  exit /b 2
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

set "PCPORT="
if exist "%ROOT%\data\pc.port" set /p PCPORT=<"%ROOT%\data\pc.port"
if "%PCPORT%"=="" set "PCPORT=8099"

set "FORGE_ROOT=%ROOT%"
rem pc writes 2 debug lines to stderr on every run ("Path not found for process compose config home");
rem the agent shell treats non-empty stderr as a failed command, so keep stderr out of the tool output
rem (diagnostics still land in data\logs\register.log).
"%ROOT%\bin\pc\process-compose.exe" -p %PCPORT% project update -f "%ROOT%\conf\process-compose.yaml" -f "%ROOT%\conf\ports.env.yaml" -f "%ROOT%\conf\apps.env.yaml" -f "%APPFULL%" 2>>"%ROOT%\data\logs\register.log"
if errorlevel 1 (
  echo [PocketForge] register failed. Tell the agent to check the app file and try again.
  exit /b 1
)
echo [PocketForge] registered: apps\%APP%
exit /b 0
