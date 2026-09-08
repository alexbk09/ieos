-- ============================================================
-- Migración 0032: Cuentas por cobrar
-- 1) Columnas de crédito en profiles e invoices.
-- 2) Tabla public.abonos.
-- 3) Tabla public.cuentas_por_cobrar (saldo por factura).
-- 4) RPC registrar_abono (transaccional, actualiza saldo).
-- 5) Registro del módulo 'cuentas_cobrar' + permisos + RLS.
-- ============================================================

alter table public.profiles
  add column if not exists limite_credito_usd numeric(12,2) not null default 0,
  add column if not exists dias_plazo_default integer not null default 0,
  add column if not exists es_credito boolean not null default false;

alter table public.invoices
  add column if not exists tiene_credito boolean not null default false,
  add column if not exists dias_plazo integer not null default 0,
  add column if not exists fecha_vencimiento date;

create table if not exists public.abonos (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  monto_usd numeric(12,2) not null check (monto_usd > 0),
  metodo text not null default 'transferencia' check (metodo in ('transferencia', 'movil', 'efectivo', 'tarjeta', 'paypal', 'zelle')),
  referencia text,
  fecha timestamptz not null default now(),
  registrado_por uuid references auth.users(id) on delete set null,
  notas text,
  created_at timestamptz not null default now()
);

alter table public.abonos enable row level security;

create index if not exists idx_abonos_invoice on public.abonos (invoice_id);

create table if not exists public.cuentas_por_cobrar (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  total_usd numeric(12,2) not null default 0,
  abonado_usd numeric(12,2) not null default 0,
  saldo_usd numeric(12,2) not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'parcial', 'pagada', 'vencida', 'cancelada')),
  updated_at timestamptz not null default now()
);

alter table public.cuentas_por_cobrar enable row level security;

create index if not exists idx_cxc_estado on public.cuentas_por_cobrar (estado);

-- RPC: registrar abono (transaccional)
create or replace function public.registrar_abono(
  p_invoice_id uuid,
  p_monto numeric,
  p_metodo text default 'transferencia',
  p_referencia text default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
  v_cxc public.cuentas_por_cobrar%rowtype;
  v_nuevo_saldo numeric;
  v_nuevo_estado text;
begin
  select public.has_permission('cuentas_cobrar', 'write')
  into v_permitido;
  if not coalesce(v_permitido, false) then
    raise exception 'No tienes permisos para registrar abonos.';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del abono debe ser mayor a 0.';
  end if;

  select * into v_cxc from public.cuentas_por_cobrar where invoice_id = p_invoice_id for update;
  if v_cxc.id is null then
    raise exception 'La factura no tiene cuenta por cobrar.';
  end if;

  v_nuevo_saldo := greatest(0, v_cxc.saldo_usd - p_monto);
  v_nuevo_estado := case when v_nuevo_saldo = 0 then 'pagada' else 'parcial' end;

  insert into public.abonos (invoice_id, monto_usd, metodo, referencia, notas, registrado_por)
  values (p_invoice_id, p_monto, p_metodo, p_referencia, p_notas, auth.uid());

  update public.cuentas_por_cobrar
  set abonado_usd = abonado_usd + p_monto,
      saldo_usd = v_nuevo_saldo,
      estado = v_nuevo_estado,
      updated_at = now()
  where invoice_id = p_invoice_id;

  return jsonb_build_object('ok', true, 'saldo', v_nuevo_saldo, 'estado', v_nuevo_estado);
end;
$$;

grant execute on function public.registrar_abono(uuid, numeric, text, text, text) to authenticated, service_role;

insert into public.modules (name, slug, description)
values (
  'Cuentas por Cobrar',
  'cuentas_cobrar',
  'Registro de abonos a facturas, plazos de pago y límites de crédito aprobados para los clientes.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'cuentas_cobrar'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'abonos' and policyname = 'Abonos read authorized') then
    create policy "Abonos read authorized" on public.abonos for select
    using (public.has_permission('cuentas_cobrar', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'abonos' and policyname = 'Abonos write authorized') then
    create policy "Abonos write authorized" on public.abonos for all
    using (public.has_permission('cuentas_cobrar', 'write') or public.is_admin())
    with check (public.has_permission('cuentas_cobrar', 'write') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cuentas_por_cobrar' and policyname = 'CxC read authorized') then
    create policy "CxC read authorized" on public.cuentas_por_cobrar for select
    using (public.has_permission('cuentas_cobrar', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cuentas_por_cobrar' and policyname = 'CxC write authorized') then
    create policy "CxC write authorized" on public.cuentas_por_cobrar for all
    using (public.has_permission('cuentas_cobrar', 'write') or public.is_admin())
    with check (public.has_permission('cuentas_cobrar', 'write') or public.is_admin());
  end if;
end $$;