# MOBIX · Despliegue en producción

MOBIX es una aplicación Next.js + PostgreSQL. En producción debe ejecutarse con Node.js 22 y una base PostgreSQL persistente.

## Variables obligatorias

```env
DATABASE_URL="postgresql://USUARIO:CLAVE@HOST:5432/BASE?schema=public"
AUTH_SECRET="GENERA_UN_SECRETO_ALEATORIO_DE_32_CARACTERES_O_MAS"
```

`AUTH_SECRET` no debe compartirse ni guardarse en Git. Si existen usuarios heredados con `LOGIN_NOT_ENABLED_YET`, puede definirse temporalmente:

```env
MOBIX_BOOTSTRAP_PASSWORD="CLAVE_INICIAL_SEGURA"
```

Después del primer acceso de esos usuarios, MOBIX guarda un hash scrypt y la variable puede retirarse cuando ya no existan cuentas heredadas.

## Opción recomendada: Docker

```bash
docker build -t mobix:latest .
docker run -d \
  --name mobix \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e AUTH_SECRET="$AUTH_SECRET" \
  mobix:latest
```

El contenedor ejecuta `prisma migrate deploy` antes de iniciar Next.js y expone `/api/health` para health checks.

## Despliegue Node sin Docker

```bash
npm ci
npm run db:generate
npx prisma migrate deploy
npm run build
NODE_ENV=production npm run start -- -p 3000
```

Nunca uses `npm run dev` como servidor del cliente.

## Proxy HTTPS

Publica MOBIX detrás de HTTPS (Nginx, Cloudflare, proxy del hosting o balanceador). La cookie de sesión se marca `Secure` automáticamente en producción, por lo que el acceso final debe ser HTTPS.

## Base de datos

- Usa PostgreSQL 16 o una versión compatible soportada por el proveedor.
- Activa backups automáticos diarios.
- Conserva al menos 7–30 días de restauración según el volumen de ventas.
- No expongas PostgreSQL públicamente salvo que el proveedor lo requiera; limita el acceso por red/firewall.
- Antes de una actualización importante, crea un backup y luego ejecuta `prisma migrate deploy`.

## Verificación posterior al despliegue

1. `GET /api/health` debe responder HTTP 200.
2. Abrir `/productos` sin sesión debe redirigir a `/login`.
3. Iniciar sesión con un usuario real.
4. Verificar Dashboard, Productos, Equipos/IMEI, Compras, POS, Ventas, Caja, Clientes, Postventa, Reportes, Devoluciones y Transferencias.
5. Realizar una venta de prueba en un entorno de staging antes de operar con datos reales.
6. Verificar impresión de ticket, A4 y cierre de caja desde el navegador/impresora del cliente.

## Recomendaciones de repositorio

El código comercial debería mantenerse en un repositorio privado y la rama `main` debería exigir el check `validate` antes de aceptar cambios. No publiques archivos `.env`, backups de PostgreSQL ni credenciales.

## SUNAT

Los comprobantes actuales de MOBIX son registros internos. La emisión electrónica CPE/SUNAT requiere un módulo de integración específico antes de considerarlos comprobantes electrónicos enviados/aceptados por SUNAT.
