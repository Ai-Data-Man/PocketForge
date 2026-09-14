$ErrorActionPreference='Stop'
$O='C:\ZCodeWorks\PocketForge\tmp'
$L=@()

# Allow spaces (evidence: TS-LSM successful session sources + geo verification)
$allow = @('27.17.34.0/24','171.83.0.0/16','27.27.160.0/20')

# Block set = all IPv4 minus allow spaces minus private ranges
$blk = @(
 '0.0.0.0-9.255.255.255',
 '11.0.0.0-27.17.33.255',
 '27.17.35.0-27.27.159.255',
 '27.27.176.0-171.82.255.255',
 '171.84.0.0-172.15.255.255',
 '172.32.0.0-192.167.255.255',
 '192.169.0.0-255.255.255.255'
)

$L += "== before =="
$f0 = Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625;StartTime=(Get-Date).AddMinutes(-5)} -ErrorAction SilentlyContinue
$L += ("4625 last5min=" + $(if($f0){$f0.Count}else{0}) + " newest=" + $(if($f0){$f0[0].TimeCreated.ToString('HH:mm:ss')}else{'-'}))

Get-NetFirewallRule -DisplayName 'PF-SEC-BLOCK-IN-TCP','PF-SEC-BLOCK-IN-UDP' -ErrorAction SilentlyContinue | Remove-NetFirewallRule

$desc = 'PocketForge 2026-09-14 hardening: block internet brute-force on RDP/WinRM/SMB/RPC. Allow office 27.17.34.0/24, rental(Wuhan 5G) 171.83.0.0/16, home(Xiangyang) 27.27.160.0/20. Private ranges left open. REVERT: Remove-NetFirewallRule -DisplayName PF-SEC-BLOCK-IN-TCP,PF-SEC-BLOCK-IN-UDP'

New-NetFirewallRule -DisplayName 'PF-SEC-BLOCK-IN-TCP' -Direction Inbound -Action Block -Enabled True -Profile Any -Protocol TCP -LocalPort 135,139,445,3389,5985,47001 -RemoteAddress $blk -Description $desc | Out-Null
New-NetFirewallRule -DisplayName 'PF-SEC-BLOCK-IN-UDP' -Direction Inbound -Action Block -Enabled True -Profile Any -Protocol UDP -LocalPort 137,138,3389 -RemoteAddress $blk -Description $desc | Out-Null

$L += "== created =="
foreach($r in (Get-NetFirewallRule -DisplayName 'PF-SEC-BLOCK-IN-*')){
  $pf=$r|Get-NetFirewallPortFilter; $af=$r|Get-NetFirewallAddressFilter
  $L += ("{0} | En={1} | Act={2} | prof={3} | {4}/{5} | ranges={6} | rem0={7}" -f $r.DisplayName,$r.Enabled,$r.Action,$r.Profile,$pf.Protocol,$pf.LocalPort,$af.RemoteAddress.Count,$af.RemoteAddress[0])
}

# Rescope the pre-existing RDP/WinRM allow rules by PORT (avoids matching localized display names)
$L += "== rescope allow rules (match by port) =="
foreach($r in (Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow)){
  $pf = $r | Get-NetFirewallPortFilter
  $lp = [string]$pf.LocalPort
  $portSpec = ($lp -split ',') | ForEach-Object { $_.Trim() }
  $isRdp  = ($portSpec -contains '3389')
  $isWmrm = ($portSpec -contains '5985')
  $isRpcA = ($portSpec -contains 'Any')   # report only
  if($isRdp -or $isWmrm){
    $prof = [string]$r.Profile
    if($isWmrm -and $prof -eq 'Public'){ $L += ("  SKIP(public-lan): " + $r.Name); continue }
    try { $r | Set-NetFirewallRule -RemoteAddress $allow; $L += ("  OK: {0} | prof={1} | port={2}" -f $r.Name,$prof,$lp) }
    catch { $L += ("  ERR: {0} :: {1}" -f $r.Name,$_.Exception.Message) }
  }
}

$L += "== Any-port allow rules still open (residual surface) =="
foreach($r in (Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow)){
  $pf = $r | Get-NetFirewallPortFilter; $af = $r | Get-NetFirewallAddressFilter
  if(([string]$pf.LocalPort) -eq 'Any' -and (([string]$af.RemoteAddress) -eq 'Any')){ $L += ("  ANY: {0} | prof={1}" -f $r.Name,$r.Profile) }
}

$L += "== after (immediate) =="
Start-Sleep -Seconds 8
$f1 = Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625;StartTime=(Get-Date).AddMinutes(-1)} -ErrorAction SilentlyContinue
$L += ("4625 last1min=" + $(if($f1){$f1.Count}else{0}))
$L += "== rdp established (expect 27.17.34.18 kept) =="
$L += ((netstat -ano | Select-String ':3389\s' | Select-String 'ESTABLISHED' | ForEach-Object { $_.ToString().Trim() }) -join "`n")
$L | Out-File -Encoding utf8 "$O\fw-apply.txt"
$L -join "`n"
