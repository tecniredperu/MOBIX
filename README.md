# MOBIX Core v0.2 — Productos operativo

MOBIX es un sistema integral diseñado específicamente para tiendas de celulares, accesorios, equipos serializados y servicios.

## Avance incluido en esta versión

### Base técnica
- Next.js + TypeScript.
- PostgreSQL 16 mediante Docker Compose.
- Prisma ORM 7.10 con `@prisma/adapter-pg` y `pg`.
- Arquitectura multiempresa desde la base de datos.
- Auditoría para operaciones críticas.

### Catálogo y Productos
- Listado de productos conectado a PostgreSQL.
- Búsqueda real por nombre, modelo, SKU y código de barras.
- Filtros por tipo, marca, categoría y estado.
- Resumen real de productos activos, equipos disponibles, stock bajo y valor de inventario.
- Formulario real **Nuevo producto**.
- Tipos: Celular, Equipo serializado, Accesorio y Servicio.
- Reglas automáticas según tipo:
  - Celular: stock + serie + IMEI.
  - Equipo serializado: stock + serie.
  - Accesorio: stock por cantidades.
  - Servicio: sin inventario.
- Categoría, marca, modelo, SKU, código de barras, garantía y descripción.
- Variantes dinámicas con color, RAM, almacenamiento, SKU y código de barras.
- Costo, precio de venta, precio mínimo, utilidad y margen estimado.
- Validación del lado servidor antes de guardar.
- Control de duplicidad de SKU/códigos mediante restricciones de PostgreSQL/Prisma.
- Registro automático de auditoría al crear un producto.

### Inventario
MOBIX diferencia dos lógicas:

1. **Celulares/equipos serializados**: el stock se calcula contando unidades físicas con estado `AVAILABLE`.
2. **Accesorios**: el stock se obtiene de `inventory_balances`, por variante y almacén.

Los IMEI y series se almacenan en `product_unit_identifiers`, con una restricción única por empresa que impide reutilizar un IMEI incluso como otro tipo de identificador.

## Requisitos

- Node.js 22.12 o superior.
- Docker Desktop o PostgreSQL 16+.
- npm.

## Instalación

### 1. Variables de entorno

Linux/macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 2. Levantar PostgreSQL

```bash
docker compose up -d
```

### 3. Instalar dependencias

```bash
npm install
```

### 4. Validar Prisma

```bash
npm run db:validate
```

### 5. Crear la base de datos

```bash
npm run db:migrate -- --name init
```

### 6. Cargar datos demostrativos

```bash
npm run db:seed
```

El seed crea:
- Empresa MOBIX Store.
- Sucursal principal.
- Almacén principal.
- Usuario/rol administrativo de demostración (el login todavía no está habilitado).
- Categorías y marcas.
- Samsung Galaxy A56, iPhone 16 y Redmi Note 15 con unidades físicas e IMEI únicos.
- Cargador Samsung y mica hidrogel con stock por cantidades.

### 7. Ejecutar MOBIX

```bash
npm run dev
```

Abrir:

```text
http://localhost:3000/productos
```

Para registrar un producto:

```text
http://localhost:3000/productos/nuevo
```

## Comandos útiles

```bash
npm run dev
npm run build
npm run typecheck
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

## Importante

La selección de empresa aún usa temporalmente la primera empresa activa de la base de datos. En la etapa de autenticación se reemplazará por la empresa activa de la sesión para asegurar aislamiento SaaS completo.

## Siguiente etapa recomendada

Construir **Equipos / IMEI** y el flujo de **Compras**, para que un producto celular creado desde el catálogo pueda recibir unidades físicas reales y generar automáticamente stock y Kardex.
