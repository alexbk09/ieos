-- ============================================================
-- Migración 0029: Multi-almacén
--
-- 1) Tabla public.almacenes: sucursales, depósitos o bodegas.
-- 2) Tabla public.producto_stock_almacen: stock separado por
--    almacén y producto (unidades y gramos para productos por peso).
-- 3) RPC transferir_stock_almacen: transfiere stock entre almacenes
--    en una sola transacción (sin stock negativo).
-- 4) Registro del módulo 'almacenes' + permisos admin + RLS.
-- ============================================================

-- ============================================================
-- 1) Tabla de almacenes
-- ============================================================
create table if not exists public.almacenes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null unique,
  tipo text not null default 'deposito' check (tipo in ('sucursal', 'deposito', 'bodega')),
  direccion text,
  ciudad text,
  telefono text,
  responsable text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.almacenes enable row level security;

-- ============================================================
-- 2) Tabla de stock por almacén y producto
-- ============================================================
create table if not exists public.producto_stock_almacen (
  id uuid primary key default gen_random_uuid(),
  almacen_id uuid not null references public.almacenes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock integer not null default 0,
  stock_grams numeric(12,2) not null default 0,
  stock_minimo integer not null default 0,
  stock_maximo integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (almacen_id, product_id)
);

alter table public.producto_stock_almacen enable row level security;

create index if not exists idx_producto_stock_almacen_almacen on public.producto_stock_almacen (almacen_id);
create index if not exists idx_producto_stock_almacen_producto on public.producto_stock_almacen (product_id);

-- ============================================================
-- 3) RPC: transferir stock entre almacenes (transaccional)
-- ============================================================
create or replace function public.transferir_stock_almacen(
  p_producto_id uuid,
  p_origen uuid,
  p_destino uuid,
  p_cantidad integer,
  p_cantidad_gramos numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
  v_stock_origen integer;
  v_stock_gramos_origen numeric;
  v_es_peso boolean;
begin
  select public.has_permission('almacenes', 'write')
  into v_permitido;
  if not coalesce(v_permitido, false) then
    raise exception 'No tienes permisos para transferir stock entre almacenes.';
  end if;

  if p_origen is null or p_destino is null then
    raise exception 'Debes seleccionar almacén de origen y destino.';
  end if;
  if p_origen = p_destino then
    raise exception 'El almacén de origen y destino deben ser diferentes.';
  end if;
  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad a transferir debe ser mayor o igual a 0.';
  end if;
  if p_cantidad_gramos is null or p_cantidad_gramos < 0 then
    raise exception 'La cantidad en gramos debe ser mayor o igual a 0.';
  end if;

  -- Determinar si el producto es por peso (usa stock_grams)
  select pricing_type = 'weight'::text into v_es_peso
  from public.products
  where id = p_producto_id;

  if not coalesce(v_es_peso, false) then
    -- Producto por unidad → transferir de stock
    if p_cantidad = 0 then
      raise exception 'La cantidad a transferir debe ser mayor a 0 para productos por unidad.';
    end if;

    select stock into v_stock_origen
    from public.producto_stock_almacen
    where almacen_id = p_origen and product_id = p_producto_id
    for update;

    if v_stock_origen is null or v_stock_origen < p_cantidad then
      raise exception 'Stock insuficiente en el almacén de origen.';
    end if;

    insert into public.producto_stock_almacen (almacen_id, product_id, stock)
    values (p_destino, p_producto_id, p_cantidad)
    on conflict (almacen_id, product_id)
    do update set stock = public.producto_stock_almacen.stock + p_cantidad;

    update public.producto_stock_almacen
    set stock = stock - p_cantidad
    where almacen_id = p_origen and product_id = p_producto_id;
  else
    -- Producto por peso → transferir de stock_grams
    if p_cantidad_gramos = 0 then
      raise exception 'La cantidad en gramos debe ser mayor a 0 para productos por peso.';
    end if;

    select stock_grams into v_stock_gramos_origen
    from public.producto_stock_almacen
    where almacen_id = p_origen and product_id = p_producto_id
    for update;

    if v_stock_gramos_origen is null or v_stock_gramos_origen < p_cantidad_gramos then
      raise exception 'Stock insuficiente en el almacén de origen (gramos).';
    end if;

    insert into public.producto_stock_almacen (almacen_id, product_id, stock_grams)
    values (p_destino, p_producto_id, p_cantidad_gramos)
    on conflict (almacen_id, product_id)
    do update set stock_grams = public.producto_stock_almacen.stock_grams + p_cantidad_gramos;

    update public.producto_stock_almacen
    set stock_grams = stock_grams - p_cantidad_gramos
    where almacen_id = p_origen and product_id = p_producto_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.transferir_stock_almacen(uuid, uuid, uuid, integer, numeric) to authenticated, service_role;

-- ============================================================
-- 4) Módulo del sistema + permisos admin
-- ============================================================
insert into public.modules (name, slug, description)
values (
  'Almacenes',
  'almacenes',
  'Gestión de stock separado por sucursales, depósitos o bodegas, con transferencias entre almacenes.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'almacenes'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

-- ============================================================
-- 5) Políticas RLS
-- ============================================================
-- Almacenes: lectura para quien tenga can_read; escritura/borrado con can_write/can_delete.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'almacenes' and policyname = 'Almacenes read authorized'
  ) then
    create policy "Almacenes read authorized"
    on public.almacenes for select
    using (
      public.has_permission('almacenes', 'read')
      or public.is_admin()
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'almacenes' and policyname = 'Almacenes write authorized'
  ) then
    create policy "Almacenes write authorized"
    on public.almacenes for all
    using (
      public.has_permission('almacenes', 'write')
      or public.is_admin()
    )
    with check (
      public.has_permission('almacenes', 'write')
      or public.is_admin()
    );
  end if;

  -- Stock por almacén
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'producto_stock_almacen' and policyname = 'Producto stock almacen read authorized'
  ) then
    create policy "Producto stock almacen read authorized"
    on public.producto_stock_almacen for select
    using (
      public.has_permission('almacenes', 'read')
      or public.is_admin()
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'producto_stock_almacen' and policyname = 'Producto stock almacen write authorized'
  ) then
    create policy "Producto stock almacen write authorized"
    on public.producto_stock_almacen for all
    using (
      public.has_permission('almacenes', 'write')
      or public.is_admin()
    )
    with check (
      public.has_permission('almacenes', 'write')
      or public.is_admin()
    );
  end if;
end $$;