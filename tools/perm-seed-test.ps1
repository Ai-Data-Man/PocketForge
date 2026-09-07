# PERM-SEED-TEST: unit test for bootstrap.ps1 block 1b-7 (permission.yaml seed).
# Extracts the real block from forge/conf/bootstrap.ps1 (source of truth, no copy),
# writes it to a temp .ps1 (UTF-8 BOM, safe for PS5.1 with Chinese comments) and runs
# it as a child powershell -File process per scenario, in a fresh temp sandbox
# mirroring the shipped package layout (package.sh pre-creates data/logs).
# Pure ASCII on purpose: PS5.1 misreads BOM-less UTF-8 Chinese as ANSI (known pitfall).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\perm-seed-test.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$raw = [IO.File]::ReadAllText((Join-Path $repo 'forge\conf\bootstrap.ps1'))
$s = $raw.IndexOf('# 1b-7)')
$e = $raw.IndexOf('# 1c)')
if ($s -lt 0 -or $e -lt 0 -or $e -le $s) { Write-Host 'PERM-SEED-TEST FAIL: 1b-7 block markers not found'; exit 1 }
$block = $raw.Substring($s, $e - $s)

$script:pass = 0; $script:total = 0; $script:roots = @()
function New-Sandbox {
    $root = Join-Path ([IO.Path]::GetTempPath()) ('perm-seed-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path (Join-Path $root 'conf\templates') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $root 'conf\goose\config') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $root 'data\logs') | Out-Null
    $script:roots += $root
    return $root
}
function New-Tpl([string]$root) {
    [IO.File]::WriteAllText((Join-Path $root 'conf\templates\permission.tpl.yaml'), "user:`r`n  always_allow: []`r`n")
}
# Runs the extracted block with $ForgeRoot pointed at the sandbox.
# Returns the child's stdout; sets $script:rc to the child's exit code.
function Invoke-Block([string]$root) {
    $snippet = Join-Path ([IO.Path]::GetTempPath()) ('perm-seed-run-' + [Guid]::NewGuid().ToString('N') + '.ps1')
    [IO.File]::WriteAllText($snippet, "`$ForgeRoot = '$root'" + "`r`n" + $block, [Text.Encoding]::UTF8)
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $snippet
    $script:rc = $LASTEXITCODE
    Remove-Item $snippet -Force
    return ($out -join "`n")
}
function Assert([string]$name, [bool]$cond) {
    $script:total++
    if ($cond) { $script:pass++; Write-Host "PERM-SEED-TEST PASS: $name" }
    else { Write-Host "PERM-SEED-TEST FAIL: $name" }
}

# S1 normal first seed: template present, target absent -> seeded from template
$root = New-Sandbox; New-Tpl $root
$out = Invoke-Block $root
$t = Get-Content (Join-Path $root 'conf\goose\config\permission.yaml') -Raw
Assert 'S1 target created with template content' ($null -ne $t -and $t.Contains('user:'))
Assert 'S1 reports seeded message' ($out -match 'seeded')
Assert 'S1 exit code 0' ($script:rc -eq 0)

# S2 exists and valid -> untouched, no backup
$root = New-Sandbox; New-Tpl $root
$target = Join-Path $root 'conf\goose\config\permission.yaml'
[IO.File]::WriteAllText($target, "user:`r`n  ask_before: [keep_me]`r`n")
Invoke-Block $root | Out-Null
$t = [IO.File]::ReadAllText($target)
$noBak = $null -eq (Get-ChildItem (Join-Path $root 'data\logs') -Filter '*.bak' -ErrorAction SilentlyContinue)
Assert 'S2 valid runtime copy untouched' ($t.Contains('keep_me'))
Assert 'S2 no backup created' $noBak
Assert 'S2 exit code 0' ($script:rc -eq 0)

# S3 exists but empty -> archived to data/logs + re-seeded from template
$root = New-Sandbox; New-Tpl $root
$target = Join-Path $root 'conf\goose\config\permission.yaml'
[IO.File]::WriteAllText($target, '')
Invoke-Block $root | Out-Null
$t = [IO.File]::ReadAllText($target)
$baks = Get-ChildItem (Join-Path $root 'data\logs') -Filter 'permission-corrupt-*.bak' -ErrorAction SilentlyContinue
Assert 'S3 invalid file re-seeded' ($t.Contains('user:'))
Assert 'S3 archive created' ($null -ne $baks -and $baks.Count -ge 1)
Assert 'S3 archive preserves old (empty) content' ($baks.Count -ge 1 -and [IO.File]::ReadAllText($baks[0].FullName).Length -eq 0)

Write-Host "PERM-SEED-TEST: $pass/$total"
foreach ($r in $roots) { try { Remove-Item $r -Recurse -Force } catch {} }
if ($pass -eq $total) { exit 0 } else { exit 1 }
