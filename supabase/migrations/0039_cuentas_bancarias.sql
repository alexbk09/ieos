-- ============================================================
-- Migración 0039: Módulo de Cuentas Bancarias
--
-- Tabla public.cuentas_bancarias: cuentas asociadas a los bancos
-- configurados en conciliación (banco_configuraciones) para saber
-- qué cuenta agregar, activar y asociar a los pagos.
-- 1) Tabla + RLS.
-- 2) Registro del módulo 'cuentas_bancarias' + permisos admin.
-- 3) Políticas usando has_permission('cuentas_bancarias', ...).
-- ============================================================

create table if not exists public.cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  banco_id uuid references public.banco_configuraciones(id) on delete set null,
  nombre_banco text not null,
  numero_cuenta text not null,
  tipo_cuenta text not null default 'corriente' check (tipo_cuenta in ('corriente', 'ahorro', 'pago_movil')),
  titular text,
  documento_titular text,
  moneda text not null default 'USD' check (moneda in ('USD', 'VES', 'EUR')),
  telefono_pago_movil text,
  cedula_pago_movil text,
  banco_pago_movil text,
  activa boolean not null default true,
  es_principal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cuentas_bancarias enable row level security;

create index if not exists idx_cuentas_bancarias_banco on public.cuentas_bancarias (banco_id);
create index if not exists idx_cuentas_bancarias_activa on public.cuentas_bancarias (activa);

insert into public.modules (name, slug, description)
values (
  'Cuentas Bancarias',
  'cuentas_bancarias',
  'Gestión de cuentas bancarias de la empresa: número de cuenta, titular, tipo, moneda y cuenta principal para asociar los pagos.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'cuentas_bancarias'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cuentas_bancarias' and policyname = 'Cuentas bancarias read authorized') then
    create policy "Cuentas bancarias read authorized" on public.cuentas_bancarias for select
    using (public.has_permission('cuentas_bancarias', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cuentas_bancarias' and policyname = 'Cuentas bancarias write authorized') then
    create policy "Cuentas bancarias write authorized" on public.cuentas_bancarias for all
    using (public.has_permission('cuentas_bancarias', 'write') or public.is_admin())
    with check (public.has_permission('cuentas_bancarias', 'write') or public.is_admin());
  end if;
end $$;