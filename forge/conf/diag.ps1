$ErrorActionPreference = 'Stop'
$ForgeRoot = Split-Path -Parent $PSScriptRoot
Write-Host "ForgeRoot=$ForgeRoot"
$gooseDir = Join-Path $ForgeRoot 'conf\goose\config'
$tplPath  = Join-Path $ForgeRoot 'conf\templates\goose-config.tpl.yaml'
Write-Host "tplPath=$tplPath exists=$(Test-Path $tplPath)"
$tpl = [IO.File]::ReadAllText($tplPath)
Write-Host "goose tpl len=$($tpl.Length)"
$memTplPath = Join-Path $ForgeRoot 'conf\templates\memory-mcp.tpl.cmd'
Write-Host "memTplPath=$memTplPath exists=$(Test-Path $memTplPath)"
$memTpl = [IO.File]::ReadAllText($memTplPath)
Write-Host "memTpl len=$($memTpl.Length)"
