# Queries de Supabase para Ilumax

Este archivo centraliza el esquema SQL y las políticas de acceso que usa la aplicación. Cópialo completo en el SQL Editor de Supabase y ejecútalo en el mismo proyecto que tiene configurado en `.env.local`.

> Importante: la app usa el bucket `productos-bucket` en [app/api/admin/upload/route.ts](app/api/admin/upload/route.ts). Si quieres usar otro bucket, también debes cambiar esa ruta.

## 1) Extensión base

```sql
create extension if not exists pgcrypto;
```

## 2) Tabla de roles

Almacena los roles del sistema. Cada rol agrupa permisos por módulo.

```sql
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.roles enable row level security;
```

## 3) Tabla de módulos

Define los módulos del sistema a los que se asignan permisos (lectura, escritura, borrado).

```sql
create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.modules enable row level security;
```

## 4) Tabla de permisos por rol y módulo

Vincula cada rol con los módulos a los que tiene acceso y qué operaciones puede realizar.

```sql
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  can_read boolean not null default false,
  can_write boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  unique (role_id, module_id)
);

alter table public.role_permissions enable row level security;
```

## 5) Tabla de perfiles de usuario

Incluye `role` (compatibilidad con el código actual) y `role_id` (FK a la tabla `roles` para permisos finos).

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'client' check (role in ('admin', 'client', 'user')),
  role_id uuid references public.roles(id),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
```

## 6) Trigger: asignar rol "client" al registrarse

Todo usuario nuevo que se registre desde la app recibe el rol `client` por defecto (a menos que envíe `role` en sus metadatos, usado solo para el admin creado manualmente).

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'client');
begin
  insert into public.profiles (id, email, full_name, role, role_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    (select r.id from public.roles r where r.name = v_role limit 1)
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = coalesce(public.profiles.role, excluded.role),
        role_id = coalesce(public.profiles.role_id, excluded.role_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();
```

## 7) Políticas para `profiles`

```sql
create policy "Profiles read own or admin"
on public.profiles for select
using (
  auth.uid() = id
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "Profiles update own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Profiles update admin"
on public.profiles for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
```

## 8) Políticas para `roles`, `modules` y `role_permissions`

```sql
-- roles: solo lectura pública de nombres, escritura de admin
create policy "Roles read public"
on public.roles for select
using (true);

create policy "Roles admin all"
on public.roles for all
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- modules: solo lectura pública de nombres, escritura de admin
create policy "Modules read public"
on public.modules for select
using (true);

create policy "Modules admin all"
on public.modules for all
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- role_permissions: lectura a quien tenga can_read en el módulo, escritura de admin
create policy "Role permissions read own role"
on public.role_permissions for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role_id = role_id
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "Role permissions admin all"
on public.role_permissions for all
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
```

## 9) Insertar roles base (administrador y cliente)

```sql
insert into public.roles (name, description)
values
  ('admin',  'Administrador del sistema con acceso total a todos los módulos'),
  ('client', 'Cliente final que navega el catálogo y envía solicitudes')
on conflict (name) do update
  set description = excluded.description;
```

## 10) Insertar módulos del sistema

```sql
insert into public.modules (name, slug, description)
values
  ('Dashboard',          'dashboard',        'Resumen general del panel administrativo'),
  ('Productos',          'productos',        'Gestión de productos del catálogo'),
  ('Categorías',         'categorias',       'Gestión de categorías del catálogo'),
  ('Usuarios',           'usuarios',         'Gestión de usuarios y asignación de roles'),
  ('Solicitudes',        'solicitudes',      'Gestión de solicitudes de los clientes'),
  ('Roles y Permisos',   'roles_permissions','Gestión de roles, módulos y permisos')
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;
```

## 11) Asignar permisos al rol administrador

El rol `admin` recibe permisos de **lectura, escritura y borrado** en **todos** los módulos.

```sql
insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;
```

## 12) Asignar permisos al rol cliente

El rol `client` solo puede **leer** productos y ver sus propias solicitudes.

