@echo off
setlocal EnableExtensions
set "FORGE_ROOT=%~dp0"
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"

rem wait for chat bridge (max 30s)
set /a tries=0
:wait
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',8790);$c.Close();exit 1}catch{exit 0}" >nul 2>&1
if not errorlevel 1 (
  set /a tries+=1
  if %tries% lss 30 (
    timeout /t 1 /nobreak >nul
    goto wait
  )
  echo [PocketForge] chat service not ready. start it first.
  pause
  exit /b
)

rem dedicated profile forces a NEW edge instance (existing window would swallow --app)
powershell -NoProfile -Command "Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--app=http://127.0.0.1:8790','--window-size=480,760','--user-data-dir=%FORGE_ROOT%\data\chat-window-profile'"
