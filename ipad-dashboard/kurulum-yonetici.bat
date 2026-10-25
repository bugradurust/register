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

echo [2/3] Oturum acilinca otomatik baslatma gorevi ekleniyor...
schtasks /create /tn "iPad Pano" /tr "\"%~dp0start.bat\"" /sc onlogon /delay 0000:30 /rl highest /f

echo [3/3] Bilgisayarin uyku ve hazirda bekleme modu kapatiliyor...
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

echo.
echo Tamam. Gorevi kaldirmak icin: schtasks /delete /tn "iPad Pano" /f
pause
