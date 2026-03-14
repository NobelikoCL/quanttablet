@echo off
setlocal enabledelayedexpansion
title Quant MT5 Dashboard - Instalador
color 0B

:: Cambiar al directorio donde esta este script
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
    echo  [!] Se necesitan permisos de Administrador para instalar
    echo      Python, Node.js y configurar el entorno correctamente.
    echo.
    echo  Abriendo solicitud de permisos UAC...
    echo  (Acepta el dialogo de "Permitir que esta aplicacion realice cambios")
    echo.
    timeout /t 3 /nobreak >nul
    powershell -Command "Start-Process cmd.exe -ArgumentList '/c cd /d ""%~dp0"" && ""%~f0""' -Verb RunAs"
    exit /b
)

:: A partir de aqui corremos como Administrador
cls
color 0B
echo =======================================================
echo       QUANT MT5 DASHBOARD - INSTALADOR v1.0
echo       [Ejecutando como Administrador - OK]
echo =======================================================
echo.

:: Contador de errores
set INSTALL_ERRORS=0
set PYTHON_OK=0
set NODE_OK=0
set VENV_OK=0
set DEPS_OK=0
set MIGRATE_OK=0
set FRONTEND_OK=0
set ENV_OK=0

:: ============================================================
:: PASO 1: VERIFICAR ARQUITECTURA Y SISTEMA
:: ============================================================
echo [Sistema] Verificando compatibilidad del sistema operativo...
ver | findstr /i "10\." >nul 2>&1
if %errorLevel% neq 0 (
    ver | findstr /i "11\." >nul 2>&1
    if %errorLevel% neq 0 (
        echo  [WARN] No se pudo confirmar Windows 10/11. El proyecto esta optimizado para Windows 10+.
    ) else (
        echo  [OK] Windows 11 detectado.
    )
) else (
    echo  [OK] Windows 10 detectado.
)

:: Verificar arquitectura 64-bit
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    echo  [OK] Arquitectura 64-bit ^(AMD64^) - Compatible.
) else if "%PROCESSOR_ARCHITEW6432%"=="AMD64" (
    echo  [OK] Arquitectura 64-bit ^(WOW64^) - Compatible.
) else (
    echo  [WARN] Arquitectura no reconocida: %PROCESSOR_ARCHITECTURE%. MetaTrader5 requiere 64-bit.
)

