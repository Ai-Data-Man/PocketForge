@echo off
setlocal
rem PocketForge: register an app with the running stack (hot reload).
rem Usage: forge-register.cmd apps\<app-name>.yaml   (".yaml" and "apps\" are optional)
rem ASCII only. No "cd &&", no nested quotes, no env dependency:
rem this file derives the install root from its own location, so it works from any shell.
set "ROOT=%~dp0..\.."
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "APP=%~1"
if "%APP%"=="" (
  echo usage: forge-register.cmd apps\^<app-name^>.yaml
  exit /b 2
)
if /i not "%APP:~-5%"==".yaml" set "APP=%APP%.yaml"
if /i "%APP:~0,5%"=="apps\" goto :havesub
set "APP=apps\%APP%"
:havesub

if not exist "%ROOT%\%APP%" (
  echo [PocketForge] app file not found: %ROOT%\%APP%
  exit /b 3
)

set "PCPORT="
if exist "%ROOT%\data\pc.port" set /p PCPORT=<"%ROOT%\data\pc.port"
if "%PCPORT%"=="" set "PCPORT=8099"

set "FORGE_ROOT=%ROOT%"
"%ROOT%\bin\pc\process-compose.exe" -p %PCPORT% project update -f "%ROOT%\conf\process-compose.yaml" -f "%ROOT%\conf\ports.env.yaml" -f "%ROOT%\conf\apps.env.yaml" -f "%ROOT%\%APP%"
if errorlevel 1 (
  echo [PocketForge] register failed. Tell the agent to check the app file and try again.
  exit /b 1
)
echo [PocketForge] registered: %APP%
exit /b 0
