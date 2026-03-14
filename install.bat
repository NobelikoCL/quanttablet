@echo off
setlocal enabledelayedexpansion
title Quant MT5 Dashboard - Instalador
color 0B

:: Fijar directorio de trabajo al lugar donde esta este script
cd /d "%~dp0"

:: ============================================================
:: PASO 0: AUTO-ELEVACION A ADMINISTRADOR (UAC)
:: ============================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    cls
    echo =======================================================
    echo       QUANT MT5 DASHBOARD - INSTALADOR
    echo =======================================================
    echo.
    echo  [!] Se necesitan permisos de Administrador.
    echo      Solicitando elevacion UAC...
    echo      (Acepta el dialogo "Permitir que esta app realice cambios")
    echo.
    timeout /t 2 /nobreak >nul
    powershell -Command "Start-Process cmd.exe -ArgumentList '/d /c cd /d ""%~dp0"" && ""%~f0""' -Verb RunAs"
    exit /b
)

cls
color 0B
echo =======================================================
echo    QUANT MT5 DASHBOARD - INSTALADOR v1.0
echo    Ejecutando como Administrador [OK]
echo =======================================================
echo.

set INSTALL_ERRORS=0

:: ============================================================
:: PASO 1: VERIFICACIONES DEL SISTEMA
:: ============================================================
echo [Sistema] Verificando compatibilidad...

if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    echo  [OK] Arquitectura 64-bit.
) else if "%PROCESSOR_ARCHITEW6432%"=="AMD64" (
    echo  [OK] Arquitectura 64-bit (WOW64).
) else (
    echo  [WARN] Arquitectura no reconocida: %PROCESSOR_ARCHITECTURE%
    echo         MetaTrader5 requiere Windows 64-bit.
)

