@echo off
rem TTM Monitor source packaging - double-click for the menu, or: package.cmd -Mode Full / -Mode Incremental (see README.md)
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package.ps1" %*
set EXITCODE=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %EXITCODE%
