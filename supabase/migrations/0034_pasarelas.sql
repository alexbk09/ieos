-- ============================================================
-- Migración 0034: Pasarelas de pago internacionales
-- 1) Tabla public.pasarelas_configuracion (llaves, modo, comisión).
-- 2) Tabla public.pagos (pendiente, aprobado, etc).
-- 3) RPC confirmar_pago (valida permiso y actualiza estado).
-- 4) Registro del módulo 'pasarelas' + permisos + RLS.
-- ============================================================

create table if not exists public.pasarelas_configuracion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (nombre in ('paypal', 'stripe', 'zelle', 'binance', 'cripto')),
  activo boolean not null default false,
  llave_publica text,
  llave_secreta_enc text,
  modo text not null default 'sandbox' check (modo in ('sandbox', 'produccion')),
  monedas text[] not null default '{USD}',
  comision_porcentual numeric(5,2) not null default 0,
  config jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.pasarelas_configuracion enable row level security;

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid references public.solicitudes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  pasarela_id uuid references public.pasarelas_configuracion(id) on delete set null,
  referencia_pasarela text,
  monto_usd numeric(12,2) not null default 0,
  moneda text not null default 'USD',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'reembolsado', 'expirado')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pagos enable row level security;

create index if not exists idx_pagos_solicitud on public.pagos (solicitud_id);
create index if not exists idx_pagos_estado on public.pagos (estado);

create or replace function public.confirmar_pago(
  p_pago_id uuid,
  p_estado text default 'aprobado'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
  v_pago public.pagos%rowtype;
begin
  select public.has_permission('pasarelas', 'write')
  into v_permitido;
  if not coalesce(v_permitido, false) then
    raise exception 'No tienes permisos para confirmar pagos.';
  end if;

  if p_estado not in ('aprobado', 'rechazado', 'reembolsado', 'expirado') then
    raise exception 'Estado de pago inválido.';
  end if;

  select * into v_pago from public.pagos where id = p_pago_id for update;
  if v_pago.id is null then
    raise exception 'Pago no encontrado.';
  end if;

  update public.pagos
  set estado = p_estado,
      updated_at = now()
  where id = p_pago_id;

  if p_estado = 'aprobado' and v_pago.solicitud_id is not null then
    update public.solicitudes
    set status = 'confirmed', updated_at = now()
    where id = v_pago.solicitud_id
      and status = 'pending';
  end if;

  return jsonb_build_object('ok', true, 'estado', p_estado);
end;
$$;

grant execute on function public.confirmar_pago(uuid, text) to authenticated, service_role;

insert into public.modules (name, slug, description)
values (
  'Pasarelas de Pago',
  'pasarelas',
  'Integración de botones de pago directo para tarjetas de crédito, PayPal y billeteras digitales.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'pasarelas'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pasarelas_configuracion' and policyname = 'Pasarelas read authorized') then
    create policy "Pasarelas read authorized" on public.pasarelas_configuracion for select
    using (public.has_permission('pasarelas', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pasarelas_configuracion' and policyname = 'Pasarelas write authorized') then
    create policy "Pasarelas write authorized" on public.pasarelas_configuracion for all
    using (public.has_permission('pasarelas', 'write') or public.is_admin())
    with check (public.has_permission('pasarelas', 'write') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pagos' and policyname = 'Pagos read authorized') then
    create policy "Pagos read authorized" on public.pagos for select
    using (public.has_permission('pasarelas', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pagos' and policyname = 'Pagos write authorized') then
    create policy "Pagos write authorized" on public.pagos for all
    using (public.has_permission('pasarelas', 'write') or public.is_admin())
    with check (public.has_permission('pasarelas', 'write') or public.is_admin());
  end if;
end $$;