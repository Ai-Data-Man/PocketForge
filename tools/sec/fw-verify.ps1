$ErrorActionPreference='Continue'
$O='C:\ZCodeWorks\PocketForge\tmp'
$L=@()
$L += "== verification window: flood must stop; user session must survive =="
for($i=0; $i -lt 9; $i++){
  $t = (Get-Date).ToString('HH:mm:ss')
  $f1 = Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625;StartTime=(Get-Date).AddMinutes(-2)} -ErrorAction SilentlyContinue
  $newest = if($f1){ (($f1 | Sort-Object TimeCreated -Descending)[0]).TimeCreated.ToString('HH:mm:ss') } else { '-' }
  $ips = @()
  foreach($e in $f1){ $x=[xml]$e.ToXml(); $d=@{}; foreach($p in $x.Event.EventData.Data){$d[$p.Name]=$p.'#text'}; if($d['IpAddress'] -and $d['IpAddress'] -ne '-'){ $ips += $d['IpAddress'] } }
  $ips = $ips | Sort-Object -Unique
  $userSpaceHits = @($ips | Where-Object { $_ -match '^(27\.17\.34\.|27\.27\.16[0-9]\.|171\.83\.)' })
  $r131 = Get-WinEvent -LogName 'Microsoft-Windows-RemoteDesktopServices-RdpCoreTS/Operational' -FilterXPath "*[System[EventID=131]]" -MaxEvents 30 -ErrorAction SilentlyContinue
  $n131 = if($r131){ $r131.Count } else { 0 }
  $n131r2 = if($r131){ @($r131 | Where-Object { $_.TimeCreated -ge (Get-Date).AddMinutes(-2) }).Count } else { 0 }
  $est = (netstat -ano | Select-String ':3389\s' | Select-String 'ESTABLISHED' | ForEach-Object { $_.ToString().Trim() }) -join ' ;; '
  $L += ("[{0}] 4625_last2min={1} newest={2} distinct_src={3} userSpaceSrc={4} | 131_last2min={5} | EST: {6}" -f $t, $(if($f1){$f1.Count}else{0}), $newest, $ips.Count, $(if($userSpaceHits.Count){($userSpaceHits -join ',')}else{'-'}), $n131r2, $est)
  Start-Sleep -Seconds 40
}
$L += "== rule state =="
foreach($r in (Get-NetFirewallRule -DisplayName 'PF-SEC-BLOCK-IN-*')){
  $pf=$r|Get-NetFirewallPortFilter; $af=$r|Get-NetFirewallAddressFilter
  $L += ("{0} | En={1} | Act={2} | prof={3} | {4}/{5} | ranges={6}" -f $r.DisplayName,$r.Enabled,$r.Action,$r.Profile,$pf.Protocol,$pf.LocalPort,$af.RemoteAddress.Count)
}
$L | Out-File -Encoding utf8 "$O\fw-verify.txt"
