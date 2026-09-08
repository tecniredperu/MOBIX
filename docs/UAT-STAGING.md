# MOBIX · Staging y UAT

El workflow **MOBIX Staging UAT** ejecuta diariamente un entorno efímero y aislado con PostgreSQL 16. No utiliza la base de datos de producción ni datos reales de clientes.

## Cobertura automática

Cada ejecución realiza:

1. instalación y auditoría de dependencias;
2. generación y validación de Prisma;
3. aplicación de todas las migraciones sobre una base vacía;
4. carga de datos base;
5. pruebas unitarias de reglas de negocio;
6. pruebas de integración y concurrencia;
7. escenario UAT transaccional integral;
8. TypeScript y build de producción;
9. arranque real de Next.js en modo producción;
10. health check de aplicación y PostgreSQL;
11. autenticación y smoke test de rutas críticas;
12. build de imagen Docker;
13. publicación del informe `uat-report.md` y `uat-report.json` como artefactos.

## Escenario UAT integral

El script `scripts/uat-staging.ts` crea una empresa aislada y recorre:

- compra e ingreso de accesorios y equipo con IMEI/serie;
- apertura de Caja;
- venta en efectivo;
- venta de equipo individual por IMEI;
- venta a crédito y creación de cuenta por cobrar;
- cobranza parcial asociada a Caja;
- devolución parcial con reingreso de stock y egreso de Caja;
- transferencia entre almacenes;
- garantía/postventa hasta entrega;
- arqueo y cierre de Caja sin diferencia.

## Concurrencia e integridad

La batería `tests/integration/concurrency.test.ts` comprueba especialmente:

- dos créditos simultáneos no pueden exceder la línea del cliente;
- dos devoluciones simultáneas no pueden superar la cantidad vendida;
- un equipo no puede tener dos atenciones activas de postventa;
- el inventario no puede ser negativo;
- una Caja cerrada no acepta movimientos posteriores;
- postventa respeta su máquina de estados.

## Criterio de aprobación

Una jornada UAT se considera aprobada solamente si todos los pasos anteriores concluyen correctamente. Un build exitoso sin escenario de negocio, o un escenario de negocio sin build/smoke web, no se considera una aprobación completa.

## Límite del staging automatizado

Este staging valida aplicación, base de datos, reglas de dominio, concurrencia básica y navegación web en un entorno reproducible. Antes de liberar una versión a clientes reales debe complementarse con una aceptación humana sobre un despliegue de preproducción: impresión física de ticket/A4, lector/impresora si aplica, WhatsApp, experiencia de usuario y datos representativos del negocio.
