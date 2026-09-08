-- ============================================================
-- Migración 0031: Zonas de envío (cálculo de delivery dinámico)
--
-- 1) Tabla public.zonas_envio: zonas con tarifa plana y por kg.
-- 2) Tabla public.envio_rangos_peso: rangos escalonados por zona.
-- 3) Registro del módulo 'envios' + permisos admin + RLS.
-- La lógica de cálculo (peso volumétrico, rangos, tarifas) vive
-- en lib/shipping-calculator.mjs (lógica pura con tests).
-- ============================================================

create table if not exists public.zonas_envio (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  estados text[] not null default '{}',
  ciudades text[] not null default '{}',
  tarifa_flat_usd numeric(10,2) not null default 0,
  tarifa_por_kg_usd numeric(10,2) not null default 2,
  tiempo_estimado text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.zonas_envio enable row level security;

create table if not exists public.envio_rangos_peso (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid not null references public.zonas_envio(id) on delete cascade,
  peso_min_kg numeric(10,2) not null default 0,
  peso_max_kg numeric(10,2) not null default 0,
  tarifa_usd numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint envio_rangos_peso_min_lt_max check (peso_min_kg < peso_max_kg)
);

alter table public.envio_rangos_peso enable row level security;

create index if not exists idx_envio_rangos_peso_zona on public.envio_rangos_peso (zona_id);

insert into public.modules (name, slug, description)
values (
  'Zonas de Envío',
  'envios',
  'Configuración de costos dinámicos de delivery según el peso volumétrico y el destino de la mercancía.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'envios'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'zonas_envio' and policyname = 'Zonas envio read authorized'
  ) then
    create policy "Zonas envio read authorized"
    on public.zonas_envio for select
    using (
      public.has_permission('envios', 'read')
      or public.is_admin()
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'zonas_envio' and policyname = 'Zonas envio write authorized'
  ) then
    create policy "Zonas envio write authorized"
    on public.zonas_envio for all
    using (
      public.has_permission('envios', 'write')
      or public.is_admin()
    )
    with check (
      public.has_permission('envios', 'write')
      or public.is_admin()
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'envio_rangos_peso' and policyname = 'Rangos peso read authorized'
  ) then
    create policy "Rangos peso read authorized"
    on public.envio_rangos_peso for select
    using (
      public.has_permission('envios', 'read')
      or public.is_admin()
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'envio_rangos_peso' and policyname = 'Rangos peso write authorized'
  ) then
    create policy "Rangos peso write authorized"
    on public.envio_rangos_peso for all
    using (
      public.has_permission('envios', 'write')
      or public.is_admin()
    )
    with check (
      public.has_permission('envios', 'write')
      or public.is_admin()
    );
  end if;
end $$;