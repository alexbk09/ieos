-- ============================================================
-- Migración 0052: Valoraciones y opiniones de producto
--
-- POR QUÉ:
--   Las fichas pSEO necesitan "peso" de contenido real. El pipeline de
--   AliExpress ya conoce la valoración positiva del producto (`evaluate_rate`)
--   y puede extraer las mejores reseñas; se guardan aquí para:
--     1) Renderizarlas en la sección "Opiniones" (contenido único/long-tail).
--     2) Alimentar el schema JSON-LD AggregateRating SOLO cuando el dato es
--        real y visible (nunca se inventan reseñas → evita penalización).
--
-- Columnas nuevas en public.products:
--   rating_average  → valoración media en escala 0-5 (ej: 4.88).
--   rating_count    → nº de valoraciones reportado por el marketplace.
--   rating_source   → origen del dato ('aliexpress', 'amazon', 'store').
--   reviews         → JSONB [{autor, valoracion, texto, fecha}] ya traducidas.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================

alter table public.products
  add column if not exists rating_average numeric(3,2),
  add column if not exists rating_count integer,
  add column if not exists rating_source text,
  add column if not exists reviews jsonb;

-- Filtro/orden por mejor valorado (catálogo y relacionados).
create index if not exists idx_products_rating_average
  on public.products(rating_average)
  where rating_average is not null;

-- Guard defensivo: la media debe ser coherente con la escala 0-5.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_rating_average_range'
  ) then
    alter table public.products
      add constraint products_rating_average_range
      check (rating_average is null or (rating_average >= 0 and rating_average <= 5));
  end if;
end $$;

comment on column public.products.rating_average is
  'Valoración media del producto en escala 0-5 (ej: 4.88). NULL si no hay dato real.';
comment on column public.products.rating_count is
  'Número de valoraciones reportado por el marketplace. NULL si no hay dato real.';
comment on column public.products.rating_source is
  'Origen de la valoración: aliexpress | amazon | store.';
comment on column public.products.reviews is
  'Reseñas reales traducidas: [{autor, valoracion, texto, fecha}]. Alimenta la sección Opiniones.';
