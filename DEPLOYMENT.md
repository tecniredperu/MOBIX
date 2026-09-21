# MOBIX · Despliegue en producción

MOBIX es una aplicación Next.js + PostgreSQL. En producción debe ejecutarse con Node.js 22 y una base PostgreSQL persistente.

## Variables obligatorias

```env
DATABASE_URL="postgresql://USUARIO:CLAVE@HOST:5432/BASE?schema=public"
AUTH_SECRET="GENERA_UN_SECRETO_ALEATORIO_DE_32_CARACTERES_O_MAS"
TRUST_PROXY_HEADERS="false"
HEALTH_DETAILS_TOKEN="TOKEN_ALEATORIO_DE_24_CARACTERES_O_MAS"
```

`TRUST_PROXY_HEADERS` solo debe ponerse en `true` cuando Nginx, Cloudflare o el proxy del hosting sobrescribe de forma confiable `X-Forwarded-For` / `X-Real-IP`. No lo habilites si MOBIX está expuesto directamente a Internet.

`AUTH_SECRET` no debe compartirse ni guardarse en Git. Si existen usuarios heredados con `LOGIN_NOT_ENABLED_YET`, puede definirse temporalmente:

```env
MOBIX_BOOTSTRAP_PASSWORD="CLAVE_INICIAL_SEGURA"
```

Después del primer acceso de esos usuarios, MOBIX guarda un hash scrypt y la variable puede retirarse cuando ya no existan cuentas heredadas.

## Opción recomendada: Docker

Para producción usa `docker-compose.production.yml`. Esta variante no publica PostgreSQL en el host y expone MOBIX únicamente en `127.0.0.1` para colocarlo detrás del proxy HTTPS.

```bash
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
```

El `docker-compose.yml` simple del repositorio queda reservado para desarrollo local.

El contenedor ejecuta primero `npm run prod:check`, después `prisma migrate deploy` y finalmente inicia Next.js. Si faltan variables críticas, MOBIX falla antes de tocar el esquema. `/api/health` devuelve una respuesta pública mínima; los detalles operativos requieren el encabezado `X-Mobix-Health-Token` cuando `HEALTH_DETAILS_TOKEN` está configurado.

## Despliegue Node sin Docker

```bash
npm ci
npm run db:generate
npm run prod:check
npx prisma migrate deploy
npm run build
NODE_ENV=production npm run start -- -p 3000
```

Nunca uses `npm run dev` como servidor del cliente.

## Proxy HTTPS

Publica MOBIX detrás de HTTPS (Nginx, Cloudflare, proxy del hosting o balanceador). La cookie de sesión se marca `Secure` automáticamente en producción, por lo que el acceso final debe ser HTTPS.

Existe una configuración Nginx de referencia en `deploy/nginx/mobix.conf.example`. El proxy debe sobrescribir `X-Forwarded-For` y `X-Real-IP` antes de usar `TRUST_PROXY_HEADERS=true`.

## Base de datos

- Usa PostgreSQL 16 o una versión compatible soportada por el proveedor.
- Activa backups automáticos diarios.
- Conserva al menos 7–30 días de restauración según el volumen de ventas.
- No expongas PostgreSQL públicamente salvo que el proveedor lo requiera; limita el acceso por red/firewall.
- Antes de una actualización importante, crea un backup y luego ejecuta `prisma migrate deploy`.
- Instala herramientas cliente de PostgreSQL de la misma versión mayor o una superior compatible (`pg_dump` y `pg_restore`).

### Backup manual verificado

```bash
MOBIX_BACKUP_DIR=backups npm run db:backup
```

El comando genera un `.dump` en formato PostgreSQL custom y un archivo `.json` con tamaño y SHA-256. El propio comando valida que `pg_restore --list` pueda leer el respaldo.

### Restauración controlada

Restaura primero en una base separada de prueba. MOBIX exige una confirmación explícita para evitar sobrescrituras accidentales:

```bash
MOBIX_RESTORE_CONFIRM=RESTORE \
DATABASE_URL="postgresql://USUARIO:CLAVE@HOST:5432/BASE_PRUEBA" \
npm run db:restore -- backups/mobix-AAAA-MM-DDTHH-MM-SS.dump
```

Después de la restauración verifica `/api/health`, usuarios, catálogo, una venta de prueba y cierre de caja antes de considerar válido el backup.

## Verificación posterior al despliegue

Ejecuta primero:

```bash
MOBIX_BASE_URL="https://mobix.tudominio.com" \
MOBIX_EXPECTED_COMMIT="SHA_DESPLEGADO" \
HEALTH_DETAILS_TOKEN="TOKEN_PRIVADO" \
npm run go-live:check
```

También existe el workflow manual `MOBIX Production Go-Live Check`, que usa el secret de GitHub `MOBIX_PRODUCTION_HEALTH_TOKEN`.

1. `GET /api/health` debe responder HTTP 200 y no debe exponer módulos, commit ni entorno sin token.
2. Abrir `/productos` sin sesión debe redirigir a `/login`.
3. Iniciar sesión con un usuario real.
4. Verificar Dashboard, Productos, Equipos/IMEI, Compras, POS, Ventas, Caja, Clientes, Postventa, Reportes, Devoluciones y Transferencias.
5. Realizar una venta de prueba en un entorno de staging antes de operar con datos reales.
6. Verificar impresión de ticket, A4 y cierre de caja desde el navegador/impresora del cliente.

## Recomendaciones de repositorio

El código comercial debería mantenerse en un repositorio privado y la rama `main` debería exigir el check `validate` antes de aceptar cambios. No publiques archivos `.env`, backups de PostgreSQL ni credenciales.

## SUNAT

Los comprobantes actuales de MOBIX son registros internos. La emisión electrónica CPE/SUNAT requiere un módulo de integración específico antes de considerarlos comprobantes electrónicos enviados/aceptados por SUNAT.


## Runbook operativo

El procedimiento completo de backup, despliegue, validación, rollback y recuperación está documentado en `docs/PRODUCTION-RUNBOOK.md`.

El estado de los pendientes externos se mantiene en `docs/GO-LIVE-STATUS.md`.
