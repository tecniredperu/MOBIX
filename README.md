# MOBIX Core v0.4

MOBIX es un sistema integral diseñado específicamente para tiendas de celulares, accesorios, equipos serializados y servicios en Perú.

## Módulos operativos

- Productos y variantes.
- Equipos / IMEI.
- Compras.
- Kardex.
- Inventario por unidades serializadas y saldos por almacén.
- Punto de Venta (POS).
- Ventas y detalle de venta.
- Pago simple o mixto.
- Ticket 80 mm e impresión A4.
- Compartir resumen de venta por WhatsApp.

## Lógica para Perú

- Moneda PEN (S/).
- IGV 18% para operaciones gravadas.
- Operaciones gravadas, exoneradas e inafectas.
- Factura (01), Boleta de venta (03) y Nota de venta.
- Clientes y proveedores con RUC, DNI, CE u otro documento.
- Yape, Plin, efectivo, tarjeta, transferencia y otros medios de pago.
- Los precios del POS se consideran precios finales; cuando la venta es gravada, MOBIX desglosa el IGV incluido en el total.

> Importante: los comprobantes actuales son correlativos internos de MOBIX. La emisión electrónica y envío a SUNAT todavía no están habilitados.

## Reglas de inventario

1. Celulares y equipos serializados: cada unidad física se registra individualmente con IMEI/serie y estado.
2. Accesorios: el stock se administra por saldo de almacén y costo promedio.
3. Los IMEI/series son únicos por empresa.
4. Cada compra confirmada actualiza inventario, Kardex y auditoría en una sola transacción.
5. Cada venta confirmada valida stock, marca el IMEI como vendido, descuenta accesorios, registra pagos, genera Kardex y crea auditoría en una sola transacción.

## Actualización en Windows

Ejecuta `ACTUALIZAR-MOBIX.bat`. El script descarga la última versión desde GitHub, levanta PostgreSQL, instala dependencias, genera Prisma, aplica migraciones y abre MOBIX en el puerto 3001.

## Rutas principales

- `/productos`
- `/productos/nuevo`
- `/equipos`
- `/compras`
- `/compras/nueva`
- `/kardex`
- `/pos`
- `/ventas`
- `/ventas/[id]`
- `/ventas/[id]/ticket`

## Entorno local

- Aplicación: `http://localhost:3001`
- PostgreSQL MOBIX: puerto `5433`
- Base de datos: `mobix`

El archivo `.env` es local y no debe subirse al repositorio.
