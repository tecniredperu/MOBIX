@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

title MOBIX - Actualizar y ejecutar
cd /d "%~dp0"

set "PORT=3001"
set "APP_URL=http://localhost:%PORT%"

echo.
echo ============================================
echo       MOBIX - ACTUALIZACION AUTOMATICA
echo ============================================
echo.

where git >nul 2>&1
if errorlevel 1 goto :git_missing

where npm.cmd >nul 2>&1
if errorlevel 1 goto :npm_missing

where docker >nul 2>&1
if errorlevel 1 goto :docker_missing

if not exist ".git" goto :not_repo

for /f "delims=" %%A in ('git status --porcelain --untracked-files=no') do set "DIRTY=1"
if defined DIRTY goto :local_changes

echo [1/7] Buscando actualizaciones en GitHub...
git fetch origin main
if errorlevel 1 goto :error

echo [2/7] Descargando ultima version de MOBIX...
git pull --ff-only origin main
if errorlevel 1 goto :error

if not exist ".env" (
    if exist ".env.example" (
        echo.
        echo No existe .env. Se creara desde .env.example.
        copy /Y ".env.example" ".env" >nul
        echo Se creo .env. Verifica sus datos antes de continuar.
        start "" notepad ".env"
        echo.
        echo Guarda el archivo .env y vuelve a ejecutar ACTUALIZAR-MOBIX.bat.
        pause
        exit /b 1
    ) else (
        echo ERROR: No existe .env ni .env.example.
        goto :error
    )
)

echo [3/7] Iniciando PostgreSQL de MOBIX...
docker compose up -d
if errorlevel 1 goto :docker_error

echo [4/7] Actualizando dependencias...
call npm.cmd install
if errorlevel 1 goto :error

echo [5/7] Generando cliente Prisma...
call npm.cmd run db:generate
if errorlevel 1 goto :error

echo [6/7] Aplicando migraciones pendientes...
call npx.cmd prisma migrate deploy
if errorlevel 1 goto :migration_error

echo [7/7] Reiniciando servidor MOBIX en puerto %PORT%...
set "PID3001="
for /f %%P in ('powershell.exe -NoProfile -Command "$p=(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess); if($p){$p}"') do set "PID3001=%%P"
if defined PID3001 (
    echo Cerrando proceso anterior del puerto %PORT% ^(PID !PID3001!^)...
    taskkill /PID !PID3001! /F >nul 2>&1
    timeout /t 2 /nobreak >nul
)

start "MOBIX - Servidor" cmd /k "cd /d ""%~dp0"" && npm.cmd run dev -- -p %PORT%"

timeout /t 5 /nobreak >nul
start "" "%APP_URL%"

echo.
echo ============================================
echo MOBIX actualizado correctamente.
echo GitHub       : origin/main
echo PostgreSQL   : Docker activo
echo Prisma       : actualizado
echo Aplicacion   : %APP_URL%
echo ============================================
echo.
echo Puedes cerrar esta ventana. La ventana del servidor debe permanecer abierta.
timeout /t 5 /nobreak >nul
exit /b 0

:local_changes
echo.
echo ATENCION: Hay cambios locales sin guardar en archivos del proyecto.
echo Para proteger tu trabajo, MOBIX no se actualizara automaticamente.
echo.
echo Ejecuta "git status" para revisarlos. Si esos cambios no son necesarios,
echo puedes descartarlos antes de volver a ejecutar este archivo.
echo.
pause
exit /b 1

:git_missing
echo ERROR: Git no esta instalado o no esta disponible en PATH.
pause
exit /b 1

:npm_missing
echo ERROR: Node.js/npm no esta instalado o no esta disponible en PATH.
pause
exit /b 1

:docker_missing
echo ERROR: Docker Desktop no esta instalado o no esta disponible en PATH.
pause
exit /b 1

:not_repo
echo ERROR: Esta carpeta no esta conectada a GitHub.
echo Ejecuta este BAT dentro de la carpeta C:\MOBIX clonada desde el repositorio.
pause
exit /b 1

:docker_error
echo.
echo ERROR: No se pudo iniciar Docker/PostgreSQL.
echo Verifica que Docker Desktop este abierto y vuelve a intentarlo.
pause
exit /b 1

:migration_error
echo.
echo ERROR: Prisma no pudo aplicar las migraciones.
echo No se inicio MOBIX para evitar trabajar con una base desactualizada.
pause
exit /b 1

:error
echo.
echo ERROR: La actualizacion no pudo completarse.
echo Revisa el mensaje anterior. Tus datos de PostgreSQL no han sido eliminados.
pause
exit /b 1
