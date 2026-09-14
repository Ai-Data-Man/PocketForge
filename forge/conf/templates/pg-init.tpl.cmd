@echo off
rem PocketForge PG init (one-shot, idempotent). Pure ASCII; %~dp0 self-derives portable root, codepage-independent.
set "FORGE_ROOT=%~dp0.."
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"
if exist "%FORGE_ROOT%\data\pg\PG_VERSION" exit /b 0
"%FORGE_ROOT%\bin\pg\bin\initdb.exe" -D "%FORGE_ROOT%\data\pg" -E UTF8 --locale=C -A trust -U postgres >> "%FORGE_ROOT%\data\logs\pg-init.log" 2>&1
set "RC=%errorlevel%"
if not "%RC%"=="0" echo [%DATE% %TIME%] PG data init FAILED, see data\logs\pg-init.log for details >> "%FORGE_ROOT%\data\logs\pg-init.log"
exit /b %RC%
