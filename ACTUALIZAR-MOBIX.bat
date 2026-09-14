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

echo [1/9] Cerrando servidor anterior de MOBIX...
set "PID3001="
for /f %%P in ('powershell.exe -NoProfile -Command "$p=(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess); if($p){$p}"') do set "PID3001=%%P"
if defined PID3001 (
    echo Cerrando proceso del puerto %PORT% ^(PID !PID3001!^)...
    taskkill /PID !PID3001! /F >nul 2>&1
    timeout /t 2 /nobreak >nul
) else (
    echo No habia servidor activo en el puerto %PORT%.
)

echo.
echo [2/9] Consultando ultima version en GitHub...
git fetch origin main --prune
if errorlevel 1 goto :error

for /f %%A in ('git rev-parse --short HEAD') do set "LOCAL_BEFORE=%%A"
for /f %%A in ('git rev-parse --short origin/main') do set "REMOTE_HEAD=%%A"
echo Version local antes : !LOCAL_BEFORE!
echo Version GitHub      : !REMOTE_HEAD!

echo.
echo [3/9] Sincronizando exactamente con origin/main...
git checkout main >nul 2>&1
if errorlevel 1 goto :error
git reset --hard origin/main
if errorlevel 1 goto :error

for /f %%A in ('git rev-parse --short HEAD') do set "LOCAL_AFTER=%%A"
echo Version local ahora : !LOCAL_AFTER!

if /I "!LOCAL_AFTER!"=="!REMOTE_HEAD!" (
    echo OK: MOBIX quedo sincronizado con GitHub.
) else (
    echo ERROR: La copia local no coincide con GitHub.
    goto :error
)

echo.
echo [4/9] Limpiando cache de Next.js...
if exist ".next" (
    rmdir /S /Q ".next" >nul 2>&1
    if exist ".next" (
        echo ERROR: No se pudo eliminar la carpeta .next.
        echo Cierra cualquier ventana de MOBIX y vuelve a ejecutar este archivo.
        goto :error
    )
)
echo Cache .next limpia.

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

echo.
echo [5/9] Iniciando PostgreSQL de MOBIX...
docker compose up -d
if errorlevel 1 goto :docker_error

echo.
echo [6/9] Actualizando dependencias...
call npm.cmd install
if errorlevel 1 goto :error

echo.
echo [7/9] Generando cliente Prisma...
call npm.cmd run db:generate
if errorlevel 1 goto :error

echo.
echo [8/9] Aplicando migraciones pendientes...
call npx.cmd prisma migrate deploy
if errorlevel 1 goto :migration_error

echo.
echo [9/9] Iniciando MOBIX en puerto %PORT%...
start "MOBIX - Servidor" cmd /k "cd /d ""%~dp0"" && echo MOBIX commit !LOCAL_AFTER! && npm.cmd run dev -- -p %PORT%"

timeout /t 6 /nobreak >nul
start "" "%APP_URL%"

echo.
echo ============================================
echo MOBIX actualizado correctamente.
echo Commit GitHub : !LOCAL_AFTER!
echo PostgreSQL    : Docker activo
echo Prisma        : actualizado
echo Cache Next.js : limpia
echo Aplicacion    : %APP_URL%
echo ============================================
echo.
echo Puedes cerrar esta ventana.
echo La ventana "MOBIX - Servidor" debe permanecer abierta.
timeout /t 8 /nobreak >nul
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
echo Ejecuta este BAT dentro de la carpeta clonada de MOBIX.
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
