# MOBIX · Runbook de Producción y Go-Live

Este documento define el procedimiento operativo para desplegar MOBIX en producción, verificarlo y volver atrás si aparece un problema.

## 1. Antes del despliegue

1. Confirmar que el commit a desplegar tiene:
   - MOBIX CI en SUCCESS.
   - MOBIX Staging UAT en SUCCESS.
   - Hostinger Package en SUCCESS si se usa despliegue Node/Hostinger.
2. Crear un backup verificable:
   ```bash
   MOBIX_BACKUP_DIR=/ruta/segura/backups \
   MOBIX_BACKUP_RETENTION_DAYS=30 \
   npm run db:backup
   ```
3. Guardar el `.dump` y su `.json` fuera del directorio público del sitio.
4. Confirmar que las variables de producción existen:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `HEALTH_DETAILS_TOKEN`
   - `TRUST_PROXY_HEADERS`
5. Retirar `MOBIX_BOOTSTRAP_PASSWORD` cuando ya no sea necesaria.
6. Confirmar que PostgreSQL no está expuesto públicamente o está restringido por firewall/red privada.
7. Confirmar dominio y certificado TLS válidos.

## 2. Despliegue Docker recomendado

Usa `docker-compose.production.yml`. La base no publica ningún puerto al host.

```bash
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
```

Variables mínimas de ejemplo:

```env
POSTGRES_USER=mobix
POSTGRES_PASSWORD=CLAVE_POSTGRES_SEGURA
POSTGRES_DB=mobix
DATABASE_URL=postgresql://mobix:CLAVE_URL_ENCODED@postgres:5432/mobix?schema=public
AUTH_SECRET=SECRETO_ALEATORIO_32_O_MAS
HEALTH_DETAILS_TOKEN=TOKEN_ALEATORIO_24_O_MAS
TRUST_PROXY_HEADERS=true
MOBIX_PORT=3000
```

Si la contraseña contiene caracteres especiales, `DATABASE_URL` debe usar codificación URL.

## 3. Proxy HTTPS

Existe un ejemplo en:

`deploy/nginx/mobix.conf.example`

El proxy debe:

- redirigir HTTP → HTTPS;
- enviar `Host`;
- fijar `X-Forwarded-Proto=https`;
- sobrescribir `X-Forwarded-For` y `X-Real-IP` con la IP observada por el proxy;
- no aceptar ciegamente cabeceras IP enviadas por el cliente.

Solo después de cumplir esto usa:

```env
TRUST_PROXY_HEADERS=true
```

## 4. Validación automática del dominio

Configura en GitHub Actions el secret:

`MOBIX_PRODUCTION_HEALTH_TOKEN`

con el mismo valor de `HEALTH_DETAILS_TOKEN` de producción.

Luego ejecuta manualmente el workflow:

`MOBIX Production Go-Live Check`

Indicando:

- `base_url`: URL HTTPS final;
- `expected_commit`: SHA desplegado.

También puede ejecutarse desde el servidor:

```bash
MOBIX_BASE_URL="https://mobix.tudominio.com" \
MOBIX_EXPECTED_COMMIT="SHA_DEL_DEPLOY" \
HEALTH_DETAILS_TOKEN="TOKEN_PRIVADO" \
npm run go-live:check
```

El chequeo valida:

- HTTPS;
- health público sin fuga de datos internos;
- health privado con base, esquema y seguridad OK;
- commit desplegado;
- latencia básica del health;
- cabeceras de seguridad;
- ruta protegida redirigiendo a login.

El informe queda en `artifacts/go-live/`.

## 5. Prueba funcional de salida

Con una empresa de prueba o datos claramente identificables:

1. Iniciar sesión.
2. Abrir caja.
3. Buscar accesorio por nombre/SKU.
4. Buscar equipo por IMEI.
5. Venta en efectivo.
6. Venta Yape/Plin/tarjeta con referencia.
7. Venta mixta.
8. Venta a crédito y abono.
9. Imprimir ticket 80 mm.
10. Imprimir A4.
11. Descargar PDF.
12. Probar compartir por WhatsApp en el dispositivo real.
13. Devolución parcial.
14. Cambio/vale.
15. Transferencia.
16. Postventa/garantía.
17. Cierre de caja.
18. Verificar reportes.
19. Revisar Administración → Auditoría.

## 6. Backups automáticos

Programar diariamente en el servidor o proveedor.

Ejemplo cron a las 02:15:

```cron
15 2 * * * cd /ruta/mobix && MOBIX_BACKUP_DIR=/ruta/segura/backups MOBIX_BACKUP_RETENTION_DAYS=30 /usr/bin/npm run db:backup >> /var/log/mobix-backup.log 2>&1
```

Recomendación:

- backup diario;
- retención mínima 30 días si el espacio lo permite;
- copia fuera del servidor de aplicación;
- prueba de restauración al menos mensual;
- backup adicional inmediatamente antes de cada despliegue.

## 7. Verificación de restauración

Nunca pruebes la restauración sobre la base productiva.

```bash
MOBIX_RESTORE_CONFIRM=RESTORE \
DATABASE_URL="postgresql://usuario:clave@host:5432/mobix_restore_test" \
npm run db:restore -- /ruta/backups/mobix-fecha.dump
```

Después verifica:

- migraciones;
- usuarios;
- catálogo;
- stock;
- ventas;
- caja;
- auditoría.

## 8. Rollback

Si aparece un problema crítico:

1. detener nuevas operaciones;
2. conservar logs y hora exacta del incidente;
3. si el problema es solo de aplicación, volver al último commit estable sin restaurar base;
4. si una migración o proceso dañó datos, detener MOBIX;
5. crear una copia del estado actual para análisis;
6. restaurar el backup previo en una base separada;
7. validar la restauración;
8. apuntar MOBIX a la base restaurada solo después de la validación;
9. ejecutar `npm run go-live:check`;
10. reabrir operación.

No restaures una base solo para corregir un error visual o de frontend.

## 9. Criterios NO-GO

No abrir operación real si ocurre cualquiera de estos casos:

- CI o UAT fallan;
- no existe backup previo verificable;
- restauración nunca fue probada;
- HTTPS no es válido;
- `AUTH_SECRET` o contraseña de PostgreSQL están expuestos;
- PostgreSQL está abierto a Internet sin restricción;
- health privado reporta base/esquema degradado;
- commit desplegado no coincide con el aprobado;
- usuarios/roles reales no fueron revisados;
- ticket/impresora real no fueron probados;
- se pretende usar los comprobantes internos como CPE SUNAT.

## 10. Repositorio

Para uso comercial:

- repositorio privado;
- `main` protegida;
- PR obligatorio;
- checks CI/UAT obligatorios antes del merge;
- evitar force-push;
- no almacenar `.env`, dumps ni credenciales.

Estos dos ajustes son de cuenta GitHub y deben realizarse explícitamente en la configuración del repositorio.
