-- ============================================================
-- Migración 0027: Precio por peso y unidades de medida
--
-- Amplía products para soportar:
--   1. pricing_type          → 'unit' | 'weight'
--   2. price_per_kilo_usd    → precio por kg (peso)
--   3. price_per_gram_usd    → precio por gramo (peso, derivado)
--   4. stock_grams           → stock en gramos (peso)
--   5. min_order_grams       → peso mínimo de compra (peso)
--   6. unit_label            → unidad de venta (u, g, kg, m, caja...)
--   7. is_available          → ocultar del catálogo sin borrar
--   8. low_stock_threshold   → umbral de stock bajo configurable
--   9. sku / bar_code        → código interno y barras
--  10. bulk_discount_percent → descuento por mayoreo (promocional)
--  11. sort_order            → orden manual en catálogo
--  12. weight_grams          → peso por unidad (ficha técnica)
-- También agrega unit_label y weight_grams a solicitud_items y quote_items.
-- ============================================================

-- ============================================================
-- 1) Columnas nuevas en products
-- ============================================================
alter table public.products
  add column if not exists pricing_type text not null default 'unit' check (pricing_type in ('unit', 'weight')),
  add column if not exists price_per_kilo_usd numeric(12,4) not null default 0,
  add column if not exists price_per_gram_usd numeric(12,6) not null default 0,
  add column if not exists stock_grams numeric(12,2) not null default 0,
  add column if not exists min_order_grams numeric(12,2) not null default 0,
  add column if not exists unit_label text not null default 'u',
  add column if not exists is_available boolean not null default true,
  add column if not exists low_stock_threshold integer not null default 10,
  add column if not exists sku text,
  add column if not exists bar_code text,
  add column if not exists bulk_discount_percent numeric(5,2) not null default 0 check (bulk_discount_percent between 0 and 100),
  add column if not exists sort_order integer not null default 0,
  add column if not exists weight_grams numeric(12,2);

-- Índices para búsquedas frecuentes
create index if not exists idx_products_pricing_type on public.products(pricing_type);
create index if not exists idx_products_is_available on public.products(is_available);
create index if not exists idx_products_sku on public.products(sku);
create index if not exists idx_products_bar_code on public.products(bar_code);
create index if not exists idx_products_sort_order on public.products(sort_order);

-- ============================================================
-- 2) Columnas de unidad en solicitud_items y quote_items
-- ============================================================
alter table public.solicitud_items
  add column if not exists unit_label text not null default 'u',
  add column if not exists weight_grams numeric(12,2);

alter table public.quote_items
  add column if not exists unit_label text not null default 'u',
  add column if not exists weight_grams numeric(12,2);

-- ============================================================
-- 3) Backfill: derivar precio por gramo si falta (desde kg)
-- ============================================================
update public.products
set price_per_gram_usd = round(price_per_kilo_usd / 1000, 6)
where pricing_type = 'weight'
  and price_per_kilo_usd > 0
  and price_per_gram_usd = 0;

-- ============================================================
-- 4) Trigger de stock actualizado que soporta gramos
--    Reemplaza el trigger de la migración 0022 para que si el
--    producto es por peso, descuente de stock_grams; si es por
--    unidad, descuente de stock.
-- ============================================================
create or replace function public.adjust_stock_on_solicitud_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  si public.solicitud_items%rowtype;
  v_product public.products%rowtype;
begin
  -- Transición → completed: restar stock (evita stock negativo).
  if new.status = 'completed' and old.status is distinct from 'completed' then
    for si in
      select * from public.solicitud_items where solicitud_id = new.id
    loop
      select * into v_product from public.products where id = si.product_id;
      if v_product.id is not null and v_product.pricing_type = 'weight' then
        update public.products
          set stock_grams = stock_grams - si.quantity
          where id = si.product_id
            and stock_grams >= si.quantity;
      else
        update public.products
          set stock = stock - si.quantity
          where id = si.product_id
            and stock >= si.quantity;
      end if;
    end loop;
  end if;

  -- Transición desde completed → otro estado: devolver stock (deshacer venta).
  if old.status = 'completed' and new.status is distinct from 'completed' then
    for si in
      select * from public.solicitud_items where solicitud_id = new.id
    loop
      select * into v_product from public.products where id = si.product_id;
      if v_product.id is not null and v_product.pricing_type = 'weight' then
        update public.products
          set stock_grams = stock_grams + si.quantity
          where id = si.product_id;
      else
        update public.products
          set stock = stock + si.quantity
          where id = si.product_id;
      end if;
    end loop;
  end if;

  return new;
end;
$$;

-- ============================================================
-- 5) Documentación de las columnas
-- ============================================================
comment on column public.products.pricing_type is 'Tipo de precio: unit (por unidad) o weight (por peso en gramos/kilos).';
comment on column public.products.price_per_kilo_usd is 'Precio por kilogramo (solo si pricing_type = weight).';
comment on column public.products.price_per_gram_usd is 'Precio por gramo (derivado del precio por kg). Se usa para los cálculos.';
comment on column public.products.stock_grams is 'Inventario disponible en gramos (solo si pricing_type = weight).';
comment on column public.products.min_order_grams is 'Peso mínimo de compra en gramos (solo si pricing_type = weight).';
comment on column public.products.unit_label is 'Etiqueta de unidad de venta (u, g, kg, m, caja, etc.).';
comment on column public.products.is_available is 'Si es false, el producto NO aparece en el catálogo público (pero no se borra).';
comment on column public.products.low_stock_threshold is 'Umbral de stock bajo configurable por producto.';
comment on column public.products.sku is 'Código SKU interno del producto.';
comment on column public.products.bar_code is 'Código de barras (EAN/UPC) del producto.';
comment on column public.products.bulk_discount_percent is 'Descuento por compra al mayor (%) que se muestra como incentivo en el catálogo.';
comment on column public.products.sort_order is 'Orden manual en el catálogo (menor = aparece primero).';
comment on column public.products.weight_grams is 'Peso en gramos de una unidad del producto (para ficha técnica).';
comment on column public.solicitud_items.unit_label is 'Unidad vendida del ítem (u, g, kg...). Snapshot al crear la solicitud.';
comment on column public.solicitud_items.weight_grams is 'Peso total en gramos del ítem (si el producto es por peso).';
comment on column public.quote_items.unit_label is 'Unidad cotizada del ítem (u, g, kg...). Snapshot al crear la cotización.';
comment on column public.quote_items.weight_grams is 'Peso total en gramos del ítem (si el producto es por peso).';