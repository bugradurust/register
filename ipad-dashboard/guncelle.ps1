# GitHub'dan son surumu indirip bu klasorun uzerine yazar. config.json'a ve guncelle.bat'a dokunmaz.
param([string]$Target)
$ErrorActionPreference = 'Stop'
$repo = 'bugradurust/register'
$branch = 'claude/confident-ramanujan-l82yja'
$Target = (Resolve-Path -LiteralPath $Target).Path
$tmp = Join-Path $env:TEMP 'pano-guncelle'
$zip = "$tmp.zip"
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Write-Host 'Son surum indiriliyor (yaklasik 10 MB)...'
  Invoke-WebRequest -Uri "https://github.com/$repo/archive/refs/heads/$branch.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  $root = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
  $new = Join-Path $root.FullName 'ipad-dashboard'
  if (-not (Test-Path (Join-Path $new 'server.js'))) { throw 'Indirilen pakette ipad-dashboard klasoru bulunamadi.' }
  Get-ChildItem -LiteralPath $new -Force |
    Where-Object { $_.Name -ne 'config.json' -and $_.Name -ne 'guncelle.bat' } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $Target -Recurse -Force }
  Write-Host ''
  Write-Host 'Guncelleme tamam. start.bat penceresini kapatip yeniden calistirin.'
} catch {
  Write-Host ''
  Write-Host "Guncelleme basarisiz: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Internet baglantinizi kontrol edin. Olmazsa GitHub sayfasindan ZIP indirip klasorun uzerine kopyalayin.'
  exit 1
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path $zip) { Remove-Item $zip -Force -ErrorAction SilentlyContinue }
}
