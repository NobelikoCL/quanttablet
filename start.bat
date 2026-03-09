@echo off
setlocal enabledelayedexpansion
title Quant MT5 Dashboard - SECURED Launcher
title Quant MT5 Dashboard - Launcher
color 0A

echo =======================================================
echo          INICIANDO PANEL CUANTITATIVO MT5
echo =======================================================
echo.
echo [!] Limpiando instancias previas para evitar conflictos...
taskkill /f /fi "windowtitle eq DJANGO BACKEND*" /t 2>nul
taskkill /f /fi "windowtitle eq REACT FRONTEND*" /t 2>nul
timeout /t 2 /nobreak >nul
echo.

REM Detectar IP local de la máquina
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4" ^| findstr /V "127.0.0.1"') do (
    set LOCAL_IP=%%a
)
set LOCAL_IP=%LOCAL_IP: =%
echo [INFO] IP Local detectada: %LOCAL_IP%
echo.

echo [INFO] Variables de Entorno de Seguridad requeridas (Revisando .env...)
if not exist "backend\.env" (
    echo [ERROR] No se detecta backend\.env. Creandolo...
    echo DEBUG=False > backend\.env
    echo CORS_ALLOW_ALL_ORIGINS=True >> backend\.env
    echo ALLOWED_HOSTS=* >> backend\.env
    echo API_SECRET_KEY=quant-admin-supersecret-token-777 >> backend\.env
)

if not exist "frontend\.env.local" (
    cmd /c "echo VITE_API_SECRET_KEY=quant-admin-supersecret-token-777 > frontend\.env.local"
)

echo [1] Verificando entorno Backend Django...
if not exist "backend\venv\Scripts\python.exe" (
    echo [ERROR] No se detecta venv en Backend.
    echo Por favor, ejecuta primero: install.bat
    pause
    exit /b
)

if not exist "frontend\node_modules" (
    echo [ERROR] No se detectan los modulos de Node en Frontend.
    echo Por favor, ejecuta primero: install.bat
    pause
    exit /b
)

echo [INFO] LOGS DETALLADOS ACTIVADOS PARA BACKEND (quant_backend_logs.log)
echo.
echo [2] Ejecutando Migraciones e iniciando Django en 0.0.0.0:8000...
set PYTHONUTF8=1
set PYTHONUNBUFFERED=1
start "DJANGO BACKEND" cmd /c "cd backend && venv\Scripts\python.exe manage.py migrate && echo === BACKEND ACTIVO en 0.0.0.0:8000 === && echo [INFO] Los logs se muestran aqui y se guardan en quant_backend_logs.log && venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000"

echo.
echo [3] Iniciando Frontend React en 0.0.0.0:5173...
start "REACT FRONTEND" cmd /c "cd frontend && echo === FRONTEND ACTIVO === && npm run dev"

echo.
echo =======================================================
echo TODO INICIADO. Revisa las 2 consolas abiertas.
echo.
echo   Backend (API):   http://%LOCAL_IP%:8000/
echo   Frontend (UI):   http://%LOCAL_IP%:5173/
echo.
echo   LOGS: Revisa la consola de DJANGO BACKEND para ver el
echo   escaneo de MT5 y las metricas en tiempo real.
echo =======================================================
if "%1"=="--no-pause" goto end
pause
:end
