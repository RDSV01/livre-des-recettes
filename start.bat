@echo off
rem Lancement en un double-clic pour Windows.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est requis. Telechargez-le sur https://nodejs.org puis relancez ce script.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Premiere installation des dependances...
  call npm install --omit=dev
)

node server.js
pause