:: Verificar conexion a internet
echo  [Sistema] Comprobando conexion a internet...
ping -n 1 -w 3000 8.8.8.8 >nul 2>&1
if %errorLevel% neq 0 (
    echo  [WARN] Sin conexion a internet detectada. La descarga de dependencias podria fallar.
    echo         Si ya tienes Python y Node instalados, puedes continuar de todos modos.
    echo.
    echo  Presiona cualquier tecla para continuar de todos modos, o cierra esta
    echo  ventana si deseas conectarte primero...
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
    echo  [INFO] Python no encontrado en el PATH. Descargando Python 3.13...
    echo         Esto puede tardar varios minutos segun tu conexion.
    echo.
    powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.13.1/python-3.13.1-amd64.exe' -OutFile '%TEMP%\python_installer.exe' -UseBasicParsing" 2>nul
    if exist "%TEMP%\python_installer.exe" (
        echo  [INFO] Instalando Python 3.13 (silencioso, para todos los usuarios)...
        start /wait "" "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_launcher=1
        del "%TEMP%\python_installer.exe" >nul 2>&1
        :: Refrescar PATH en esta sesion
        for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%b"
        for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USR_PATH=%%b"
        set "PATH=%SYS_PATH%;%USR_PATH%;%PATH%"
        python --version >nul 2>&1
        if %errorLevel% neq 0 (
            echo.
            echo  [ERROR] Python se instalo pero no se reconoce en esta sesion aun.
            echo  Cierra esta ventana y vuelve a ejecutar install.bat.
            echo.
            set /a INSTALL_ERRORS+=1
            goto :SUMMARY
        )
        echo  [OK] Python instalado correctamente:
        python --version
        set PYTHON_OK=1
    ) else (
        echo.
        echo  [ERROR] No se pudo descargar Python automaticamente.
        echo.
        echo  INSTALACION MANUAL:
        echo  1. Ve a: https://www.python.org/downloads/
        echo  2. Descarga Python 3.13 para Windows (64-bit).
        echo  3. IMPORTANTE: Marca "Add python.exe to PATH" en la primera pantalla.
        echo  4. Cierra esta ventana y vuelve a ejecutar install.bat.
        echo.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
) else (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
    echo  [OK] Python !PY_VER! detectado.
    set PYTHON_OK=1
)
echo.

:: ============================================================
:: PASO 3: VERIFICAR / INSTALAR NODE.JS
:: ============================================================
echo [2/5] Comprobando Node.js...
npm --version >nul 2>&1
if %errorLevel% neq 0 (
    echo  [INFO] Node.js no encontrado. Descargando Node.js LTS v20...
    echo         Esto puede tardar varios minutos segun tu conexion.
    echo.
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi' -OutFile '%TEMP%\node_installer.msi' -UseBasicParsing" 2>nul
    if exist "%TEMP%\node_installer.msi" (
        echo  [INFO] Instalando Node.js v20 LTS...
        start /wait msiexec.exe /i "%TEMP%\node_installer.msi" /quiet /qn /norestart ADDLOCAL=ALL
        del "%TEMP%\node_installer.msi" >nul 2>&1
        :: Refrescar PATH
        for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%b"
        set "PATH=%SYS_PATH%;%PATH%"
        npm --version >nul 2>&1
        if %errorLevel% neq 0 (
            echo.
            echo  [ERROR] Node.js se instalo pero no se reconoce en esta sesion aun.
            echo  Cierra esta ventana y vuelve a ejecutar install.bat.
            echo.
            set /a INSTALL_ERRORS+=1
            goto :SUMMARY
        )
        echo  [OK] Node.js instalado. npm version:
        npm --version
        set NODE_OK=1
    ) else (
        echo.
        echo  [ERROR] No se pudo descargar Node.js automaticamente.
        echo.
        echo  INSTALACION MANUAL:
        echo  1. Ve a: https://nodejs.org/
        echo  2. Descarga la version LTS (recomendada).
        echo  3. Instala con todas las opciones por defecto.
        echo  4. Cierra esta ventana y vuelve a ejecutar install.bat.
        echo.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
) else (
    for /f %%v in ('npm --version 2^>^&1') do set NODE_VER=%%v
    echo  [OK] Node.js detectado. npm v!NODE_VER!
    set NODE_OK=1
)
echo.

:: ============================================================
:: PASO 4: ENTORNO VIRTUAL PYTHON (venv)
:: ============================================================
echo [3/5] Configurando entorno virtual Python (backend)...
if not exist "backend\venv\Scripts\python.exe" (
    echo  [INFO] Creando entorno virtual en backend\venv...
    python -m venv backend\venv
    if %errorLevel% neq 0 (
        echo  [ERROR] No se pudo crear el entorno virtual.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
    echo  [OK] Entorno virtual creado.
) else (
    echo  [OK] Entorno virtual existente detectado.
)

:: Actualizar pip
echo  [INFO] Actualizando pip...
backend\venv\Scripts\python.exe -m pip install --upgrade pip --quiet
if %errorLevel% neq 0 (
    echo  [WARN] No se pudo actualizar pip. Continuando con la version actual...
) else (
    echo  [OK] pip actualizado.
)

:: Instalar dependencias del backend
echo  [INFO] Instalando dependencias del backend (requirements.txt)...
echo         (Django, DRF, MetaTrader5, pandas, numpy...)
echo.
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if %errorLevel% neq 0 (
    echo.
    echo  [ERROR] Fallo la instalacion de dependencias del backend.
    echo  Revisa tu conexion a internet o el archivo backend\requirements.txt.
    set /a INSTALL_ERRORS+=1
    goto :SUMMARY
)
echo.
echo  [OK] Dependencias del backend instaladas correctamente.
set VENV_OK=1
set DEPS_OK=1
echo.

:: ============================================================
:: PASO 5: ARCHIVOS DE ENTORNO (.env)
:: ============================================================
echo [Configuracion] Verificando archivos de entorno (.env)...

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
    ) > backend\.env
    echo  [OK] backend\.env creado.
) else (
    echo  [OK] backend\.env ya existe.
)

if not exist "frontend\.env.local" (
    echo  [INFO] Creando frontend\.env.local...
    (echo VITE_API_SECRET_KEY=quant-admin-supersecret-token-777) > frontend\.env.local
    echo  [OK] frontend\.env.local creado.
) else (
    echo  [OK] frontend\.env.local ya existe.
)
set ENV_OK=1
echo.

:: ============================================================
:: PASO 6: MIGRACIONES DJANGO (base de datos)
:: ============================================================
echo [4/5] Ejecutando migraciones de base de datos (Django)...
set PYTHONUTF8=1
backend\venv\Scripts\python.exe backend\manage.py migrate --run-syncdb
if %errorLevel% neq 0 (
    echo  [ERROR] Fallaron las migraciones de Django.
    echo  Revisa que backend\.env exista y sea correcto.
    set /a INSTALL_ERRORS+=1
) else (
    echo  [OK] Base de datos configurada correctamente.
    set MIGRATE_OK=1
)
echo.

:: ============================================================
:: PASO 7: DEPENDENCIAS FRONTEND (npm install)
:: ============================================================
echo [5/5] Instalando dependencias del frontend (React + Vite)...
echo       (node_modules - puede tardar 1-3 minutos en la primera vez)
echo.
cd frontend
call npm install
if %errorLevel% neq 0 (
    echo.
    echo  [ERROR] Fallo npm install en el frontend.
    set /a INSTALL_ERRORS+=1
    cd ..
    goto :SUMMARY
)
cd ..
echo.
echo  [OK] Dependencias del frontend instaladas.
set FRONTEND_OK=1
echo.

:: ============================================================
:: VERIFICACION FINAL DEL SISTEMA
:: ============================================================
echo =======================================================
echo  VERIFICACION FINAL DEL SISTEMA
echo =======================================================
echo.

:: Verificar imports clave de Python
echo  Verificando instalacion de Django...
backend\venv\Scripts\python.exe -c "import django; print('  [OK] Django', django.__version__)" 2>nul
if %errorLevel% neq 0 (
    echo  [ERROR] Django no se importa correctamente.
    set /a INSTALL_ERRORS+=1
)

echo  Verificando instalacion de Django REST Framework...
backend\venv\Scripts\python.exe -c "import rest_framework; print('  [OK] DRF', rest_framework.__version__)" 2>nul
if %errorLevel% neq 0 (
    echo  [ERROR] DRF no se importa correctamente.
    set /a INSTALL_ERRORS+=1
)

echo  Verificando MetaTrader5...
backend\venv\Scripts\python.exe -c "import MetaTrader5 as mt5; print('  [OK] MetaTrader5 disponible (MT5 debe estar instalado en el sistema)')" 2>nul
if %errorLevel% neq 0 (
    echo  [WARN] MetaTrader5 no se importa. Instala la plataforma MT5 desde tu broker.
    echo         El dashboard funcionara pero sin datos de trading en vivo.
)

echo  Verificando pandas y numpy...
backend\venv\Scripts\python.exe -c "import pandas, numpy; print('  [OK] pandas', pandas.__version__, '/ numpy', numpy.__version__)" 2>nul
if %errorLevel% neq 0 (
    echo  [ERROR] pandas o numpy no disponibles.
    set /a INSTALL_ERRORS+=1
)

:: Verificar base de datos
echo  Verificando base de datos SQLite...
if exist "backend\db.sqlite3" (
    echo  [OK] Base de datos creada ^(backend\db.sqlite3^).
) else (
    echo  [WARN] db.sqlite3 no encontrada. Se creara al primer inicio con start.bat.
)

:: Verificar node_modules
echo  Verificando node_modules del frontend...
if exist "frontend\node_modules\vite" (
    echo  [OK] Frontend: Vite y dependencias listas.
) else (
    echo  [ERROR] node_modules parece incompleto.
    set /a INSTALL_ERRORS+=1
)

echo.

:: ============================================================
:: RESUMEN FINAL
:: ============================================================
:SUMMARY
echo =======================================================
if %INSTALL_ERRORS% equ 0 (
    color 0A
    echo.
    echo   ##############################################
    echo   ##                                          ##
    echo   ##   INSTALACION COMPLETADA CON EXITO      ##
    echo   ##                                          ##
    echo   ##############################################
    echo.
    echo   Todo el entorno esta listo y verificado:
    echo.
    echo   [OK] Python instalado y configurado
    echo   [OK] Node.js instalado y configurado
    echo   [OK] Entorno virtual (venv) creado
    echo   [OK] Dependencias backend (requirements.txt)
    echo   [OK] Base de datos Django migrada
    echo   [OK] Dependencias frontend (node_modules)
    echo   [OK] Archivos .env configurados
    echo.
    echo   Para iniciar el panel ejecuta:
    echo.
    echo        ---^>  start.bat  ^<---
    echo.
    echo   NOTA: Puedes editar backend\.env para configurar
    echo   tu cuenta MT5 (MT5_ACCOUNT / MT5_PASSWORD / MT5_SERVER)
    echo   o cambiar la API_SECRET_KEY de seguridad.
    echo.
    echo =======================================================
    echo.
    echo  Presiona cualquier tecla para cerrar este instalador...
) else (
    color 0C
    echo.
    echo   ##############################################
    echo   ##                                          ##
    echo   ##   INSTALACION COMPLETADA CON ERRORES    ##
    echo   ##                                          ##
    echo   ##############################################
    echo.
    echo   Se detectaron %INSTALL_ERRORS% error(es) durante la instalacion.
    echo   Revisa los mensajes [ERROR] mostrados arriba.
    echo.
    echo   Sugerencias:
    echo   - Verifica tu conexion a internet e intenta de nuevo.
    echo   - Asegurate de aceptar el dialogo de Administrador.
    echo   - Si el error persiste, instala Python/Node manualmente
    echo     y vuelve a ejecutar install.bat.
    echo.
    echo =======================================================
    echo.
    echo  Presiona cualquier tecla para cerrar...
)
pause >nul
