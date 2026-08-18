# Migraciones y Seeders Automatizados para Supabase

Este sistema elimina la necesidad de ejecutar queries manualmente en el SQL Editor de Supabase. Todo el esquema, permisos, roles, módulos y usuario admin se configuran automáticamente con un solo comando.

## 📁 Estructura

```
supabase/
├── migrations/          # Esquema + permisos (se ejecuta solo si no está aplicado)
│   ├── 0001_init.sql            # Tablas base + RLS habilitado
│   ├── 0002_functions_triggers.sql  # Funciones y triggers (updated_at, handle_new_user)
│   ├── 0002b_ensure_columns.sql # Sincroniza columnas si las tablas ya existían
│   ├── 0003_policies.sql        # Políticas RLS idempotentes
│   └── 0004_storage.sql         # Bucket productos-bucket + políticas de storage
├── seed/                # Datos base (siempre seguro ejecutarlos, son idempotentes)
│   ├── 0001_roles_modules_permissions.sql  # Roles admin/client + módulos + permisos
│   └── 0002_admin_user.sql      # Perfil del usuario admin
└── run.mjs              # Script automatizado (migraciones + seeders + admin)
```

## 🚀 Instalación (una sola vez)

### 1. Configurar la password de la base de datos

El script **detecta automáticamente el host de conexión correcto** (pooler por región, hosts legacy). Solo necesitas la password de la base de datos:

1. Si no la recuerdas: **Supabase Dashboard → Project Settings → Database → Reset database password**
2. Edita `.env.development.local`:

```
SUPABASE_DB_PASSWORD='TU_PASSWORD_DE_LA_DB'
```

> 💡 **Alternativa**: si prefieres una `DATABASE_URL` completa (por ejemplo de la sección "Connection pooling" del dashboard) puedes usarla y el script la probará primero, sin necesidad de `SUPABASE_DB_PASSWORD`.

### 2. Configurar el admin (opcional)

Por defecto crea `admin@ilumax.ve` con password `CambiaEstaClave123!`. Para cambiarlas:

```
SUPABASE_ADMIN_EMAIL='admin@ilumax.ve'
SUPABASE_ADMIN_PASSWORD='TuClaveSegura123!'
```

### 3. Ejecutar todo

```bash
npm run supabase:setup
```

Este comando:
1. Verifica las variables de entorno
2. Conecta a la base de datos
3. Crea la tabla de registro `_migrations` (si no existe)
4. Ejecuta **solo las migraciones pendientes** (las ya aplicadas se saltan)
5. Crea el usuario admin en Supabase Auth vía API (si no existe)
6. Ejecuta los seeders (roles, módulos, permisos, perfil admin)
7. Muestra un resumen final

## 📋 Comandos disponibles

| Comando | Descripción |
|---|---|
| `npm run supabase:setup` | Ejecuta migraciones pendientes + seeders + crea admin |
| `npm run supabase:seed` | Solo ejecuta los seeders (idempotentes) |
| `npm run supabase:verify` | Verifica el estado actual sin modificar nada |

## 🔄 Cómo funciona la idempotencia

### Migraciones
Cada migración se registra en la tabla `public._migrations`. Al volver a ejecutar:
- Si la migración ya está en `_migrations`, **se salta**.
- Si no está, se ejecuta y se registra.

Además, cada migración es idempotente a nivel SQL:
- `CREATE TABLE IF NOT EXISTS` — no falla si la tabla existe
- `CREATE OR REPLACE FUNCTION` — reemplaza la función si existe
- `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` — no duplica triggers
- Políticas RLS: verifican en `pg_policies` antes de crear, para no fallar si la política ya existe

### Seeders
Los seeders usan `ON CONFLICT DO UPDATE/NOTHING` y verificaciones `IF NOT EXISTS`:
- Roles: `ON CONFLICT (name) DO UPDATE`
- Módulos: `ON CONFLICT (slug) DO UPDATE`
- Permisos: `ON CONFLICT (role_id, module_id) DO UPDATE`
- Perfil admin: `IF NOT EXISTS` + `ON CONFLICT (id) DO UPDATE`

## ➕ Agregar una migración nueva

1. Crea el archivo en `supabase/migrations/` con el prefijo numérico siguiente:
   ```
   0005_nombre_descriptivo.sql
   ```
2. Haz que sea idempotente (usa `IF NOT EXISTS`, `CREATE OR REPLACE`, verificación en `pg_policies`, etc.)
3. Ejecuta `npm run supabase:setup`

## ➕ Agregar un seeder nuevo

1. Crea el archivo en `supabase/seed/` con el prefijo numérico siguiente:
   ```
   0003_nombre_descriptivo.sql
   ```
2. Usa `ON CONFLICT` o verificaciones `IF NOT EXISTS` para que sea idempotente
3. Ejecuta `npm run supabase:setup` (o `npm run supabase:seed`)

## ⚠️ Notas

- **`SUPABASE_DB_PASSWORD`** (o `DATABASE_URL`) es necesaria para migraciones y seeders SQL. Es la password del rol `postgres`.
- **`SUPABASE_SERVICE_ROLE_KEY`** se usa solo para crear el usuario admin vía API de Auth (no expone la contraseña en SQL).
- **Autodetección de host**: el script prueba los poolers de Supabase (`aws-0-<region>.pooler.supabase.com`) en todas las regiones y hosts legacy. Si tu proyecto es nuevo y no tiene host directo, la conexión funcionará vía pooler.
- El archivo `.env.development.local` está protegido por `.gitignore` (no se sube al repositorio).
- Si modificas una migración ya aplicada, debes borrar su registro en `_migrations` para que se re-ejecute, o crear una migración nueva.
- Todo el esquema está documentado en [SUPABASE_QUERIES.md](../SUPABASE_QUERIES.md), que sigue siendo válido como referencia (el sistema de migraciones lo reemplaza como forma de ejecución).
- Si aún así no conecta, copia la **connection string del pooler** desde el dashboard y úsala como `DATABASE_URL` (el script la usará primero).