```sql
insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, false, false
from public.roles r
cross join public.modules m
where r.name = 'client'
  and m.slug in ('productos', 'solicitudes')
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = false,
  can_delete = false;
```

## 13) Insertar usuario administrador

> ⚠️ **IMPORTANTE**: Cambia el `email` y `password` antes de ejecutar. La primera query crea el usuario en Supabase Auth con rol `admin` en sus metadatos y confirmado. La segunda asegura que su perfil quede con rol `admin` y su `role_id` apuntando al rol administrador.

```sql
-- 1) Crear el usuario en Supabase Auth
select auth.admin_create_user(
  '{
    "email": "admin@ilumax.ve",
    "password": "CambiaEstaClave123!",
    "email_confirm": true,
    "user_metadata": {
      "full_name": "Administrador ilumaX",
      "role": "admin"
    }
  }'::jsonb
);

-- 2) Asegurar que el perfil quede con rol admin y role_id correcto
update public.profiles
set role = 'admin',
    role_id = (select id from public.roles where name = 'admin')
where email = 'admin@ilumax.ve';

-- 3) Verificar el usuario admin
select id, email, role, role_id
from public.profiles
where email = 'admin@ilumax.ve';
```

## 14) Categorías

```sql
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Categories read public"
on public.categories for select
using (true);

create policy "Categories admin all"
on public.categories for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
```

## 15) Productos

```sql
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price_usd numeric(10,2) not null default 0,
  stock integer not null default 0,
  image_url text,
  colors text[] not null default '{}',
  specifications jsonb not null default '{}',
  category_id uuid references public.categories(id) on delete set null,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Products read public"
on public.products for select
using (true);

create policy "Products admin all"
on public.products for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create trigger products_set_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();
```

## 16) Solicitudes

```sql
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_usd numeric(12,2) not null default 0,
  exchange_rate numeric(10,2) not null default 36.5,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'shipped', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.solicitudes enable row level security;

create policy "Solicitudes read own or admin"
on public.solicitudes for select
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "Solicitudes insert own"
on public.solicitudes for insert
with check (
  auth.uid() = user_id
);

create policy "Solicitudes update own or admin"
on public.solicitudes for update
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create trigger solicitudes_set_updated_at
before update on public.solicitudes
for each row execute procedure public.set_updated_at();
```

## 17) Items de la solicitud

```sql
create table if not exists public.solicitud_items (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_usd numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.solicitud_items enable row level security;

create policy "Solicitud items read own or admin"
on public.solicitud_items for select
using (
  exists (
    select 1 from public.solicitudes s
    where s.id = solicitud_id
      and (
        s.user_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      )
  )
);

create policy "Solicitud items insert own"
on public.solicitud_items for insert
with check (
  exists (
    select 1 from public.solicitudes s
    where s.id = solicitud_id and s.user_id = auth.uid()
  )
);

create policy "Solicitud items update own or admin"
on public.solicitud_items for update
using (
  exists (
    select 1 from public.solicitudes s
    where s.id = solicitud_id
      and (
        s.user_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      )
  )
)
with check (
  exists (
    select 1 from public.solicitudes s
    where s.id = solicitud_id
      and (
        s.user_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      )
  )
);
```

## 18) Bucket de imágenes del catálogo

La app sube archivos a `productos-bucket` desde [app/api/admin/upload/route.ts](app/api/admin/upload/route.ts).

```sql
insert into storage.buckets (id, name, public)
values ('productos-bucket', 'productos-bucket', true)
on conflict (id) do update set public = true;

create policy "Public product files"
on storage.objects for select
using (bucket_id = 'productos-bucket');

create policy "Admins upload product files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'productos-bucket'
  and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
);

create policy "Admins update product files"
on storage.objects for update to authenticated
using (
  bucket_id = 'productos-bucket'
  and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
)
with check (
  bucket_id = 'productos-bucket'
  and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
);

create policy "Admins delete product files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'productos-bucket'
  and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
);
```

## 19) Verificación rápida

Ejecuta estas comprobaciones para confirmar que todo quedó bien:

