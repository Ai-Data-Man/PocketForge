@echo off
rem PocketForge memory MCP wrapper (pure ASCII; %~dp0 self-derives portable root, codepage-independent)
rem goose drops parent env when spawning stdio extensions -> set portable root here
set "FORGE_ROOT=%~dp0.."
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"
set "GOOSE_PATH_ROOT=%FORGE_ROOT%\conf\goose"
set "GOOSE_DISABLE_KEYRING=1"
"%FORGE_ROOT%\bin\goose\goose-package\goose.exe" mcp memory
