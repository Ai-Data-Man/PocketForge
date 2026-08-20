@echo off
rem PocketForge memory MCP wrapper (ASCII only: cmd parses ANSI)
rem goose drops parent env when spawning stdio extensions -> set portable root here
set "GOOSE_PATH_ROOT=__FORGE_ROOT__\conf\goose"
set "GOOSE_DISABLE_KEYRING=1"
"__FORGE_ROOT__\bin\goose\goose-package\goose.exe" mcp memory
