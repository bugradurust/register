@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js bulunamadi.
  pause
  exit /b 1
)
rem Adres vermezseniz bundle.app/tr/gundem sayfasi incelenir.
node tools\teshis.js %*
echo.
pause
