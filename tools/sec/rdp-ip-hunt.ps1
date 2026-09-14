$ErrorActionPreference='SilentlyContinue'
function Dump($ev, $tag) {
  if (-not $ev) { Write-Output "[$tag] (none)"; return }
  Write-Output "[$tag] count=$($ev.Count) window $($ev[-1].TimeCreated) -> $($ev[0].TimeCreated)"
  $g=@{}
  foreach($e in $ev){
    $x=[xml]$e.ToXml(); $d=@{}
    foreach($p in $x.Event.EventData.Data){ $d[$p.Name]=$p.'#text' }
    # 消息文本里抓 IPv4（TS 日志的 IP 只在 Message 中）
    $ips=@()
    if ($e.Message) { $ips=[regex]::Matches($e.Message,'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b') | ForEach-Object { $_.Value } | Sort-Object -Unique }
    $src = $d['IpAddress']
    $key = if ($src) { $src } elseif ($ips.Count) { ($ips -join ',') } else { '(no-ip)' }
    $u = $d['TargetUserName']; if (-not $u) { $u = ($e.Properties | ForEach-Object { $_.Value }) -join '/' }
    if (-not $g[$key]) { $g[$key] = [pscustomobject]@{K=$key;N=0;First=[datetime]::MaxValue;Last=[datetime]::MinValue;IDs=@{}} }
    $a=$g[$key]; $a.N++
    if ($e.TimeCreated -gt $a.Last) { $a.Last=$e.TimeCreated }
    if ($e.TimeCreated -lt $a.First) { $a.First=$e.TimeCreated }
    $a.IDs[[string]$e.Id]=1
  }
  $g.Values | Sort-Object Last -Descending | ForEach-Object {
    '{0} | {1}x | {2:MM-dd HH:mm} -> {3:MM-dd HH:mm} | evt {4}' -f $_.K, $_.N, $_.First, $_.Last, (($_.IDs.Keys) -join ',')
  }
}

Write-Output "=== Security log info ==="
$li = Get-WinEvent -ListLog Security
'{0} records | max {1} MB | mode {2}' -f $li.RecordCount, [math]::Round($li.MaximumSizeInBytes/1MB), $li.LogMode

Write-Output "`n=== 4624 Administrator (all history, 5000 cap) ==="
Dump (Get-WinEvent -LogName Security -FilterXPath "*[System[EventID=4624] and EventData[Data[@Name='TargetUserName']='Administrator']]" -MaxEvents 5000) '4624-admin'

Write-Output "`n=== LocalSessionManager (RDP session logon/reconnect) ==="
Dump (Get-WinEvent -LogName 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational' -MaxEvents 3000) 'TS-LSM'

Write-Output "`n=== RemoteConnectionManager (RDP auth) ==="
Dump (Get-WinEvent -LogName 'Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational' -MaxEvents 3000) 'TS-RCM'

Write-Output "`n=== RdpCoreTS accepted connections (131) ==="
Dump (Get-WinEvent -LogName 'Microsoft-Windows-RemoteDesktopServices-RdpCoreTS/Operational' -FilterXPath "*[System[EventID=131]]" -MaxEvents 3000) 'RdpCoreTS-131'
