@echo off
title Stemify
echo.
echo  ====================================
echo   Stemify - AI Audio Stem Separator
echo  ====================================
echo.

rem %~dp0 = the folder this .bat lives in, so it works wherever the repo is.
set "ROOT=%~dp0"

echo [1/2] Iniciando backend en http://localhost:8000 ...
start "Stemify Backend" /min cmd /k "cd /d "%ROOT%backend-node" && (if not exist node_modules npm install) && node server.js"

timeout /t 3 /nobreak >nul

echo [2/2] Iniciando frontend en http://localhost:3000 ...
start "Stemify Frontend" /min cmd /k "cd /d "%ROOT%frontend" && (if not exist node_modules npm install) && npm run dev"

timeout /t 6 /nobreak >nul

echo.
echo  Abriendo navegador...
start "" "http://localhost:3000"

echo.
echo  Stemify esta corriendo!
echo  Cierra las ventanas de consola para detenerlo.
echo.
pause
