# s92 start pre-flight (called by the launcher BEFORE bootstrap). Exit code is the cmd signal:
#   exit 0 = clean, continue booting
#   exit 2 = stack already running (our pc is alive) -> caller prints the message and exits.
#            Prevents a second pc from sharing the same pc.log (rotation rename errors reported
#            2026-09-15) and duplicate service starts.
# Orphan cleanup: pc is gone but stack executables under THIS install root are still alive
#            (previous pc was force-killed / crashed) - they hold ports, so a fresh start would
#            flood the console with EADDRINUSE + FTL. We only kill processes under this root.
# ASCII-only on purpose: PowerShell 5.1 may read this file as ANSI when it has no BOM.
$root = $env:FORGE_ROOT
if (-not $root) { exit 0 }
$procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and $_.Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)
})
$pc = @($procs | Where-Object { $_.Name -eq 'process-compose.exe' })
if ($pc.Count -gt 0) {
    # UTF-8 base64 so the Chinese message cannot be mangled by the ANSI file parse
    $m = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('UG9ja2V0Rm9yZ2Ug5bey57uP5Zyo6L+Q6KGM5LqG77ya6IGK5aSp56qX5Y+j55u05o6l5Y+v55So44CC6KaB6YeN5ZCv6K+35YWI5Y+M5Ye744CM5YGc5q2i5pWw5a2X5ZGY5belLmNtZOOAjeOAgg=='))
    [Console]::Out.WriteLine($m)
    exit 2
}
$orph = @($procs | Where-Object { $_.Name -match '^(postgres|faucet|nats-server|node|goose|chat-bridge).*\.exe$' })
if ($orph.Count -gt 0) {
    foreach ($p in $orph) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }
    Start-Sleep -Milliseconds 800
    [Console]::Out.WriteLine('cleaned ' + $orph.Count + ' leftover process(es) from a previous run')
}
exit 0
