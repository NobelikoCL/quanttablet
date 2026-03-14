@echo off
setlocal enabledelayedexpansion

:: Fijar directorio de trabajo al lugar donde esta este script
cd /d "%~dp0"

title Quant MT5 Dashboard - Instalador Profesional

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
    echo.
    powershell -Command "Start-Process cmd.exe -ArgumentList '/k cd /d ""%~dp0"" && ""%~f0""' -Verb RunAs"
    exit /b
)

:: ============================================================
:: ENCABEZADO
:: ============================================================
color 0F
echo =======================================================
echo    QUANT MT5 DASHBOARD - INSTALADOR v1.1
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

:: Verificar Internet
ping -n 1 -w 2000 8.8.8.8 >nul 2>&1
if %errorLevel% neq 0 (
    echo  [WARN] Sin conexion a internet detectada.
) else (
    echo  [OK] Conexion a internet disponible.
)
echo.

:: ============================================================
:: PASO 2: VERIFICAR / INSTALAR PYTHON (Min 3.10)
:: ============================================================
echo [1/5] Comprobando Python...
python --version >nvl_py_ver.txt 2>&1
set /p PY_RAW=<nvl_py_ver.txt
del nvl_py_ver.txt >nul 2>&1

if "%PY_RAW%"=="" (
    echo  [INFO] Python no encontrado en el sistema.
    call :INSTALL_PYTHON
) else (
    for /f "tokens=2" %%v in ("%PY_RAW%") do set PY_VER=%%v
    echo  [OK] Python !PY_VER! detectado.
    
    :: Validacion de version simple (solo primer digito y segundo)
    for /f "tokens=1,2 delims=." %%a in ("!PY_VER!") do (
        set PY_MAJOR=%%a
        set PY_MINOR=%%b
    )
    if !PY_MAJOR! LSS 3 (
        echo  [ERROR] Se requiere Python 3.10 o superior. Tu version es muy antigua.
        call :INSTALL_PYTHON
    ) else if !PY_MAJOR! EQU 3 if !PY_MINOR! LSS 10 (
        echo  [ERROR] Se requiere Python 3.10 o superior. Detectado 3.!PY_MINOR!
        call :INSTALL_PYTHON
    )
)
echo.

:: ============================================================
:: PASO 3: VERIFICAR / INSTALAR NODE.JS (Min 20)
:: ============================================================
echo [2/5] Comprobando Node.js...
call npm --version >nvl_node_ver.txt 2>&1
if %errorLevel% neq 0 (
    echo  [INFO] Node.js no encontrado.
    call :INSTALL_NODE
) else (
    set /p NODE_NPM_VER=<nvl_node_ver.txt
    echo  [OK] Node.js/npm !NODE_NPM_VER! detectado.
)
del nvl_node_ver.txt >nul 2>&1
echo.

:: ============================================================
:: PASO 4: ARCHIVOS .ENV
:: ============================================================
echo [Config] Verificando archivos de entorno...

if not exist "backend\.env" (
    echo  [INFO] Creando backend\.env...
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
    echo  [INFO] Creando entorno virtual en backend\venv...
    python -m venv backend\venv
    if !errorLevel! neq 0 (
        echo  [ERROR] No se pudo crear el venv. Asegurate de que Python este bien instalado.
        set /a INSTALL_ERRORS+=1
        goto :SUMMARY
    )
    echo  [OK] Entorno virtual creado.
) else (
    echo  [OK] Entorno virtual ya existe.
)

echo  [INFO] Actualizando pip e instalando dependencias (requirements.txt)...
"backend\venv\Scripts\python.exe" -m pip install --upgrade pip -q
"backend\venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
if !errorLevel! neq 0 (
    echo.
    echo  [ERROR] Fallo la instalacion de dependencias del backend.
    set /a INSTALL_ERRORS+=1
    goto :SUMMARY
)
echo  [OK] Backend listo.
echo.

:: ============================================================
:: PASO 6: MIGRACIONES DJANGO
:: ============================================================
echo [4/5] Configurando base de datos Django...
set PYTHONUTF8=1
"backend\venv\Scripts\python.exe" backend\manage.py migrate
if !errorLevel! neq 0 (
    echo  [ERROR] Fallaron las migraciones. Revisa si hay errores arriba.
    set /a INSTALL_ERRORS+=1
) else (
    echo  [OK] Base de datos configurada.
)
echo.

:: ============================================================
:: PASO 7: DEPENDENCIAS FRONTEND
:: ============================================================
echo [5/5] Instalando dependencias frontend (React)...
if not exist "frontend\node_modules" (
    echo  [INFO] Ejecutando npm install en la carpeta frontend...
    pushd frontend
    call npm install
    if !errorLevel! neq 0 (
        echo  [ERROR] Fallo npm install. Prueba manualmente en la carpeta frontend.
        set /a INSTALL_ERRORS+=1
    ) else (
        echo  [OK] Frontend instalado.
    )
    popd
) else (
    echo  [OK] Modulos de Node ya existen ^(saltando npm install^).
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
    echo   ¡INSTALACION COMPLETADA EXITOSAMENTE!
    echo.
    echo   Ahora puedes iniciar el dashboard con: start.bat
    echo.
) else (
    color 0C
    echo.
    echo   INSTALACION FINALIZADA CON %INSTALL_ERRORS% PROBLEMAS
    echo.
    echo   Revisa los mensajes [ERROR] arriba. 
    echo   Si instalaste Python/Node ahora, REINICIA esta ventana.
)
echo =======================================================
pause
exit /b

:: ============================================================
:: FUNCIONES DE INSTALACION
:: ============================================================

:INSTALL_PYTHON
echo  [INFO] Iniciando descarga de Python 3.13.1...
set "PY_DL_URL=https://www.python.org/ftp/python/3.13.1/python-3.13.1-amd64.exe"
set "PY_TEMP=%TEMP%\py_inst_quant.exe"
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%PY_DL_URL%', '%PY_TEMP%')"
if not exist "%PY_TEMP%" (
    echo  [ERROR] No se pudo descargar Python. Por favor instalalo manualmente:
    echo  https://www.python.org/downloads/ (MARCA 'ADD TO PATH')
    set /a INSTALL_ERRORS+=1
    exit /b
)
echo  [INFO] Ejecutando instalador de Python... (Sigue los pasos en pantalla)
start /wait "" "%PY_TEMP%"
del "%PY_TEMP%" >nul 2>&1
echo  [IMPORTANT] CIERRA ESTA VENTANA Y VUELVE A EJECUTAR install.bat
pause
exit

:INSTALL_NODE
echo  [INFO] Iniciando descarga de Node.js v20 LTS...
set "NODE_DL_URL=https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi"
set "NODE_TEMP=%TEMP%\node_inst_quant.msi"
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%NODE_DL_URL%', '%NODE_TEMP%')"
if not exist "%NODE_TEMP%" (
    echo  [ERROR] No se pudo descargar Node.js. Por favor instalalo manualmente:
    echo  https://nodejs.org/
    set /a INSTALL_ERRORS+=1
    exit /b
)
echo  [INFO] Ejecutando instalador de Node.js...
start /wait msiexec.exe /i "%NODE_TEMP%"
del "%NODE_TEMP%" >nul 2>&1
echo  [IMPORTANT] CIERRA ESTA VENTANA Y VUELVE A EJECUTAR install.bat
pause
exit
