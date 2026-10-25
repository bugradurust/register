@echo off
chcp 65001 >nul
title iPad Pano
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurun.
  pause
  exit /b 1
)
:loop
node server.js
echo.
echo Sunucu durdu. 5 saniye sonra yeniden baslatiliyor... Kapatmak icin bu pencereyi kapatin.
timeout /t 5 /nobreak >nul
goto loop
