@echo off
rem PocketForge uninstall helper: removes the ONLY system footprint (AppData junction).
rem Portable folder itself: just delete it. Data inside stays in the folder.
setlocal
set "JUNC=%APPDATA%\Block\goose\config\memory"
if exist "%JUNC" rmdir "%JUNC%"
rem remove empty parents (rmdir only removes if empty)
rmdir "%APPDATA%\Block\goose\config" 2>nul
rmdir "%APPDATA%\Block\goose" 2>nul
rmdir "%APPDATA%\Block" 2>nul
echo [PocketForge] AppData junction removed. Now delete the PocketForge folder to fully uninstall.
pause
