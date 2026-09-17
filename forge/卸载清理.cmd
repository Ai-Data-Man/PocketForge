@echo off
rem PocketForge uninstall helper (ASCII; real work in PowerShell for reliability)
rem s95: also remove the stray "nul" + ideographic-full-stop file the old launcher left in the install
rem root (a reserved-name file Explorer cannot delete). [char]0x3002 keeps this line pure ASCII.
powershell -NoProfile -Command "Remove-Item -LiteralPath (Join-Path $PSScriptRoot ('nul' + [char]0x3002)) -Force -ErrorAction SilentlyContinue"
powershell -NoProfile -Command "$b=Join-Path $env:APPDATA 'Block'; foreach($r in 'goose\config\memory','goose\config','goose',''){ $p=Join-Path $b $r; if(Test-Path $p){ try{ cmd /c rmdir /q \"$p\" 2>$null; if(Test-Path $p){ Remove-Item $p -Force -Recurse:$false -ErrorAction SilentlyContinue } }catch{} } }; if(Test-Path $b){ Write-Host 'note: some entries remain in' $b } else { Write-Host 'AppData clean' }"
echo [PocketForge] uninstall cleanup done. Now delete the PocketForge folder itself.
pause
