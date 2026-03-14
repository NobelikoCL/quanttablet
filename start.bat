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

echo [INFO] Verificando archivos de configuracion (.env)...
if not exist "backend\.env" (
    echo [INFO] Creando backend\.env con valores por defecto...
    (
        echo SECRET_KEY=django-insecure-quant-default-key-change-in-production-!!
        echo DEBUG=False
        echo ALLOWED_HOSTS=*
        echo API_SECRET_KEY=quant-admin-supersecret-token-777
        echo CORS_ALLOWED_ORIGINS=ALL
        echo MT5_ACCOUNT=
        echo MT5_PASSWORD=
        echo MT5_SERVER=
    ) > backend\.env
    echo [OK] backend\.env creado.
) else (
    echo [OK] backend\.env detectado.
)

if not exist "frontend\.env.local" (
    echo [INFO] Creando frontend\.env.local...
    (echo VITE_API_SECRET_KEY=quant-admin-supersecret-token-777) > frontend\.env.local
    echo [OK] frontend\.env.local creado.
) else (
    echo [OK] frontend\.env.local detectado.
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

echo [INFO] LOGS DETALLADOS ACTIVADOS PARA BACKEND
echo [INFO] Guardando salida en: %CD%\quant_backend_logs.log
echo.
echo [2] Ejecutando Migraciones e iniciando Django en 0.0.0.0:8000...
set PYTHONUTF8=1
set PYTHONUNBUFFERED=1
:: Borrar log previo si existe para iniciar limpio
if exist "quant_backend_logs.log" del "quant_backend_logs.log"

start "DJANGO BACKEND" cmd /c "cd backend && venv\Scripts\python.exe manage.py migrate && echo [%DATE% %TIME%] --- INICIO DE SERVIDOR --- >> ..\quant_backend_logs.log && echo === BACKEND ACTIVO en 0.0.0.0:8000 === && venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000 2>&1 | powershell -Command \"$input | Tee-Object -FilePath '..\quant_backend_logs.log' -Append\""

echo.
echo [3] Iniciando Frontend React en 0.0.0.0:5173...
start "REACT FRONTEND" cmd /c "cd frontend && echo === FRONTEND ACTIVO === && npm run dev"

echo.
echo [4] Esperando que el backend este listo (Verificando Health Check)...
set /a WAIT_ATTEMPTS=0
:wait_backend
set /a WAIT_ATTEMPTS+=1
if %WAIT_ATTEMPTS% gtr 30 (
    echo [WARN] El backend tarda mas de lo esperado. Revisa quant_backend_logs.log
    echo Abriendo navegador de todas formas...
    goto open_browser
)
:: Intentar verificar salud del backend
curl -s --max-time 2 http://localhost:8000/api/health/ > temp_health.json
findstr /C:"\"status\"" temp_health.json >nul 2>&1
if errorlevel 1 (
    del temp_health.json >nul 2>&1
    echo [WAIT] Esperando backend (!WAIT_ATTEMPTS!/30)...
    timeout /t 2 /nobreak >nul
    goto wait_backend
)
del temp_health.json >nul 2>&1

:open_browser
echo [OK] Backend detectado y saludable. Abriendo navegador...
start "" "http://localhost:5173"

echo.
echo =======================================================
echo TODO INICIADO CORRECTAMENTE.
echo.
echo   Backend (API):   http://%LOCAL_IP%:8000/
echo   Frontend (UI):   http://%LOCAL_IP%:5173/
echo.
echo   LOGS EN TIEMPO REAL: Revisa la ventana "DJANGO BACKEND"
echo   LOGS EN ARCHIVO:     %CD%\quant_backend_logs.log
echo =======================================================
if "%1"=="--no-pause" goto end
pause
:end
