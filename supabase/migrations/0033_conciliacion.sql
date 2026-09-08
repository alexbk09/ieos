-- ============================================================
-- Migración 0033: Conciliación bancaria express
-- 1) Tabla public.banco_configuraciones.
-- 2) Tabla public.movimientos_bancarios.
-- 3) RPC conciliar_movimiento (validación contra abonos).
-- 4) Registro del módulo 'conciliacion' + permisos + RLS.
-- ============================================================

create table if not exists public.banco_configuraciones (
  id uuid primary key default gen_random_uuid(),
  nombre_banco text not null,
  tipo_integracion text not null default 'manual' check (tipo_integracion in ('manual', 'api')),
  api_endpoint text,
  api_key text,
  api_token text,
  activo boolean not null default true,
  ultima_sincronizacion timestamptz,
  created_at timestamptz not null default now()
);

alter table public.banco_configuraciones enable row level security;

create table if not exists public.movimientos_bancarios (
  id uuid primary key default gen_random_uuid(),
  banco_id uuid references public.banco_configuraciones(id) on delete set null,
  referencia text not null,
  fecha_movimiento timestamptz not null default now(),
  monto_usd numeric(12,2) not null default 0,
  emisor text,
  beneficiario text,
  detalle text,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'conciliado', 'descartado', 'duplicado')),
  abono_id uuid references public.abonos(id) on delete set null,
  raw_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (banco_id, referencia)
);

alter table public.movimientos_bancarios enable row level security;

create index if not exists idx_movimientos_estado on public.movimientos_bancarios (estado);
create index if not exists idx_movimientos_fecha on public.movimientos_bancarios (fecha_movimiento desc);

-- RPC: conciliar movimiento contra abono (transaccional)
create or replace function public.conciliar_movimiento(
  p_movimiento_id uuid,
  p_abono_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
  v_movimiento public.movimientos_bancarios%rowtype;
begin
  select public.has_permission('conciliacion', 'write')
  into v_permitido;
  if not coalesce(v_permitido, false) then
    raise exception 'No tienes permisos para conciliar movimientos.';
  end if;

  select * into v_movimiento from public.movimientos_bancarios where id = p_movimiento_id for update;
  if v_movimiento.id is null then
    raise exception 'Movimiento no encontrado.';
  end if;

  if v_movimiento.estado = 'conciliado' then
    raise exception 'El movimiento ya está conciliado.';
  end if;

  update public.movimientos_bancarios
  set estado = 'conciliado',
      abono_id = p_abono_id
  where id = p_movimiento_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.conciliar_movimiento(uuid, uuid) to authenticated, service_role;

-- RPC: descartar movimiento
create or replace function public.descartar_movimiento(
  p_movimiento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
begin
  select public.has_permission('conciliacion', 'write')
  into v_permitido;
  if not coalesce(v_permitido, false) then
    raise exception 'No tienes permisos para descartar movimientos.';
  end if;

  update public.movimientos_bancarios
  set estado = 'descartado'
  where id = p_movimiento_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.descartar_movimiento(uuid) to authenticated, service_role;

insert into public.modules (name, slug, description)
values (
  'Conciliación Bancaria',
  'conciliacion',
  'Validación de pagos móviles y transferencias mediante lectura de notificaciones o APIs bancarias.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'conciliacion'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'banco_configuraciones' and policyname = 'Bancos read authorized') then
    create policy "Bancos read authorized" on public.banco_configuraciones for select
    using (public.has_permission('conciliacion', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'banco_configuraciones' and policyname = 'Bancos write authorized') then
    create policy "Bancos write authorized" on public.banco_configuraciones for all
    using (public.has_permission('conciliacion', 'write') or public.is_admin())
    with check (public.has_permission('conciliacion', 'write') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'movimientos_bancarios' and policyname = 'Movimientos read authorized') then
    create policy "Movimientos read authorized" on public.movimientos_bancarios for select
    using (public.has_permission('conciliacion', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'movimientos_bancarios' and policyname = 'Movimientos write authorized') then
    create policy "Movimientos write authorized" on public.movimientos_bancarios for all
    using (public.has_permission('conciliacion', 'write') or public.is_admin())
    with check (public.has_permission('conciliacion', 'write') or public.is_admin());
  end if;
end $$;