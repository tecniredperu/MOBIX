# MOBIX

MOBIX es un sistema integral para tiendas de celulares, accesorios, equipos serializados y servicios en Perú. Está construido con Next.js, React, TypeScript, Prisma y PostgreSQL, con arquitectura multiempresa y control de inventario por IMEI/serie.

## Módulos operativos

- Dashboard operativo.
- Productos, variantes, marcas y categorías.
- Equipos / IMEI / serie.
- Compras y proveedores.
- Inventario y Kardex.
- Transferencias entre almacenes.
- Punto de venta (POS).
- Ventas y detalle de venta.
- Pagos simples o mixtos.
- Efectivo, Yape, Plin, tarjeta, transferencia, crédito y otros.
- Caja: apertura, movimientos, arqueo y cierre.
- Clientes, línea de crédito y cuentas por cobrar.
- Devoluciones y cambios.
- Garantías y servicio técnico.
- Reportes gerenciales y rentabilidad.
- Usuarios, roles y permisos.
- Configuración empresarial, sucursales y almacenes.
- Ticket 80 mm, formatos A4 y envío de resúmenes por WhatsApp.

## Lógica para Perú

- Moneda predeterminada PEN (S/).
- IGV general 18% para operaciones gravadas.
- Operaciones gravadas, exoneradas e inafectas.
- Factura (01), Boleta de venta (03) y Nota de venta interna.
- Clientes y proveedores con RUC, DNI, CE u otro documento.
- Los precios del POS se consideran precios finales; en ventas gravadas MOBIX desglosa el IGV incluido.

> Importante: los comprobantes actuales son correlativos internos de MOBIX. La emisión electrónica CPE y el envío a SUNAT todavía requieren un módulo de integración específico.

## Reglas de inventario

1. Celulares y equipos serializados se registran por unidad física con IMEI/serie y estado.
2. Accesorios administran stock por saldo de almacén y costo promedio ponderado.
3. Los IMEI/series son únicos por empresa.
4. Compras, ventas, devoluciones y transferencias actualizan inventario, Kardex y auditoría dentro de transacciones.
5. Un equipo vendido no puede volver a venderse mientras su estado no sea `AVAILABLE`.
6. Las transferencias usan `IN_TRANSFER` para impedir ventas durante el traslado.
7. Garantías y servicio técnico conservan la trazabilidad de la unidad vendida.

## Seguridad y multiempresa

- Sesión firmada mediante cookie HttpOnly.
- Cookie `Secure` en producción.
- Roles y permisos validados en servidor.
- Aislamiento por `companyId` en las operaciones de negocio.
- Protección contra intentos repetidos de inicio de sesión.
- Auditoría de operaciones críticas.
- Cabeceras HTTP de seguridad.

## Calidad y validación

La integración continua valida cada cambio en `main` con:

- instalación limpia de dependencias;
- auditoría controlada de dependencias de producción;
- generación y validación de Prisma;
- aplicación de todas las migraciones sobre PostgreSQL vacío;
- seed de prueba;
- TypeScript estricto;
- build optimizado de Next.js;
- arranque en modo producción;
- health check;
- protección de rutas sin sesión;
- smoke test de rutas críticas autenticadas;
- construcción de la imagen Docker de producción.

Comando local de verificación:

```bash
npm run verify
```

## Actualización en Windows

Ejecuta `ACTUALIZAR-MOBIX.bat`. El script descarga la última versión, levanta PostgreSQL, instala dependencias, genera Prisma, aplica migraciones y abre MOBIX en el puerto 3001.

## Rutas principales

- `/productos`
- `/equipos`
- `/compras`
- `/kardex`
- `/transferencias`
- `/pos`
- `/ventas`
- `/caja`
- `/clientes`
- `/devoluciones`
- `/servicio-tecnico`
- `/reportes`
- `/administracion/usuarios`
- `/administracion/roles`
- `/configuracion`

## Entorno local

- Aplicación: `http://localhost:3001`
- PostgreSQL MOBIX: puerto `5433`
- Base de datos: `mobix`

El archivo `.env` es local y no debe subirse al repositorio.

## Producción

Consulta `DEPLOYMENT.md`. MOBIX debe ejecutarse con HTTPS, PostgreSQL persistente, backups automáticos y variables de entorno seguras. Para código comercial se recomienda mantener el repositorio privado.
