@echo off
setlocal enabledelayedexpansion

:: Fijar directorio de trabajo al lugar donde esta este script
cd /d "%~dp0"

title Quant MT5 Dashboard - Instalador

:: ============================================================
:: PASO 0: AUTO-ELEVACION A ADMINISTRADOR (UAC)
:: ============================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo =======================================================
    echo       QUANT MT5 DASHBOARD - INSTALADOR
    echo =======================================================
    echo.
    echo  Se necesitan permisos de Administrador.
    echo  Se abrira una nueva ventana con privilegios elevados.
    echo  Acepta el dialogo de Windows cuando aparezca.
    echo.
    powershell -Command "Start-Process cmd.exe -ArgumentList '/k cd /d ""%~dp0"" && ""%~f0""' -Verb RunAs"
    exit /b
)

:: ============================================================
:: ENCABEZADO
:: ============================================================
echo =======================================================
echo    QUANT MT5 DASHBOARD - INSTALADOR v1.0
echo    Permisos de Administrador: OK
echo =======================================================
echo.

set INSTALL_ERRORS=0

:: ============================================================
:: PASO 1: VERIFICACIONES DEL SISTEMA
:: ============================================================
echo [Sistema] Verificando entorno...

if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    echo  [OK] Arquitectura 64-bit detectada.
) else if "%PROCESSOR_ARCHITEW6432%"=="AMD64" (
    echo  [OK] Arquitectura 64-bit ^(WOW64^) detectada.
) else (
    echo  [WARN] Arquitectura no reconocida: %PROCESSOR_ARCHITECTURE%
)

ping -n 1 -w 2000 8.8.8.8 >nul 2>&1
if %errorLevel% neq 0 (
    echo  [WARN] Sin conexion a internet detectada.
    echo         Si Python y Node ya estan instalados puedes continuar.
    echo         Presiona cualquier tecla para continuar o cierra si quieres
    echo         conectarte primero...
    pause >nul
) else (
    echo  [OK] Conexion a internet disponible.
)
echo.

:: ============================================================
:: PASO 2: VERIFICAR / INSTALAR PYTHON
:: ============================================================
echo [1/5] Comprobando Python...
python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo  [INFO] Python no encontrado. Descargando Python 3.13...
    echo         Espera, esto puede tardar varios minutos...
    echo.
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.13.1/python-3.13.1-amd64.exe' -OutFile '%TEMP%\python_installer.exe' -UseBasicParsing"
    if not exist "%TEMP%\python_installer.exe" (
        echo.
        echo  [ERROR] No se pudo descargar Python automaticamente.
        echo.
        echo  INSTALACION MANUAL:
        echo  1. Abre: https://www.python.org/downloads/
        echo  2. Descarga Python 3.13 para Windows (64-bit)
        echo  3. IMPORTANTE: Marca "Add python.exe to PATH"
        echo  4. Cierra esta ventana y vuelve a ejecutar install.bat
        echo.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
    echo  [INFO] Instalando Python 3.13...
    start /wait "" "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_launcher=1
    del "%TEMP%\python_installer.exe" >nul 2>&1
    echo  [OK] Python instalado.
    echo.
    echo  IMPORTANTE: Cierra esta ventana y vuelve a ejecutar install.bat
    echo  para que el sistema reconozca Python en el PATH.
    echo.
    goto :SUMMARY
) else (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
    echo  [OK] Python !PY_VER! detectado.
    
    :: Asegurar que venv esté disponible
    python -m pip install --user --upgrade pip >nul 2>&1
)
echo.

