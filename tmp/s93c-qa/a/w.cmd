@echo off
chcp 936 >nul
set "PATH=C:\Windows\system32;C:\Windows;C:\Windows\System32\Wbem;C:\Windows\System32\WindowsPowerShell\v1.0"
call "C:\PF-S93C\a\启动数字员工.cmd" > "C:\PF-S93C\a\launch.log" 2>&1
