# qa2/P2-2 fuzz fixture: hold SKILL.md with NO FileShare.Delete (QA M3 form: editor/AV lock),
# then exercise disable + enable error receipts. Human gate expected; zero path reflection.
# ASCII-only on purpose: PowerShell 5 reads no-BOM UTF-8 as ANSI (s86 lesson).
param([string]$Base, [string]$MdPath, [string]$Name)
# deterministic UTF-8 stdout (curl.exe decode + redirect encode) so the fuzz grep on Chinese stays stable
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$off = $MdPath + '.off'

# phase 1: lock SKILL.md -> disable must fail through the human gate
$f1 = [System.IO.File]::Open($MdPath, 'Open', 'Read', 'Read')
try {
    $r1 = & curl.exe -s -X POST ($Base + '/api/skillstore') -H 'content-type: application/json' -d ('{\"name\":\"' + $Name + '\",\"op\":\"disable\"}')
    Write-Output ('PH1:' + $r1)
} finally { $f1.Close() }

# move to stopped state (same rename the bridge uses), then lock .off -> enable must fail the same way
Rename-Item -LiteralPath $MdPath -NewName 'SKILL.md.off'
$f2 = [System.IO.File]::Open($off, 'Open', 'Read', 'Read')
try {
    $r2 = & curl.exe -s -X POST ($Base + '/api/skillstore') -H 'content-type: application/json' -d ('{\"name\":\"' + $Name + '\",\"op\":\"enable\"}')
    Write-Output ('PH2:' + $r2)
} finally { $f2.Close() }
Rename-Item -LiteralPath $off -NewName 'SKILL.md'
