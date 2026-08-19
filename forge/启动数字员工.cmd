@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"
if not exist "%FORGE_ROOT%\data\logs" mkdir "%FORGE_ROOT%\data\logs"

rem ==== 端口（被占用时自动 +1，最多试 5 次）====
call :pickport PC_PORT 8099
call :pickport FAUCET_PORT 8091

rem ==== 首启生成随机凭据 ====
if not exist "%FORGE_ROOT%\data\secrets.env" (
  powershell -NoProfile -Command ^"-$c={-join((48..57)+(65..90)+(97..122)^|Get-Random -Count 32^|%%{[char]$_})};^
$lines=@^('PC_TOKEN='+(^&$c)^,^'FAUCET_ADMIN_EMAIL=admin@pocketforge.local'^,^'FAUCET_ADMIN_PW='+(^&$c^).Substring(0,24^)^,^'FAUCET_API_KEY_LABEL=forge-agent'^);^
[IO.File]::WriteAllLines^('%FORGE_ROOT%\data\secrets.env',$lines)^" >nul 2>&1
)
for /f "usebackq eol=# tokens=1,2 delims==" %%a in ("%FORGE_ROOT%\data\secrets.env") do set "%%a=%%b"

rem ==== 环境注入（便携化关键，见 ADR-0003）====
set "GOOSE_PATH_ROOT=%FORGE_ROOT%\conf\goose"
set "GOOSE_DISABLE_KEYRING=1"
set "GOOSE_MODE=smart_approve"
set "GOOSE_TELEMETRY_ENABLED=false"
set "NODE_DIR=%FORGE_ROOT%\bin\node-v22\node-v22.21.1-win-x64"
set "NO_PROXY=127.0.0.1,localhost"
set "no_proxy=127.0.0.1,localhost"

rem 生成端口注入文件（pc vars 机制）
> "%FORGE_ROOT%\conf\ports.env.yaml" (
  echo processes:
  echo   faucet:
  echo     environment:
  echo       - "FAUCET_PORT=%FAUCET_PORT%"
)

echo [PocketForge] 启动中…… 管理端口 %PC_PORT%，数据端口 %FAUCET_PORT%
cd /d "%FORGE_ROOT%"
"%FORGE_ROOT%\bin\pc\process-compose.exe" up ^
  -f "%FORGE_ROOT%\conf\process-compose.yaml" ^
  -f "%FORGE_ROOT%\conf\ports.env.yaml" ^
  -p %PC_PORT% -t=false
echo [PocketForge] 已全部停止。
pause
exit /b

:pickport  [varname] [start]
setlocal
set "p=%~2"
set /a n=0
:pp
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',%p%);$c.Close();exit 1}catch{exit 0}" >nul 2>&1
if errorlevel 1 (
  set /a p+=1
  set /a n+=1
  if %n% lss 5 goto pp
)
endlocal & set "%~1=%p%"
goto :eof
