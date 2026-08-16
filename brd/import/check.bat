@echo off
chcp 65001 > nul
title Jira Data Hierarchy Verifier

echo =======================================================
echo     KHOI CHAY CHUONG TRINH KIEM TRA TOAN VEN JIRA
echo =======================================================
echo.

:: Kiem tra Python tren he thong
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Python tren may tinh!
    echo Vui long cai dat Python va tick chon "Add Python to PATH".
    echo.
    pause
    exit /b
)

:: Chay chuong trinh Python
python verify_hierarchy.py

echo.
echo Hoan tat! Nhan phim bat ky de thoat...
pause > nul