:: ============================================================
:: PASO 3: VERIFICAR / INSTALAR NODE.JS
:: ============================================================
echo [2/5] Comprobando Node.js...
call npm --version >nul 2>&1
if %errorLevel% neq 0 (
    echo  [INFO] Node.js no encontrado. Descargando Node.js v20 LTS...
    echo         Espera, esto puede tardar varios minutos...
    echo.
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi' -OutFile '%TEMP%\node_installer.msi' -UseBasicParsing"
    if not exist "%TEMP%\node_installer.msi" (
        echo.
        echo  [ERROR] No se pudo descargar Node.js automaticamente.
        echo.
        echo  INSTALACION MANUAL:
        echo  1. Abre: https://nodejs.org/
        echo  2. Descarga la version LTS
        echo  3. Instala con opciones por defecto
        echo  4. Cierra esta ventana y vuelve a ejecutar install.bat
        echo.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
    echo  [INFO] Instalando Node.js v20 LTS...
    start /wait msiexec.exe /i "%TEMP%\node_installer.msi" /quiet /qn /norestart ADDLOCAL=ALL
    del "%TEMP%\node_installer.msi" >nul 2>&1
    echo  [OK] Node.js instalado.
    echo.
    echo  IMPORTANTE: Cierra esta ventana y vuelve a ejecutar install.bat
    echo  para que el sistema reconozca Node.js en el PATH.
    echo.
    goto :SUMMARY
) else (
    for /f %%v in ('npm --version 2^>^&1') do set NODE_VER=%%v
    echo  [OK] Node.js detectado. npm v!NODE_VER!
)
echo.

:: ============================================================
:: PASO 4: ARCHIVOS .ENV
:: ============================================================
echo [Config] Verificando archivos de entorno...

if not exist "backend\.env" (
    echo  [INFO] Creando backend\.env con valores por defecto...
    (
        echo SECRET_KEY=django-insecure-quant-default-key-change-in-production-!!
        echo DEBUG=False
        echo ALLOWED_HOSTS=*
        echo API_SECRET_KEY=quant-admin-supersecret-token-777
        echo CORS_ALLOWED_ORIGINS=ALL
        echo MT5_ACCOUNT=
        echo MT5_PASSWORD=
        echo MT5_SERVER=
    ) > "backend\.env"
    echo  [OK] backend\.env creado.
) else (
    echo  [OK] backend\.env ya existe.
)

if not exist "frontend\.env.local" (
    echo  [INFO] Creando frontend\.env.local...
    (echo VITE_API_SECRET_KEY=quant-admin-supersecret-token-777) > "frontend\.env.local"
    echo  [OK] frontend\.env.local creado.
) else (
    echo  [OK] frontend\.env.local ya existe.
)
echo.

:: ============================================================
:: PASO 5: ENTORNO VIRTUAL + DEPENDENCIAS BACKEND
:: ============================================================
echo [3/5] Configurando entorno virtual Python...

if not exist "backend\venv\Scripts\python.exe" (
    echo  [INFO] Creando entorno virtual...
    python -m venv backend\venv
    if %errorLevel% neq 0 (
        echo  [ERROR] No se pudo crear el entorno virtual.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
    echo  [OK] Entorno virtual creado.
) else (
    echo  [OK] Entorno virtual ya existe.
)

echo  [INFO] Actualizando pip...
"backend\venv\Scripts\python.exe" -m pip install --upgrade pip -q
echo  [OK] pip actualizado.

echo  [INFO] Instalando dependencias backend (puede tardar unos minutos)...
echo.
"backend\venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
if %errorLevel% neq 0 (
    echo.
    echo  [ERROR] Fallo la instalacion de requirements.txt
    set /a INSTALL_ERRORS+=1
    goto :SUMMARY
)
echo.
echo  [OK] Dependencias backend instaladas.
echo  [LOG] Verificando requisitos minimos...
echo.

:: ============================================================
:: PASO 6: MIGRACIONES DJANGO
:: ============================================================
echo [4/5] Configurando base de datos Django...
set PYTHONUTF8=1
"backend\venv\Scripts\python.exe" backend\manage.py migrate
if %errorLevel% neq 0 (
    echo  [ERROR] Fallaron las migraciones Django.
    set /a INSTALL_ERRORS+=1
) else (
    echo  [OK] Base de datos lista.
)
echo.

:: ============================================================
:: PASO 7: DEPENDENCIAS FRONTEND
:: ============================================================
echo [5/5] Instalando dependencias frontend (React + Vite)...
echo       Puede tardar 1-3 minutos la primera vez...
echo.
pushd frontend
call npm install
set NPM_EXIT=%errorLevel%
popd

if %NPM_EXIT% neq 0 (
    echo.
    echo  [ERROR] Fallo npm install.
    echo  Intenta manualmente: cd frontend ^&^& npm install
    set /a INSTALL_ERRORS+=1
    goto :SUMMARY
)
echo.
echo  [OK] Dependencias frontend instaladas.
echo.

:: ============================================================
:: VERIFICACION FINAL
:: ============================================================
echo =======================================================
echo  VERIFICACION FINAL
echo =======================================================
echo.

"backend\venv\Scripts\python.exe" -c "import django; print('  [OK] Django', django.__version__)"
if %errorLevel% neq 0 ( echo  [ERROR] Django no disponible. & set /a INSTALL_ERRORS+=1 )

"backend\venv\Scripts\python.exe" -c "import rest_framework; print('  [OK] DRF', rest_framework.__version__)"
if %errorLevel% neq 0 ( echo  [ERROR] DRF no disponible. & set /a INSTALL_ERRORS+=1 )

"backend\venv\Scripts\python.exe" -c "import pandas as pd, numpy as np; print('  [OK] pandas', pd.__version__, '/ numpy', np.__version__)"
if %errorLevel% neq 0 ( echo  [ERROR] pandas/numpy no disponibles. & set /a INSTALL_ERRORS+=1 )

"backend\venv\Scripts\python.exe" -c "import MetaTrader5; print('  [OK] MetaTrader5 disponible')" 2>nul
if %errorLevel% neq 0 (
    echo  [WARN] MetaTrader5 no detectado. Instala la plataforma MT5 desde tu broker.
    echo         El dashboard funciona sin MT5 pero sin datos de trading en vivo.
)

if exist "backend\db.sqlite3" ( echo  [OK] Base de datos presente. ) else ( echo  [WARN] db.sqlite3 no encontrada. )
if exist "frontend\node_modules\vite" ( echo  [OK] Frontend: Vite listo. ) else ( echo  [WARN] node_modules podria estar incompleto. )

:: ============================================================
:: RESUMEN FINAL
:: ============================================================
:SUMMARY
echo.
echo =======================================================

if %INSTALL_ERRORS% equ 0 (
    color 0A
    echo.
    echo   INSTALACION COMPLETADA CON EXITO
    echo.
    echo   Para iniciar el panel ejecuta:
    echo.
    echo        ---^>  start.bat  ^<---
    echo.
    echo   Puedes editar backend\.env para configurar tu cuenta
    echo   MT5 (MT5_ACCOUNT, MT5_PASSWORD, MT5_SERVER).
    echo.
    echo =======================================================
    echo.
    echo   Todo listo. Presiona cualquier tecla para cerrar...
) else (
    color 0C
    echo.
    echo   INSTALACION FINALIZADA CON %INSTALL_ERRORS% ERROR(ES)
    echo.
    echo   Revisa los mensajes [ERROR] mostrados arriba.
    echo   Soluciones comunes:
    echo     - Sin internet: conectate y vuelve a ejecutar
    echo     - Python/Node recien instalados: cierra y vuelve a abrir
    echo     - requirements.txt: revisa backend\requirements.txt
    echo.
    echo =======================================================
    echo.
    echo   Presiona cualquier tecla para cerrar...
)
pause >nul
endlocal
