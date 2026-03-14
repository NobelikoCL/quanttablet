@echo off
title Quant MT5 Dashboard - Launcher
color 0A

echo =======================================================
echo          INICIANDO PANEL CUANTITATIVO MT5
echo =======================================================
echo.

:: 1. Limpieza de procesos
echo [!] Limpiando instancias previas...
taskkill /f /fi "windowtitle eq DJANGO BACKEND*" /t >nul 2>&1
taskkill /f /fi "windowtitle eq REACT FRONTEND*" /t >nul 2>&1
timeout /t 2 /nobreak >nul

:: 2. Verificación de Entorno
echo [1] Verificando archivos...
if not exist "backend\venv\Scripts\python.exe" (
    echo [ERROR] No se detecta venv en Backend. Ejecuta: install.bat
    pause
    exit /b
)
if not exist "frontend\node_modules" (
    echo [ERROR] No se detecta node_modules. Ejecuta: install.bat
    pause
    exit /b
)
echo [OK] Entorno verificado.

:: 3. Configuración de Variables
set LOCAL_IP=127.0.0.1
echo [2] Detectando red...
:: Metodo simple para IP que no rompe por idioma
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set LOCAL_IP=%%a
)
:: Limpiar espacios (metodo sin delayed expansion)
set LOCAL_IP=%LOCAL_IP: =%
echo [OK] IP Local: %LOCAL_IP%

:: 4. Arranque de Backend
echo.
echo [3] Iniciando Backend Django...
if exist "quant_backend_logs.log" del "quant_backend_logs.log"
:: Ejecutamos migraciones primero
echo [INFO] Ejecutando migraciones...
cd backend
venv\Scripts\python.exe manage.py migrate > ..\quant_backend_logs.log 2>&1
if errorlevel 1 (
    echo [ERROR] Fallaron las migraciones. Revisa quant_backend_logs.log
    cd ..
    pause
    exit /b
)
cd ..
echo [OK] Migraciones completadas.

:: Iniciar servidor en ventana aparte (Simple, sin pipes complejos)
start "DJANGO BACKEND" cmd /k "cd backend && venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000"

:: 5. Arranque de Frontend
echo.
echo [4] Iniciando Frontend React...
start "REACT FRONTEND" cmd /k "cd frontend && npm run dev"

:: 6. Finalización
echo.
echo =======================================================
echo TODO INICIADO CORRECTAMENTE.
echo.
echo   Local:        http://localhost:5173
echo   Red Local:    http://%LOCAL_IP%:5173
echo.
echo   Si el navegador no abre solo, usa los links de arriba.
echo =======================================================
echo.

timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

pause
