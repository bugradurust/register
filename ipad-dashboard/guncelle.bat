@echo off
chcp 65001 >nul
title iPad Pano - Guncelle
rem Betik calisirken kendi uzerine yazilmasin diye gecici klasorden calistirilir.
copy /y "%~dp0guncelle.ps1" "%TEMP%\pano-guncelle.ps1" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\pano-guncelle.ps1" -Target "%~dp0."
echo.
pause
