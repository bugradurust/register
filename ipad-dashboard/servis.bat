@echo off
chcp 65001 >nul
title iPad Pano - Arka plan hizmeti
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Yonetici izni isteniyor, acilan pencerede Evet deyin...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

:menu
cls
echo ====== iPad Pano - arka plan hizmeti ======
echo.
echo   1  Kur ve baslat   (pencere acilmaz, bilgisayar acilinca kendiliginden baslar)
echo   2  Yeniden baslat  (config.json degisikliginden ya da guncellemeden sonra)
echo   3  Durdur ve kaldir
echo   4  Durum ve son kayitlar
echo   5  Cik
echo.
set "SEC="
set /p SEC=Seciminiz: 
echo.
if "%SEC%"=="1" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servis-kur.ps1" -Dir "%~dp0."
if "%SEC%"=="2" powershell -NoProfile -Command "Stop-ScheduledTask -TaskName 'iPad Pano'; Start-Sleep -Seconds 3; Start-ScheduledTask -TaskName 'iPad Pano'; Write-Host 'Yeniden baslatildi.'"
if "%SEC%"=="3" powershell -NoProfile -Command "Stop-ScheduledTask -TaskName 'iPad Pano' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'iPad Pano' -Confirm:$false; Write-Host 'Durduruldu ve kaldirildi.'"
if "%SEC%"=="4" powershell -NoProfile -Command "Get-ScheduledTask -TaskName 'iPad Pano' | Select-Object TaskName, State | Format-List; if (Test-Path pano.log) { Get-Content pano.log -Tail 40 -Encoding UTF8 } else { Write-Host '(pano.log yok)' }"
if "%SEC%"=="5" exit /b
echo.
pause
goto menu
