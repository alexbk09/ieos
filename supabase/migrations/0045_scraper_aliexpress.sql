-- ============================================================
-- Migración 0045: Scraper AliExpress + Logs de monitoreo (Fase 2.1)
--
-- Objetivo: registrar el módulo 'scraper_aliexpress' para el RBAC
-- del panel admin y crear la tabla `scraper_logs` que guarda el
-- historial de cada extracción (URL, usuario, estado, duración y
-- payload JSONB) para que el administrador monitoree el motor.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + checks + ON CONFLICT.
-- ============================================================

-- ============================================================
-- 1) Tabla de logs del scraper
-- ============================================================
create table if not exists public.scraper_logs (
  id uuid primary key default gen_random_uuid(),
  url_producto text not null,
  estado text not null check (estado in ('inicio', 'exito', 'error')),
  mensaje text,
  datos_json jsonb,
  error_json text,
  usuario_email text,
  duracion_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_scraper_logs_created_at
  on public.scraper_logs (created_at desc);

comment on table public.scraper_logs is
  'Historial de intentos del scraper AliExpress (éxito/error) para monitoreo admin.';

-- ============================================================
-- 2) RLS: solo lectura/escritura admin
-- ============================================================
alter table public.scraper_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'scraper_logs'
      and policyname = 'Scraper logs admin all'
  ) then
    create policy "Scraper logs admin all" on public.scraper_logs
      for all using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

-- ============================================================
-- 3) Módulo del panel + permisos para el rol admin
-- ============================================================
insert into public.modules (name, slug, description)
values (
  'Scraper AliExpress',
  'scraper_aliexpress',
  'Extracción y monitoreo de productos AliExpress vía proxy con renderizado JS.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'scraper_aliexpress'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;