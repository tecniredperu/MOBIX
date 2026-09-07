# Auditoría técnica de MOBIX

Fecha de referencia: 2026-09-07

## Resultado global

**84 / 100 — Nivel: sólido para staging y piloto controlado.**

MOBIX tiene una base funcional y transaccional superior a la de un prototipo: maneja inventario serializado por IMEI, ventas, caja, crédito, devoluciones, transferencias, postventa, permisos, multiempresa y reportes. La integración continua valida una base PostgreSQL vacía, migraciones, TypeScript, build de producción, rutas autenticadas y Docker.

El puntaje no es 100 porque todavía existe deuda técnica relevante antes de considerarlo un producto SaaS maduro a gran escala: faltan pruebas unitarias/de dominio, algunas tablas operativas siguen fuera del esquema Prisma, el POS y ciertos formularios son componentes grandes y el CSS global está fragmentado en varias capas históricas.

## Puntaje por área

| Área | Puntaje | Evaluación |
|---|---:|---|
| Cobertura funcional y reglas de negocio | 9.0/10 | Muy completa para tienda de celulares. |
| Integridad de datos y transacciones | 9.1/10 | Buen uso de transacciones, locks, constraints y estados. |
| Seguridad, permisos y multiempresa | 8.6/10 | Sesión firmada, permisos server-side, rate limit y aislamiento por empresa. |
| Diseño de base de datos | 8.0/10 | Buen modelo principal; faltan modelos Prisma para algunas tablas creadas por migraciones SQL. |
| Calidad y mantenibilidad del código | 7.6/10 | Arquitectura modular correcta, pero quedan archivos grandes y SQL manual. |
| UI/UX y consistencia visual | 8.3/10 | Interfaz operativa y coherente; CSS histórico requiere consolidación gradual. |
| Rendimiento y escalabilidad | 7.5/10 | Adecuado para una tienda/piloto; POS y reportes necesitarán paginación/consultas incrementales al escalar. |
| QA y automatización | 8.0/10 | CI de producción fuerte; faltan pruebas unitarias e integración de reglas de negocio. |
| Despliegue y operación | 9.0/10 | Build de producción, health check, Docker no-root y migraciones automáticas. |
| Documentación | 8.4/10 | README y despliegue actualizados; falta documentación de dominio más formal. |

## Fortalezas verificadas

- TypeScript en modo `strict`.
- Next.js y React con build real de producción.
- PostgreSQL con Prisma y migraciones reproducibles desde una base vacía.
- Aislamiento multiempresa mediante `companyId`.
- Roles y permisos validados en servidor.
- Sesión firmada mediante cookie HttpOnly y Secure en producción.
- Protección de login frente a intentos repetidos.
- Cabeceras HTTP de seguridad.
- IMEI/serie únicos por empresa.
- Estados de unidad física para impedir doble venta.
- Inventario de accesorios con costo promedio.
- Kardex transaccional.
- Bloqueos de concurrencia en ventas, caja, crédito, devoluciones y transferencias.
- Restricciones y triggers PostgreSQL para reglas críticas.
- Auditoría de operaciones.
- Docker ejecutado sin usuario root.
- CI con smoke tests autenticados de los módulos principales.

## Riesgos corregidos durante la auditoría

### Ventas y cierre de caja

La venta ahora toma un lock del turno de caja cuando la empresa exige caja abierta. Esto evita que una venta entre mientras el mismo turno está siendo cerrado.

### Crédito concurrente

La venta a crédito bloquea la fila del cliente antes de calcular deuda y crédito disponible. Evita que dos ventas simultáneas superen la línea de crédito.

### Devoluciones concurrentes

La devolución bloquea la venta y vuelve a calcular dentro de la transacción las cantidades ya devueltas. Evita devolver más unidades que las originalmente vendidas.

### Devolución en efectivo y cierre de caja

La caja abierta utilizada por una devolución en efectivo se bloquea durante la operación, evitando movimientos posteriores al arqueo.

### Transferencias

Recepción y cancelación bloquean la cabecera de transferencia. Se validan cambios de estado y se protegen los saldos de accesorios durante el recálculo de costo promedio.

### Código duplicado

Se centralizaron utilidades monetarias y de revalidación de rutas, y se reescribieron acciones densas de configuración, ventas, devoluciones y transferencias con tipos y bloques legibles.

## Deuda técnica priorizada

### Prioridad alta

1. **Modelar en Prisma todas las tablas operativas creadas actualmente por SQL manual**: configuración empresarial, devoluciones, transferencias y postventa. Esto devolverá type-safety y reducirá `$queryRaw/$executeRaw`.
2. **Crear pruebas de dominio** para impuestos, distribución de descuentos, crédito, caja, devoluciones, estados de IMEI y transferencias.
3. **Convertir el repositorio a privado** antes de operar comercialmente o guardar información sensible relacionada con despliegues.
4. **Staging/UAT** con una base separada antes de cargar datos de clientes reales.

### Prioridad media

1. Dividir `pos-form-v3.tsx` en componentes de catálogo, carrito, cliente, pagos y confirmación. El nombre `v3` también debe desaparecer cuando el refactor esté cubierto por pruebas.
2. Separar consultas del POS para no cargar todo el catálogo y todos los IMEI disponibles en una sola respuesta cuando crezca el volumen.
3. Añadir paginación real a reportes de periodos extensos.
4. Consolidar gradualmente los múltiples `mobix-*.css` en una estructura por tokens/base/componentes/módulos. No debe hacerse como cambio masivo porque el orden actual participa en la cascada.
5. Añadir logging estructurado, monitoreo de errores y métricas en producción.
6. Incorporar revocación/versionado de sesiones para invalidar todas las sesiones al cambiar contraseña si el modelo comercial lo requiere.

## Seguridad de infraestructura pendiente del hosting

- HTTPS obligatorio.
- `AUTH_SECRET` aleatorio de al menos 32 caracteres.
- PostgreSQL no expuesto públicamente salvo necesidad estricta.
- Backups automáticos diarios y prueba periódica de restauración.
- Proxy confiable que sobrescriba correctamente `X-Forwarded-For` / `X-Real-IP`.
- HSTS preferiblemente configurado en proxy/CDN una vez confirmado que el dominio funciona exclusivamente por HTTPS.
- Revisar CSP en staging antes de activarlo para no romper scripts/estilos de Next.js.

## Facturación electrónica

Factura, boleta y nota de venta actualmente son registros internos de MOBIX. **SUNAT/CPE no está implementado todavía.** Para considerarlo facturación electrónica legal falta firma/envío CPE, CDR, estados, QR/hash y manejo de rechazos/contingencias.

## Criterio de salida a producción

Antes de entregar MOBIX a un cliente real se recomienda completar:

1. CI verde sobre el commit a desplegar.
2. Staging idéntico al hosting final.
3. Prueba de punta a punta: compra → stock → venta → caja → crédito → cobranza → devolución/cambio → transferencia → servicio técnico → reportes.
4. Backup y restauración probados.
5. Usuarios/roles reales configurados.
6. Repositorio privado.
7. Confirmación explícita de que el cliente conoce la limitación actual de SUNAT.

No existe software que pueda certificarse como “100% sin errores” solo mediante revisión estática. El objetivo de MOBIX debe ser mantener invariantes de datos, pruebas automatizadas, observabilidad y un proceso seguro de despliegue para detectar y corregir fallos antes de que afecten la operación.
