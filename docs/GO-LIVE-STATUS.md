# MOBIX · Estado de Infraestructura para Go-Live

Fecha: 2026-09-21

## Automatizado y verificado

- CI de producción.
- Staging UAT.
- Build Docker.
- Paquete Hostinger.
- Validación de variables críticas antes del arranque.
- Health público mínimo.
- Health privado protegido por token.
- Prueba real backup → restore en PostgreSQL temporal.
- Backup con SHA-256.
- Retención local configurable.
- Auditoría administrativa.
- Smoke tests autenticados.
- Venta POS real.
- Productos, pagos y comprobantes protegidos por pruebas.

## Pendientes externos antes de declarar GO

- [ ] Repositorio GitHub en modo privado. Estado observado: **público**.
- [ ] Rama `main` protegida. Estado observado: **sin protección**.
- [ ] Dominio final HTTPS verificado con `npm run go-live:check`.
- [ ] Secret GitHub `MOBIX_PRODUCTION_HEALTH_TOKEN` configurado si se usará el workflow de Go-Live.
- [ ] PostgreSQL productivo confirmado como privado/restringido.
- [ ] Backup diario realmente programado en el proveedor/servidor.
- [ ] Copia de backup fuera del servidor de aplicación.
- [ ] Datos reales de empresa, sucursales y almacenes revisados.
- [ ] Usuarios/roles reales revisados.
- [ ] Ticket 80 mm probado en impresora real.
- [ ] A4/PDF/WhatsApp probados en el equipo real.
- [ ] Cliente informado de que SUNAT CPE aún no forma parte del sistema.

Mientras los puntos externos críticos sigan pendientes, el estado operativo es **NO-GO para apertura comercial definitiva**, aunque el software esté validado técnicamente.
