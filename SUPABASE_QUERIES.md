# Queries de Supabase para Ilumax

Este archivo centraliza el esquema SQL y las políticas de acceso que usa la aplicación. Cópialo completo en el SQL Editor de Supabase y ejecútalo en el mismo proyecto que tiene configurado en `.env.local`.

> Importante: la app usa el bucket `productos-bucket` en [app/api/admin/upload/route.ts](app/api/admin/upload/route.ts). Si quieres usar otro bucket, también debes cambiar esa ruta.

## 1) Extensión base

```sql
create extension if not exists pgcrypto;
```

## 2) Tabla de perfiles de usuario

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'user' check (role in ('user', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = coalesce(public.profiles.role, excluded.role);

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

### Políticas para `profiles`

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

## 3) Categorías

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

## 4) Productos

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

## 5) Solicitudes

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

## 6) Items de la solicitud

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

## 7) Bucket de imágenes del catálogo

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

## 8) Verificación rápida

Ejecuta estas comprobaciones para confirmar que todo quedó bien:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','categories','products','solicitudes','solicitud_items');

select id, name, public
from storage.buckets
where id = 'productos-bucket';
```

## 9) Notas importantes

- La app lee los roles desde `public.profiles.role`.
- La autenticación y la creación de usuarios se gestiona con Supabase Auth.
- Si cambias el nombre del bucket, también debes cambiar la ruta de carga en [app/api/admin/upload/route.ts](app/api/admin/upload/route.ts).
- Revisa que las variables de entorno apunten al mismo proyecto de Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
