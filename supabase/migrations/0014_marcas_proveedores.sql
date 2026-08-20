-- ============================================================
-- Migración 0014: Módulos de Marcas y Proveedores
--
-- 1) Tabla marcas:             id, nombre, activa.
-- 2) Tabla proveedores:        id, rif, nombre, dirección, contacto,
--                              teléfono, email, activo.
-- 3) Relación con productos:   products.marca_id y products.proveedor_id
--                              (on delete set null para no borrar productos).
-- 4) Políticas RLS:            lectura pública + escritura admin.
-- 5) Módulos nuevos:           'marcas' y 'proveedores' en public.modules
--                              y permisos completos para rol admin.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO UPDATE
-- ============================================================

-- ============================================================
-- 1) Tabla de marcas
-- ============================================================
create table if not exists public.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marcas_nombre_unique on public.marcas (lower(nombre));

alter table public.marcas enable row level security;

-- ============================================================
-- 2) Tabla de proveedores
-- ============================================================
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  rif text not null unique,
  nombre text not null,
  direccion text,
  contacto_nombre text,
  telefono text,
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proveedores enable row level security;

-- ============================================================
-- 3) Relación con productos: marcas y proveedores
-- ============================================================
alter table public.products
  add column if not exists marca_id uuid references public.marcas(id) on delete set null,
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;

create index if not exists idx_products_marca_id on public.products(marca_id);
create index if not exists idx_products_proveedor_id on public.products(proveedor_id);

-- ============================================================
-- 4) Políticas RLS: marcas
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'marcas' and policyname = 'Marcas read public'
  ) then
    create policy "Marcas read public"
    on public.marcas for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'marcas' and policyname = 'Marcas admin all'
  ) then
    create policy "Marcas admin all"
    on public.marcas for all
    using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
  end if;
end $$;

-- ============================================================
-- 5) Políticas RLS: proveedores
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'proveedores' and policyname = 'Proveedores read public'
  ) then
    create policy "Proveedores read public"
    on public.proveedores for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'proveedores' and policyname = 'Proveedores admin all'
  ) then
    create policy "Proveedores admin all"
    on public.proveedores for all
    using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
  end if;
end $$;

-- ============================================================
-- 6) Asegurar módulos del sistema (marcas y proveedores)
-- ============================================================
insert into public.modules (name, slug, description)
values
  ('Marcas',       'marcas',       'Gestión de marcas de productos'),
  ('Proveedores',  'proveedores',  'Gestión de proveedores de productos')
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

-- ============================================================
-- 7) Asegurar permisos completos del rol admin en los módulos nuevos
-- ============================================================
insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug in ('marcas', 'proveedores')
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;