ping -n 1 -w 2000 8.8.8.8 >nul 2>&1
if %errorLevel% neq 0 (
    echo  [WARN] Sin conexion a internet. Si Python y Node ya estan instalados,
    echo         puedes continuar. Presiona una tecla para seguir o cierra la
    echo         ventana si quieres conectarte primero.
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
    echo  [INFO] Python no detectado. Descargando Python 3.13...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.13.1/python-3.13.1-amd64.exe' -OutFile '%TEMP%\python_installer.exe' -UseBasicParsing"
    if not exist "%TEMP%\python_installer.exe" (
        echo.
        echo  [ERROR] No se pudo descargar Python.
        echo  Descargalo manualmente desde: https://www.python.org/downloads/
        echo  IMPORTANTE: Marca "Add python.exe to PATH" durante la instalacion.
        echo  Luego cierra esta ventana y vuelve a ejecutar install.bat.
        echo.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
    echo  [INFO] Instalando Python 3.13 (puede tardar unos minutos)...
    start /wait "" "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_launcher=1
    del "%TEMP%\python_installer.exe" >nul 2>&1
    echo.
    echo  [INFO] Python instalado. Es necesario reiniciar esta consola para
    echo         que el PATH se actualice correctamente.
    echo  Cierra esta ventana y vuelve a ejecutar install.bat.
    echo.
    pause >nul
    exit /b
) else (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
    echo  [OK] Python !PY_VER! detectado.
)
echo.

:: ============================================================
:: PASO 3: VERIFICAR / INSTALAR NODE.JS
:: ============================================================
echo [2/5] Comprobando Node.js...
call npm --version >nul 2>&1
if %errorLevel% neq 0 (
    echo  [INFO] Node.js no detectado. Descargando Node.js v20 LTS...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi' -OutFile '%TEMP%\node_installer.msi' -UseBasicParsing"
    if not exist "%TEMP%\node_installer.msi" (
        echo.
        echo  [ERROR] No se pudo descargar Node.js.
        echo  Descargalo manualmente desde: https://nodejs.org/ (version LTS)
        echo  Luego cierra esta ventana y vuelve a ejecutar install.bat.
        echo.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
    echo  [INFO] Instalando Node.js v20 LTS (puede tardar unos minutos)...
    start /wait msiexec.exe /i "%TEMP%\node_installer.msi" /quiet /qn /norestart ADDLOCAL=ALL
    del "%TEMP%\node_installer.msi" >nul 2>&1
    echo.
    echo  [INFO] Node.js instalado. Es necesario reiniciar esta consola para
    echo         que el PATH se actualice correctamente.
    echo  Cierra esta ventana y vuelve a ejecutar install.bat.
    echo.
    pause >nul
    exit /b
) else (
    for /f %%v in ('npm --version 2^>^&1') do set NODE_VER=%%v
    echo  [OK] Node.js detectado. npm v!NODE_VER!
)
echo.

:: ============================================================
:: PASO 4: ARCHIVOS DE ENTORNO (.env)
:: ============================================================
echo [Configuracion] Verificando archivos .env...

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
    echo  [OK] backend\.env ya existe (no se sobreescribe).
)

if not exist "frontend\.env.local" (
    echo  [INFO] Creando frontend\.env.local...
    (echo VITE_API_SECRET_KEY=quant-admin-supersecret-token-777) > "frontend\.env.local"
    echo  [OK] frontend\.env.local creado.
) else (
    echo  [OK] frontend\.env.local ya existe (no se sobreescribe).
)
echo.

:: ============================================================
:: PASO 5: ENTORNO VIRTUAL PYTHON + DEPENDENCIAS BACKEND
:: ============================================================
echo [3/5] Configurando entorno virtual Python...

if not exist "backend\venv\Scripts\python.exe" (
    echo  [INFO] Creando entorno virtual en backend\venv...
    python -m venv backend\venv
    if %errorLevel% neq 0 (
        echo  [ERROR] No se pudo crear el entorno virtual.
        echo  Asegurate de que Python esta correctamente instalado.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
    echo  [OK] Entorno virtual creado.
) else (
    echo  [OK] Entorno virtual existente detectado.
)

echo  [INFO] Actualizando pip...
"backend\venv\Scripts\python.exe" -m pip install --upgrade pip --quiet 2>nul
echo  [OK] pip actualizado.

echo  [INFO] Instalando dependencias del backend (requirements.txt)...
echo         Django, DRF, MetaTrader5, pandas, numpy...
echo.
"backend\venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
if %errorLevel% neq 0 (
    echo.
    echo  [ERROR] Fallo la instalacion de requirements.txt.
    echo  Verifica tu conexion a internet o el archivo backend\requirements.txt.
    set /a INSTALL_ERRORS+=1
    goto :SUMMARY
)
echo.
echo  [OK] Dependencias del backend instaladas.
echo.

:: ============================================================
:: PASO 6: MIGRACIONES DJANGO
:: ============================================================
echo [4/5] Ejecutando migraciones de la base de datos...
set PYTHONUTF8=1
"backend\venv\Scripts\python.exe" backend\manage.py migrate
if %errorLevel% neq 0 (
    echo  [ERROR] Fallaron las migraciones de Django.
    echo  Verifica que backend\.env exista y sea correcto.
    set /a INSTALL_ERRORS+=1
) else (
    echo  [OK] Base de datos configurada correctamente.
)
echo.

:: ============================================================
:: PASO 7: DEPENDENCIAS FRONTEND
:: ============================================================
echo [5/5] Instalando dependencias del frontend (React + Vite)...
echo       (node_modules - puede tardar 1-3 minutos la primera vez)
echo.

pushd frontend
call npm install
set NPM_EXIT=%errorLevel%
popd

if %NPM_EXIT% neq 0 (
    echo.
    echo  [ERROR] Fallo npm install en el frontend.
    echo  Intenta ejecutar manualmente: cd frontend ^&^& npm install
    set /a INSTALL_ERRORS+=1
    goto :SUMMARY
)
echo.
echo  [OK] Dependencias del frontend instaladas.
echo.

:: ============================================================
:: VERIFICACION FINAL
:: ============================================================
echo =======================================================
echo  VERIFICACION FINAL DEL SISTEMA
echo =======================================================
echo.

echo  Verificando Django...
"backend\venv\Scripts\python.exe" -c "import django; print('  [OK] Django ' + django.__version__)"
if %errorLevel% neq 0 (
    echo  [ERROR] Django no se pudo importar.
    set /a INSTALL_ERRORS+=1
)

echo  Verificando Django REST Framework...
"backend\venv\Scripts\python.exe" -c "import rest_framework; print('  [OK] DRF ' + rest_framework.__version__)"
if %errorLevel% neq 0 (
    echo  [ERROR] DRF no se pudo importar.
    set /a INSTALL_ERRORS+=1
)

echo  Verificando pandas y numpy...
"backend\venv\Scripts\python.exe" -c "import pandas as pd, numpy as np; print('  [OK] pandas ' + pd.__version__ + ' / numpy ' + np.__version__)"
if %errorLevel% neq 0 (
    echo  [ERROR] pandas o numpy no disponibles.
    set /a INSTALL_ERRORS+=1
)

echo  Verificando MetaTrader5...
"backend\venv\Scripts\python.exe" -c "import MetaTrader5; print('  [OK] MetaTrader5 disponible')" 2>nul
if %errorLevel% neq 0 (
    echo  [WARN] MetaTrader5 no disponible. Instala la plataforma MT5 desde tu broker.
    echo         El dashboard funcionara sin datos de trading en vivo.
)

echo  Verificando base de datos...
if exist "backend\db.sqlite3" (
    echo  [OK] db.sqlite3 presente.
) else (
    echo  [WARN] db.sqlite3 no encontrada - se creara al primer inicio.
)

echo  Verificando frontend...
if exist "frontend\node_modules\.package-lock.json" (
    echo  [OK] node_modules completo.
) else if exist "frontend\node_modules\vite" (
    echo  [OK] node_modules listo.
) else (
    echo  [WARN] node_modules podria estar incompleto.
)

echo.

:: ============================================================
:: RESUMEN FINAL
:: ============================================================
:SUMMARY
echo.
echo =======================================================
if %INSTALL_ERRORS% equ 0 (
    color 0A
    echo.
    echo   ############################################
    echo   ##                                        ##
    echo   ##   INSTALACION COMPLETADA CON EXITO    ##
    echo   ##                                        ##
    echo   ############################################
    echo.
    echo   El entorno esta listo. Para iniciar el panel:
    echo.
    echo        ---^>  start.bat  ^<---
    echo.
    echo   Puedes editar backend\.env para configurar:
    echo     - MT5_ACCOUNT / MT5_PASSWORD / MT5_SERVER
    echo     - API_SECRET_KEY (clave de seguridad)
    echo.
    echo =======================================================
    echo.
    echo  Todo esta OK. Presiona cualquier tecla para cerrar...
) else (
    color 0C
    echo.
    echo   ############################################
    echo   ##                                        ##
    echo   ##   INSTALACION FINALIZADA CON ERRORES  ##
    echo   ##                                        ##
    echo   ############################################
    echo.
    echo   Se detectaron %INSTALL_ERRORS% error(es). Revisa los mensajes
    echo   [ERROR] mostrados arriba para solucionarlos.
    echo.
    echo   Soluciones comunes:
    echo   - Sin internet: conectate y vuelve a ejecutar install.bat
    echo   - Python/Node no reconocidos: cierra y vuelve a abrir install.bat
    echo   - Error en requirements.txt: revisa backend\requirements.txt
    echo.
    echo =======================================================
    echo.
    echo  Presiona cualquier tecla para cerrar...
)
pause >nul
endlocal
