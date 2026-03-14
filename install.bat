@echo off
setlocal enabledelayedexpansion
title Quant MT5 Dashboard - Instalador
color 0B

echo =======================================================
echo          INSTALADOR DEL PANEL CUANTITATIVO MT5
echo =======================================================
echo.

:: 1. VERIFICAR PERMISOS DE ADMINISTRADOR
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ADVERTENCIA] Este script no se esta ejecutando como Administrador.
    echo Si necesitas instalar Python o Node.js automaticamente, por favor 
    echo cierra esta ventana, haz clic derecho en install.bat y selecciona:
    echo "Ejecutar como administrador".
    echo.
    echo Presiona cualquier tecla para continuar de todos modos...
    pause >nul
)

:: 2. VERIFICAR E INSTALAR PYTHON (Omitir si ya existe)
echo [1/4] Comprobando entorno de Python...
python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Python no esta instalado o no esta en el PATH.
    echo Descargando e instalando Python 3.13 silenciosamente...
    
    :: Descargar instalador de Python
    powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.13.12/python-3.13.12-amd64.exe' -OutFile 'python_installer.exe'"
    
    if exist python_installer.exe (
        echo Instalando Python... esto puede tomar varios minutos.
        start /wait python_installer.exe /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
        del python_installer.exe
        echo [INFO] Python instalado correctamente. Por favor CIERRA ESTA CONSOLA y vuelve a abrir install.bat para que reconozca los nuevos comandos.
        pause
        exit /b
    ) else (
        echo.
        echo [ERROR] No se pudo descargar Python automaticamente. 
        echo Esto suele ocurrir si tu red bloquea descargas silenciosas o si no tienes permisos.
        echo.
        echo [ASISTENCIA MANUAL - PASOS A SEGUIR]
        echo 1. Abre tu navegador y ve a: https://www.python.org/downloads/release/python-31312/
        echo 2. Descarga el instalador de Windows ^(64-bit^).
        echo 3. IMPORTANTE: Al instalarlo, asegurate de marcar la casilla "Add python.exe to PATH" en la primera pantalla.
        echo 4. Una vez instalado, cierra esta ventana y vuelve a ejecutar install.bat.
        echo.
        pause
        exit /b
    )
) else (
    echo [OK] Python detectado correctamente:
    python --version
)
echo.

:: 3. VERIFICAR E INSTALAR NODE.JS (Omitir si ya existe)
echo [2/4] Comprobando entorno de Node.js (npm)...
npm --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Node.js ^(npm^) no esta instalado.
    echo Descargando e instalando Node.js silenciosamente...
    
    :: Descargar instalador de Node
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile 'node_installer.msi'"
    
    if exist node_installer.msi (
        echo Instalando Node.js... esto puede tomar varios minutos.
        msiexec.exe /i node_installer.msi /quiet /qn /norestart
        del node_installer.msi
        echo [INFO] Node.js instalado correctamente. Por favor CIERRA ESTA CONSOLA y vuelve a abrir install.bat para que reconozca los nuevos comandos.
        pause
        exit /b
    ) else (
        echo.
        echo [ERROR] No se pudo descargar Node.js automaticamente.
        echo Esto suele ocurrir si tu red bloquea descargas silenciosas o si no tienes permisos.
        echo.
        echo [ASISTENCIA MANUAL - PASOS A SEGUIR]
        echo 1. Abre tu navegador y ve a: https://nodejs.org/
        echo 2. Descarga e instala la version "LTS" ^(Recomendada para la mayoria^).
        echo 3. La instalacion es todo "Siguiente", no necesitas cambiar configuraciones especiales.
        echo 4. Una vez instalado, cierra esta ventana y vuelve a ejecutar install.bat.
        echo.
        pause
        exit /b
    )
) else (
    echo [OK] Node.js detectado correctamente. npm version: 
    npm --version
)
echo.

:: 4. SETUP DEL BACKEND (Python venv + requirements)
echo [3/4] Configurando Backend (Django)...
cd backend

if not exist venv\Scripts\python.exe (
    echo Creando entorno virtual (venv)...
    python -m venv venv
) else (
    echo [OK] Entorno virtual detectado.
)

echo Instalando/Actualizando dependencias del backend...
call venv\Scripts\python.exe -m pip install --upgrade pip
call venv\Scripts\python.exe -m pip install -r requirements.txt

cd ..
echo.

:: 5. SETUP DEL FRONTEND (Node_modules)
echo [4/4] Configurando Frontend (React)...
cd frontend

if not exist node_modules (
    echo Instalando modulos de Node (dependencias del frontend)...
    call npm install
) else (
    echo [OK] Carpeta node_modules detectada. Actualizando si es necesario...
    call npm install
)

cd ..
echo.

:: 6. CREAR ARCHIVOS .ENV SI NO EXISTEN
echo [Configuracion] Verificando archivos de entorno (.env)...

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
    echo [OK] backend\.env ya existe, no se sobreescribio.
)

if not exist "frontend\.env.local" (
    echo [INFO] Creando frontend\.env.local...
    (echo VITE_API_SECRET_KEY=quant-admin-supersecret-token-777) > frontend\.env.local
    echo [OK] frontend\.env.local creado.
) else (
    echo [OK] frontend\.env.local ya existe, no se sobreescribio.
)

echo.

:: 7. FINALIZACION
echo =======================================================
echo          INSTALACION COMPLETADA CON EXITO
echo =======================================================
echo.
echo Todo el entorno ha sido preparado. Ya puedes ejecutar:
echo.
echo    --^> start.bat ^<--
echo.
echo para encender el servidor y el panel.
echo.
echo NOTA: Los archivos backend\.env y frontend\.env.local
echo contienen la configuracion de seguridad. Puedes editar
echo backend\.env para cambiar la API_SECRET_KEY o configurar
echo el login automatico de MT5 (MT5_ACCOUNT / MT5_PASSWORD).
echo =======================================================
pause
