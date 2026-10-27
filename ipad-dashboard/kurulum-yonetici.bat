@echo off
chcp 65001 >nul
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Bu dosyaya sag tiklayip "Yonetici olarak calistir" secin.
  pause
  exit /b 1
)
set PORT=3000
if not "%~1"=="" set PORT=%~1

echo [1/3] Guvenlik duvari: TCP %PORT% icin ev agindan gelen baglantilara izin veriliyor...
netsh advfirewall firewall delete rule name="iPad Pano" >nul 2>&1
netsh advfirewall firewall add rule name="iPad Pano" dir=in action=allow protocol=TCP localport=%PORT% profile=private,domain

echo [2/3] Arka plan hizmeti kuruluyor: pencere acilmaz, bilgisayar acilinca kendiliginden baslar...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servis-kur.ps1" -Dir "%~dp0."

echo [3/3] Bilgisayarin uyku ve hazirda bekleme modu kapatiliyor...
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

echo.
echo Tamam. Hizmeti yonetmek (yeniden baslat, kaldir, kayitlari gor) icin servis.bat dosyasini kullanin.
pause
