-- ============================================================
-- Migración 0030: Despacho y asignación de rutas
--
-- 1) Columnas de entrega en solicitudes.
-- 2) Tabla public.transportistas.
-- 3) Tabla public.despachos (programado, en_ruta, entregado, fallido).
-- 4) Tabla public.despacho_estados (historial de estados).
-- 5) RPC avanzar_estado_despacho (transaccional + historial).
-- 6) Registro del módulo 'despachos' + permisos admin + RLS.
-- ============================================================

alter table public.solicitudes
  add column if not exists direccion_entrega text,
  add column if not exists telefono_entrega text;

create table if not exists public.transportistas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'externo' check (tipo in ('interno', 'externo')),
  telefono text,
  vehiculo text,
  placa text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.transportistas enable row level security;

create table if not exists public.despachos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  almacen_origen uuid references public.almacenes(id) on delete set null,
  transportista_id uuid references public.transportistas(id) on delete set null,
  ruta text,
  estado text not null default 'programado' check (estado in ('programado', 'en_ruta', 'entregado', 'fallido')),
  fecha_programada date,
  fecha_entrega timestamptz,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.despachos enable row level security;

create index if not exists idx_despachos_solicitud on public.despachos (solicitud_id);
create index if not exists idx_despachos_estado on public.despachos (estado);
create index if not exists idx_despachos_fecha on public.despachos (fecha_programada desc);

create table if not exists public.despacho_estados (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null check (estado_nuevo in ('programado', 'en_ruta', 'entregado', 'fallido')),
  ubicacion text,
  observaciones text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.despacho_estados enable row level security;

create index if not exists idx_despacho_estados_despacho on public.despacho_estados (despacho_id, created_at desc);

-- RPC: avanzar estado de despacho (transaccional, registra historial)
create or replace function public.avanzar_estado_despacho(
  p_despacho_id uuid,
  p_estado text,
  p_ubicacion text default null,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
  v_anterior text;
  v_despacho public.despachos%rowtype;
  v_solicitud_id uuid;
  v_fecha_entrega timestamptz;
begin
  select public.has_permission('despachos', 'write')
  into v_permitido;
  if not coalesce(v_permitido, false) then
    raise exception 'No tienes permisos para actualizar despachos.';
  end if;

  if p_estado not in ('programado', 'en_ruta', 'entregado', 'fallido') then
    raise exception 'Estado de despacho inválido.';
  end if;

  select * into v_despacho from public.despachos where id = p_despacho_id for update;
  if v_despacho.id is null then
    raise exception 'Despacho no encontrado.';
  end if;

  v_anterior := v_despacho.estado;
  v_solicitud_id := v_despacho.solicitud_id;
  v_fecha_entrega := case when p_estado = 'entregado' then now() else v_despacho.fecha_entrega end;

  update public.despachos
  set estado = p_estado,
      fecha_entrega = v_fecha_entrega,
      updated_at = now()
  where id = p_despacho_id;

  insert into public.despacho_estados (despacho_id, estado_anterior, estado_nuevo, ubicacion, observaciones, updated_by)
  values (p_despacho_id, v_anterior, p_estado, p_ubicacion, p_observaciones, auth.uid());

  -- Si el despacho se entrega, completar la solicitud (dispara trigger de stock).
  if p_estado = 'entregado' and v_anterior is distinct from 'entregado' then
    update public.solicitudes
    set status = 'completed', updated_at = now()
    where id = v_solicitud_id
      and status not in ('cancelled');
  end if;

  return jsonb_build_object('ok', true, 'estado', p_estado, 'anterior', v_anterior);
end;
$$;

grant execute on function public.avanzar_estado_despacho(uuid, text, text, text) to authenticated, service_role;

insert into public.modules (name, slug, description)
values (
  'Despacho y Rutas',
  'despachos',
  'Organización de entregas diarias, asignación de transportistas y actualización de estados de envío en tiempo real.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'despachos'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'transportistas' and policyname = 'Transportistas read authorized') then
    create policy "Transportistas read authorized" on public.transportistas for select
    using (public.has_permission('despachos', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'transportistas' and policyname = 'Transportistas write authorized') then
    create policy "Transportistas write authorized" on public.transportistas for all
    using (public.has_permission('despachos', 'write') or public.is_admin())
    with check (public.has_permission('despachos', 'write') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'despachos' and policyname = 'Despachos read authorized') then
    create policy "Despachos read authorized" on public.despachos for select
    using (public.has_permission('despachos', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'despachos' and policyname = 'Despachos write authorized') then
    create policy "Despachos write authorized" on public.despachos for all
    using (public.has_permission('despachos', 'write') or public.is_admin())
    with check (public.has_permission('despachos', 'write') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'despacho_estados' and policyname = 'Despacho estados read authorized') then
    create policy "Despacho estados read authorized" on public.despacho_estados for select
    using (public.has_permission('despachos', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'despacho_estados' and policyname = 'Despacho estados write authorized') then
    create policy "Despacho estados write authorized" on public.despacho_estados for all
    using (public.has_permission('despachos', 'write') or public.is_admin())
    with check (public.has_permission('despachos', 'write') or public.is_admin());
  end if;
end $$;