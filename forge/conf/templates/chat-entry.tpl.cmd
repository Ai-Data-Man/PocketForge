@echo off
setlocal EnableExtensions
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"

if exist "%FORGE_ROOT%\data\secrets.env" (
  for /f "usebackq eol=# tokens=1,2 delims==" %%a in ("%FORGE_ROOT%\data\secrets.env") do set "%%a=%%b"
)

rem wait for bridge up (max 30s)
set /a tries=0
:wait
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',8790);$c.Close();exit 1}catch{exit 0}" >nul 2>&1
if not errorlevel 1 (
  set /a tries+=1
  if %tries% lss 30 (
    timeout /t 1 /nobreak >nul
    goto wait
  )
)

rem open as app window (Edge kiosk-like)
start "" "msedge.exe" --app=http://127.0.0.1:8790 --window-size=480,760