```sql
-- Tablas principales
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','roles','modules','role_permissions','categories','products','solicitudes','solicitud_items');

-- Roles insertados
select id, name, description from public.roles order by name;

-- Módulos insertados
select id, name, slug from public.modules order by name;

-- Permisos del rol admin (debe mostrar can_read = true en todos)
select r.name as rol, m.name as modulo, rp.can_read, rp.can_write, rp.can_delete
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
join public.modules m on m.id = rp.module_id
where r.name = 'admin'
order by m.name;

-- Permisos del rol client (solo lectura en productos y solicitudes)
select r.name as rol, m.name as modulo, rp.can_read, rp.can_write, rp.can_delete
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
join public.modules m on m.id = rp.module_id
where r.name = 'client'
order by m.name;

-- Bucket
select id, name, public
from storage.buckets
where id = 'productos-bucket';
```

## 20) Tema visual de marca (site_settings.theme)

Cada empresa configura sus colores desde **Configuración → Apariencia**. Los valores se guardan en `site_settings.theme` (JSONB) y la app los convierte a variables CSS inyectadas en `<head>` (cero parpadeo, ISR).

```sql
alter table public.site_settings
  add column if not exists theme jsonb not null default '{}'::jsonb;

-- Valores por defecto (reproducen el look actual de ilumaX)
update public.site_settings
set theme = $json${
  "brand": "#06b6d4",
  "brandStrong": "#0891b2",
  "brandLight": "#67e8f9",
  "brandForeground": "#020617",
  "navy": "#020617",
  "navyForeground": "#f8fafc",
  "navyMuted": "#cbd5e1",
  "background": "#f8fafc",
  "foreground": "#020617",
  "backgroundDark": "#020617",
  "foregroundDark": "#f8fafc",
  "radius": "1rem"
}$json$::jsonb
where id = 1
  and (theme is null or theme = '{}'::jsonb);
```

Campos del tema:

| Campo | Descripción |
|---|---|
| `brand` | Color de marca principal (botones, enlaces, badges) |
| `brandStrong` | Variante oscura para texto sobre fondos claros |
| `brandLight` | Variante clara para fondos oscuros |
| `brandForeground` | Texto que va encima del color de marca |
| `navy` | Azul marino (secciones, botones primarios, overlays) |
| `navyForeground` | Texto sobre secciones de azul marino |
| `navyMuted` | Subtítulos sobre secciones oscuras |
| `background` / `foreground` | Fondo y texto en modo claro |
| `backgroundDark` / `foregroundDark` | Fondo y texto en modo oscuro |
| `radius` | Radio de esquinas (ej: `1rem`, `12px`) |

La app mapea estos valores a variables CSS (`--brand`, `--navy`, etc.) expuestas como clases Tailwind: `text-brand`, `bg-navy`, `border-brand/50`, `text-brand-strong`, `text-brand-light`, `bg-navy`, `text-navy-foreground`, `text-navy-muted`, `bg-card`, etc.

## 21) Notas importantes

- La app lee los roles desde `public.profiles.role` (valores: `admin` o `client`). La tabla `roles` + `role_permissions` permite gestionar permisos finos por módulo.
- Todo usuario nuevo registrado en la app recibe automáticamente rol `client` (ver trigger `handle_new_user`).
- Cuando un cliente inicia sesión, `app/dashboard/page.tsx` muestra **su** historial de solicitudes (filtrado por `user_id`). La página `/dashboard` es el "Mis Solicitudes" del cliente.
- Cuando un administrador inicia sesión, se le redirige a `/admin` (dashboard administrativo) gracias a `requireAdmin()` en `app/admin/layout.tsx` y la redirección en `app/dashboard/page.tsx`.
- La autenticación y la creación de usuarios se gestiona con Supabase Auth.
- Si cambias el nombre del bucket, también debes cambiar la ruta de carga en [app/api/admin/upload/route.ts](app/api/admin/upload/route.ts).
- Revisa que las variables de entorno apunten al mismo proyecto de Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.