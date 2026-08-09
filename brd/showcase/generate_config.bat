@echo off
:: Move to the directory where this batch file is located
cd /d "%~dp0"

echo [TTM Showcase Config Generator]
echo Scanning images/ directory for new assets...
echo.

python generate_config.py

echo.
echo Operation completed!
pause
