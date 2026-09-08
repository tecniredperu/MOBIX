# Arquitectura CSS de MOBIX

MOBIX usa `src/app/mobix.css` como único punto de entrada global. El archivo conserva el orden histórico de la cascada para evitar regresiones visuales.

## Capas objetivo

1. **tokens**: variables de color, espacio, tipografía, radios y sombras.
2. **base**: reset, elementos HTML y layout principal.
3. **components**: botones, campos, tablas, paneles, badges y modales reutilizables.
4. **modules**: POS, Caja, Clientes, Postventa, Reportes y demás vistas de negocio.
5. **print**: ticket, A4, servicio técnico y reportes impresos.

## Regla de migración

Los archivos históricos no se fusionan de golpe. Cada cambio debe:

- mover selectores sin cambiar especificidad efectiva;
- mantener el orden de cascada;
- pasar build de producción y smoke tests;
- comprobar al menos desktop y viewport reducido;
- evitar duplicar tokens ya definidos.

Cuando un archivo histórico quede vacío, recién entonces se elimina del `@import` de `mobix.css`.
