-- ============================================================
-- Migración 0037: Reporte de margen neto (ganancia real)
-- 1) Tabla public.reportes_margen (snapshots opcionales).
-- 2) Registro del módulo 'reporte_margen' + permisos admin + RLS.
-- La lógica de cálculo (ingreso neto de IVA, costo inicial, otros
-- costos) vive en lib/margin-net-calculator.mjs (lógica pura + tests).
-- ============================================================

create table if not exists public.reportes_margen (
  id uuid primary key default gen_random_uuid(),
  periodo_inicio date not null,
  periodo_fin date not null,
  resumen jsonb not null default '{}',
  renglones jsonb not null default '[]',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.reportes_margen enable row level security;

insert into public.modules (name, slug, description)
values (
  'Reporte de Margen Neto',
  'reporte_margen',
  'Deducción automática del costo inicial del producto para calcular la ganancia real del negocio.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'reporte_margen'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reportes_margen' and policyname = 'Reportes margen read authorized') then
    create policy "Reportes margen read authorized" on public.reportes_margen for select
    using (public.has_permission('reporte_margen', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reportes_margen' and policyname = 'Reportes margen write authorized') then
    create policy "Reportes margen write authorized" on public.reportes_margen for all
    using (public.has_permission('reporte_margen', 'write') or public.is_admin())
    with check (public.has_permission('reporte_margen', 'write') or public.is_admin());
  end if;
end $$;