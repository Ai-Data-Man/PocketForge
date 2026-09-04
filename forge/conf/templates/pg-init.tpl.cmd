@echo off
rem PocketForge PG init (one-shot, idempotent). ASCII only: cmd parses ANSI (memory-mcp.tpl.cmd precedent).
set "FORGE_ROOT=__FORGE_ROOT__"
if exist "%FORGE_ROOT%\data\pg\PG_VERSION" exit /b 0
"%FORGE_ROOT%\bin\pg\bin\initdb.exe" -D "%FORGE_ROOT%\data\pg" -E UTF8 --locale=C -A trust -U postgres >> "%FORGE_ROOT%\data\logs\pg-init.log" 2>&1
set "RC=%errorlevel%"
if not "%RC%"=="0" echo [%DATE% %TIME%] PG data init FAILED, see data\logs\pg-init.log for details >> "%FORGE_ROOT%\data\logs\pg-init.log"
exit /b %RC%
