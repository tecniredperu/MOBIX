# MOBIX · Checklist de salida a producción para cliente

Fecha de referencia: 2026-09-21

Este documento define el mínimo operativo antes de entregar MOBIX a un cliente real.

## 1. Seguridad previa

- [ ] El repositorio de código comercial está en modo privado.
- [ ] `AUTH_SECRET` es aleatorio, tiene al menos 32 caracteres y no ha sido expuesto.
- [ ] La contraseña de PostgreSQL fue rotada si apareció en capturas, tickets o chats.
- [ ] `DATABASE_URL` fue actualizada después de cualquier rotación de contraseña.
- [ ] `MOBIX_BOOTSTRAP_PASSWORD` fue retirada después de crear/configurar los usuarios iniciales.
- [ ] HTTPS funciona correctamente en el dominio final.
- [ ] Los usuarios reales tienen contraseñas únicas y roles con mínimo privilegio.

## 2. Base de datos y respaldo

- [ ] Existe un backup completo inmediatamente anterior al despliegue.
- [ ] Los backups automáticos diarios están habilitados.
- [ ] Se conoce y se ha probado al menos una vez el procedimiento de restauración.
- [ ] `prisma migrate deploy` termina sin errores.
- [ ] `/api/health` público responde HTTP 200 con `status=ok` sin exponer detalles internos.
- [ ] `/api/health` con `X-Mobix-Health-Token` responde `database=ok`, `schema=ok` y `migration=ok`.
- [ ] El campo `commit` del health protegido coincide con el paquete desplegado.
- [ ] `npm run go-live:check` termina con GO técnico sobre el dominio final.

## 3. Validación automatizada

- [ ] MOBIX CI está en SUCCESS sobre el commit que se desplegará.
- [ ] MOBIX Staging UAT está en SUCCESS sobre el mismo commit.
- [ ] TypeScript está limpio.
- [ ] Build Next.js de producción está limpio.
- [ ] Smoke tests autenticados están en SUCCESS.
- [ ] Docker de producción compila aunque Hostinger use despliegue Node.js.

## 4. Configuración empresarial

- [ ] Razón social, nombre comercial, RUC, dirección, teléfono y logo son correctos.
- [ ] Sucursales y almacenes están creados y activos.
- [ ] Series internas de boleta, factura y nota de venta están configuradas.
- [ ] Garantía predeterminada fue revisada.
- [ ] La exigencia de caja abierta antes de vender está configurada según la operación real.
- [ ] Se crearon roles separados: Administrador, Vendedor y los perfiles adicionales necesarios.

## 5. Prueba funcional punta a punta

Realizar con datos de prueba identificables y luego anular/revertir cuando corresponda.

- [ ] Crear proveedor.
- [ ] Registrar compra.
- [ ] Confirmar stock de accesorios.
- [ ] Confirmar ingreso de equipo con IMEI/serie.
- [ ] Abrir caja.
- [ ] Crear cliente.
- [ ] Venta en efectivo.
- [ ] Venta Yape/Plin con referencia.
- [ ] Venta de equipo por IMEI.
- [ ] Venta a crédito.
- [ ] Cobranza parcial.
- [ ] Devolución parcial.
- [ ] Cambio con vale.
- [ ] Transferencia entre almacenes.
- [ ] Ingreso y cierre de postventa/garantía.
- [ ] Cierre de caja sin diferencia.
- [ ] Reportes reflejan correctamente ventas, devoluciones y caja.
- [ ] Ticket 80 mm, A4, PDF y WhatsApp se verificaron desde el equipo que usará el cliente.

## 6. Rendimiento

- [ ] El POS responde sin pausas perceptibles al buscar por nombre/SKU.
- [ ] La búsqueda exacta por IMEI/serie responde correctamente.
- [ ] Revisar varias lecturas consecutivas de `databaseLatencyMs` usando el health protegido.
- [ ] Si la latencia permanece alta en varias mediciones en caliente, revisar región del servidor de aplicación, región de PostgreSQL y conectividad antes de cargar operación real.
- [ ] Probar con el volumen estimado de catálogo y clientes del negocio.

## 7. Recuperación operativa

- [ ] El administrador puede restablecer la contraseña de un usuario.
- [ ] Cambiar/restablecer contraseña invalida las demás sesiones.
- [ ] Suspender o cambiar acceso de un usuario invalida sus sesiones.
- [ ] El sistema impide dejar la empresa sin al menos un administrador activo.
- [ ] El procedimiento de rollback del despliegue está documentado en `docs/PRODUCTION-RUNBOOK.md`.
- [ ] Existe acceso a logs de ejecución de Hostinger.

## 8. Alcance legal

MOBIX registra Boleta, Factura y Nota de venta como documentos internos del sistema.

- [ ] El cliente sabe que la integración CPE/SUNAT no está incluida actualmente.
- [ ] No se presenta un documento interno de MOBIX como CPE enviado/aceptado por SUNAT.
- [ ] Si el cliente requiere emisión electrónica legal, se implementará un módulo SUNAT/proveedor OSE/PSE específico antes de usar esa función comercialmente.

## 9. Criterio GO / NO-GO

**GO** solo cuando:
- CI y UAT están verdes;
- `npm run go-live:check` reporta GO técnico;
- health protegido indica base y esquema OK;
- existe backup verificable;
- secretos expuestos fueron rotados;
- la prueba punta a punta fue completada;
- usuarios/roles reales están configurados;
- el cliente conoce el alcance de SUNAT.

Cualquier punto crítico pendiente implica **NO-GO** hasta resolverlo.
