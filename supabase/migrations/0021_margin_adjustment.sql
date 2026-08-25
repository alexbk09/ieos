-- Migración 0021: Ajuste de Margen y Control de Pérdidas
-- Tabla de historial + RPC de actualización masiva en una sola transacción.

create table if not exists public.historial_ajustes_precios (
  id uuid primary key default gen_random_uuid(),
  fecha_registro timestamptz not null default now(),
  tasa_calculada numeric(10,2) not null,
  porcentaje_aplicado numeric(5,2) not null,
  productos jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null
);

alter table public.historial_ajustes_precios enable row level security;

-- RPC: aplicar_ajuste_precios (bulk update + auditoría en una transacción)
create or replace function public.aplicar_ajuste_precios(
  p_product_ids uuid[],
  p_porcentaje numeric,
  p_tasa numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_permitido boolean;
  v_total_actualizados int;
  v_productos_anteriores jsonb;
  v_historial_id uuid;
begin
  select public.has_permission('ajustes_precios', 'write')
  into v_usuario_permitido;
  if not coalesce(v_usuario_permitido, false) then
    raise exception 'No tienes permisos para aplicar ajustes de precios.';
  end if;

  if p_product_ids is null or array_length(p_product_ids, 1) = 0 then
    raise exception 'Debes seleccionar al menos un producto.';
  end if;
  if p_porcentaje is null or p_porcentaje <= 0 then
    raise exception 'El porcentaje de incremento debe ser mayor a 0.';
  end if;
  if p_tasa is null or p_tasa <= 0 then
    raise exception 'La tasa calculada debe ser mayor a 0.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', pr.id,
    'nombre', pr.name,
    'costo_inicial_anterior', pr.costo_inicial,
    'precio_venta_anterior', pr.price_usd
  )), '[]'::jsonb)
  into v_productos_anteriores
  from public.products pr
  where pr.id = any(p_product_ids);

  update public.products
  set costo_inicial = round(costo_inicial * (1 + p_porcentaje / 100), 2),
      price_usd = round(
        round(costo_inicial * (1 + p_porcentaje / 100), 2) * 1.16,
        2
      )
  where id = any(p_product_ids);

  get diagnostics v_total_actualizados = row_count;

  insert into public.historial_ajustes_precios (
    tasa_calculada,
    porcentaje_aplicado,
    productos,
    created_by
  ) values (
    p_tasa,
    p_porcentaje,
    v_productos_anteriores,
    auth.uid()
  )
  returning id into v_historial_id;

  return jsonb_build_object(
    'historial_id', v_historial_id,
    'total_actualizados', v_total_actualizados,
    'tasa_calculada', p_tasa,
    'porcentaje_aplicado', p_porcentaje,
    'productos_anteriores', v_productos_anteriores
  );
end;
$$;

grant execute on function public.aplicar_ajuste_precios(uuid[], numeric, numeric) to authenticated, service_role;

-- Módulo del sistema + permisos completos para admin
insert into public.modules (name, slug, description)
values (
  'Ajuste de Margen y Control de Pérdidas',
  'ajustes_precios',
  'Cálculo de pérdidas por fluctuación de la tasa oficial, simulación de incremento porcentual del costo base y actualización masiva de precios con historial.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'ajustes_precios'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

-- Políticas RLS: lectura del historial solo para autorizados
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'historial_ajustes_precios'
      and policyname = 'Historial ajustes read authorized'
  ) then
    create policy "Historial ajustes read authorized"
    on public.historial_ajustes_precios for select
    using (
      exists (
        select 1 from public.profiles pr
        join public.role_permissions rp on rp.role_id = pr.role_id
        join public.modules mo on mo.id = rp.module_id
        where pr.id = auth.uid()
          and mo.slug = 'ajustes_precios'
          and rp.can_read = true
      )
      or exists (
        select 1 from public.profiles pr
        where pr.id = auth.uid() and pr.role = 'admin'
      )
    );
  end if;
end $$;
