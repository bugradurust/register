@echo off
rem Sunucuyu surekli calistirir: kapanirsa 5 saniye sonra yeniden baslatir. Cikti pano.log dosyasina yazilir.
chcp 65001 >nul
cd /d "%~dp0"
set "NODE="
if exist node-yolu.txt set /p NODE=<node-yolu.txt
if not defined NODE set "NODE=node"

:dongu
rem Kayit dosyasi 2 MB'i gecerse eskisi yedeklenir.
if exist pano.log for %%A in (pano.log) do if %%~zA GTR 2000000 move /y pano.log pano.eski.log >nul
echo ===== %date% %time% sunucu basliyor ===== >> pano.log
"%NODE%" server.js >> pano.log 2>&1
echo ===== %date% %time% sunucu durdu, 5 saniye sonra yeniden basliyor ===== >> pano.log
rem timeout komutu gizli oturumda calismaz, bu yuzden ping ile beklenir.
ping -n 6 127.0.0.1 >nul
goto dongu
