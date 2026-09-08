-- ============================================================
-- Migración 0035: Libros fiscales automatizados
-- 1) Tabla facturas_proveedor (libro de compras).
-- 2) Tabla libros_fiscales_exportaciones (historial de exportaciones).
-- 3) Registro del módulo 'libros_fiscales' + permisos admin + RLS.
-- El libro de ventas se genera desde la tabla invoices existente.
-- ============================================================

create table if not exists public.facturas_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  numero_factura text not null,
  emisor_rif text not null,
  emisor_nombre text,
  base_imponible numeric(12,2) not null default 0,
  iva_amount numeric(12,2) not null default 0,
  exento_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  fecha_emision date not null,
  xml_path text,
  created_at timestamptz not null default now()
);

alter table public.facturas_proveedor enable row level security;

create table if not exists public.libros_fiscales_exportaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('compra', 'venta')),
  periodo_inicio date not null,
  periodo_fin date not null,
  formato text not null check (formato in ('pdf', 'excel')),
  archivo_url text,
  generado_por uuid references auth.users(id) on delete set null,
  filtros jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.libros_fiscales_exportaciones enable row level security;

insert into public.modules (name, slug, description)
values (
  'Libros Fiscales',
  'libros_fiscales',
  'Exportación de los libros de compra y venta en formatos PDF o Excel listos para declarar ante el organismo tributario.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'libros_fiscales'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'facturas_proveedor' and policyname = 'Facturas proveedor read authorized') then
    create policy "Facturas proveedor read authorized" on public.facturas_proveedor for select
    using (public.has_permission('libros_fiscales', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'facturas_proveedor' and policyname = 'Facturas proveedor write authorized') then
    create policy "Facturas proveedor write authorized" on public.facturas_proveedor for all
    using (public.has_permission('libros_fiscales', 'write') or public.is_admin())
    with check (public.has_permission('libros_fiscales', 'write') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'libros_fiscales_exportaciones' and policyname = 'Exportaciones read authorized') then
    create policy "Exportaciones read authorized" on public.libros_fiscales_exportaciones for select
    using (public.has_permission('libros_fiscales', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'libros_fiscales_exportaciones' and policyname = 'Exportaciones write authorized') then
    create policy "Exportaciones write authorized" on public.libros_fiscales_exportaciones for all
    using (public.has_permission('libros_fiscales', 'write') or public.is_admin())
    with check (public.has_permission('libros_fiscales', 'write') or public.is_admin());
  end if;
end $$;