$sig = @'
using System; using System.Runtime.InteropServices; using System.Text;
public class W3 {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
'@
Add-Type -TypeDefinition $sig
$found = @()
[W3]::EnumWindows({ param($h,$l)
  if ([W3]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][W3]::GetClassName($h, $sb, 256)
    if ($sb.ToString() -eq 'CabinetWClass') { $script:found += $h }
  }
  $true
}, [IntPtr]::Zero) | Out-Null
Write-Host ("before: " + $found.Count)
$found | ForEach-Object { [void][W3]::SendMessage($_, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
Start-Sleep 3
$n = 0
[W3]::EnumWindows({ param($h,$l)
  if ([W3]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][W3]::GetClassName($h, $sb, 256)
    if ($sb.ToString() -eq 'CabinetWClass') { $script:n++ }
  }
  $true
}, [IntPtr]::Zero) | Out-Null
Write-Host ("after: " + $n)
