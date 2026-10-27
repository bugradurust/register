# iPad Pano'yu pencere acmadan arka planda calistiran Windows gorevini kurar.
# Bilgisayar acilinca (kimse oturum acmasa da) kendiliginden baslar. Yonetici olarak calistirilmalidir.
param([string]$Dir)
$ErrorActionPreference = 'Stop'
$taskName = 'iPad Pano'
$Dir = (Resolve-Path -LiteralPath $Dir).Path

try {
  $nodePath = (Get-Command node -ErrorAction Stop).Source
} catch {
  Write-Host 'Node.js bulunamadi. Once https://nodejs.org adresinden LTS surumunu kurun.' -ForegroundColor Red
  exit 1
}

# Sunucunun kullanacagi port (config.json varsa onun degeri)
$port = 3000
foreach ($name in 'config.default.json', 'config.json') {
  $file = Join-Path $Dir $name
  if (Test-Path -LiteralPath $file) {
    try {
      $json = Get-Content -Raw -LiteralPath $file -Encoding UTF8 | ConvertFrom-Json
      if ($json.port) { $port = [int]$json.port }
    } catch { }
  }
}

# Eski gorevi (ya da onceki surumun gorunur penceresini) durdur
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host ('Port {0} baska bir islem tarafindan kullaniliyor. Acik bir start.bat penceresi varsa kapatin, sonra tekrar deneyin.' -f $port) -ForegroundColor Red
  exit 1
}

# SYSTEM hesabi PATH'i farkli gorebilir; node.exe'nin tam yolu kaydedilir.
Set-Content -LiteralPath (Join-Path $Dir 'node-yolu.txt') -Value $nodePath -Encoding ASCII

$vbs = Join-Path $Dir 'arka-plan.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B //Nologo "{0}"' -f $vbs) -WorkingDirectory $Dir
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'iPad Pano sunucusu (arka plan)' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host 'Gorev kuruldu, sunucu baslatiliyor...'
$ok = $false
for ($i = 0; $i -lt 20 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  try {
    Invoke-WebRequest -Uri ('http://localhost:{0}/api/config' -f $port) -UseBasicParsing -TimeoutSec 3 | Out-Null
    $ok = $true
  } catch { }
}

Write-Host ''
if ($ok) {
  Write-Host 'Sunucu arka planda calisiyor. iPad icin adresler:' -ForegroundColor Green
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { Write-Host ('   http://{0}:{1}' -f $_.IPAddress, $port) }
  Write-Host ''
  Write-Host 'Bundan sonra pencere acmaya gerek yok; bilgisayar acilinca kendiliginden baslar.'
  Write-Host 'Kayitlar: pano.log  (servis.bat ile de gorebilirsiniz)'
} else {
  Write-Host 'Sunucu 20 saniyede yanit vermedi. Nedenini pano.log dosyasinda bulabilirsiniz:' -ForegroundColor Red
  $log = Join-Path $Dir 'pano.log'
  if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 15 -Encoding UTF8 } else { Write-Host '   (pano.log henuz olusmadi)' }
  exit 1
}
